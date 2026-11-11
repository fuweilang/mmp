import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LibraryService } from '../../src/library/library.service';
import { MemoryLibraryStore } from '../../src/library/library.store';
import type { Actor } from '../../src/library/library.types';

function setup() {
  const store = new MemoryLibraryStore();
  store.rememberTenant('a', '企业甲');
  const service = new LibraryService(store);
  const owner: Actor = { userId: 'owner', tenantId: 'a', activeMember: true, isOrgAdmin: false, isPlatformAdmin: false };
  const mate = { ...owner, userId: 'mate' };
  const admin = { ...owner, userId: 'admin', isOrgAdmin: true };
  const other = { ...mate, tenantId: 'b' };
  const file = (parentId?: string) => service.upload(owner, { originalName: 'notes.md', mimeType: 'text/markdown', bytes: Buffer.from('正文'), parentId });
  return { store, service, owner, mate, admin, other, file };
}

describe('library sharing inheritance', () => {
  it('creates a shared root directly for an ordinary member while private roots remain private', async () => {
    const { service, owner, mate, other } = setup();
    const shared = await service.createFolder(owner, '共享根目录', null, { scope: 'ENTERPRISE', confirmShare: true });
    assert.equal(shared.scope, 'ENTERPRISE');
    assert.equal(shared.ownerUserId, 'owner');
    assert.deepEqual((await service.list(mate, 'shared')).items.map(x => x.id), [shared.id]);
    assert.equal((await service.list(other, 'shared')).items.length, 0);
    assert.equal((await service.createFolder(owner, '私人')).scope, 'PRIVATE');
    await assert.rejects(service.createFolder(owner, '缺少确认', null, { scope: 'ENTERPRISE' }), { code: 'CONFIRM_SHARE' });
  });

  it('inherits shared visibility for nested folders, old-client uploads and saved links', async () => {
    const { service, owner, mate, file } = setup();
    const root = await service.createFolder(owner, '共享');
    await service.setScope(owner, root.id, 'ENTERPRISE', true);
    const nested = await service.createFolder(mate, '同事子目录', root.id);
    const document = await file(nested.id);
    const link = await service.createLink(owner, '链接', 'https://example.test', nested.id);
    assert.equal(nested.scope, 'ENTERPRISE');
    assert.equal(nested.ownerUserId, mate.userId);
    assert.equal(document.scope, 'ENTERPRISE');
    assert.equal(link.scope, 'ENTERPRISE');
    assert.match((await service.preview(mate, document.id)).text ?? '', /正文/);
    await assert.rejects(service.rename(mate, document.id, '不能编辑他人文件'), { status: 403 });
  });

  it('rejects a stale client scope instead of silently sharing after a parent changes', async () => {
    const { service, owner } = setup();
    const root = await service.createFolder(owner, '父目录');
    await service.setScope(owner, root.id, 'ENTERPRISE', true);
    await assert.rejects(service.createFolder(owner, '旧页面创建', root.id, { scope: 'PRIVATE' }), { code: 'SCOPE_CONFLICT' });
  });

  it('shares every descendant including recycled items without changing ids or ownership', async () => {
    const { service, owner, mate, store, file } = setup();
    const root = await service.createFolder(owner, '目录');
    const nested = await service.createFolder(owner, '二级', root.id);
    const active = await file(nested.id);
    const recycled = await file(root.id);
    await service.recycle(owner, recycled.id);
    const impact = await service.scopeImpact(owner, root.id, 'ENTERPRISE');
    assert.equal(impact.total, 4);
    assert.equal(impact.changed, 4);
    await service.setScope(owner, root.id, 'ENTERPRISE', true, { expectedTreeRevision: impact.treeRevision });
    for (const id of [root.id, nested.id, active.id, recycled.id]) {
      assert.equal((await store.getNode(id))?.scope, 'ENTERPRISE');
      assert.equal((await store.getNode(id))?.ownerUserId, owner.userId);
    }
    await service.restore(owner, recycled.id);
    assert.match((await service.preview(mate, recycled.id)).text ?? '', /正文/);
  });

  it('rejects sharing hidden private descendants of a legacy shared folder, including for org admins', async () => {
    const { service, owner, mate, admin, store } = setup();
    const root = await service.createFolder(owner, '目录');
    await service.setScope(owner, root.id, 'ENTERPRISE', true);
    const own = await service.createFolder(owner, '自己的子项', root.id);
    const foreign = await service.createFolder(mate, '隐藏的他人资料');
    await store.updateNode(foreign.id, { parentId: root.id });
    for (const who of [owner, admin]) {
      await assert.rejects(service.setScope(who, root.id, 'ENTERPRISE', true), error => {
        assert.equal((error as { code?: string }).code, 'FORBIDDEN');
        assert.equal(String(error).includes('隐藏的他人资料'), false);
        return true;
      });
    }
    assert.equal((await store.getNode(root.id))?.scope, 'ENTERPRISE');
    assert.equal((await store.getNode(own.id))?.scope, 'ENTERPRISE');
    assert.equal((await store.getNode(foreign.id))?.scope, 'PRIVATE');
  });

  it('rolls back all subtree changes if storage rejects one update', async () => {
    const { service, owner, store } = setup();
    const root = await service.createFolder(owner, '目录');
    const child = await service.createFolder(owner, '子目录', root.id);
    const original = store.updateNode.bind(store);
    store.updateNode = async (id, patch) => {
      if (id === child.id && patch.scope === 'ENTERPRISE') throw new Error('storage rejected');
      return original(id, patch);
    };
    await assert.rejects(service.setScope(owner, root.id, 'ENTERPRISE', true), /storage rejected/);
    assert.equal((await store.getNode(root.id))?.scope, 'PRIVATE');
    assert.equal((await store.getNode(child.id))?.scope, 'PRIVATE');
  });

  it('refuses stale recursive confirmation when the subtree changed', async () => {
    const { service, owner, store } = setup();
    const root = await service.createFolder(owner, '目录');
    const impact = await service.scopeImpact(owner, root.id, 'ENTERPRISE');
    await service.createFolder(owner, '确认后新增', root.id);
    await assert.rejects(service.setScope(owner, root.id, 'ENTERPRISE', true, { expectedTreeRevision: impact.treeRevision }), { code: 'TREE_CONFLICT' });
    assert.equal((await store.getNode(root.id))?.scope, 'PRIVATE');
  });

  it('requires move confirmation and shares the entire private subtree atomically', async () => {
    const { service, owner, mate, store, file } = setup();
    const shared = await service.createFolder(owner, '共享');
    await service.setScope(owner, shared.id, 'ENTERPRISE', true);
    const root = await service.createFolder(owner, '待移动');
    const child = await file(root.id);
    await assert.rejects(service.move(owner, root.id, shared.id), { code: 'CONFIRM_SHARE' });
    assert.equal((await store.getNode(root.id))?.parentId, null);
    await service.move(owner, root.id, shared.id, { confirmShare: true });
    assert.equal((await store.getNode(child.id))?.scope, 'ENTERPRISE');
    assert.match((await service.preview(mate, child.id)).text ?? '', /正文/);
    await service.move(owner, root.id, null);
    assert.equal((await store.getNode(child.id))?.scope, 'ENTERPRISE');
  });

  it('blocks a private override inside shared folders and confirms recursive unsharing at the root', async () => {
    const { service, owner, mate, file, store } = setup();
    const root = await service.createFolder(owner, '共享');
    const child = await file(root.id);
    await service.setScope(owner, root.id, 'ENTERPRISE', true);
    await assert.rejects(service.setScope(owner, child.id, 'PRIVATE'), { code: 'SHARED_PARENT' });
    await assert.rejects(service.setScope(owner, root.id, 'PRIVATE'), { code: 'CONFIRM_UNSHARE' });
    await service.setScope(owner, root.id, 'PRIVATE', false, { confirmUnshare: true });
    assert.equal((await store.getNode(child.id))?.scope, 'PRIVATE');
    await assert.rejects(service.preview(mate, child.id), { status: 404 });
  });

  it('rejects cross-tenant, invisible and recycled targets and former members', async () => {
    const { service, owner, mate, other, store } = setup();
    const root = await service.createFolder(owner, '私人目录');
    await assert.rejects(service.createFolder(mate, '越权', root.id), { status: 404 });
    await assert.rejects(service.createFolder(other, '跨企业', root.id), { status: 404 });
    await service.recycle(owner, root.id);
    await assert.rejects(service.createFolder(owner, '回收目录', root.id), { code: 'BAD_PARENT' });
    await assert.rejects(service.createFolder({ ...owner, activeMember: false }, '离职后共享', null, { scope: 'ENTERPRISE', confirmShare: true }), { code: 'NOT_MEMBER' });
    assert.equal((await store.listNodes(owner.tenantId)).length, 1);
  });

  it('rejects an upload whose parent changes during blob persistence and cleans up the blob', async () => {
    const { service, owner, store, file } = setup();
    const root = await service.createFolder(owner, '目录');
    const put = store.putBlob.bind(store);
    store.putBlob = async (key, bytes) => {
      await put(key, bytes);
      await service.setScope(owner, root.id, 'ENTERPRISE', true);
    };
    await assert.rejects(file(root.id), { code: 'SCOPE_CONFLICT' });
    assert.equal(store.blobs.size, 0);
    assert.equal((await store.listNodes(owner.tenantId)).length, 1);
  });

  it('serializes a concurrent child creation and recursive share', async () => {
    const { service, owner, store } = setup();
    const root = await service.createFolder(owner, '目录');
    await Promise.all([
      service.createFolder(owner, '并发新增', root.id),
      service.setScope(owner, root.id, 'ENTERPRISE', true),
    ]);
    assert.deepEqual((await store.listNodes(owner.tenantId)).map(row => row.scope), ['ENTERPRISE', 'ENTERPRISE']);
  });

  it('requires both source and destination CRUD grants for platform recursive sharing', async () => {
    const { service, owner, admin, store } = setup();
    const root = await service.createFolder(owner, '目录');
    const child = await service.createFolder(owner, '子目录', root.id);
    const expiresAt = Date.now() + 60_000;
    const source = await service.grantCustody(owner, { tenantId: owner.tenantId, granteeUserId: 'platform', contentScope: 'PRIVATE_OWNER', ownerUserId: owner.userId, powers: 'CRUD', expiresAt, reason: '本人批准资料管理' });
    const target = await service.grantCustody(admin, { tenantId: owner.tenantId, granteeUserId: 'platform', contentScope: 'ENTERPRISE', powers: 'CRUD', expiresAt, reason: '企业批准共享管理' });
    const platform = await service.managedActor({ userId: 'platform', isPlatformAdmin: true }, source.id);
    await assert.rejects(service.setScope(platform, root.id, 'ENTERPRISE', true), { code: 'FORBIDDEN' });
    assert.equal((await store.getNode(child.id))?.scope, 'PRIVATE');
    await service.setScope({ ...platform, targetCustodyId: target.id }, root.id, 'ENTERPRISE', true);
    assert.equal((await store.getNode(child.id))?.scope, 'ENTERPRISE');
  });

  it('uses the destination CRUD grant when a platform custodian moves a private tree into a shared folder', async () => {
    const { service, owner, admin, store } = setup();
    const destination = await service.createFolder(owner, '共享目标', null, { scope: 'ENTERPRISE', confirmShare: true });
    const root = await service.createFolder(owner, '待移动');
    const child = await service.createFolder(owner, '私人子项', root.id);
    const expiresAt = Date.now() + 60_000;
    const source = await service.grantCustody(owner, { tenantId: owner.tenantId, granteeUserId: 'platform', contentScope: 'PRIVATE_OWNER', ownerUserId: owner.userId, powers: 'CRUD', expiresAt, reason: '本人批准目录管理' });
    const target = await service.grantCustody(admin, { tenantId: owner.tenantId, granteeUserId: 'platform', contentScope: 'ENTERPRISE', powers: 'CRUD', expiresAt, reason: '企业批准共享管理' });
    const platform = { ...await service.managedActor({ userId: 'platform', isPlatformAdmin: true }, source.id), targetCustodyId: target.id };
    const impact = await service.scopeImpact(platform, root.id, 'ENTERPRISE');
    await service.move(platform, root.id, destination.id, { confirmShare: true, expectedTreeRevision: impact.treeRevision });
    assert.equal((await store.getNode(root.id))?.parentId, destination.id);
    assert.equal((await store.getNode(child.id))?.scope, 'ENTERPRISE');
  });

  it('retains file metadata and original bytes while permanent deletion is blocked', async () => {
    const { service, owner, store, file } = setup();
    const item = await file();
    await service.recycle(owner, item.id);
    const blobs = store.blobs.size;
    await assert.rejects(service.purge(owner, item.id), { status: 409, code: 'REFERENCE_UNVERIFIED' });
    assert.equal(store.blobs.size, blobs);
    assert.equal((await store.getNode(item.id))?.state, 'RECYCLED');
    await service.restore(owner, item.id);
    assert.equal((await store.getNode(item.id))?.state, 'ACTIVE');
  });

  it('removes replacement blobs when the enclosing transaction fails after writing the version', async () => {
    const { service, owner, store, file } = setup();
    const item = await file();
    const audit = store.audit.bind(store);
    store.audit = async row => {
      if (row.action === 'library_replace') throw new Error('replacement audit unavailable');
      return audit(row);
    };
    await assert.rejects(service.replaceVersion(owner, item.id, 'new.md', 'text/markdown', Buffer.from('new version')), /replacement audit unavailable/);
    assert.equal((await store.listVersions(item.id)).length, 1);
    assert.equal((await store.getNode(item.id))?.currentVersionId, item.currentVersion?.id);
    assert.equal(store.blobs.size, 1);
    assert.ok((await service.download(owner, item.id)).bytes.length > 0);
  });
});
