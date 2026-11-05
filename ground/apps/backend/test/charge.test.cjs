const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChargeService } = require('../dist/billing/charge.service.js');
const { JwtGuard } = require('../dist/auth/jwt.guard.js');
const { modelPricingSnapshot } = require('../dist/billing/model-pricing.js');

function fixture() {
  const rows = new Map();
  const wallet = { id: 'wallet', tenantId: 'enterprise', balanceCoins: 10, totalDebited: 0 };
  const pricing = modelPricingSnapshot('vendor/model', { 'vendor/model': { input: 1, output: 1 } }, 2, 10000);
  const tx = {
    tenantAiWallet: {
      findUnique: async () => wallet,
      findUniqueOrThrow: async () => ({ ...wallet }),
      updateMany: async ({ where, data }) => {
        if (where.balanceCoins && wallet.balanceCoins < where.balanceCoins.gte) return { count: 0 };
        wallet.balanceCoins -= data.balanceCoins.decrement;
        wallet.totalDebited += data.totalDebited.increment;
        return { count: 1 };
      },
    },
    tenantAiLedger: {
      findUnique: async ({ where }) => rows.get(where.idempotencyKey),
      create: async ({ data }) => { const row = { ...data, id: 'ledger' }; rows.set(data.idempotencyKey, row); return row; },
    },
  };
  const db = { ...tx, $transaction: async action => action(tx) };
  const service = new ChargeService(db, { quoteModel: async () => pricing, ensureConfig: async () => ({ sellPriceMultiplier: 2, tokensPerAiCoin: 1 }) }, { ensureWallet: async () => wallet });
  return { service, wallet, rows, pricing };
}
const dto = { provider: 'vendor', model: 'model', inputTokens: 1000, outputTokens: 1000, tokens: 2000, idempotencyKey: 'request-unique-0001' };

test('completed upstream usage settles once, records immutable prices and blocks subsequent requests when in debt', async () => {
  const { service, wallet, rows, pricing } = fixture();
  const user = { id: 'member', isPlatformAdmin: false };
  const charged = await service.charge(user, 'enterprise', dto, pricing);
  assert.equal(charged.chargedCoins, 40);
  assert.equal(wallet.balanceCoins, -30);
  const ledger = [...rows.values()][0];
  assert.equal(ledger.meta.purchaseCostYuan, '0.002');
  assert.equal(ledger.meta.pricing.modelRef, 'vendor/model');
  assert.equal(ledger.meta.pricing.aiCoinsPerYuan, 10000);
  assert.equal((await service.charge(user, 'enterprise', dto, pricing)).reused, true);
  assert.equal(wallet.balanceCoins, -30);
  await assert.rejects(service.precheck(user, 'enterprise'), e => e.getStatus() === 402);
  await assert.rejects(service.charge(user, 'another-enterprise', dto, pricing));
});
test('caller-supplied charges cannot overdraw or omit model input/output details', async () => {
  const { service } = fixture();
  const user = { id: 'member', isPlatformAdmin: false };
  await assert.rejects(service.charge(user, 'enterprise', dto), e => e.getStatus() === 402);
  await assert.rejects(service.charge(user, 'enterprise', { ...dto, inputTokens: undefined }));
  await assert.rejects(service.precheck(user, null));
});
test('platform administrators bypass balance checks and debit while ordinary users do not', async () => {
  const { service, wallet, rows } = fixture();
  wallet.balanceCoins = 0;
  const admin = { id: 'admin', isPlatformAdmin: true };
  assert.equal((await service.precheck(admin, 'enterprise')).requiredCoins, 0);
  assert.equal((await service.precheck(admin, null)).unlimited, true);
  assert.equal((await service.charge(admin, 'enterprise', dto)).chargedCoins, 0);
  assert.equal(rows.size, 0);
  await assert.rejects(service.precheck({ id: 'member', isPlatformAdmin: false }, 'enterprise'));
});
test('administrator billing identity comes from effective platform permissions rather than the old database flag', async () => {
  for (const permitted of [true, false]) {
    const req = { headers: { authorization: 'Bearer session' }, path: '/api/auth/me' };
    const guard = new JwtGuard({ verifyAsync: async () => ({ sub: 'operator', tenantId: null }) }, {
      user: { findUnique: async () => ({ id: 'operator', status: 'active', isPlatformAdmin: !permitted }) },
      userRole: { findMany: async () => permitted ? [{ role: { key: 'platform_admin', scope: 'PLATFORM', tenantId: null, permissions: [{ permKey: 'portal.admin.access' }] } }] : [] },
    }, { get: () => undefined });
    assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) }), true);
    assert.equal(req.user.isPlatformAdmin, permitted);
  }
});
