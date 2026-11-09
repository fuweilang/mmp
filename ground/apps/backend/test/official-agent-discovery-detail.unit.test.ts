import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expertDiscoveryDetail,
  normalizeDiscoveryDetail,
  publicDiscoveryDetail,
} from '../src/official-agent/discovery-detail';

describe('expert discovery detail single source', () => {
  it('falls back to openingQuestions only when starters key is absent', () => {
    const withFallback = expertDiscoveryDetail({}, ['写周报', '复盘会议']);
    assert.equal(withFallback.starters.length, 2);
    assert.equal(withFallback.starters[0]?.text, '写周报');

    const cleared = expertDiscoveryDetail({ discoveryDetail: { starters: [] } }, ['写周报']);
    assert.deepEqual(cleared.starters, []);
  });

  it('normalize always persists starters array so clear stays clear', () => {
    const previous = expertDiscoveryDetail({}, ['旧问题']);
    const normalized = normalizeDiscoveryDetail(
      {
        schemaVersion: 1,
        displayRevision: previous.displayRevision,
        introduction: '介绍',
        outputs: [],
        materials: [],
        boundaries: [],
        starters: [],
      },
      previous,
    );
    assert.ok(Object.prototype.hasOwnProperty.call(normalized, 'starters'));
    assert.deepEqual(normalized.starters, []);
    const again = expertDiscoveryDetail({ discoveryDetail: normalized }, ['旧问题']);
    assert.deepEqual(again.starters, []);
  });

  it('public allowlist keeps text-only starter shape and limits', () => {
    const detail = publicDiscoveryDetail({
      introduction: 'x'.repeat(10),
      starters: [
        { label: 'ignored', text: '完整推荐提问正文' },
        { text: '第二条' },
        '纯字符串第三条',
        { text: '第四条应被截断' },
      ],
      role: 'secret',
    });
    assert.equal(detail.starters.length, 3);
    assert.deepEqual(detail.starters[0], { text: '完整推荐提问正文' });
    assert.deepEqual(detail.starters[1], { text: '第二条' });
    assert.deepEqual(detail.starters[2], { text: '纯字符串第三条' });
    assert.equal('role' in detail, false);
  });

  it('normalize accepts text-only starters and rejects empty body', () => {
    const previous = publicDiscoveryDetail({});
    const ok = normalizeDiscoveryDetail(
      {
        schemaVersion: 1,
        displayRevision: previous.displayRevision,
        introduction: '',
        outputs: [],
        materials: [],
        boundaries: [],
        starters: [{ text: '帮我写一份周报' }],
      },
      previous,
    );
    assert.deepEqual(ok.starters, [{ text: '帮我写一份周报' }]);
    assert.throws(
      () =>
        normalizeDiscoveryDetail(
          {
            schemaVersion: 1,
            displayRevision: previous.displayRevision,
            starters: [{ label: '只有标签' }],
          },
          previous,
        ),
      /推荐提问/,
    );
  });
});
