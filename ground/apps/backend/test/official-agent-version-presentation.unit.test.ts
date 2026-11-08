import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  formatAgentDateTime,
  formatAgentTimeSummary,
} from '../../frontend/src/views/admin/official-agent-version-presentation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vuePath = path.join(root, 'frontend/src/views/admin/AdminOfficialAgents.vue');
const helperPath = path.join(
  root,
  'frontend/src/views/admin/official-agent-version-presentation.ts',
);

describe('official agent admin time presentation', () => {
  it('formatAgentDateTime returns dash for empty/invalid and seconds for valid ISO', () => {
    assert.equal(formatAgentDateTime(null), '—');
    assert.equal(formatAgentDateTime(undefined), '—');
    assert.equal(formatAgentDateTime(''), '—');
    assert.equal(formatAgentDateTime('not-a-date'), '—');

    const fixed = new Date('2026-11-06T09:41:15.570Z');
    const text = formatAgentDateTime(fixed);
    assert.match(text, /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}$/);
    // Instant is stable; local Asia/Shanghai = UTC+8 → 17:41:15
    assert.equal(text, '2026/11/06 17:41:15');
    assert.equal(formatAgentDateTime(fixed.toISOString()), '2026/11/06 17:41:15');
  });

  it('formatAgentTimeSummary maps created/updated independently', () => {
    const summary = formatAgentTimeSummary({
      createdAt: '2026-11-06T03:41:14.931Z',
      updatedAt: null,
    });
    assert.equal(summary.createdAt, '2026/11/06 11:41:14');
    assert.equal(summary.updatedAt, '—');
  });

  it('AdminOfficialAgents.vue no longer exposes product/publish version UI', () => {
    const vue = readFileSync(vuePath, 'utf8');
    const helper = readFileSync(helperPath, 'utf8');

    assert.match(helper, /formatAgentDateTime/);
    assert.equal(helper.includes('产品版本'), false);
    assert.equal(helper.includes('当前发布'), false);
    assert.equal(helper.includes('PRODUCT_VERSION'), false);

    assert.match(vue, /formatAgentDateTime/);
    assert.equal(vue.includes('productVersionLabel'), false);
    assert.equal(vue.includes('currentPublishLabel'), false);
    assert.equal(vue.includes('formatHistoryRowLabel'), false);
    assert.equal(vue.includes('publishSeqLabel'), false);
    assert.equal(vue.includes('版本记录'), false);
    assert.equal(vue.includes('发布历史'), false);
    assert.equal(vue.includes('产品版本'), false);
    assert.equal(vue.includes('发布序号'), false);
    assert.equal(vue.includes('openHistory'), false);
    assert.equal(vue.includes('historyOpen'), false);
    assert.equal(vue.includes('viewerSource'), false);
    assert.match(vue, /label="创建时间"/);
    assert.match(vue, /label="更新时间"/);
  });
});
