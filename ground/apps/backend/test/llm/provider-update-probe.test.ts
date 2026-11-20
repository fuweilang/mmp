import assert from 'node:assert/strict';
import { test } from 'node:test';
import { User } from '@prisma/client';
import { LlmProvidersService } from '../../src/llm/llm-providers.service';
import { encryptApiKey } from '../../src/llm/llm-key-crypto';

process.env.JWT_SECRET ||= 'provider-update-probe-test';

function harness(baseUrl = 'https://proxy.example/v1', apiKey = 'sk-old') {
  const now = new Date();
  const provider = {
    id: 'p', name: 'tf', displayName: 'token-factory', kind: 'openai_compatible', baseUrl,
    apiKeyEnc: encryptApiKey(apiKey), apiKeyHint: '…old', note: null, enabled: true, sortOrder: 0, createdAt: now, updatedAt: now,
    models: [{ id: 'm1', providerId: 'p', modelId: 'claude-opus-5-5', displayName: 'claude', enabled: true, thinkingEnabled: false, isPreferred: false, sortOrder: 0, createdAt: now, updatedAt: now, meta: null }],
  };
  const probes: string[] = [];
  let reset = 0;
  const db = {
    llmProvider: {
      findUnique: async () => provider,
      findMany: async () => [provider],
      update: async () => provider,
    },
    auditLog: { create: async () => ({}) },
  };
  const health = { reset: async () => { reset += 1; }, requestProbe: (id: string) => { probes.push(id); } };
  const service = new LlmProvidersService(db as never, health as never);
  return { service, probes, resetCount: () => reset };
}

const admin = { isPlatformAdmin: true } as User;

test('renaming a vendor does not retest its models', async () => {
  const { service, probes, resetCount } = harness();
  await service.update(admin, 'p', { displayName: 'Token Factory', baseUrl: 'https://proxy.example/v1' });
  assert.equal(resetCount(), 0);
  assert.deepEqual(probes, []);
});

test('a changed base URL or API key retests enabled chat models', async () => {
  const renamed = harness();
  await renamed.service.update(admin, 'p', { baseUrl: 'https://proxy.example/v2' });
  assert.equal(renamed.resetCount(), 1);
  assert.deepEqual(renamed.probes, ['m1']);

  const sameKey = harness();
  await sameKey.service.update(admin, 'p', { apiKey: 'sk-old' });
  assert.equal(sameKey.resetCount(), 0);

  const newKey = harness();
  await newKey.service.update(admin, 'p', { apiKey: 'sk-new' });
  assert.equal(newKey.resetCount(), 1);
  assert.deepEqual(newKey.probes, ['m1']);
});
