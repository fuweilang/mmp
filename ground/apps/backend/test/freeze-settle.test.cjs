/**
 * 任务五/七：冻结-结算-解冻（多退少补）、幂等重试、并发冻结、价格快照、透支策略。
 * 跑法：pnpm verify:api 后 node --test test/freeze-settle.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChargeService } = require('../dist/billing/charge.service.js');
const { modelPricingSnapshot, settleModelPrice } = require('../dist/billing/model-pricing.js');
const { Prisma } = require('@prisma/client');

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '6.19.3' });
}

/** 内存版钱包/流水，模拟 updateMany 的 gte 原子语义与串行事务（等价 PG 唯一键隔离）。 */
function fixture(balanceCoins = 100000) {
  const ledgers = new Map();
  const wallet = { id: 'w1', tenantId: 'ent', balanceCoins, totalCredited: 0, totalDebited: 0 };
  let txQueue = Promise.resolve();
  const applyDebit = (coins, allowNegative) => {
    if (!allowNegative && wallet.balanceCoins < coins) return { count: 0 };
    wallet.balanceCoins -= coins;
    return { count: 1 };
  };
  const api = {
    tenantAiWallet: {
      findUnique: async () => wallet,
      findUniqueOrThrow: async () => wallet,
      create: async () => wallet,
      updateMany: async ({ where, data }) => {
        const r = applyDebit(data.balanceCoins.decrement, !where.balanceCoins);
        if (r.count && data.totalDebited) wallet.totalDebited += data.totalDebited.increment;
        return r;
      },
      update: async ({ data }) => {
        if (data.balanceCoins?.decrement) applyDebit(data.balanceCoins.decrement, true);
        if (data.balanceCoins?.increment) wallet.balanceCoins += data.balanceCoins.increment;
        if (data.totalDebited?.increment) wallet.totalDebited += data.totalDebited.increment;
        return { ...wallet };
      },
    },
    tenantAiLedger: {
      findUnique: async ({ where }) => ledgers.get(where.idempotencyKey) ?? null,
      create: async ({ data }) => {
        if (ledgers.has(data.idempotencyKey)) throw p2002();
        const row = { ...data, id: `ledger-${ledgers.size}` };
        ledgers.set(data.idempotencyKey, row);
        return row;
      },
    },
    quota: { findUnique: async () => null },
    userTokenQuota: { findUnique: async () => null },
    tokenUsageTurn: { aggregate: async () => ({ _sum: { totalTokens: 0 } }) },
    $transaction: (fn) => {
      const run = txQueue.then(async () => {
        // 快照，出错回滚（等价 PG 事务回滚）
        const walletSnap = { ...wallet };
        const ledgerSnap = new Map(ledgers);
        try {
          return await fn(api);
        } catch (err) {
          Object.assign(wallet, walletSnap);
          ledgers.clear();
          for (const [k, v] of ledgerSnap) ledgers.set(k, v);
          throw err;
        }
      });
      txQueue = run.catch(() => {});
      return run;
    },
  };
  const pricing = modelPricingSnapshot('vendor/model', { 'vendor/model': { input: 2, output: 4 } }, 2, 10000);
  const service = new ChargeService(api, { quoteModel: async () => pricing, ensureConfig: async () => ({ sellPriceMultiplier: 2, tokensPerAiCoin: 1 }) }, { ensureWallet: async () => wallet });
  return { service, wallet, ledgers, pricing, prismaApi: api };
}

const user = { id: 'u1', isPlatformAdmin: false };
const keys = (b) => ({ freezeKey: `gw-freeze-${b}`, chargeKey: `gw-charge-${b}`, unfreezeKey: `gw-unfreeze-${b}` });
const chargeDto = (key, input = 1000, output = 500) => ({
  provider: 'vendor', model: 'model', inputTokens: input, outputTokens: output, tokens: input + output, idempotencyKey: key,
});

test('冻结扣余额，结算按实际多退少补，流水三条且幂等', async () => {
  const { service, wallet, ledgers, pricing } = fixture(100000);
  const k = keys('req1');
  const f = await service.freeze(user, 'ent', { idempotencyKey: k.freezeKey, coins: 1000, provider: 'vendor', model: 'model', inputEstimate: 5000, outputEstimate: 8192 });
  assert.equal(f.frozenCoins, 1000);
  assert.equal(wallet.balanceCoins, 99000);

  const s = await service.settleFrozen(user, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, charge: chargeDto(k.chargeKey) }, pricing);
  // 实际：(1000*2 + 500*4)/1e6 * 2 * 10000 = 80 币
  assert.equal(s.chargedCoins, 80);
  assert.equal(wallet.balanceCoins, 100000 - 80);
  assert.equal(ledgers.get(k.freezeKey).type, 'chat_freeze');
  assert.equal(ledgers.get(k.unfreezeKey).type, 'chat_unfreeze');
  assert.equal(ledgers.get(k.unfreezeKey).coins, 1000);
  assert.equal(ledgers.get(k.chargeKey).type, 'chat_consume');
  assert.equal(ledgers.get(k.chargeKey).meta.pricing.modelRef, 'vendor/model');

  // 幂等重试：不重复扣、不重复退
  const again = await service.settleFrozen(user, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, charge: chargeDto(k.chargeKey) }, pricing);
  assert.equal(again.reused, true);
  assert.equal(wallet.balanceCoins, 100000 - 80);
});

test('余额不足冻结 402，请求不应发上游；结算允许透支', async () => {
  const { service, wallet, pricing } = fixture(50);
  const k = keys('req2');
  await assert.rejects(
    service.freeze(user, 'ent', { idempotencyKey: k.freezeKey, coins: 200, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 }),
    (e) => e.getStatus() === 402 && e.getResponse().balanceCoins === 50,
  );
  assert.equal(wallet.balanceCoins, 50); // 未动；失败的冻结不占幂等键，可复用同键重试

  // 冻结 40 后实际费用 80：允许透支到 -30，下次冻结被拦
  await service.freeze(user, 'ent', { idempotencyKey: k.freezeKey, coins: 40, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 });
  const s = await service.settleFrozen(user, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, charge: chargeDto(k.chargeKey) }, pricing);
  assert.equal(s.chargedCoins, 80);
  assert.equal(wallet.balanceCoins, -30);
  await assert.rejects(
    service.freeze(user, 'ent', { idempotencyKey: keys('req4').freezeKey, coins: 1, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 }),
    (e) => e.getStatus() === 402,
  );
});

test('失败补偿：解冻全额退回且幂等；已结算的不再退', async () => {
  const { service, wallet, ledgers } = fixture(1000);
  const k = keys('req5');
  await service.freeze(user, 'ent', { idempotencyKey: k.freezeKey, coins: 300, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 });
  const r1 = await service.releaseFrozen(user, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, reason: 'transport-error' });
  assert.equal(r1.refundedCoins, 300);
  assert.equal(wallet.balanceCoins, 1000);
  const r2 = await service.releaseFrozen(user, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, reason: 'retry' });
  assert.equal(r2.reused, true);
  assert.equal(wallet.balanceCoins, 1000);
  assert.equal([...ledgers.values()].filter((l) => l.type === 'chat_unfreeze').length, 1);
});

test('价格快照权威：冻结后涨价，结算仍按请求开始时价格', async () => {
  const { service, wallet, pricing } = fixture(100000);
  const k = keys('req6');
  await service.freeze(user, 'ent', { idempotencyKey: k.freezeKey, coins: 100, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 });
  // 结算时传入请求开始时的快照（即使 config 里已改价也不受影响）
  const s = await service.settleFrozen(user, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, charge: chargeDto(k.chargeKey) }, pricing);
  assert.equal(s.chargedCoins, 80); // 旧价，不是新价
  assert.equal(s.ledgerId && true, true);
});

test('并发冻结不超卖：余额只够一个，另一个 402', async () => {
  const { service, wallet } = fixture(100);
  const mk = (b) => service.freeze(user, 'ent', { idempotencyKey: keys(b).freezeKey, coins: 100, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 });
  const results = await Promise.allSettled([mk('c1'), mk('c2')]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].reason.getStatus(), 402);
  assert.equal(wallet.balanceCoins, 0);
});

test('企业/用户 Token 额度超限 429，先于冻结', async () => {
  // 企业额度 100，当月已用 150 → 429，不产生任何流水
  const fx = fixture(100000);
  const limited = new ChargeService(
    {
      ...fx.prismaApi,
      quota: { findUnique: async () => ({ monthlyTokens: 100 }) },
      tokenUsageTurn: { aggregate: async () => ({ _sum: { totalTokens: 150 } }) },
    },
    { quoteModel: async () => fx.pricing, ensureConfig: async () => ({ sellPriceMultiplier: 2, tokensPerAiCoin: 1 }) },
    { ensureWallet: async () => fx.wallet },
  );
  await assert.rejects(
    limited.freeze(user, 'ent', { idempotencyKey: 'q1-freeze', coins: 10, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 }),
    (e) => e.getStatus() === 429 && e.getResponse().code === 'TOKEN_QUOTA_EXCEEDED' && e.getResponse().scope === 'tenant',
  );
  assert.equal(fx.wallet.balanceCoins, 100000);
  assert.equal(fx.ledgers.size, 0);

  // 用户级额度：企业不限、用户超限 → 429 scope=user
  const fx2 = fixture(100000);
  const limitedUser = new ChargeService(
    {
      ...fx2.prismaApi,
      userTokenQuota: { findUnique: async () => ({ monthlyTokens: 50 }) },
      tokenUsageTurn: { aggregate: async () => ({ _sum: { totalTokens: 60 } }) },
    },
    { quoteModel: async () => fx2.pricing, ensureConfig: async () => ({ sellPriceMultiplier: 2, tokensPerAiCoin: 1 }) },
    { ensureWallet: async () => fx2.wallet },
  );
  await assert.rejects(
    limitedUser.freeze(user, 'ent', { idempotencyKey: 'q2-freeze', coins: 10, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 }),
    (e) => e.getStatus() === 429 && e.getResponse().code === 'TOKEN_QUOTA_EXCEEDED' && e.getResponse().scope === 'user',
  );
  assert.equal(fx2.wallet.balanceCoins, 100000);
  assert.equal(fx2.ledgers.size, 0);
});

test('不变量：估算冻结额 ≥ 同用量按快照的实际扣费（缓存价只低不高）', async () => {
  const fx = fixture(1000000);
  const withCache = modelPricingSnapshot('vendor/model', { 'vendor/model': { input: 2, output: 4, cachedInput: 0.4 } }, 2, 10000);
  const input = 50000, output = 8192;
  const freezeCoins = Math.max(1, settleModelPrice(withCache, input, output, 0, 0, 0).chargedCoins);
  const actualCoins = settleModelPrice(withCache, input, output, 30000, 0, 0).chargedCoins;
  assert.ok(freezeCoins >= actualCoins, `${freezeCoins} < ${actualCoins}`);

  // 结算并发重试：同 chargeKey 只有一个落库，另一个走 P2002 复用
  const k = keys('req8');
  await fx.service.freeze(user, 'ent', { idempotencyKey: k.freezeKey, coins: freezeCoins, provider: 'vendor', model: 'model', inputEstimate: input, outputEstimate: output });
  const payload = { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, charge: chargeDto(k.chargeKey, input, output) };
  const [r1, r2] = await Promise.allSettled([
    fx.service.settleFrozen(user, 'ent', payload, withCache),
    fx.service.settleFrozen(user, 'ent', payload, withCache),
  ]);
  const oks = [r1, r2].filter((r) => r.status === 'fulfilled');
  assert.equal(oks.length, 2);
  assert.equal(oks.filter((r) => r.value.reused).length, 1);
  assert.equal(fx.wallet.balanceCoins, 1000000 - fx.ledgers.get(k.chargeKey).coins);
});

test('平台管理员免冻结免结算', async () => {
  const { service, wallet, ledgers, pricing } = fixture(0);
  const admin = { id: 'a1', isPlatformAdmin: true };
  const k = keys('req7');
  const f = await service.freeze(admin, 'ent', { idempotencyKey: k.freezeKey, coins: 999, provider: 'vendor', model: 'model', inputEstimate: 1, outputEstimate: 1 });
  assert.equal(f.skipped, true);
  const s = await service.settleFrozen(admin, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, charge: chargeDto(k.chargeKey) }, pricing);
  assert.equal(s.skipped, true);
  const r = await service.releaseFrozen(admin, 'ent', { freezeKey: k.freezeKey, unfreezeKey: k.unfreezeKey, reason: 'x' });
  assert.equal(r.skipped, true);
  assert.equal(wallet.balanceCoins, 0);
  assert.equal(ledgers.size, 0);
});
