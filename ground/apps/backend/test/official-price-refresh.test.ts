import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  officialModelPrice,
  officialPriceCatalogue,
  refreshOfficialPrices,
} from '../src/billing/official-model-prices';

const DS = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const dsHtml = `<table>
<tr><th>模型细节</th><th>deepseek-flash(1)</th><th>deepseek-v4-pro</th></tr>
<tr><td>百万tokens输入（缓存命中）</td><td>空闲时段</td><td>0.02元</td><td>0.15元</td></tr>
<tr><td>缓存命中高峰</td><td>0.04元</td><td>0.30元</td></tr>
<tr><td>缓存未命中空闲</td><td>1元</td><td>4.5元</td></tr>
<tr><td>缓存未命中高峰</td><td>2元</td><td>9元</td></tr>
<tr><td>输出空闲</td><td>4元</td><td>13.5元</td></tr>
<tr><td>输出高峰</td><td>8元</td><td>27元</td></tr>
</table>`;
const kimiHtml = ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k3']
  .map(id => `children:\`${id}\`}),\`¥13.00 / MTok\`,\`¥68.00 / MTok\`,\`¥1.30 / MTok\`,\`¥13.00 / MTok\`,\`¥26.00 / MTok\``)
  .join('\n');

test('定时刷新同时更新厂商目录、并发去重，失败时保留最近有效价格', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls += 1;
    const source = String(input);
    return new Response(source === DS ? dsHtml : kimiHtml, { status: 200 });
  }) as typeof fetch;
  try {
    const now = new Date('2026-11-05T00:00:00Z');
    await Promise.all([refreshOfficialPrices(now), refreshOfficialPrices(now)]);
    assert.equal(calls, 2);
    const catalogue = officialPriceCatalogue();
    assert.equal(catalogue['deepseek-flash']?.checkedAt, now.toISOString());
    assert.equal(catalogue['kimi-k3.1-pro']?.checkedAt, now.toISOString());

    await refreshOfficialPrices(now);
    assert.equal(calls, 2, '刷新间隔内不重复请求');

    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    const failedAt = new Date('2026-11-06T00:00:00Z');
    await refreshOfficialPrices(failedAt);
    assert.equal((await officialModelPrice('https://api.deepseek.com', 'deepseek-flash', failedAt))?.input, 1);
    assert.equal(await officialModelPrice('https://api.deepseek.com', 'deepseek-flash', new Date('2026-11-13T00:00:00Z')), null);
  } finally {
    globalThis.fetch = original;
  }
});
