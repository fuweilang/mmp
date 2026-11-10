import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { LibraryService } from '../../src/library/library.service';
import { LibraryAdminService } from '../../src/library/library.admin.service';
import { LibraryController } from '../../src/library/library.controller';
import { MemoryLibraryStore } from '../../src/library/library.store';
import { AdminUsersService } from '../../src/admin/admin-users.service';
import { OidcController } from '../../src/oidc/oidc.controller';
import { JwtGuard } from '../../src/auth/jwt.guard';
import { TenantService } from '../../src/tenant/tenant.service';
import { canAccessConsole } from '../../../../packages/shared/src/index';
import type { Actor } from '../../src/library/library.types';

it('management visibility never grants AI reference access through search/open/ask/source-use', async () => {
  const store = new MemoryLibraryStore(); store.rememberTenant('a', 'A'); store.rememberTenant('b', 'B');
  const service = new LibraryService(store);
  const owner: Actor = { userId: 'owner', tenantId: 'a', activeMember: true, isOrgAdmin: false, isPlatformAdmin: false };
  const platform = { ...owner, userId: 'platform', isPlatformAdmin: true, isOrgAdmin: true };
  const mine = await service.upload(platform, { originalName: 'mine.md', mimeType: 'text/markdown', bytes: Buffer.from('member isolation mine') });
  const privateFile = await service.upload(owner, { originalName: 'private.md', mimeType: 'text/markdown', bytes: Buffer.from('member isolation private') });
  const shared = await service.upload(owner, { originalName: 'shared.md', mimeType: 'text/markdown', bytes: Buffer.from('member isolation shared') });
  await service.setScope(owner, shared.id, 'ENTERPRISE', true);
  const foreign = await service.upload({ ...owner, tenantId: 'b' }, { originalName: 'foreign.md', mimeType: 'text/markdown', bytes: Buffer.from('member isolation foreign') });
  assert.equal((await service.preview(platform, privateFile.id)).text, 'member isolation private');
  const found = await service.searchQuotes(platform, 'member isolation');
  assert.deepEqual(new Set(found.hits.map(x => x.nodeId)), new Set([mine.id, shared.id]));
  for (const item of [mine, shared]) assert.ok((await service.openCitation(platform, item.id, item.currentVersion!.id)).quote);
  let calls = 0;
  const complete = async () => { calls++; throw new Error('must not call model without authorized evidence'); };
  for (const item of [privateFile, foreign]) {
    await assert.rejects(service.openCitation(platform, item.id, item.currentVersion!.id), { status: 404 });
    await assert.rejects(service.markUsed(platform, item.id, item.currentVersion!.id), { status: 404 });
    assert.equal((await service.ask(platform, [item.currentVersion!.id], 'question', undefined, complete)).status, 'no_evidence');
  }
  await service.recycle(owner, shared.id);
  await assert.rejects(service.openCitation(platform, shared.id, shared.currentVersion!.id), { code: 'RECYCLED' });
  assert.equal((await service.ask(platform, [shared.currentVersion!.id], 'question', undefined, complete)).status, 'no_evidence');
  assert.equal((await service.searchQuotes(platform, 'shared')).hits.length, 0);
  await service.restore(owner, shared.id);
  await service.setScope(owner, shared.id, 'PRIVATE');
  await assert.rejects(service.openCitation(platform, shared.id, shared.currentVersion!.id), { status: 404 });
  assert.equal(calls, 0);
});

it('member discovery does not use Admin tenant discovery or choose the first membership', async () => {
  const queries: object[] = [];
  const db = {
    orgMember: { findMany: async (query: object) => { queries.push(query); return [{ tenant: { id: 'a', name: 'A' } }, { tenant: { id: 'b', name: 'B' } }]; } },
  };
  const controller = new LibraryController({} as never, db as never, {} as never, { sign: () => 'synthetic-scoped-test-value' } as never);
  const user = { id: 'platform', isPlatformAdmin: true } as never;
  assert.equal((await controller.context(user, null)).selectedTenantId, null);
  assert.equal((await controller.context(user, 'foreign')).selectedTenantId, null);
  assert.equal((await controller.context(user, 'b')).selectedTenantId, 'b');
  assert.deepEqual(queries[0], { where: { userId: 'platform', tenant: { status: 'active' } }, select: { tenant: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
  await assert.rejects(controller.selectContext(user, { tenantId: 'foreign' }), /只能选择/);
  assert.equal((await controller.selectContext(user, { tenantId: 'a' })).selectedTenantId, 'a');
});

it('platform membership never unlocks Console on either frontend or backend', async () => {
  const user = { id: 'platform', isPlatformAdmin: true };
  const session = { user, currentTenant: { id: 'a' }, effectivePermissions: ['portal.console.access'] };
  assert.equal(canAccessConsole(session as never), false);
  const tenants = new TenantService({} as never);
  await assert.rejects(tenants.requireConsolePerm(user as never, 'a', 'portal.console.members'), /Admin/);
  await assert.rejects(tenants.requireConsoleAdmin(user as never, 'a'), /Admin/);
});

it('a library-member credential cannot be reused for Admin, auth, Console, custody or member management', async () => {
  const guard = new JwtGuard(
    { verifyAsync: async () => ({ sub: 'platform', tenantId: 'a', purpose: 'library-member' }) } as never,
    { user: { findUnique: async () => ({ id: 'platform', status: 'active' }) },
      userRole: { findMany: async () => [{ role: { key: 'super_admin', scope: 'PLATFORM', tenantId: null, permissions: [{ permKey: 'portal.admin.access' }] } }] },
      orgPresetOverride: { findUnique: async () => null } } as never,
    { get: () => 'fixture' } as never,
  );
  const request = (path: string) => ({ switchToHttp: () => ({ getRequest: () => ({ path, headers: { authorization: 'Bearer synthetic-test-credential' } }) }) });
  for (const path of ['/api/admin/enterprises', '/api/auth/me', '/api/library/admin/tenants', '/api/library/members', '/api/library/managed/grant', '/api/tenants/current/members']) {
    await assert.rejects(guard.canActivate(request(path) as never), /不能访问管理功能/);
  }
  for (const path of ['/api/library/context', '/api/library/config', '/api/library/search', '/api/library/nodes/file/source', '/api/library/open']) {
    assert.equal(await guard.canActivate(request(path) as never), true);
  }
});

it('terminal actor requires a live real membership and never gains platform management powers', async () => {
  let member = true; let active = true;
  const db = { orgMember: { findUnique: async () => member ? { role: 'ADMIN' } : null }, tenant: { findUnique: async () => ({ status: active ? 'active' : 'inactive', type: 'ENTERPRISE' }) } };
  const controller = new LibraryController({ config: async (actor: Actor) => actor } as never, db as never, {} as never, {} as never);
  const user = { id: 'platform', isPlatformAdmin: true } as never;
  const read = async () => { const value: object = await controller.config(user, 'a'); return value as Actor; };
  assert.deepEqual(await read(), {userId:'platform',tenantId:'a',activeMember:true,isPlatformAdmin:true,isOrgAdmin:false});
  member = false;assert.equal((await read()).tenantId, '');
  member = true;active = false;assert.equal((await read()).activeMember, false);assert.equal((await read()).tenantId, '');
});

it('headquarters membership opens the same member library and does not grant org-admin powers', async () => {
  const db = { orgMember: { findUnique: async () => ({ role: 'ADMIN' }) }, tenant: { findUnique: async () => ({ status: 'active', type: 'PLATFORM' }) } };
  const controller = new LibraryController({ config: async (actor: Actor) => actor } as never, db as never, {} as never, {} as never);
  const user = { id: 'platform', isPlatformAdmin: true } as never;
  assert.deepEqual(await controller.config(user, 'hq'), { userId: 'platform', tenantId: 'hq', activeMember: true, isPlatformAdmin: true, isOrgAdmin: false });
});

it('a library credential cannot be exchanged for an unrestricted OIDC login through a cookie', async () => {
  let issued = false; let cleared = false; let redirected = '';
  const oidc = new OidcController({isAllowedClient:()=>true,isAllowedRedirect:()=>true,authorizeUrl:()=>'/authorize',loginRedirect:()=>'/login',issueCode:()=>{issued=true;return 'never';}} as never,
    {verifyAsync:async()=>({sub:'platform',tenantId:'a',purpose:'library-member'})} as never,
    {user:{findUnique:async()=>{throw new Error('restricted credential must be rejected before database access');}}} as never,
    {get:(key:string)=>key==='COOKIE_NAME'?'fixture':'http://127.0.0.1'} as never);
  await oidc.authorize({response_type:'code',client_id:'fixture',redirect_uri:'http://127.0.0.1/callback',state:'state',nonce:'nonce',code_challenge:'challenge'},
    {cookies:{fixture:'synthetic-library-credential'},hostname:'127.0.0.1',protocol:'http'} as never,
    {clearCookie:()=>{cleared=true;},redirect:(value:string)=>{redirected=value;}} as never);
  assert.equal(issued,false);assert.equal(cleared,true);assert.equal(redirected,'/login');
});

it('Admin statistics count active file owners and shared files, but storage includes history and recycle', async () => {
  const service = new LibraryAdminService({
    tenant:{count:async()=>1,findMany:async()=>[{id:'a',name:'A',status:'active'}]},
    libraryNode:{findMany:async()=>[
      {kind:'FILE',state:'ACTIVE',scope:'PRIVATE',ownerUserId:'p',currentVersionId:'v1'},
      {kind:'FILE',state:'ACTIVE',scope:'ENTERPRISE',ownerUserId:'q',currentVersionId:'v2'},
      {kind:'FILE',state:'RECYCLED',scope:'ENTERPRISE',ownerUserId:'r',currentVersionId:'v3'},
      {kind:'FOLDER',state:'ACTIVE',scope:'ENTERPRISE',ownerUserId:'s',currentVersionId:null},
    ]},
    libraryVersion:{findMany:async()=>[
      {id:'v1',sizeBytes:10,parseStatus:'READY'},{id:'v2',sizeBytes:2,parseStatus:'FAILED'},
      {id:'old',sizeBytes:8,parseStatus:'FAILED'},{id:'v3',sizeBytes:5,parseStatus:'FAILED'},
    ]},
  } as never);
  const page=await service.tenants({id:'platform',isPlatformAdmin:true},{page:1,pageSize:20} as never);
  assert.deepEqual(page.items[0],{id:'a',name:'A',status:'active',memberCount:2,sharedFiles:1,activeFiles:2,folderCount:1,linkCount:0,recycledCount:1,usedBytes:25,failed:1});
});
it('Admin ownership validation accepts a real platform member, never a platform-only or inactive account', async () => {
  const service = new LibraryAdminService({} as never);
  let member = true;let status = 'active';
  const db = {orgMember:{findUnique:async()=>member?{user:{status,isPlatformAdmin:true}}:null}};
  await service['owner'](db as never,'a','platform');
  member=false;await assert.rejects(service['owner'](db as never,'a','platform'),{code:'BAD_OWNER'});
  member=true;status='inactive';await assert.rejects(service['owner'](db as never,'a','platform'),{code:'BAD_OWNER'});
});

it('Admin adds a MEMBER relationship without deleting memberships or changing platform roles', async () => {
  const upserts: object[] = [];const audits: object[] = [];
  let status='active';let type='ENTERPRISE';let keys=['super_admin'];
  const db = {
    user:{findUnique:async()=>({id:'target',status:'active',isPlatformAdmin:true})},
    tenant:{findUnique:async()=>({status,type})},
    orgMember:{upsert:async(value:object)=>{upserts.push(value);},deleteMany:async()=>{throw new Error('must preserve all existing memberships');}},
    userRole:{deleteMany:async()=>{throw new Error('must preserve platform roles');}},
    auditLog:{create:async(value:object)=>{audits.push(value);}},
    $transaction:async(work:(tx:object)=>Promise<void>)=>work(db),
  };
  const service = new AdminUsersService(db as never, {
    adminScope:async()=>null,getRoleKeys:async()=>keys,
    assertTenantInScope:async()=>{},
    assertCanManageSuperAdmin:async(actor:{id:string})=>{if(actor.id!=='super-actor')throw new Error('only super admin can bind super admin');},
    getUser:async()=>({id:'target',isPlatformAdmin:true,roleKeys:['super_admin']}),
  } as never);
  const actor={id:'super-actor',isPlatformAdmin:true} as never;
  const updated=await service.updateUser(actor,'target',{addMemberTenantId:'a'});
  assert.deepEqual(updated.roleKeys,['super_admin']);
  assert.deepEqual(upserts,[{where:{userId_tenantId:{userId:'target',tenantId:'a'}},create:{userId:'target',tenantId:'a',role:'MEMBER'},update:{}}]);
  assert.equal(audits.length,1);assert.ok(JSON.stringify(audits).includes('addedMemberTenantId'));
  await assert.rejects(service.updateUser(actor,'target',{addMemberTenantId:'a',tenantId:'b'}), /不能同时替换/);
  await assert.rejects(service.updateUser({id:'platform-actor',isPlatformAdmin:true} as never,'target',{addMemberTenantId:'a'}), /only super admin/);
  status='inactive';await assert.rejects(service.updateUser(actor,'target',{addMemberTenantId:'a'}), /有效业务企业/);
  status='active';type='PLATFORM';await assert.rejects(service.updateUser(actor,'target',{addMemberTenantId:'a'}), /平台总部/);
  type='ENTERPRISE';keys=[];await assert.rejects(service.updateUser(actor,'target',{addMemberTenantId:'a'}), /既有平台账号/);
  assert.equal(upserts.length,1);
});
