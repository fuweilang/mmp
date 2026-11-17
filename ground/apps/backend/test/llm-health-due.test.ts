import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthProbeDue } from '../src/llm/llm-health.service';

const now = Date.parse('2026-11-17T00:00:00Z');
const hour = 3_600_000;
test('automatic probes skip fresh healthy models and failures still inside the cooldown', () => {
  assert.equal(healthProbeDue(undefined, now), true);
  assert.equal(healthProbeDue({ status: 'unchecked', checkedAt: new Date(now), retryAt: null }, now), true);
  assert.equal(healthProbeDue({ status: 'healthy', checkedAt: new Date(now - hour), retryAt: null }, now), false);
  assert.equal(healthProbeDue({ status: 'degraded', checkedAt: new Date(now - hour), retryAt: null }, now), false);
  assert.equal(healthProbeDue({ status: 'healthy', checkedAt: new Date(now - 25 * hour), retryAt: null }, now), true);
  assert.equal(healthProbeDue({ status: 'unavailable', checkedAt: new Date(now), retryAt: new Date(now + hour) }, now), false);
  assert.equal(healthProbeDue({ status: 'unavailable', checkedAt: new Date(now - 7 * hour), retryAt: new Date(now - 1000) }, now), true);
  assert.equal(healthProbeDue({ status: 'unchecked', checkedAt: new Date(now), retryAt: new Date(now + hour) }, now), false);
});
