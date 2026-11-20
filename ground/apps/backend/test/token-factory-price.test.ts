import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenFactoryPurchasePrice } from '../src/billing/token-factory-price';

const base = 'https://proxy.token-factory.digicore-ai.com/v1';
const offPeak = new Date('2026-11-04T00:59:00Z');

test('Token Factory flash uses the public DeepSeek flash tariff', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  const RealDate = Date;
  const frozen = class extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate>) {
      super(...(args.length ? args : [offPeak.toISOString()]));
    }
    static now() { return offPeak.getTime(); }
  };
  try {
    const price = await tokenFactoryPurchasePrice(base, 'deepseek-v4.1-flash', offPeak);
    assert.equal(price?.input, 1);
    assert.equal(price?.output, 4);
    assert.equal(price?.cachedInput, 0.02);
    assert.equal(price?.tier, '空闲时段');
    const peak = await tokenFactoryPurchasePrice(base, 'deepseek-v4.1-flash', new Date('2026-11-04T02:00:00Z'));
    assert.equal(peak?.input, 2);
    assert.equal(peak?.output, 8);
    assert.equal(peak?.tier, '高峰时段');
    assert.equal(await tokenFactoryPurchasePrice(base, 'claude-haiku-4-5', offPeak), null);
    assert.equal(await tokenFactoryPurchasePrice('https://api.deepseek.com/v1', 'deepseek-v4.1-flash', offPeak), null);

    globalThis.Date = frozen as DateConstructor;
    const { BillingConfigService } = await import('../src/billing/billing-config.service');
    const prisma = {
      platformBillingConfig: { findUnique: async () => ({ aiCoinsPerYuan: 10000, sellPriceMultiplier: 3 }) },
      llmProvider: { findUnique: async () => ({ baseUrl: base, apiKeyEnc: null }) },
      $executeRaw: async () => 1,
      $queryRaw: async () => [],
    };
    const service = new BillingConfigService(prisma as never, {} as never);
    const quote = await service.quoteModel('token-factory', 'deepseek-v4.1-flash');
    assert.equal(quote.input, 1);
    assert.equal(quote.output, 4);
    assert.equal(quote.cachedInput, 0.02);
    assert.equal(quote.multiplier, 3);
    await assert.rejects(service.quoteModel('token-factory', 'claude-haiku-4-5'), /暂无有效的系统参考价/);
  } finally {
    globalThis.fetch = original;
    globalThis.Date = RealDate;
  }
});
