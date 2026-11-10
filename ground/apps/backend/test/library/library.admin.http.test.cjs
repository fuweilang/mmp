/** Only synthetic tenants in the existing dedicated 55439 acceptance DB; normal login/JwtGuard, no user tokens. */
const assert=require('node:assert/strict');const {test}=require('node:test');const {randomUUID}=require('node:crypto');
const {withLibraryHttpFixture}=require('./library.http-fixture.cjs');
const deny=res=>assert.ok([400,403,404,409,410].includes(res.status),`expected rejection, got ${res.status}: ${res.bytes}`);
test('admin full single-tenant library workflow without custody grants',{timeout:60000},async t=>{
 await withLibraryHttpFixture(async({request,upload,prisma,users,tenants})=>{
  const tenant=tenants[0].id,foreign=tenants[1].id,owner=users[0].id,platform=users[4].id;
  const base=`admin/tenants/${tenant}`;
  const context=()=>({requestId:randomUUID()});
  const row=async(id)=>{const r=await request('platform',`${base}/items?state=ACTIVE&page=1&pageSize=100`);assert.equal(r.status,200);return r.body.items.find(n=>n.id===id);};
  const command=async(node,action,extra={})=>request('platform',`${base}/commands`,'POST',{...context(),nodeId:node.id,action,expectedUpdatedAt:node.updatedAt,...(node.currentVersion?{expectedVersionId:node.currentVersion.id}:{}),...extra});
  let file,folder;
  await t.test('platform can read a selected tenant body; non-platform, foreign node and incomplete request stay rejected',async()=>{
   file=(await upload('owner','私人测试.md','fixture private content')).body.items[0];
   const metadata=await request('platform',`${base}/items`);assert.equal(metadata.status,200);assert.ok(metadata.body.items.some(n=>n.name==='私人测试.md'&&n.canRead===true&&n.canWrite===true));assert.ok(!metadata.bytes.toString().includes('fixture private content'));assert.ok(!metadata.bytes.toString().includes('storageKey'));
   deny(await request('mate',`${base}/items`));assert.equal((await request(null,`${base}/items`)).status,401);
   const preview=await request('platform',`${base}/nodes/${file.id}/preview`);assert.equal(preview.status,200);assert.equal(preview.body.text,'fixture private content');
   const foreignFile=(await upload('other','其他企业.md','foreign fixture')).body.items[0];deny(await request('platform',`${base}/nodes/${foreignFile.id}`));
   const tenantsPage=await request('platform',`admin/tenants?q=${encodeURIComponent(tenants[0].name)}&page=1&pageSize=1`);assert.equal(tenantsPage.body.total,1);assert.equal(tenantsPage.body.items[0].id,tenant);
   deny(await request('platform',`${base}/items?page=0`));deny(await request('platform',`${base}/folders`,'POST',{ownerUserId:owner,scope:'PRIVATE',name:'no auth'}));
  });
  await t.test('platform creates for a real member without a grant and does not become that member',async()=>{
   deny(await request('platform','folders','POST',{name:'still not a member'}));
   deny(await request('platform',`admin/tenants/${foreign}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'foreign denied'}));
   for(const invalidOwner of [platform,users[1].id,users[2].id])deny(await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:invalidOwner,scope:'PRIVATE',name:'owner denied'}));
   const created=await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'Apple'});assert.equal(created.status,201);folder=await row(created.body.nodeId);assert.equal(folder.ownerUserId,owner);
   deny(await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'spoof',activeMember:true}));
  });
  await t.test('multipart creates explicit-owner media/files, idempotent request cannot duplicate or change payload',async()=>{
   const input={...context(),ownerUserId:owner,scope:'PRIVATE',parentId:folder.id};
   async function send(name='新增.md'){const form=new FormData();for(const[k,v]of Object.entries(input))form.append(k,v);form.append('files',new Blob(['new fixture']),name);return request('platform',`${base}/files`,'POST',form);}
   const a=await send();assert.equal(a.status,201);const b=await send();assert.equal(b.status,201);assert.equal(b.body.nodeId,a.body.nodeId);assert.equal(b.body.replayed,true);deny(await send('改名.md'));
   const stored=await prisma.libraryNode.findUnique({where:{id:a.body.nodeId}});assert.equal(stored.ownerUserId,owner);assert.equal(stored.tenantId,tenant);assert.equal(stored.scope,'PRIVATE');assert.equal(stored.parentId,folder.id);
   const version=await prisma.libraryVersion.findUnique({where:{id:a.body.versionId}});assert.equal(version.createdByUserId,platform);
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKk0AAAAASUVORK5CYII=','base64');const form=new FormData();for(const[k,v]of Object.entries({...context(),ownerUserId:owner,scope:'PRIVATE'}))form.append(k,v);form.append('files',new Blob([png],{type:'image/png'}),'图片.png');const pic=await request('platform',`${base}/files`,'POST',form);assert.equal(pic.status,201);const picRow=await row(pic.body.nodeId);assert.equal(picRow.currentVersion.parseStatus,'DOWNLOAD_ONLY');assert.equal(picRow.fileType,'image');
  });
  await t.test('global nested search/paging/type filters do not depend on root, cyclic move rejected',async()=>{
   const listed=await request('platform',`${base}/items?q=${encodeURIComponent('新增.md')}&pageSize=1&page=1`);assert.equal(listed.body.total,1);assert.deepEqual(listed.body.items[0].parentPath,['Apple']);
   const media=await request('platform',`${base}/items?fileType=image`);assert.equal(media.body.total,1);
   const opts=await request('platform',`${base}/options`);assert.ok(opts.body.filterOwners.some(o=>o.id===owner));assert.ok(opts.body.filterFolders.some(f=>f.id===folder.id));assert.equal(opts.body.grants,undefined);
   const scoped=await request('platform',`${base}/items?folderId=${folder.id}&ownerUserId=${owner}`);assert.equal(scoped.body.total,1);assert.equal(scoped.body.items[0].name,'新增.md');
   const roots=await request('platform',`${base}/items?layer=children&ownerUserId=${owner}&pageSize=100`);assert.equal(roots.body.items.some(n=>n.id===folder.id),true);assert.equal(roots.body.items.some(n=>n.name==='新增.md'),false);
   const inside=await request('platform',`${base}/items?layer=children&folderId=${folder.id}&ownerUserId=${owner}`);assert.equal(inside.body.items.some(n=>n.name==='新增.md'),true);
   deny(await command(await row(folder.id),'move',{parentId:folder.id}));
  });
  await t.test('metadata update, immutable replacement and expected stamp serialize concurrent operations',async()=>{
   const current=await row(file.id);const simultaneous=await Promise.all([command(current,'rename',{name:'并发一.md'}),command(current,'rename',{name:'并发二.md'})]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);
   let active=await row(file.id);const oldVersion=active.currentVersion.id;
   const form=new FormData();for(const[k,v]of Object.entries({...context(),action:'replace',nodeId:active.id,expectedUpdatedAt:active.updatedAt,expectedVersionId:oldVersion}))form.append(k,v);form.append('files',new Blob(['replacement fixture']),'新版.md');const replaced=await request('platform',`${base}/replace`,'POST',form);assert.equal(replaced.status,201);assert.notEqual(replaced.body.versionId,oldVersion);
   const old=await request('platform',`${base}/nodes/${file.id}/preview?versionId=${oldVersion}`);assert.equal(old.body.text,'fixture private content');
   const pinned=await request('platform',`${base}/nodes/${file.id}/download?versionId=${oldVersion}`);assert.equal(pinned.status,200);assert.equal(pinned.bytes.toString(),'fixture private content');assert.equal(pinned.headers.get('x-content-type-options'),'nosniff');assert.match(pinned.headers.get('cache-control'),/no-store/);
   const newer=await request('platform',`${base}/nodes/${file.id}/preview?versionId=${replaced.body.versionId}`);assert.equal(newer.body.text,'replacement fixture');
   active=await row(file.id);assert.equal((await command(active,'move',{parentId:folder.id})).status,201);assert.equal((await command(await row(file.id),'move',{parentId:''})).status,201);assert.equal((await row(file.id)).parentId,null);
   const detail=await request('platform',`${base}/nodes/${file.id}`);assert.equal(detail.body.versionCount,2);assert.ok(detail.body.audit.some(a=>a.meta.success===false));assert.ok(detail.body.audit.some(a=>a.userId===platform&&a.meta.originalOwnerUserId===owner&&a.meta.before&&a.meta.after));assert.ok(!detail.bytes.toString().includes('replacement fixture'));
  });
  await t.test('sharing requires explicit confirmation; processing and unknown references are protected',async()=>{
   let active=await row(file.id);deny(await command(active,'scope',{scope:'ENTERPRISE'}));
   assert.equal((await command(active,'scope',{scope:'ENTERPRISE',confirmShare:true})).status,201);
   active=await row(file.id);assert.equal(active.scope,'ENTERPRISE');assert.equal((await command(active,'scope',{scope:'PRIVATE'})).status,201);
   active=await row(file.id);await prisma.libraryVersion.update({where:{id:active.currentVersion.id},data:{parseStatus:'PROCESSING'}});deny(await command(active,'recycle'));await prisma.libraryVersion.update({where:{id:active.currentVersion.id},data:{parseStatus:'READY'}});
   assert.equal((await command(await row(file.id),'recycle')).status,201);const trash=(await request('platform',`${base}/items?state=RECYCLED`)).body.items.find(n=>n.id===file.id);const impact=await request('platform',`${base}/nodes/${file.id}/impact`);assert.equal(impact.body.referenceStatus,'UNVERIFIED');assert.equal(impact.body.canPurge,false);deny(await command(trash,'purge',{confirmPurge:true}));
   assert.equal((await command(trash,'restore')).status,201);assert.equal((await row(file.id)).currentVersion.versionNo,2);
  });
  await t.test('platform recursive scope impact changes every descendant after confirmation',async()=>{
   const impact=await request('platform',`${base}/nodes/${folder.id}/scope-impact?scope=ENTERPRISE`);
   assert.equal(impact.status,200);assert.ok(impact.body.total>=2);assert.equal(impact.body.treeRevision.length,64);
   deny(await command(await row(folder.id),'scope',{scope:'ENTERPRISE',expectedTreeRevision:impact.body.treeRevision}));
   assert.equal((await command(await row(folder.id),'scope',{scope:'ENTERPRISE',confirmShare:true,expectedTreeRevision:impact.body.treeRevision})).status,201);
   const child=await prisma.libraryNode.findFirst({where:{tenantId:tenant,parentId:folder.id,state:'ACTIVE'}});assert.equal(child.scope,'ENTERPRISE');
   const revoke=await request('platform',`${base}/nodes/${folder.id}/scope-impact?scope=PRIVATE`);assert.equal(revoke.status,200);
   deny(await command(await row(folder.id),'scope',{scope:'PRIVATE',expectedTreeRevision:revoke.body.treeRevision}));
   assert.equal((await command(await row(folder.id),'scope',{scope:'PRIVATE',confirmUnshare:true,expectedTreeRevision:revoke.body.treeRevision})).status,201);
   assert.equal((await prisma.libraryNode.findUnique({where:{id:child.id}})).scope,'PRIVATE');
  });
  await t.test('platform moves a private tree into an enterprise folder after confirmation',async()=>{
   const created=await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'ENTERPRISE',confirmShare:true,name:'共享移动目标'});assert.equal(created.status,201);
   const destination=created.body.nodeId;
   const impact=await request('platform',`${base}/nodes/${folder.id}/scope-impact?scope=ENTERPRISE`);assert.equal(impact.status,200);
   deny(await command(await row(folder.id),'move',{parentId:destination,confirmShare:true,expectedTreeRevision:'0'.repeat(64)}));
   assert.equal((await command(await row(folder.id),'move',{parentId:destination,confirmShare:true,expectedTreeRevision:impact.body.treeRevision})).status,201);
   const moved=await prisma.libraryNode.findUnique({where:{id:folder.id}});assert.equal(moved.parentId,destination);assert.equal(moved.scope,'ENTERPRISE');
  });
  await t.test('legacy missing-parent restore requires explicit same-enterprise root confirmation',async()=>{
   const parent=(await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'legacy parent fixture'})).body.nodeId;
   const child=(await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',parentId:parent,name:'legacy child fixture'})).body.nodeId;
   assert.equal((await command(await row(child),'recycle')).status,201);
   // Synthetic fixture ONLY: reproduce a legacy missing parent without touching any real tenant/data.
   await prisma.libraryNode.update({where:{id:parent},data:{state:'PURGED'}});
   const trashed=(await request('platform',`${base}/items?state=RECYCLED`)).body.items.find(n=>n.id===child);
   deny(await command(trashed,'restore'));assert.equal((await command(trashed,'restore',{confirmMissingParent:true})).status,201);assert.equal((await row(child)).parentId,null);
  });
  await t.test('empty folder purge requires confirmation and a frozen tenant rejects writes',async()=>{
   const created=await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'空目录'});const empty=await row(created.body.nodeId);assert.equal((await command(empty,'recycle')).status,201);const recycled=(await request('platform',`${base}/items?state=RECYCLED`)).body.items.find(n=>n.id===empty.id);deny(await command(recycled,'purge'));assert.equal((await command(recycled,'purge',{confirmPurge:true})).status,201);assert.equal((await prisma.libraryNode.findUnique({where:{id:empty.id}})).state,'PURGED');
   await prisma.tenant.update({where:{id:tenant},data:{status:'inactive'}});deny(await command(await row(file.id),'rename',{name:'frozen'}));const frozen=await request('platform',`${base}/items?state=ACTIVE&page=1&pageSize=100`);assert.equal(frozen.status,200);assert.equal(frozen.body.items.find(n=>n.id===file.id).canWrite,false);await prisma.tenant.update({where:{id:tenant},data:{status:'active'}});
   assert.equal((await request('platform',`${base}/nodes/${file.id}/preview`)).status,200);assert.equal((await command(await row(file.id),'rename',{name:'still managed'})).status,201);
  });
 });
});
