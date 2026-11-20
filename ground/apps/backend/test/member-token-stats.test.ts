import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMemberTokenStats, pageMemberTokenStats } from '../src/billing/token-usage.service';

test('member token stats keep zeros and put the highest use first', () => {
  const rows = mergeMemberTokenStats(
    [
      { userId: 'a', name: '甲' },
      { userId: 'b', name: '乙' },
      { userId: 'c', name: '丙' },
    ],
    [
      { userId: 'b', inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      { userId: 'gone', inputTokens: 3, outputTokens: 1, totalTokens: 4 },
      { userId: 'silent', inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    ],
    [{ userId: 'gone', name: '已离开' }],
  );
  assert.deepEqual(rows.map((row) => [row.name, row.totalTokens]), [
    ['乙', 12],
    ['已离开', 4],
    ['丙', 0],
    ['甲', 0],
  ]);
  assert.equal(rows[0].inputTokens, 10);
  assert.equal(rows[0].outputTokens, 2);
  const page = pageMemberTokenStats(rows, '乙', 1, 10);
  assert.equal(page.total, 1);
  assert.equal(page.members[0]?.name, '乙');
  const second = pageMemberTokenStats(rows, '', 2, 10);
  assert.equal(second.total, 4);
  assert.equal(second.members.length, 0);
});
