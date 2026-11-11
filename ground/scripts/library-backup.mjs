/** Paired Ground library backup. Never logs credentials or reads production.env. */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, open, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertLibraryTestTarget } from './library-test-target.mjs';
import { assertLocalDocker } from './library-docker-local.mjs';

const fail = message => { throw new Error(message); };
let dockerEnvironment;
const inside = (root,path) => { const rel=relative(root,path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };
const digest = value => createHash('sha256').update(value).digest('hex');
async function sha256(path) { const hash=createHash('sha256');for await(const part of createReadStream(path))hash.update(part);return hash.digest('hex'); }
async function regular(path) { const info=await lstat(path);if(!info.isFile() || info.isSymbolicLink())fail('Refusing non-regular backup file');return info; }
async function directory(path) { if(!(await lstat(path)).isDirectory())fail('Refusing non-directory or symlink root');return await realpath(path); }
async function absent(path) { try {await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}fail('Refusing existing destination'); }
async function newPath(path) { if(!isAbsolute(path))fail('Destination must be absolute');await absent(path);return join(await directory(dirname(path)),basename(path)); }
function safeRelative(path) { return typeof path==='string' && path.length>0 && !path.includes('\\') && !path.includes('\0') && !isAbsolute(path) && path.split('/').every(part=>part && part!=='.' && part!=='..'); }
async function inventory(root,prefix='') {
  const found=[];
  for(const entry of (await readdir(join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=prefix ? `${prefix}/${entry.name}` : entry.name;
    if(!safeRelative(path) || entry.isSymbolicLink())fail('Refusing unsafe original path or symlink');
    if(entry.isDirectory())found.push(...await inventory(root,path));
    else { const info=await regular(join(root,path));found.push({path,sizeBytes:info.size,sha256:await sha256(join(root,path))}); }
  }
  return found.sort((a,b)=>a.path.localeCompare(b.path));
}
function fileRecord(row) { return row && safeRelative(row.path) && Number.isSafeInteger(row.sizeBytes) && row.sizeBytes>=0 && /^[a-f0-9]{64}$/.test(row.sha256); }
/** Verify the dump, exact inventory and every DB-referenced original without trusting manifest paths. */
export async function verifyLibraryBackup(root) {
  root=await directory(root);await regular(join(root,'manifest.json'));
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  if(manifest.format!==1 || typeof manifest.backupId!=='string' || !manifest.backupId || !fileRecord(manifest.database)
    || manifest.database.path!=='database.dump' || !Array.isArray(manifest.files) || !manifest.files.every(fileRecord)
    || !Array.isArray(manifest.snapshot?.versions) || !Array.isArray(manifest.snapshot?.nodes) || !Array.isArray(manifest.snapshot?.chunks))fail('Invalid library backup manifest');
  const dump=await regular(join(root,'database.dump'));
  if(dump.size!==manifest.database.sizeBytes || await sha256(join(root,'database.dump'))!==manifest.database.sha256)fail('Database dump checksum mismatch');
  const originals=await directory(join(root,'originals'));
  const actual=await inventory(originals), expected=[...manifest.files].sort((a,b)=>a.path.localeCompare(b.path));
  if(JSON.stringify(actual)!==JSON.stringify(expected))fail('Original inventory/size/checksum mismatch');
  const files=new Map(expected.map(row=>[row.path,row]));
  if(files.size!==expected.length)fail('Duplicate original inventory entry');
  for(const version of manifest.snapshot.versions) {
    const file=files.get(version.storage_key);
    if(!file || file.sizeBytes!==version.size_bytes || file.sha256!==version.sha256)fail('DB version original missing or mismatched');
  }
  return manifest;
}
function docker(args,{input,output}={}) {
  if(!dockerEnvironment)fail('Missing verified local Docker environment');
  const result=spawnSync('docker',args,{env:dockerEnvironment,encoding:'utf8',input,stdio:output===undefined?['pipe','pipe','pipe']:['pipe',output,'pipe'],maxBuffer:128*1024*1024});
  // Subprocess messages can include connection details; keep them out of the console.
  if(result.error || result.status!==0)fail(`Docker/PostgreSQL operation failed (${args[0]}); inspect container health privately`);
  return result.stdout;
}
function container(name) {
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name??''))fail('Invalid container name');
  return JSON.parse(docker(['inspect',name]))[0];
}
function dbIdentity(name,target) {
  const state=container(name);
  if(!state.State.Running)fail('PostgreSQL container is not running');
  const env=Object.fromEntries(state.Config.Env.map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)];}));
  if(!env.POSTGRES_USER)fail('PostgreSQL user must be configured');
  if(target) {
    const bindings=state.NetworkSettings.Ports['5432/tcp'];
    if(!bindings?.length || bindings.some(row=>row.HostIp!=='127.0.0.1' || row.HostPort!==target.port) || env.POSTGRES_USER!==target.user)fail('Refusing container outside dedicated local database target');
  }
  return {user:env.POSTGRES_USER,database:target?.database ?? env.POSTGRES_DB ?? env.POSTGRES_USER,id:state.Id};
}
function sql(name,identity,query,database=identity.database) {
  return docker(['exec','-i',name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U',identity.user,'-d',database],{input:query});
}
const snapshotQuery=`SELECT json_build_object(
 'nodes',COALESCE((SELECT json_agg(n ORDER BY id) FROM library_node n),'[]'::json),
 'versions',COALESCE((SELECT json_agg(v ORDER BY id) FROM library_version v),'[]'::json),
 'chunks',COALESCE((SELECT json_agg(c ORDER BY id) FROM library_chunk c),'[]'::json));`;
function snapshot(name,identity) {
  if(sql(name,identity,'SELECT current_database();').trim()!==identity.database)fail('Unexpected actual database');
  const data=JSON.parse(sql(name,identity,snapshotQuery));
  data.chunks=data.chunks.map(({content,...row})=>({...row,contentSha256:digest(content)}));
  return data;
}
async function copyOriginals(source,destination,files) {
  await mkdir(destination,{mode:0o700});
  for(const file of files) {const path=join(destination,file.path);await mkdir(dirname(path),{recursive:true,mode:0o700});await copyFile(join(source,file.path),path);}
}
/** Stop all declared writers; restart only containers running before this backup, even on failure. */
async function backup(options) {
  dockerEnvironment=assertLocalDocker();
  const source=await directory(options['library-dir']);
  const destination=await newPath(options.output);
  if(inside(source,destination) || inside(destination,source))fail('Backup and originals must be separate trees');
  const name=options['postgres-container'];
  const target=options.offline ? assertLibraryTestTarget(process.env.LIBRARY_BACKUP_DATABASE_URL) : undefined;
  const db=dbIdentity(name,target);
  const writers=options.writers?.split(',') ?? [];
  if(options.offline && writers.length)fail('Choose stopped-fixture offline mode or declared writers');
  if(!options.offline && !writers.length)fail('All writer containers must be declared');
  const running=[];
  for(const writer of new Set(writers)) {
    const state=container(writer);
    if(state.Id===db.id)fail('PostgreSQL cannot be declared as a writer');
    if(state.State.Running)running.push(writer);
    else if(state.State.Status!=='exited' && state.State.Status!=='created')fail('Writer state is not stable');
  }
  const stopped=[];
  let problem;
  try {
    for(const writer of running) { docker(['stop',writer]);stopped.push(writer); }
    const before=snapshot(name,db),files=await inventory(source);
    await mkdir(destination,{mode:0o700});
    const dumpPath=join(destination,'database.dump');
    const output=await open(dumpPath,'wx',0o600);
    try {docker(['exec',name,'pg_dump','-U',db.user,'-d',db.database,'--format=custom','--no-owner','--no-acl'],{output:output.fd});}
    finally {await output.close();}
    await copyOriginals(source,join(destination,'originals'),files);
    // Detect an undeclared concurrent writer rather than publishing a mixed backup.
    if(JSON.stringify(before)!==JSON.stringify(snapshot(name,db)) || JSON.stringify(files)!==JSON.stringify(await inventory(source)))fail('Library changed during the stopped-writer window');
    const manifest={format:1,backupId:randomUUID(),createdAt:new Date().toISOString(),database:{path:'database.dump',sizeBytes:(await regular(dumpPath)).size,sha256:await sha256(dumpPath)},files,snapshot:before};
    await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    await verifyLibraryBackup(destination);
    console.log(`Library backup verified: ${manifest.backupId} (${files.length} originals, ${before.versions.length} versions)`);
  } catch(error) {problem=error;}
  finally {
    const failures=[];
    for(const writer of stopped) {try{docker(['start',writer]);}catch(error){failures.push(error);}}
    if(failures.length)problem=new AggregateError([...(problem?[problem]:[]),...failures],'Writer restart failed; restore service availability manually');
  }
  if(problem)throw problem;
}
/** Only a fresh, dedicated local database and a nonexistent originals directory are writable. */
async function restore(options) {
  const target=assertLibraryTestTarget(process.env.LIBRARY_RESTORE_DATABASE_URL,true);
  dockerEnvironment=assertLocalDocker();
  const destination=await newPath(options['library-dir']);
  const root=await directory(options.backup);
  if(inside(root,destination) || inside(destination,root))fail('Restore and backup must be separate trees');
  const manifest=await verifyLibraryBackup(root);
  const name=options['postgres-container'],db=dbIdentity(name,target);
  // Fixed validated database name, never caller-supplied SQL identifiers.
  if(sql(name,db,`SELECT 1 FROM pg_database WHERE datname='mmp_library_restore_acceptance';`,'postgres').trim())fail('Refusing existing restore database');
  docker(['exec',name,'createdb','-U',db.user,'mmp_library_restore_acceptance']);
  // pg_restore receives only the verified dump through stdin, never interpolated shell text.
  const fd=await open(join(root,'database.dump'),'r');
  try {
    const result=spawnSync('docker',['exec','-i',name,'pg_restore','-U',db.user,'-d',db.database,'--no-owner','--no-acl','--exit-on-error'],{env:dockerEnvironment,stdio:[fd.fd,'pipe','pipe']});
    if(result.error || result.status!==0)fail('Restore failed; retain the dedicated failed database for inspection');
  } finally {await fd.close();}
  if(JSON.stringify(snapshot(name,db))!==JSON.stringify(manifest.snapshot))fail('Restored library metadata/chunks differ from backup');
  await copyOriginals(join(root,'originals'),destination,manifest.files);
  if(JSON.stringify(await inventory(destination))!==JSON.stringify(manifest.files))fail('Restored original checksum mismatch');
  console.log(`Library restore verified: ${manifest.backupId} (${manifest.snapshot.versions.length} versions)`);
}
function argumentsOf(args) {
  const options={};
  for(let i=0;i<args.length;i++) {
    const key=args[i].replace(/^--/,'');
    if(!args[i].startsWith('--') || !['offline','writers','postgres-container','library-dir','output','backup'].includes(key) || key in options)fail('Invalid or duplicate backup option');
    options[key]=key==='offline' ? true : args[++i];
    if(options[key]===undefined)fail('Missing backup option value');
  }
  return options;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    process.umask(0o077);
    const [command,...args]=process.argv.slice(2),options=argumentsOf(args);
    if(command==='backup')await backup(options);
    else if(command==='restore')await restore(options);
    else fail('Usage: library-backup.mjs backup|restore --postgres-container NAME --library-dir ABSOLUTE_PATH ...');
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
