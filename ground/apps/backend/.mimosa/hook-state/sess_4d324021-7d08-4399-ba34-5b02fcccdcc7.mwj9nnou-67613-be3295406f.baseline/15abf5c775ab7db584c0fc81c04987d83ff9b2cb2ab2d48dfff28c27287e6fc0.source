import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenUsageService } from '../src/billing/token-usage.service';

function harness(existing: { id: string; meta: unknown } | null) {
  const updates: Array<{ where: { id: string }; data: { meta: Record<string, unknown> } }> = [];
  const prisma = {
    tokenUsageTurn: {
      findUnique: async () => existing,
      update: async (args: { where: { id: string }; data: { meta: Record<string, unknown> } }) => {
        updates.push(args);
        return existing;
      },
    },
  };
  const service = new TokenUsageService(prisma as never, {} as never, {} as never);
  return { service, updates };
}

test('结算成功保留价格快照并写入金额、流水和对账时间', async () => {
  const { service, updates } = harness({ id: 'usage-1', meta: { billingStatus: 'pending-settlement', purchaseCostYuan: '0.25' } });
  assert.deepEqual(await service.markTokenUsageSettlement('gw-usage-1', {
    status: 'settled', chargedCoins: 750, ledgerId: 'ledger-1',
  }), { ok: true });
  const meta = updates[0]?.data.meta;
  assert.ok(meta);
  assert.equal(meta.billingStatus, 'settled');
  assert.equal(meta.purchaseCostYuan, '0.25');
  assert.equal(meta.chargedCoins, 750);
  assert.equal(meta.ledgerId, 'ledger-1');
  assert.ok(Number.isFinite(Date.parse(String(meta.settledAt))));
});

test('结算失败记录失败原因且不清空原有用量信息', async () => {
  const { service, updates } = harness({ id: 'usage-2', meta: { billingStatus: 'pending-settlement', inputTokens: 100 } });
  await service.markTokenUsageSettlement('gw-usage-2', {
    status: 'settlement-failed', reason: 'insufficient-ai-coins',
  });
  const meta = updates[0]?.data.meta;
  assert.ok(meta);
  assert.equal(meta.billingStatus, 'settlement-failed');
  assert.equal(meta.settlementError, 'insufficient-ai-coins');
  assert.equal(meta.inputTokens, 100);
  assert.ok(Number.isFinite(Date.parse(String(meta.settlementFailedAt))));
});

test('用量行不存在时返回可识别的未找到结果', async () => {
  const { service, updates } = harness(null);
  assert.deepEqual(await service.markTokenUsageSettlement('missing', {
    status: 'exempt', chargedCoins: 0,
  }), { ok: false, reason: 'usage-not-found' });
  assert.equal(updates.length, 0);
});
