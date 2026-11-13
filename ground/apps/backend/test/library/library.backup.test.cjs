/** Real dump/restore drill. Only owned disposable local containers and synthetic data. */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const {mkdtemp,readFile,writeFile,rm,cp,access}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {withLibraryHttpFixture}=require('./library.http-fixture.cjs');
const {createLibraryService}=require('../../dist/library/library.service.js');
const {PrismaLibraryStore}=require('../../dist/library/library.prisma-store.js');
const {assertLocalDocker}=require('../../../../scripts/library-docker-local.mjs');
const ground=resolve(__dirname,'../../../..');
const sourceUrl='postgresql://postgres@127.0.0.1:55439/mmp_library_acceptance';
const restoreUrl='postgresql://postgres@127.0.0.1:55440/mmp_library_restore_acceptance';
const restoreName='mmp-library-restore-55440';
const sourceName=process.env.LIBRARY_TEST_POSTGRES_CONTAINER || 'mmp-library-p0-55439';
const writerName=`mmp-library-drill-writer-${process.pid}`;
const digest=value=>createHash('sha256').update(value).digest('hex');
let dockerEnvironment;
function docker(args,required=true){const r=spawnSync('docker',args,{env:dockerEnvironment,encoding:'utf8'});if(required)assert.equal(r.status,0,r.stderr);return r;}
function command(file,args,env={}){return spawnSync('/bin/sh',[join(ground,'infra/production',file),...args],{encoding:'utf8',env:{...process.env,...dockerEnvironment,...env},timeout:120000});}

test('paired backup restores private/shared/recycled history and rejects corruption and existing targets',{timeout:180000},async()=>{
  dockerEnvironment=assertLocalDocker();
  const root=await mkdtemp(join(tmpdir(),'library-drill-'));
  let ownsRestore=false;
  let ownsWriter=false;
  const beforeEnv=process.env.LIBRARY_DIR;
  try {
    assert.notEqual(docker(['inspect',restoreName],false).status,0,'Refusing an existing restore container');
    docker(['run','--rm','-d','--name',restoreName,'--label','codex.task=library-backup-drill','-p','127.0.0.1:55440:5432',
      '-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres','-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector:pg16']);
    ownsRestore=true;
    let ready=false;
    for(let i=0;i<100;i++){if(docker(['exec',restoreName,'pg_isready','-U','postgres'],false).status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(ready,true,'Restore PostgreSQL never became ready');
    await withLibraryHttpFixture(async({app,prisma,directory,upload,request,users,tenants})=>{
      const privateFile=(await upload('owner','private.md','OLD fixed source')).body.items[0];
      const replaced=(await upload('owner','private.md','NEW replacement source',privateFile.id)).body;
      const shared=(await upload('owner','shared.md','SHARED source')).body.items[0];
      assert.equal((await request('owner',`nodes/${shared.id}/scope`,'POST',{scope:'ENTERPRISE',confirmShare:true})).status,201);
      const recycled=(await upload('owner','recycled.md','RECYCLED original')).body.items[0];
      assert.equal((await request('owner',`nodes/${recycled.id}/recycle`,'POST')).status,201);
      const before=await prisma.libraryNode.findMany({orderBy:{id:'asc'}});
      const versions=await prisma.libraryVersion.findMany({orderBy:{id:'asc'}});
      assert.equal(versions.length,4);assert.notEqual(replaced.currentVersion.id,privateFile.currentVersion.id);
      const hashes=Object.fromEntries(await Promise.all(versions.map(async v=>[v.storageKey,digest(await readFile(join(directory,v.storageKey)))])));
      await app.close(); // The only HTTP writer is closed before offline fixture backup.
      assert.notEqual(docker(['inspect',writerName],false).status,0,'Refusing an existing writer fixture');
      docker(['run','-d','--name',writerName,'--network','none','--entrypoint','sleep','pgvector/pgvector:pg16','300']);
      ownsWriter=true;
      const empty=join(root,'empty-originals');await require('node:fs/promises').mkdir(empty);
      const failed=command('backup-library.sh',['--postgres-container',sourceName,'--writers',writerName,'--library-dir',empty,'--output',join(root,'failed-backup')]);
      assert.notEqual(failed.status,0);
      assert.equal(JSON.parse(docker(['inspect',writerName]).stdout)[0].State.Running,true,'Failed backup must restart its writer');
      docker(['stop',writerName]);
      const stoppedBackup=command('backup-library.sh',['--postgres-container',sourceName,'--writers',writerName,'--library-dir',directory,'--output',join(root,'stopped-backup')]);
      assert.equal(stoppedBackup.status,0,stoppedBackup.stderr);
      assert.equal(JSON.parse(docker(['inspect',writerName]).stdout)[0].State.Running,false,'An originally stopped writer must stay stopped');
      const backup=join(root,'backup');
      const result=command('backup-library.sh',['--postgres-container',sourceName,'--offline','--library-dir',directory,'--output',backup],{LIBRARY_BACKUP_DATABASE_URL:sourceUrl});
      assert.equal(result.status,0,result.stderr);
      const manifest=JSON.parse(await readFile(join(backup,'manifest.json'),'utf8'));
      assert.equal(manifest.snapshot.versions.length,4);assert.equal(manifest.files.length,4);
      const destination=join(root,'restored-originals');
      const args=['--postgres-container',restoreName,'--backup',backup,'--library-dir',destination];
      const restored=command('restore-library-local.sh',args,{LIBRARY_RESTORE_DATABASE_URL:restoreUrl});
      assert.equal(restored.status,0,restored.stderr);
      const client=new PrismaClient({datasourceUrl:restoreUrl});
      try {
        assert.deepEqual(await client.libraryNode.findMany({orderBy:{id:'asc'}}),before);
        assert.deepEqual(await client.libraryVersion.findMany({orderBy:{id:'asc'}}),versions);
        for(const v of versions)assert.equal(digest(await readFile(join(destination,v.storageKey))),hashes[v.storageKey]);
        process.env.LIBRARY_DIR=destination;
        const service=createLibraryService({store:new PrismaLibraryStore(client)});
        const owner={userId:users[0].id,tenantId:tenants[0].id,isPlatformAdmin:false,isOrgAdmin:false,activeMember:true};
        const old=await service.openCitation(owner,privateFile.id,privateFile.currentVersion.id,'paragraph:1',false);
        assert.equal(old.quote,'OLD fixed source');assert.equal(old.versionId,privateFile.currentVersion.id);
        await assert.rejects(service.openCitation(owner,recycled.id,recycled.currentVersion.id,'paragraph:1',false));
        assert.equal((await client.libraryNode.findUnique({where:{id:recycled.id}})).state,'RECYCLED');
      } finally {await client.$disconnect();process.env.LIBRARY_DIR=directory;}
      const existingDirectory=command('restore-library-local.sh',args,{LIBRARY_RESTORE_DATABASE_URL:restoreUrl});
      assert.notEqual(existingDirectory.status,0);assert.match(existingDirectory.stderr,/existing destination/);
      const untouched=join(root,'must-not-create');
      const existingDatabase=command('restore-library-local.sh',[...args.slice(0,-1),untouched],{LIBRARY_RESTORE_DATABASE_URL:restoreUrl});
      assert.notEqual(existingDatabase.status,0);assert.match(existingDatabase.stderr,/existing restore database/);await assert.rejects(access(untouched));
      for(const fault of ['missing','damaged']) {
        const corrupt=join(root,fault);await cp(backup,corrupt,{recursive:true});
        const path=join(corrupt,'originals',manifest.files[0].path);
        if(fault==='missing')await rm(path);else await writeFile(path,'damaged');
        const verified=spawnSync(process.execPath,[join(ground,'scripts/verify-library-backup.mjs'),corrupt],{encoding:'utf8'});
        assert.notEqual(verified.status,0);
      }
      assert.deepEqual(await prisma.libraryNode.findMany({orderBy:{id:'asc'}}),before);
      for(const v of versions)assert.equal(digest(await readFile(join(directory,v.storageKey))),hashes[v.storageKey]);
      console.log(JSON.stringify({backupId:manifest.backupId,nodes:before.length,versions:versions.length,originals:manifest.files.length,
        oldVersionReadable:true,recycledDenied:true,privateSharedOwnerStatePreserved:true,sourceUnchanged:true,corruptionRejected:true,existingTargetsRejected:true,writerRestartOnFailure:true,originallyStoppedWriterPreserved:true}));
    });
  } finally {
    if(beforeEnv===undefined)delete process.env.LIBRARY_DIR;else process.env.LIBRARY_DIR=beforeEnv;
    if(ownsRestore)docker(['rm','-f',restoreName]);
    if(ownsWriter)docker(['rm','-f',writerName]);
    await rm(root,{recursive:true,force:true});
  }
});
