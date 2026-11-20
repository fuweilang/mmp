import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenStatsSupport } from '../src/billing/token-stats.support';

test('当前启用的对话模型不标已下线，目录里没有的历史模型才标', () => {
  const support = new TokenStatsSupport();
  const options = support.buildModelFilterOptions(
    ['deepseek/deepseek-flash', 'geekai/grok-4.7', 'deepseek/deepseek-flash'],
    ['deepseek/deepseek-flash', 'token-factory/deepseek-v4.1-flash'],
  );
  assert.deepEqual(options.offlineModels, ['geekai/grok-4.7']);
  assert.ok(options.models.includes('deepseek/deepseek-flash'));
  assert.ok(options.models.includes('token-factory/deepseek-v4.1-flash'));
});
