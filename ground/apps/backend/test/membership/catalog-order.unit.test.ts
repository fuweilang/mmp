import assert from 'node:assert/strict';
import test from 'node:test';
import { orderByMembershipAccess } from '../../src/membership/plan.ts';

const rows = [
  { key: 'alpha', minPlan: 'flagship' },
  { key: 'beta', minPlan: 'standard' },
  { key: 'gamma', minPlan: 'pro' },
];

test('standard members see usable experts first, in the original order', () => {
  const ordered = orderByMembershipAccess(rows, { enforced: true, plan: 'standard', expiresAt: null });
  assert.deepEqual(ordered.map((row) => row.key), ['beta', 'alpha', 'gamma']);
});

test('pro members keep every usable expert ahead of locked ones', () => {
  const ordered = orderByMembershipAccess(rows, { enforced: true, plan: 'pro', expiresAt: '2099-01-01T00:00:00.000Z' });
  assert.deepEqual(ordered.map((row) => row.key), ['beta', 'gamma', 'alpha']);
});

test('an unenforced plan leaves the catalog order unchanged', () => {
  const ordered = orderByMembershipAccess(rows, { enforced: false, plan: 'standard', expiresAt: null });
  assert.deepEqual(ordered.map((row) => row.key), ['alpha', 'beta', 'gamma']);
});
