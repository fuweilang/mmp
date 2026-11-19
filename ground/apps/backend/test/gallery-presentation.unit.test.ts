import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPublicCapabilities,
  isOfficialAgentCategory,
} from '../src/official-agent/gallery-presentation';

describe('gallery presentation', () => {
  it('places stored content capabilities before tool labels', () => {
    const caps = buildPublicCapabilities(
      ['enterprise_knowledge', 'web_search'],
      ['访谈设计', '追问链'],
    );
    assert.deepEqual(caps, ['访谈设计', '追问链', '企业资料', '联网检索']);
  });

  it('derives tool labels when no stored labels exist', () => {
    const caps = buildPublicCapabilities(
      ['web_search', 'web_fetch', 'tabular_analyze'],
      [],
    );
    assert.deepEqual(caps, ['联网检索', '网页阅读', '表格分析']);
  });

  it('dedupes labels that appear in both sources', () => {
    const caps = buildPublicCapabilities(['enterprise_knowledge'], ['企业资料', '内容创作']);
    assert.deepEqual(caps, ['企业资料', '内容创作']);
  });

  it('caps the public payload at eight labels', () => {
    const caps = buildPublicCapabilities(['web_search'], ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    assert.deepEqual(caps, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  it('validates category keys', () => {
    assert.equal(isOfficialAgentCategory('common'), true);
    assert.equal(isOfficialAgentCategory('featured'), false);
  });
});
