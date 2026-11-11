import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { PrismaService } from '../../src/prisma/prisma.service';
import { encryptApiKey } from '../../src/llm/llm-key-crypto';
import { KnowledgeProfilesService } from '../../src/knowledge-core/profiles.service';
import { KnowledgeHttpAdapter } from '../../src/knowledge-core/provider';
import { KnowledgeCoreService } from '../../src/knowledge-core/knowledge-core.service';
import { KnowledgeBlobStorage } from '../../src/knowledge-core/storage';
import { KnowledgeJobsService } from '../../src/knowledge-core/jobs.service';
import { KnowledgeIngestionWorker } from '../../src/knowledge-core/ingestion.worker';
const url = process.env.RAG_TEST_DATABASE_URL;
if (
  !url ||
  !url.startsWith('postgresql://rag_test:') ||
  !url.includes('@127.0.0.1:55441/mmp_rag_acceptance')
)
  throw new Error(
    'Dedicated RAG_TEST_DATABASE_URL required; never use application DB',
  );
process.env.LLM_API_KEY_SECRET = 'test-only-rag-encryption-secret';
const db = new PrismaService({ datasources: { db: { url } } });
const profiles = new KnowledgeProfilesService(db),
  jobs = new KnowledgeJobsService(db),
  storage = new KnowledgeBlobStorage();
const adapter = new KnowledgeHttpAdapter(profiles),
  core = new KnowledgeCoreService(db, profiles, storage, jobs);
const worker = new KnowledgeIngestionWorker(
  db,
  profiles,
  storage,
  jobs,
  adapter,
);
const scope = { type: 'PLATFORM' } as const;
let dir: string,
  endpoint: string,
  mode = 'ok',
  delay: Promise<void> | undefined,
  unlock: (() => void) | undefined;
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    if (delay) await delay;
    if (mode === 'transient') {
      res.statusCode = 503;
      res.end('fake-sensitive-key');
      return;
    }
    if (mode === 'permanent') {
      res.statusCode = 400;
      res.end('fake-sensitive-key');
      return;
    }
    const input = JSON.parse(raw).input as string[];
    res.end(
      JSON.stringify({
        data: input.map((_, index) => ({ index, embedding: [1, index + 1] })),
      }),
    );
  });
});
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rag-core-'));
  process.env.KNOWLEDGE_CORE_DIR = dir;
  await db.$connect();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as any).port}/v1`;
  await exhaustQueued();
});
after(async () => {
  unlock?.();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
  await rm(dir, { recursive: true, force: true });
});
async function provider(key = true) {
  return db.llmProvider.create({
    data: {
      name: `rag-${randomUUID()}`,
      displayName: 'RAG test',
      baseUrl: endpoint,
      apiKeyEnc: key ? encryptApiKey('fake-sensitive-key') : null,
    },
  });
}
async function profile() {
  const p = await provider();
  return profiles.create({
    providerId: p.id,
    task: 'EMBEDDING',
    model: 'mock-embedding',
    dimension: 2,
    tokenizer: 'cl100k_base',
    batchSize: 2,
    timeoutMs: 5000,
  });
}
async function upload(
  profileId: string,
  key = randomUUID(),
  text = '资料甲\n\n末尾乙',
) {
  const base = await core.createBase(scope, 'test');
  return core.upload(base.id, scope, {
    originalName: '../../traversal.txt',
    bytes: Buffer.from(text),
    profileId,
    idempotencyKey: key,
  });
}
async function exhaustQueued() {
  for (let i = 0; i < 30; i++) if (!(await worker.runOnce())) return;
  throw new Error('too many pending jobs');
}

test('profiles explicitly reject missing credentials, configuration and inactive profile; DTOs redact encryption', async () => {
  const p = await provider(false);
  await assert.rejects(
    () =>
      profiles.create({
        providerId: p.id,
        task: 'EMBEDDING',
        model: 'mock',
        dimension: 2,
      }),
    (e: any) => e.code === 'PROVIDER_CREDENTIALS_MISSING',
  );
  await assert.rejects(
    () => profiles.resolveForRequest('missing', 'EMBEDDING'),
    (e: any) => e.code === 'PROFILE_UNCONFIGURED',
  );
  const dto = await profile();
  assert.ok(dto.id);
  assert.equal(dto.model, 'mock-embedding');
  assert.equal(JSON.stringify(dto).includes('fake-sensitive-key'), false);
  assert.equal('apiKeyEnc' in dto, false);
  await profiles.setEnabled(dto.id, false);
  await assert.rejects(
    () => profiles.resolveForRequest(dto.id, 'EMBEDDING'),
    (e: any) => e.code === 'PROFILE_DISABLED',
  );
});
test('profiles freeze endpoint/model/dimension and preserve endpoint across provider edits', async () => {
  const dto = await profile();
  const original = dto.endpoint;
  await db.llmProvider.update({
    where: { id: dto.providerId },
    data: { baseUrl: 'https://changed.invalid/v1' },
  });
  assert.equal(
    (await profiles.resolveForRequest(dto.id, 'EMBEDDING')).endpoint,
    original,
  );
  await assert.rejects(() =>
    db.knowledgeProfile.update({
      where: { id: dto.id },
      data: { model: 'changed' },
    }),
  );
  const successor = await profiles.create({
    providerId: dto.providerId,
    task: 'EMBEDDING',
    model: 'new',
    dimension: 3,
    predecessorId: dto.id,
  });
  assert.notEqual(successor.id, dto.id);
  assert.equal((await profiles.get(dto.id)).model, 'mock-embedding');
});
test('duplicate concurrent upload is idempotent, scope checked and blobs never use original name', async () => {
  const dto = await profile(),
    base = await core.createBase(scope, 'idempotent'),
    key = randomUUID();
  const input = {
    originalName: '../../escape.txt',
    bytes: Buffer.from('同一文件'),
    profileId: dto.id,
    idempotencyKey: key,
  };
  const [a, b] = await Promise.all([
    core.upload(base.id, scope, input),
    core.upload(base.id, scope, input),
  ]);
  assert.ok(a.id);
  assert.equal(a.id, b.id);
  await assert.rejects(
    () =>
      core.upload(base.id, scope, {
        ...input,
        bytes: Buffer.from('different'),
      }),
    (e: any) => e.code === 'IDEMPOTENCY_CONFLICT',
  );
  await assert.rejects(
    () => core.inspectJob(a.id, { type: 'TENANT', tenantId: 'wrong' }),
    (e: any) => e.code === 'KNOWLEDGE_SCOPE_MISMATCH',
  );
  const saved = await db.knowledgeDocumentRevision.findFirstOrThrow({
    where: { indexes: { some: { job: { id: a.id } } } },
  });
  assert.match(saved.storageKey, /^[a-f0-9]{64}$/);
  assert.equal(saved.originalName, 'escape.txt');
  await exhaustQueued();
});
test('only complete validated indexes release; released bytes/chunks/items cannot mutate', async () => {
  const dto = await profile(),
    job = await upload(dto.id);
  await exhaustQueued();
  const state = await core.inspectJob(job.id, scope);
  assert.equal(state.status, 'SUCCEEDED');
  assert.equal(state.index.status, 'READY');
  const release = await core.createRelease(state.baseId, scope, [
    state.indexRevisionId,
  ]);
  assert.equal(release.items.length, 1);
  assert.equal(release.sealed, true);
  const chunk = await db.knowledgeChunk.findFirstOrThrow({
    where: { indexRevisionId: state.indexRevisionId },
  });
  await assert.rejects(() =>
    db.knowledgeChunk.update({
      where: { id: chunk.id },
      data: { text: 'changed' },
    }),
  );
  await assert.rejects(() =>
    db.knowledgeReleaseItem.delete({
      where: {
        releaseId_indexRevisionId: {
          releaseId: release.id,
          indexRevisionId: state.indexRevisionId,
        },
      },
    }),
  );
  await assert.rejects(() =>
    db.knowledgeDocumentRevision.update({
      where: { id: state.index.revisionId },
      data: { storageKey: 'changed' },
    }),
  );
  const count = await db.knowledgeProviderUsage.count({
    where: { operationId: job.id, actualTokens: null, status: 'SUCCEEDED' },
  });
  assert.ok(count > 0);
});
test('cancellation fences slow upstream promotion and restart can reclaim an expired lease', async () => {
  const dto = await profile(),
    job = await upload(dto.id);
  delay = new Promise((r) => (unlock = r));
  assert.equal((await core.inspectJob(job.id, scope)).stage, 'UPLOADED');
  const pending = worker.runOnce();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal((await core.inspectJob(job.id, scope)).stage, 'EMBEDDING');
  await core.cancelJob(job.id, scope);
  unlock!();
  delay = undefined;
  await pending;
  const state = await core.inspectJob(job.id, scope);
  assert.equal(state.status, 'CANCELLED');
  assert.equal(
    await db.knowledgeChunk.count({
      where: { indexRevisionId: state.indexRevisionId },
    }),
    0,
  );
  await core.retryJob(job.id, scope);
  const claim = await jobs.claim(1000);
  assert.ok(claim);
  assert.equal(claim.attempts, 1);
  await db.$executeRaw`UPDATE kc_ingestion_job SET lease_until=now()-interval '1 second' WHERE id=${job.id}`;
  await assert.rejects(
    () => jobs.heartbeat(job.id, claim.leaseToken),
    (e: any) => e.code === 'INGESTION_LEASE_LOST',
  );
  await worker.runOnce();
  assert.equal((await core.inspectJob(job.id, scope)).status, 'SUCCEEDED');
});
test('transient failures get at most four attempts; permanent failures never auto retry', async () => {
  mode = 'transient';
  const dto = await profile(),
    job = await upload(dto.id);
  for (let i = 1; i <= 4; i++) {
    await worker.runOnce();
    const s = await core.inspectJob(job.id, scope);
    assert.equal(s.attempts, i);
    assert.equal(s.status, i === 4 ? 'FAILED' : 'QUEUED');
    if (i < 4)
      await db.$executeRaw`UPDATE kc_ingestion_job SET available_at=now() WHERE id=${job.id}`;
  }
  mode = 'permanent';
  const other = await upload(dto.id);
  await worker.runOnce();
  const failed = await core.inspectJob(other.id, scope);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.attempts, 1);
  assert.equal(JSON.stringify(failed).includes('fake-sensitive-key'), false);
  mode = 'ok';
});
test('unsupported and partial indexes cannot be released', async () => {
  const dto = await profile(),
    base = await core.createBase(scope, 'unsupported');
  const j = await core.upload(base.id, scope, {
    originalName: 'x.png',
    bytes: Buffer.from('image'),
    profileId: dto.id,
    idempotencyKey: randomUUID(),
  });
  await worker.runOnce();
  const state = await core.inspectJob(j.id, scope);
  assert.equal(state.index.status, 'DOWNLOAD_ONLY');
  await assert.rejects(() =>
    core.createRelease(base.id, scope, [state.indexRevisionId]),
  );
});

test('lease expiring inside promotion transaction rolls all writes back', async () => {
  const dto = await profile(),
    job = await upload(dto.id);
  const claim = await jobs.claim(100);
  assert.equal(claim.id, job.id);
  await assert.rejects(
    () =>
      jobs.withLease(job.id, claim.leaseToken, async (tx) => {
        await new Promise((r) => setTimeout(r, 150));
        await tx.knowledgeIngestionJob.update({
          where: { id: job.id },
          data: { status: 'SUCCEEDED', leaseToken: null, leaseUntil: null },
        });
      }),
    (e: any) => e.code === 'INGESTION_LEASE_LOST',
  );
  assert.equal((await core.inspectJob(job.id, scope)).status, 'RUNNING');
  await worker.runOnce();
});
test('lease stolen during slow upstream never writes stale chunks', async () => {
  const dto = await profile(),
    job = await upload(dto.id);
  delay = new Promise((r) => (unlock = r));
  const pending = worker.runOnce();
  await new Promise((r) => setTimeout(r, 100));
  await db.$executeRaw`UPDATE kc_ingestion_job SET lease_token='new-worker',lease_until=now()+interval '1 minute' WHERE id=${job.id}`;
  unlock!();
  delay = undefined;
  await pending;
  const state = await core.inspectJob(job.id, scope);
  assert.equal(state.status, 'RUNNING');
  assert.equal(
    await db.knowledgeChunk.count({
      where: { indexRevisionId: state.indexRevisionId },
    }),
    0,
  );
  await db.$executeRaw`UPDATE kc_ingestion_job SET lease_until=now()-interval '1 second' WHERE id=${job.id}`;
  await worker.runOnce();
  assert.equal((await core.inspectJob(job.id, scope)).status, 'SUCCEEDED');
});
test('partial extraction has no semantic vectors and cannot enter a release', async () => {
  const dto = await profile(),
    job = await upload(dto.id, randomUUID(), 'a'.repeat(1_000_010));
  await worker.runOnce();
  const state = await core.inspectJob(job.id, scope);
  assert.equal(state.index.status, 'PARTIAL');
  assert.equal(
    await db.knowledgeChunk.count({
      where: { indexRevisionId: state.indexRevisionId },
    }),
    0,
  );
  await assert.rejects(() =>
    core.createRelease(state.baseId, scope, [state.indexRevisionId]),
  );
});

test('credentials rotation uses same frozen profile; corrupted encrypted credentials are safe failures', async () => {
  const dto = await profile();
  await db.llmProvider.update({
    where: { id: dto.providerId },
    data: { apiKeyEnc: encryptApiKey('rotated-test-secret') },
  });
  const resolved = await profiles.resolveForRequest(dto.id, 'EMBEDDING');
  assert.equal(resolved.apiKey, 'rotated-test-secret');
  assert.equal(
    JSON.stringify(await profiles.get(dto.id)).includes('rotated-test-secret'),
    false,
  );
  await db.llmProvider.update({
    where: { id: dto.providerId },
    data: { apiKeyEnc: 'broken-secret-blob' },
  });
  await assert.rejects(
    () => profiles.resolveForRequest(dto.id, 'EMBEDDING'),
    (e: any) =>
      e.code === 'PROVIDER_CREDENTIALS_UNAVAILABLE' &&
      !JSON.stringify(e).includes('broken-secret'),
  );
});
test('atomic parallel claims never give two workers the same job; crashed fourth attempt exhausts durably', async () => {
  const dto = await profile(),
    a = await upload(dto.id),
    b = await upload(dto.id);
  const claims = await Promise.all([jobs.claim(100), jobs.claim(100)]);
  assert.ok(claims[0] && claims[1]);
  assert.notEqual(claims[0].id, claims[1].id);
  assert.deepEqual(new Set(claims.map((c) => c.id)), new Set([a.id, b.id]));
  for (const c of claims)
    await db.$executeRaw`UPDATE kc_ingestion_job SET attempts=4,lease_until=now()-interval '1 second' WHERE id=${c.id}`;
  assert.equal(await jobs.claim(), null);
  assert.equal((await core.inspectJob(a.id, scope)).status, 'FAILED');
  assert.equal((await core.inspectJob(b.id, scope)).index.status, 'FAILED');
});
test('a replacement release keeps old revision, profile and chunk references readable unchanged', async () => {
  const dto = await profile(),
    job = await upload(dto.id, randomUUID(), 'original text');
  await worker.runOnce();
  const state = await core.inspectJob(job.id, scope);
  const first = await core.createRelease(state.baseId, scope, [
    state.indexRevisionId,
  ]);
  const original = await core.getReleaseInventory(first.id, scope);
  const documentId = original[0].revision.documentId;
  const next = await core.upload(state.baseId, scope, {
    documentId,
    profileId: dto.id,
    originalName: 'new.txt',
    bytes: Buffer.from('replacement text'),
    idempotencyKey: randomUUID(),
  });
  await worker.runOnce();
  const replacement = await core.inspectJob(next.id, scope);
  const second = await core.createRelease(state.baseId, scope, [
    replacement.indexRevisionId,
  ]);
  assert.equal(second.version, 2);
  assert.equal(
    (await core.getRelease(first.id, scope)).items[0].indexRevisionId,
    state.indexRevisionId,
  );
  assert.equal(
    (await core.readChunks([state.indexRevisionId], scope))[0].text,
    'original text',
  );
  await assert.rejects(() =>
    db.knowledgeReleaseItem.create({
      data: {
        releaseId: first.id,
        indexRevisionId: replacement.indexRevisionId,
      },
    }),
  );
  await db.knowledgeDocument.update({
    where: { id: documentId },
    data: { enabled: false },
  });
  await assert.rejects(
    () => core.readChunks([state.indexRevisionId], scope),
    (e: any) => e.code === 'KNOWLEDGE_DISABLED',
  );
});

test('same bytes and embedding profile with a new chunk config creates a distinct immutable successor index', async () => {
  const dto = await profile(),
    job = await upload(
      dto.id,
      randomUUID(),
      'one two three four five six seven eight nine ten',
    );
  await worker.runOnce();
  const state = await core.inspectJob(job.id, scope),
    first = await core.createRelease(state.baseId, scope, [
      state.indexRevisionId,
    ]);
  const inv = await core.getReleaseInventory(first.id, scope);
  const next = await core.reindexRevision(inv[0].revisionId, scope, {
    profileId: dto.id,
    idempotencyKey: randomUUID(),
    indexConfig: { targetTokens: 4, maxTokens: 6, overlapTokens: 1 },
  });
  assert.notEqual(next.indexRevisionId, state.indexRevisionId);
  await worker.runOnce();
  assert.equal((await core.inspectJob(next.id, scope)).index.status, 'READY');
  assert.equal(
    (await core.getRelease(first.id, scope)).items[0].indexRevisionId,
    state.indexRevisionId,
  );
});
test('corrected parser format for identical bytes creates a new revision rather than reusing download-only work', async () => {
  const dto = await profile(),
    base = await core.createBase(scope, 'format');
  const one = await core.upload(base.id, scope, {
    profileId: dto.id,
    originalName: 'wrong.png',
    bytes: Buffer.from('readable text'),
    idempotencyKey: randomUUID(),
  });
  await worker.runOnce();
  const state = await core.inspectJob(one.id, scope);
  const old = await db.knowledgeDocumentRevision.findUniqueOrThrow({
    where: { id: state.index.revisionId },
  });
  const two = await core.upload(base.id, scope, {
    documentId: old.documentId,
    profileId: dto.id,
    originalName: 'correct.txt',
    bytes: Buffer.from('readable text'),
    idempotencyKey: randomUUID(),
  });
  assert.notEqual(two.indexRevisionId, one.indexRevisionId);
  await worker.runOnce();
  assert.equal((await core.inspectJob(two.id, scope)).index.status, 'READY');
});

test('reused-index upload reserves every accepted key without overwriting the original job mapping', async () => {
  const dto = await profile(),
    original = await upload(dto.id, randomUUID(), 'alias original');
  const state = await core.inspectJob(original.id, scope);
  const revision = await db.knowledgeDocumentRevision.findUniqueOrThrow({
    where: { id: state.index.revisionId },
  });
  const keyB = randomUUID();
  const input = {
    documentId: revision.documentId,
    originalName: revision.originalName,
    bytes: Buffer.from('alias original'),
    profileId: dto.id,
    idempotencyKey: keyB,
  };
  const reused = await core.upload(state.baseId, scope, input);
  assert.equal(reused.id, original.id);
  assert.equal((await core.upload(state.baseId, scope, input)).id, original.id);
  await assert.rejects(
    () =>
      core.upload(state.baseId, scope, {
        ...input,
        bytes: Buffer.from('changed under accepted key'),
      }),
    (e: any) => e.code === 'IDEMPOTENCY_CONFLICT',
  );
  const old = await db.knowledgeIngestionJob.findUniqueOrThrow({
    where: { id: original.id },
  });
  assert.equal(old.idempotencyKey, original.idempotencyKey);
  const aliases = await db.knowledgeIngestionRequest.findMany({
    where: { baseId: state.baseId },
  });
  assert.equal(aliases.length, 2);
  assert.equal(
    aliases.find((alias) => alias.idempotencyKey === original.idempotencyKey)
      ?.requestHash,
    old.requestHash,
  );
  assert.equal(
    aliases.find((alias) => alias.idempotencyKey === keyB)?.jobId,
    original.id,
  );
  await assert.rejects(() =>
    db.knowledgeIngestionRequest.update({
      where: {
        baseId_idempotencyKey: { baseId: state.baseId, idempotencyKey: keyB },
      },
      data: { requestHash: '0'.repeat(64) },
    }),
  );
  assert.equal(
    await db.knowledgeIngestionJob.count({ where: { baseId: state.baseId } }),
    1,
  );
  await exhaustQueued();
});

test('reindexRevision reserves reused-job aliases for identical retries and changed-config conflicts', async () => {
  const dto = await profile(),
    original = await upload(dto.id);
  const state = await core.inspectJob(original.id, scope),
    keyB = randomUUID();
  const input = { profileId: dto.id, idempotencyKey: keyB };
  assert.equal(
    (await core.reindexRevision(state.index.revisionId, scope, input)).id,
    original.id,
  );
  assert.equal(
    (await core.reindexRevision(state.index.revisionId, scope, input)).id,
    original.id,
  );
  await assert.rejects(
    () =>
      core.reindexRevision(state.index.revisionId, scope, {
        ...input,
        indexConfig: { targetTokens: 4, maxTokens: 6, overlapTokens: 1 },
      }),
    (e: any) => e.code === 'IDEMPOTENCY_CONFLICT',
  );
  assert.equal(
    await db.knowledgeIngestionJob.count({ where: { baseId: state.baseId } }),
    1,
  );
  await exhaustQueued();
});

test('concurrent reused-key retries share one job and permanently reject changed bodies', async () => {
  const dto = await profile(),
    original = await upload(dto.id, randomUUID(), 'concurrent alias');
  const state = await core.inspectJob(original.id, scope);
  const revision = await db.knowledgeDocumentRevision.findUniqueOrThrow({
    where: { id: state.index.revisionId },
  });
  const input = {
    documentId: revision.documentId,
    originalName: revision.originalName,
    bytes: Buffer.from('concurrent alias'),
    profileId: dto.id,
    idempotencyKey: randomUUID(),
  };
  const accepted = await Promise.all(
    Array.from({ length: 4 }, () => core.upload(state.baseId, scope, input)),
  );
  assert.deepEqual(
    accepted.map((job) => job.id),
    Array(4).fill(original.id),
  );
  const changed = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      core.upload(state.baseId, scope, {
        ...input,
        bytes: Buffer.from('changed concurrent alias'),
      }),
    ),
  );
  assert.ok(
    changed.every(
      (result) =>
        result.status === 'rejected' &&
        result.reason.code === 'IDEMPOTENCY_CONFLICT',
    ),
  );
  assert.equal(
    await db.knowledgeIngestionJob.count({ where: { baseId: state.baseId } }),
    1,
  );
  await exhaustQueued();
});
