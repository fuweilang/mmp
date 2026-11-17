import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearGeekAiPriceCache, geekAiModelUrl, loadGeekAiModel, parseGeekAiModelDetail } from '../src/billing/geekai-model-price';
import { withUpstreamThinking } from '../src/llm/upstream-thinking';
import { encryptApiKey } from '../src/llm/llm-key-crypto';

const now = new Date('2026-11-17T00:00:00Z');
const detail = {
  id: 'gpt-5.1', name: 'GPT-5.1', type: 'chat', context: 128000,
  price: { currency: 'CNY', unit: 'mtokens', input: 12, output: 36, cache_read: 1.2, cache_write: 9, discounts: [{ channel: 'official', discount: 0.5 }] },
};

test('GeekAI quotes only domestic CNY chat prices and ignores discounts and USD', () => {
  const price = parseGeekAiModelDetail('gpt-5.1', detail, now);
  assert.equal(price.ok, true);
  if (!price.ok) return;
  assert.equal(price.price.input, 12);
  assert.equal(price.price.cachedInput, 1.2);
  assert.equal(price.price.cacheWrite5m, undefined);
  assert.equal(price.contextWindow, 128000);
  assert.equal(price.displayName, 'GPT-5.1');
  assert.equal(parseGeekAiModelDetail('img', { ...detail, type: 'image' }, now).ok, false);
  const usd = parseGeekAiModelDetail('usd', { ...detail, price: { ...detail.price, currency: 'USD' } }, now);
  assert.equal(usd.ok, false);
  if (!usd.ok) assert.match(usd.reason, /美元/);
  const noCache = parseGeekAiModelDetail('plain', { ...detail, price: { ...detail.price, cache_read: 0 } }, now);
  assert.equal(noCache.ok && noCache.price.cachedInput, 12);
  assert.equal(geekAiModelUrl('https://geekai.dev/api/v1', 'gpt-5.1'), null);
  assert.equal(geekAiModelUrl('https://geekai.co/api/v1', 'a/b'), null);
  assert.equal(geekAiModelUrl('https://geekai.co/api/v1', 'gpt-5.1'), 'https://geekai.co/api/v1/models/gpt-5.1');
});

test('GeekAI omits thinking unless the admin or a tool call asks for it', () => {
  const off = withUpstreamThinking({ model: 'claude-fable', thinking: { type: 'disabled' } }, 'https://geekai.co/api/v1', false);
  assert.equal('thinking' in off, false);
  const on = withUpstreamThinking({ model: 'claude-fable' }, 'https://geekai.co/api/v1', true);
  assert.deepEqual(on.thinking, { type: 'enabled' });
  const deepseek = withUpstreamThinking({ model: 'deepseek-flash' }, 'https://api.deepseek.com', false);
  assert.deepEqual(deepseek.thinking, { type: 'disabled' });
});

test('a GeekAI model is billed from its account price, not the DeepSeek catalogue', async () => {
  process.env.JWT_SECRET ||= 'geekai-price-test';
  clearGeekAiPriceCache();
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://geekai.co/api/v1/models/gpt-5.1') {
      return new Response(JSON.stringify(detail), { status: 200 });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  try {
    const { BillingConfigService } = await import('../src/billing/billing-config.service');
    const prisma = {
      platformBillingConfig: { findUnique: async () => ({ aiCoinsPerYuan: 10000, sellPriceMultiplier: 3 }) },
      llmProvider: { findUnique: async () => ({ baseUrl: 'https://geekai.co/api/v1', apiKeyEnc: encryptApiKey('sk-test') }) },
      $executeRaw: async () => 1,
      $queryRaw: async () => [],
    };
    const service = new BillingConfigService(prisma as never, {} as never);
    const quote = await service.quoteModel('geekai', 'gpt-5.1');
    assert.equal(quote.input, 12);
    assert.equal(quote.output, 36);
    assert.equal(quote.cachedInput, 1.2);
    assert.equal(quote.source, 'https://geekai.co/api/v1/models');
    assert.equal(quote.multiplier, 3);
    globalThis.fetch = (async () => new Response(JSON.stringify({ ...detail, price: { currency: 'USD', unit: 'mtokens', input: 1, output: 2 } }), { status: 200 })) as typeof fetch;
    clearGeekAiPriceCache();
    await assert.rejects(service.quoteModel('geekai', 'gpt-5.1'), /美元/);
  } finally {
    globalThis.fetch = original;
    clearGeekAiPriceCache();
  }
});

test('an unexpired GeekAI price is reused, and an expired price is not kept after a failed refresh', async () => {
  clearGeekAiPriceCache();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify(detail), { status: 200 });
    return new Response('down', { status: 503 });
  }) as typeof fetch;
  try {
    const first = await loadGeekAiModel('geekai', 'https://geekai.co/api/v1', 'gpt-5.1', 'sk-test', now);
    const second = await loadGeekAiModel('geekai', 'https://geekai.co/api/v1', 'gpt-5.1', 'sk-test', new Date(now.getTime() + 1000));
    const expired = await loadGeekAiModel('geekai', 'https://geekai.co/api/v1', 'gpt-5.1', 'sk-test', new Date(now.getTime() + 8 * 86_400_000));
    assert.equal(first.ok && first.price.input, 12);
    assert.equal(second.ok && second.price.input, 12);
    assert.equal(expired.ok, false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    clearGeekAiPriceCache();
  }
});
