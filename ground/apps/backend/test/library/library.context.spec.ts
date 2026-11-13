import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createLibraryContext, withWrite } from '../../src/library/library.context';
import { createLibraryService } from '../../src/library/library.service';
import { MemoryLibraryStore, type LibraryStore } from '../../src/library/library.store';
import type { Actor } from '../../src/library/library.types';

const owner: Actor = { userId: 'owner', tenantId: 'ta', activeMember: true, isOrgAdmin: false, isPlatformAdmin: false };

/** Records whether a call really ran inside the one write transaction the service opened. */
class ProbeStore extends MemoryLibraryStore {
  opens = 0;
  inTx = false;
  txNodeUpdates = 0;
  failAudit = false;

  override async withTenantWrite<T>(tenantId: string, work: (store: LibraryStore) => Promise<T>): Promise<T> {
    if (this.inTx) return super.withTenantWrite(tenantId, work);
    this.opens += 1;
    return super.withTenantWrite(tenantId, async store => {
      this.inTx = true;
      try {
        return await work(store);
      } finally {
        this.inTx = false;
      }
    });
  }

  override async updateNode(id: string, patch: Parameters<MemoryLibraryStore['updateNode']>[1]) {
    if (this.inTx) this.txNodeUpdates += 1;
    return super.updateNode(id, patch);
  }

  override async audit(row: Parameters<MemoryLibraryStore['audit']>[0]) {
    if (this.failAudit) throw new Error('audit unavailable');
    return super.audit(row);
  }
}

async function seed() {
  const store = new ProbeStore();
  store.rememberTenant('ta', '甲');
  store.rememberUser('owner', '甲');
  const service = createLibraryService({ store });
  const folder = await service.createFolder(owner, '资料');
  store.opens = 0;
  store.txNodeUpdates = 0;
  return { store, service, folder };
}

it('opens one transaction per write and applies the change through that transaction handle', async () => {
  const { store, service, folder } = await seed();
  const item = await service.rename(owner, folder.id, '改名');
  assert.equal(item.name, '改名');
  assert.equal(store.opens, 1, '一次写操作只开启一个事务');
  assert.equal(store.txNodeUpdates, 1, '节点更新发生在事务句柄上');
  assert.equal((await store.getNode(folder.id))?.name, '改名');
});

it('rolls the whole write back when a later step inside the transaction fails', async () => {
  const { store, service, folder } = await seed();
  store.failAudit = true;
  await assert.rejects(() => service.rename(owner, folder.id, '不该保留'), /audit unavailable/);
  assert.equal((await store.getNode(folder.id))?.name, '资料', '事务内的节点改名被回滚');
  assert.equal(store.audits.filter(row => row.action === 'library_rename').length, 0, '事务内的审计同样回滚');
  store.failAudit = false;
  assert.equal((await store.getNode(folder.id))?.name, '资料');
});

it('an already open transaction is reused instead of nesting a second one', async () => {
  const { store, service, folder } = await seed();
  const plain = createLibraryService({ store });
  await assert.rejects(async () => {
    await store.withTenantWrite('ta', async txStore => {
      // 平台管理路径：外层已开事务，领域服务按 writing=false 构造。
      const tx = createLibraryService({ store: txStore });
      const txItem = await tx.rename(owner, folder.id, '外层事务内改名');
      assert.equal(txItem.name, '外层事务内改名');
      assert.equal((await txStore.getNode(folder.id))?.name, '外层事务内改名', '同一事务内可见未提交结果');
      throw new Error('outer abort');
    });
  }, /outer abort/);
  assert.equal(store.opens, 1, '外层与内层共用同一个事务');
  assert.equal((await store.getNode(folder.id))?.name, '资料', '外层回滚连内层写入一起撤销');
  // 普通路径仍保持原有语义，不受上面的事务影响。
  const direct = await plain.rename(owner, folder.id, '普通改名');
  assert.equal(direct.name, '普通改名');
  assert.equal(store.opens, 2);
  assert.equal(service.limitsView().tenantQuotaBytes, plain.limitsView().tenantQuotaBytes);
});

it('withWrite shares limits, clock and the transaction flag with the nested context', async () => {
  let clock = 1_000;
  const store = new MemoryLibraryStore();
  store.rememberTenant('ta', '甲');
  const ctx = createLibraryContext({ store, now: () => clock, writing: false });
  await withWrite(ctx, owner, async inner => {
    assert.equal(inner.writing, true);
    assert.equal(inner.now(), 1_000);
    assert.equal(inner.limits.tenantQuotaBytes, ctx.limits.tenantQuotaBytes);
    clock = 2_000;
    assert.equal(inner.now(), 2_000, '时钟函数原样透传');
  });
  await assert.rejects(async () => withWrite(ctx, { ...owner, tenantId: '' }, async () => undefined), /缺少企业上下文/);
});
