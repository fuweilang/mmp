import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelPricingSnapshot, parseModelPurchasePrices, settleModelPrice } from '../src/billing/model-pricing';

test('input/output and cached input settle separately with a model override', () => {
  const snapshot = modelPricingSnapshot('vendor/model', { 'vendor/model': { input: 2, output: 8, cachedInput: 0.5, multiplier: 3 } }, 2, 10000);
  const result = settleModelPrice(snapshot, 1_000_000, 500_000, 200_000);
  assert.equal(result.purchaseCostYuan, '5.7');
  assert.equal(result.sellAmountYuan, '17.1');
  assert.equal(result.chargedCoins, 171000);
});
test('a fixed recharge denomination does not make one coin equal one token', () => {
  const p = modelPricingSnapshot('v/m', { 'v/m': { input: 2, output: 8 } }, 3, 10000);
  assert.equal(settleModelPrice(p, 1_000_000, 0).chargedCoins, 60000);
  assert.equal(settleModelPrice(p, 0, 1_000_000).chargedCoins, 240000);
  assert.equal(settleModelPrice(p, 1, 0).chargedCoins, 1);
  assert.equal(settleModelPrice(p, 0, 0).chargedCoins, 0);
});
test('missing prices and malformed usage cannot silently become a free request', () => {
  assert.throws(() => modelPricingSnapshot('missing/m', {}, 2, 10000));
  assert.throws(() => parseModelPurchasePrices({ 'v/m': { input: 'bad', output: 2 } }));
  assert.throws(() => parseModelPurchasePrices({ 'v/m': { input: 1, output: 2, multiplier: 0.1 } }));
  const p = modelPricingSnapshot('v/m', { 'v/m': { input: 2, output: 8 } }, 2, 10000);
  assert.throws(() => settleModelPrice(p, 1, 0, 2));
  assert.throws(() => settleModelPrice(p, 0.1, 0));
});
test('captured pricing stays unchanged when config changes and Decimal prevents float rounding errors', () => {
  const prices = { 'v/m': { input: 0.1, output: 0.2 } };
  const p = modelPricingSnapshot('v/m', prices, 1, 10000);
  prices['v/m'].input = 99;
  assert.equal(settleModelPrice(p, 1000, 1000).chargedCoins, 3);
});
