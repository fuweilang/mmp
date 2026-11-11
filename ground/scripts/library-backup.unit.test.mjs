import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (script, args = [], options = {}) => spawnSync(process.execPath, [join(directory, script), ...args], { encoding:'utf8', ...options });
async function bundle(work) {
  const root = await mkdtemp(join(tmpdir(),'library-manifest-'));
  const blob = Buffer.from('stored original v1');
  const manifest = { format:1, backupId:'hand-checked-backup', createdAt:'2026-11-08T00:00:00Z',
    database:{path:'database.dump',sizeBytes:4,sha256:hash('dump')},
    files:[{path:'tenant/version.md',sizeBytes:18,sha256:hash(blob)}],
    snapshot:{nodes:[{id:'node',state:'RECYCLED',owner_user_id:'owner',scope:'PRIVATE'}],
      versions:[{id:'version',node_id:'node',storage_key:'tenant/version.md',size_bytes:18,sha256:hash(blob)}],chunks:[]} };
  try {
    await mkdir(join(root,'originals','tenant'),{recursive:true});
    await writeFile(join(root,'database.dump'),'dump');
    await writeFile(join(root,'originals','tenant','version.md'),blob);
    const save = () => writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
    await save(); await work(root,manifest,save);
  } finally { await rm(root,{recursive:true,force:true}); }
}

test('verifies the dump plus every original, including a recycled version',async()=>bundle(async root=>{
  const result=run('verify-library-backup.mjs',[root]);
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/hand-checked-backup/);
}));
test('refuses a damaged original and a missing database dump',async()=>bundle(async root=>{
  await writeFile(join(root,'originals','tenant','version.md'),'different bytes');
  assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
  await rm(join(root,'database.dump')); assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
}));
test('refuses manifest traversal, duplicate entries and DB versions absent from the file inventory',async()=>bundle(async(root,manifest,save)=>{
  manifest.files[0].path='../outside'; await save(); assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
  manifest.files[0].path='tenant/version.md';manifest.files.push({...manifest.files[0]});await save();assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
  manifest.files.pop();manifest.snapshot.versions[0].storage_key='tenant/missing.md';await save();assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
}));
test('refuses symlink originals and unlisted files instead of following or silently dropping them',async()=>bundle(async root=>{
  await writeFile(join(root,'originals','extra.md'),'unlisted');assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
  await rm(join(root,'originals','extra.md'));
  await rm(join(root,'originals','tenant','version.md'));
  await symlink(join(root,'database.dump'),join(root,'originals','tenant','version.md'));
  assert.notEqual(run('verify-library-backup.mjs',[root]).status,0);
}));
test('acceptance refuses unsafe targets before invoking any migration or package manager',async()=>{
  const root=await mkdtemp(join(tmpdir(),'library-guard-'));
  try {
    const marker=join(root,'invoked');
    await writeFile(join(root,'pnpm'),'#!/bin/sh\ntouch "$LIBRARY_GUARD_MARKER"\nexit 99\n',{mode:0o700});
    for(const url of ['postgresql://postgres@remote.example/mmp_library_acceptance','postgresql://postgres@127.0.0.1:5433/mmp_library_acceptance',
      'postgresql://postgres@127.0.0.1:55439/production','postgresql://postgres@127.0.0.1:55439/mmp_library_acceptance?host=remote']) {
      const result=spawnSync('/bin/sh',[join(directory,'library-acceptance.sh')],{encoding:'utf8',env:{...process.env,PATH:root+':'+process.env.PATH,LIBRARY_GUARD_MARKER:marker,LIBRARY_TEST_DATABASE_URL:url}});
      assert.notEqual(result.status,0);let invoked=false;try{await access(marker);invoked=true}catch{}
      assert.equal(invoked,false,'unsafe target reached the package manager');
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
test('restore refuses a non-dedicated URL before contacting Docker or creating the destination',async()=>{
  const root=await mkdtemp(join(tmpdir(),'library-restore-guard-'));
  try {
    const destination=join(root,'new-originals');
    const result=run('library-backup.mjs',['restore','--backup',root,'--library-dir',destination,'--postgres-container','never-contact'],
      {env:{...process.env,LIBRARY_RESTORE_DATABASE_URL:'postgresql://postgres@remote.example/production'}});
    assert.notEqual(result.status,0);assert.match(result.stderr,/dedicated|专用|Refusing/);
    await assert.rejects(access(destination));
  } finally{await rm(root,{recursive:true,force:true});}
});
test('restore refuses remote Docker host, explicit context and current context before createdb',async()=>bundle(async root=>{
  const bin=join(root,'bin');await mkdir(bin);
  const marker=join(root,'mutated');
  await writeFile(join(bin,'docker'),`#!/bin/sh
case "$1 $2" in
 'context show') echo remote-context ;;
 'context inspect') echo '[{"Endpoints":{"docker":{"Host":"ssh://remote.example"}}}]' ;;
 'inspect never-contact') echo '[{"Id":"remote-db","State":{"Running":true},"Config":{"Env":["POSTGRES_USER=postgres","POSTGRES_DB=postgres"]},"NetworkSettings":{"Ports":{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"55440"}]}}}]' ;;
 'exec -i') exit 0 ;;
 *) touch "$LIBRARY_GUARD_MARKER"; exit 99 ;;
esac
`,{mode:0o700});
  for(const settings of [{DOCKER_HOST:'ssh://remote.example',DOCKER_CONTEXT:''},{DOCKER_HOST:'',DOCKER_CONTEXT:'remote-context'},{DOCKER_HOST:'',DOCKER_CONTEXT:''}]) {
    await rm(marker,{force:true});
    const result=run('library-backup.mjs',['restore','--backup',root,'--library-dir',join(root,'..','new-restore-'+root.split('/').at(-1)),'--postgres-container','never-contact'],
      {env:{...process.env,...settings,PATH:bin+':'+process.env.PATH,LIBRARY_GUARD_MARKER:marker,LIBRARY_RESTORE_DATABASE_URL:'postgresql://postgres@127.0.0.1:55440/mmp_library_restore_acceptance'}});
    assert.notEqual(result.status,0);await assert.rejects(access(marker),'remote restore reached a Docker mutation');
    assert.match(result.stderr,/local Docker/);
  }
}));
