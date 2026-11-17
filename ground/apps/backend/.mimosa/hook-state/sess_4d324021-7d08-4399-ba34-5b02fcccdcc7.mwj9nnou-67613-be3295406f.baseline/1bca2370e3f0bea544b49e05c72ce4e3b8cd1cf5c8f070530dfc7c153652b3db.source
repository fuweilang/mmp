import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPublicCapabilities,
  isOfficialAgentCategory,
} from '../src/official-agent/gallery-presentation';

describe('gallery presentation', () => {
  it('derives tool labels before stored capabilities and caps at 3', () => {
    const caps = buildPublicCapabilities(
      ['web_search', 'web_fetch', 'tabular_analyze'],
      ['竞品对比', '额外标签'],
    );
    assert.deepEqual(caps, ['联网检索', '网页阅读', '表格分析']);
  });

  it('fills remaining slots with stored content capabilities', () => {
    const caps = buildPublicCapabilities(['enterprise_knowledge'], ['访谈设计', '追问链', '忽略']);
    assert.deepEqual(caps, ['企业资料', '访谈设计', '追问链']);
  });

  it('validates category keys', () => {
    assert.equal(isOfficialAgentCategory('common'), true);
    assert.equal(isOfficialAgentCategory('featured'), false);
  });
});
