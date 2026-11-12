import assert from 'node:assert/strict';
import { it } from 'node:test';
import { KnowledgeHttpAdapter } from '../../src/knowledge-core/provider';
import { KnowledgeProfilesService } from '../../src/knowledge-core/profiles.service';

for (const model of ['BAAI/bge-m3', 'text-embedding-3-small']) {
  it(`sends the supported embedding payload for ${model}`, async (t) => {
    const dimension = model === 'BAAI/bge-m3' ? 1024 : 3;
    const profile = { id: 'profile', providerId: 'provider', task: 'EMBEDDING', adapter: 'OPENAI_EMBEDDINGS', model,
      endpoint: 'https://embedding.example/v1/embeddings', dimension, tokenizer: 'cl100k_base', timeoutMs: 1000,
      batchSize: 32, maxInputTokens: 8192, maxResponseBytes: 8388608, enabled: true, predecessorId: null,
      createdAt: new Date(), apiKey: 'unit-test' };
    const profiles = Object.create(KnowledgeProfilesService.prototype) as KnowledgeProfilesService;
    profiles.resolveForRequest = async () => profile;
    profiles.recordUsage = async () => undefined;
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
      requests++;
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, model);
      assert.deepEqual(body.input, ['中文知识']);
      if (model === 'BAAI/bge-m3') assert.equal(Object.hasOwn(body, 'dimensions'), false);
      else assert.equal(body.dimensions, dimension);
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(dimension).fill(0.25) }], usage: { total_tokens: 4 } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    const result = await new KnowledgeHttpAdapter(profiles).embed(profile.id, ['中文知识']);
    assert.equal(requests, 1);
    assert.equal(result.vectors[0].length, dimension);
  });
}
