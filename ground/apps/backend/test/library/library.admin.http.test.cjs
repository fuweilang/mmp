/** Only synthetic tenants in the existing dedicated 55439 acceptance DB; normal login/JwtGuard, no user tokens. */
const assert=require('node:assert/strict');const {test}=require('node:test');const {randomUUID}=require('node:crypto');
const {withLibraryHttpFixture}=require('./library.http-fixture.cjs');
const deny=res=>assert.ok([400,403,404,409,410].includes(res.status),`expected rejection, got ${res.status}: ${res.bytes}`);
test('admin full single-tenant library workflow, real authorization/DB/version/audit boundaries',{timeout:60000},async t=>{
 await withLibraryHttpFixture(async({request,upload,prisma,users,tenants})=>{
  const tenant=tenants[0].id,foreign=tenants[1].id,owner=users[0].id,platform=users[4].id;
  const base=`admin/tenants/${tenant}`;
  const context=()=>({grantId:privateGrant,requestId:randomUUID(),reason:'isolated fixture management'});let privateGrant='',sharedGrant='';
  const grantBody=(power,scope='PRIVATE_OWNER')=>({tenantId:tenant,granteeUserId:platform,contentScope:scope,...(scope==='PRIVATE_OWNER'?{ownerUserId:owner}:{}),powers:power,expiresAt:new Date(Date.now()+120000).toISOString(),reason:'isolated fixture explicit authorization'});
  const row=async(id)=>{const r=await request('platform',`${base}/items?state=ACTIVE&page=1&pageSize=100`);assert.equal(r.status,200);return r.body.items.find(n=>n.id===id);};
  const command=async(node,action,extra={})=>request('platform',`${base}/commands`,'POST',{...context(),nodeId:node.id,action,expectedUpdatedAt:node.updatedAt,...(node.currentVersion?{expectedVersionId:node.currentVersion.id}:{}),...extra});
  let file,folder,readGrant;
  await t.test('platform metadata is separate from body access; non-platform, tenant spoof and incomplete request rejected',async()=>{
   file=(await upload('owner','私人测试.md','fixture private content')).body.items[0];
   const metadata=await request('platform',`${base}/items`);assert.equal(metadata.status,200);assert.ok(metadata.body.items.some(n=>n.name==='私人测试.md'));assert.ok(!metadata.bytes.toString().includes('fixture private content'));assert.ok(!metadata.bytes.toString().includes('storageKey'));
   deny(await request('mate',`${base}/items`));assert.equal((await request(null,`${base}/items`)).status,401);
   deny(await request('platform',`${base}/nodes/${file.id}/preview?grantId=none`));deny(await request('platform',`${base}/nodes/${file.id}/preview`));
   const foreignFile=(await upload('other','其他企业.md','foreign fixture')).body.items[0];deny(await request('platform',`${base}/nodes/${foreignFile.id}`));
   const tenantsPage=await request('platform',`admin/tenants?q=${encodeURIComponent(tenants[0].name)}&page=1&pageSize=1`);assert.equal(tenantsPage.body.total,1);assert.equal(tenantsPage.body.items[0].id,tenant);
   deny(await request('platform',`${base}/items?page=0`));deny(await request('platform',`${base}/folders`,'POST',{ownerUserId:owner,scope:'PRIVATE',name:'no auth'}));
  });
  await t.test('READ cannot mutate; CRUD needs real owner and matching tenant, and grants do not turn platform into member',async()=>{
   readGrant=(await request('owner','admin/custody','POST',grantBody('READ'))).body.id;privateGrant=readGrant;
   assert.equal((await request('platform',`${base}/nodes/${file.id}/preview?grantId=${readGrant}`)).status,200);
   deny(await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'read denied'}));
   privateGrant=(await request('owner','admin/custody','POST',grantBody('CRUD'))).body.id;
   assert.ok(privateGrant);deny(await request('platform','folders','POST',{name:'still not a member'}));
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
  await t.test('global nested search/paging/type filters do not depend on root, nonempty folder and cyclic move rejected',async()=>{
   const listed=await request('platform',`${base}/items?q=${encodeURIComponent('新增.md')}&pageSize=1&page=1`);assert.equal(listed.body.total,1);assert.deepEqual(listed.body.items[0].parentPath,['Apple']);
   const media=await request('platform',`${base}/items?fileType=image`);assert.equal(media.body.total,1);
   const opts=await request('platform',`${base}/options`);assert.ok(opts.body.filterOwners.some(o=>o.id===owner));assert.ok(opts.body.filterFolders.some(f=>f.id===folder.id));
   const scoped=await request('platform',`${base}/items?folderId=${folder.id}&ownerUserId=${owner}`);assert.equal(scoped.body.total,1);assert.equal(scoped.body.items[0].name,'新增.md');
   deny(await command(await row(folder.id),'recycle'));deny(await command(await row(folder.id),'move',{parentId:folder.id}));
  });
  await t.test('metadata update, immutable replacement and expected stamp serialize concurrent operations',async()=>{
   const current=await row(file.id);const simultaneous=await Promise.all([command(current,'rename',{name:'并发一.md'}),command(current,'rename',{name:'并发二.md'})]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);
   let active=await row(file.id);const oldVersion=active.currentVersion.id;
   const form=new FormData();for(const[k,v]of Object.entries({...context(),action:'replace',nodeId:active.id,expectedUpdatedAt:active.updatedAt,expectedVersionId:oldVersion}))form.append(k,v);form.append('files',new Blob(['replacement fixture']),'新版.md');const replaced=await request('platform',`${base}/replace`,'POST',form);assert.equal(replaced.status,201);assert.notEqual(replaced.body.versionId,oldVersion);
   const old=await request('platform',`${base}/nodes/${file.id}/preview?grantId=${privateGrant}&versionId=${oldVersion}`);assert.equal(old.body.text,'fixture private content');
   const pinned=await request('platform',`${base}/nodes/${file.id}/download?grantId=${privateGrant}&versionId=${oldVersion}`);assert.equal(pinned.status,200);assert.equal(pinned.bytes.toString(),'fixture private content');assert.equal(pinned.headers.get('x-content-type-options'),'nosniff');assert.match(pinned.headers.get('cache-control'),/no-store/);
   const newer=await request('platform',`${base}/nodes/${file.id}/preview?grantId=${privateGrant}&versionId=${replaced.body.versionId}`);assert.equal(newer.body.text,'replacement fixture');
   active=await row(file.id);assert.equal((await command(active,'move',{parentId:folder.id})).status,201);assert.equal((await command(await row(file.id),'move',{parentId:''})).status,201);assert.equal((await row(file.id)).parentId,null);
   const detail=await request('platform',`${base}/nodes/${file.id}`);assert.equal(detail.body.versionCount,2);assert.ok(detail.body.audit.some(a=>a.meta.success===false));assert.ok(detail.body.audit.some(a=>a.userId===platform&&a.meta.originalOwnerUserId===owner&&a.meta.before&&a.meta.after));assert.ok(!detail.bytes.toString().includes('replacement fixture'));
  });
  await t.test('sharing requires destination scope grant and explicit confirmation; processing and unknown references are protected',async()=>{
   let active=await row(file.id);deny(await command(active,'scope',{scope:'ENTERPRISE',confirmShare:true}));
   sharedGrant=(await request('tenantAdmin','admin/custody','POST',grantBody('CRUD','ENTERPRISE'))).body.id;assert.ok(sharedGrant);
   deny(await command(active,'scope',{scope:'ENTERPRISE',targetGrantId:sharedGrant}));
   assert.equal((await command(active,'scope',{scope:'ENTERPRISE',targetGrantId:sharedGrant,confirmShare:true})).status,201);
   active=await row(file.id);assert.equal(active.scope,'ENTERPRISE');assert.equal((await command(active,'scope',{grantId:sharedGrant,scope:'PRIVATE',targetGrantId:privateGrant})).status,201);
   active=await row(file.id);await prisma.libraryVersion.update({where:{id:active.currentVersion.id},data:{parseStatus:'PROCESSING'}});deny(await command(active,'recycle'));await prisma.libraryVersion.update({where:{id:active.currentVersion.id},data:{parseStatus:'READY'}});
   assert.equal((await command(await row(file.id),'recycle')).status,201);const trash=(await request('platform',`${base}/items?state=RECYCLED`)).body.items.find(n=>n.id===file.id);const impact=await request('platform',`${base}/nodes/${file.id}/impact`);assert.equal(impact.body.referenceStatus,'UNVERIFIED');assert.equal(impact.body.canPurge,false);deny(await command(trash,'purge',{confirmPurge:true}));
   assert.equal((await command(trash,'restore')).status,201);assert.equal((await row(file.id)).currentVersion.versionNo,2);
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
  await t.test('empty folder purge requires confirmation, frozen tenant and revoked/expired grants reject server-side',async()=>{
   const created=await request('platform',`${base}/folders`,'POST',{...context(),ownerUserId:owner,scope:'PRIVATE',name:'空目录'});const empty=await row(created.body.nodeId);assert.equal((await command(empty,'recycle')).status,201);const recycled=(await request('platform',`${base}/items?state=RECYCLED`)).body.items.find(n=>n.id===empty.id);deny(await command(recycled,'purge'));assert.equal((await command(recycled,'purge',{confirmPurge:true})).status,201);assert.equal((await prisma.libraryNode.findUnique({where:{id:empty.id}})).state,'PURGED');
   await prisma.tenant.update({where:{id:tenant},data:{status:'inactive'}});deny(await command(await row(file.id),'rename',{name:'frozen'}));await prisma.tenant.update({where:{id:tenant},data:{status:'active'}});
   await request('owner',`admin/custody/${privateGrant}/revoke`,'POST');deny(await command(await row(file.id),'rename',{name:'revoked'}));deny(await request('platform',`${base}/nodes/${file.id}/preview?grantId=${privateGrant}`));
   await prisma.libraryCustody.update({where:{id:sharedGrant},data:{expiresAt:new Date(Date.now()-1000)}});deny(await request('platform',`${base}/nodes/${file.id}/preview?grantId=${sharedGrant}`));
  });
 });
});
