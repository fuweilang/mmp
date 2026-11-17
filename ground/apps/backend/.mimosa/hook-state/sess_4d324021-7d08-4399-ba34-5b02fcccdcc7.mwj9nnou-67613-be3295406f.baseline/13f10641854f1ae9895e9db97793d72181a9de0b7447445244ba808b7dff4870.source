import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepseekPeak, parseOfficialPrices, officialModelPrice } from '../src/billing/official-model-prices';
import { modelPricingSnapshot, settleModelPrice } from '../src/billing/model-pricing';
import { yuanToAiCoins } from '../src/billing/billing.pricing';
const DS = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const KIMI = 'https://platform.kimi.com/docs/pricing/chat';
test('DeepSeek peaks use Beijing time, weekends, holidays, and precise interval boundaries', () => {
  for (const [date,expected] of [
    ['2026-11-04T00:59:00Z',false],['2026-11-04T01:00:00Z',true],
    ['2026-11-04T04:00:00Z',false],['2026-11-04T06:00:00Z',true],
    ['2026-11-04T10:00:00Z',false],['2026-11-07T02:00:00Z',false],
    ['2026-10-01T02:00:00Z',false],['2027-01-04T02:00:00Z',undefined],
  ] as const) assert.equal(deepseekPeak(new Date(date)), expected, date);
});
const kimi = ['kimi-k3.1-pro','kimi-k3.1-pro-highspeed','kimi-k3'].map(id => `children:\`${id}\`}),\`¥13.00 / MTok\`,\`¥68.00 / MTok\`,\`¥1.30 / MTok\`,\`¥13.00 / MTok\`,\`¥26.00 / MTok\``).join('\n');
test('official parsing accepts exact model rows and rejects unknown table layouts and zero prices', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  assert.equal(parseOfficialPrices(KIMI,kimi,now)['kimi-k3.1-pro'].cacheWrite1h,26);
  assert.throws(() => parseOfficialPrices(KIMI,'different model',now));
  assert.throws(() => parseOfficialPrices(DS,'changed table',now));
  assert.throws(() => parseOfficialPrices(KIMI,kimi.replace('¥13.00','¥0'),now));
});
test('cache writes add procurement cost; cache hits are not charged twice', () => {
  const p = { ...modelPricingSnapshot('kimi/kimi-k3.1-pro', {'kimi/kimi-k3.1-pro': {input:13,output:68,cachedInput:1.3}},3,10000), cacheWrite5m:13,cacheWrite1h:26 };
  const charged = settleModelPrice(p,1000000,100000,200000,300000,100000);
  assert.equal(charged.purchaseCostYuan,'23.96');
  assert.equal(charged.chargedCoins,718800);
  assert.throws(() => settleModelPrice(p,100,0,80,30));
  assert.equal(yuanToAiCoins(0.29,10000),2900);
  assert.equal(yuanToAiCoins(5,10000),50000);
});
test('official prices cannot be assigned to a proxy with the same model name; known channels use the system catalogue', async () => {
  assert.equal(await officialModelPrice('https://proxy.example/v1','deepseek-flash'),null);
  assert.equal(await officialModelPrice('http://api.deepseek.com','deepseek-flash'),null);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  try {
    const p = await officialModelPrice('https://api.deepseek.com','deepseek-flash',new Date('2026-11-04T02:00:00Z'));
    assert.equal(p?.input,2); assert.equal(p?.output,8);
    assert.equal(await officialModelPrice('https://api.deepseek.com','unknown',new Date('2026-11-04')),null);
    assert.equal(await officialModelPrice('https://api.deepseek.com','deepseek-flash',new Date('2026-11-12')),null);
  } finally { globalThis.fetch = original; }
});

test('historic ledger values convert to the new denomination without rewriting monetary value', async () => {
  const { ledgerCoinsAtCurrentRate } = await import('../src/billing/billing.pricing');
  assert.equal(ledgerCoinsAtCurrentRate(200000,{originalAiCoinsPerYuan:200000}),10000);
  assert.equal(ledgerCoinsAtCurrentRate(-200000,{originalAiCoinsPerYuan:200000}),-10000);
  assert.equal(ledgerCoinsAtCurrentRate(300,null),300);
});

test('system billing uses the global multiplier and rejects manual price or denomination edits', async () => {
  const { BillingConfigService } = await import('../src/billing/billing-config.service');
  const prisma = {
    platformBillingConfig: { findUnique: async () => ({ aiCoinsPerYuan:10000,sellPriceMultiplier:3,modelUnitPrices:{'deepseek/deepseek-flash':{input:0,output:0,multiplier:99}} }) },
    llmProvider: { findUnique: async () => ({baseUrl:'https://api.deepseek.com'}) },
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
  };
  const service = new BillingConfigService(prisma as any, {} as any);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  try {
    const quote = await service.quoteModel('deepseek','deepseek-flash');
    assert.equal(quote.multiplier,3); assert.ok(quote.input>0); assert.equal(quote.aiCoinsPerYuan,10000);
    for(const dto of [{aiCoinsPerYuan:20000},{modelUnitPrices:{}},{vendorUnitPrices:{}},{tokensPerAiCoin:1}]) {
      await assert.rejects(service.updateConfig({isPlatformAdmin:true} as any,dto), /仅可设置/);
    }
  } finally { globalThis.fetch = original; }
});

test('a five-yuan signup gift credits 50,000 coins once, independently of the sales multiplier', async () => {
  const { creditSignupGiftInTx } = await import('../src/billing/welcome-gift');
  let credited=0; let ledger: any;
  const tx = {
    platformBillingConfig: { findUnique: async () => ({welcomeGiftYuan:5,aiCoinsPerYuan:10000,sellPriceMultiplier:3}) },
    tenantAiWallet: { update: async ({data}: any) => { credited += data.balanceCoins.increment; return {balanceCoins:credited}; } },
    tenantAiLedger: {findUnique: async () => ledger, create: async ({data}: any) => {ledger=data;}},
  };
  const params = {tenantId:'enterprise',walletId:'wallet'};
  assert.equal((await creditSignupGiftInTx(tx as any,params)).coins,50000);
  assert.equal((await creditSignupGiftInTx(tx as any,params)).credited,false);
  assert.equal(credited,50000);assert.equal(ledger.type,'signup_gift');assert.equal(ledger.meta.welcomeGiftYuan,5);
});
