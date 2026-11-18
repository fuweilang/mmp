import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { KnowledgeCoreService } from '../../src/knowledge-core/knowledge-core.service';

// In-memory persistence for upload transactions; use the real validation, deduplication and request handling.
function fixture() {
  const base = { id: 'base', scope: 'PLATFORM', tenantId: null, enabled: true, autoUpdate: false };
  const document = { id: 'document', baseId: base.id, title: '旧文件.txt', enabled: true, deletedAt: null, requestedIndexId: null as string | null };
  const revisions: any[] = [], indexes: any[] = [], jobs: any[] = [], requests: any[] = [];
  let sequence = 0;
  let onRead = () => {};
  const tx = {
    $queryRaw: async () => [],
    knowledgeBase: { findUnique: async () => base, findUniqueOrThrow: async () => base },
    knowledgeDocument: {
      findUnique: async ({ where }: any) => where.id === document.id ? document : null,
      update: async ({ data }: any) => Object.assign(document, data),
    },
    knowledgeDocumentRevision: {
      findUnique: async ({ where }: any) => {
        if (where.id) {
          const row = revisions.find(row => row.id === where.id);
          return row ? { ...row, document: { ...document } } : null;
        }
        return revisions.find(row => Object.entries(where.documentId_contentHash_parserFormat).every(([key, value]) => row[key] === value)) ?? null;
      },
      create: async ({ data }: any) => { const row = { id: `revision-${++sequence}`, ...data }; revisions.push(row); return row; },
    },
    knowledgeIndexRevision: {
      findUnique: async ({ where }: any) => {
        const row = indexes.find(row => Object.entries(where.revisionId_profileId_indexConfigHash).every(([key, value]) => row[key] === value));
        return row ? { ...row, job: jobs.find(job => job.indexRevisionId === row.id) } : null;
      },
      create: async ({ data }: any) => { const row = { id: `index-${++sequence}`, status: 'PENDING', ...data }; indexes.push(row); return row; },
    },
    knowledgeIngestionJob: { create: async ({ data }: any) => { const row = { id: `job-${++sequence}`, leaseToken: null, ...data }; jobs.push(row); return row; } },
    knowledgeIngestionRequest: {
      findUnique: async ({ where }: any) => {
        const row = requests.find(row => row.baseId === where.baseId_idempotencyKey.baseId && row.idempotencyKey === where.baseId_idempotencyKey.idempotencyKey);
        return row ? { ...row, job: jobs.find(job => job.id === row.jobId) } : null;
      },
      create: async ({ data }: any) => { requests.push(data); return data; },
    },
  };
  const core = new KnowledgeCoreService(
    { ...tx, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx) } as never,
    { resolveForRequest: async () => ({ maxInputTokens: 8192 }) } as never,
    { put: async (bytes: Buffer) => ({ contentHash: createHash('sha256').update(bytes).digest('hex'), storageKey: 'blob', sizeBytes: bytes.length }), read: async () => { onRead(); return Buffer.from('same content'); } } as never,
    {} as never,
  );
  const upload = (originalName: string, idempotencyKey: string, bytes = originalName, extra = {}) => core.upload(base.id, { type: 'PLATFORM' }, {
    documentId: document.id, profileId: 'profile', originalName, idempotencyKey, bytes: Buffer.from(bytes), ...extra,
  });
  return { core, document, revisions, jobs, upload, onRead: (callback: () => void) => { onRead = callback; } };
}

test('replacing a knowledge file synchronizes its title with the accepted filename', async () => {
  const f = fixture();
  const first = await f.upload('第一版.txt', 'first');
  const second = await f.upload('C:\\uploads\\第二版.txt', 'second');
  assert.equal(f.document.title, '第二版.txt');
  assert.equal(f.document.id, 'document');
  assert.equal(f.document.requestedIndexId, second.indexRevisionId);
  assert.notEqual(first.indexRevisionId, second.indexRevisionId);
  assert.equal(f.revisions[0].originalName, '第一版.txt', 'old immutable revision names remain intact');
});

test('same-content renames update the title without duplicating content or replaying an older title', async () => {
  const f = fixture();
  const first = await f.upload('第一版.txt', 'first', 'same content');
  const renamed = await f.upload('重命名后.txt', 'rename', 'same content');
  assert.equal(renamed.id, first.id);
  assert.equal(f.revisions.length, 1);
  assert.equal(f.document.title, '重命名后.txt');
  await f.upload('第一版.txt', 'first', 'same content');
  assert.equal(f.document.title, '重命名后.txt', 'an idempotent replay must not undo a later replacement');
});

test('an explicit replacement title is respected and a rejected request leaves the title intact', async () => {
  const f = fixture();
  await f.upload('新文件.txt', 'replace', 'content', { title: '自定义展示标题' });
  assert.equal(f.document.title, '自定义展示标题');
  await assert.rejects(() => f.upload('拒绝替换.txt', 'replace', 'changed content'), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.document.title, '自定义展示标题');
  assert.equal(f.jobs.length, 1);
});

test('reprocessing a revision preserves the current document title after a rename', async () => {
  const f = fixture();
  await f.upload('原文件.txt', 'first', 'same content');
  await f.upload('重命名后.txt', 'rename', 'same content');
  await f.core.reindexRevision(f.revisions[0].id, { type: 'PLATFORM' }, { profileId: 'profile', idempotencyKey: 'reprocess' });
  assert.equal(f.document.title, '重命名后.txt');
});

test('reprocessing does not overwrite a newer title changed while its blob is being read', async () => {
  const f = fixture();
  await f.upload('原文件.txt', 'first', 'same content');
  f.onRead(() => { f.document.title = '并发替换后的名称.txt'; });
  await f.core.reindexRevision(f.revisions[0].id, { type: 'PLATFORM' }, { profileId: 'profile', idempotencyKey: 'reprocess' });
  assert.equal(f.document.title, '并发替换后的名称.txt');
});

test('replaying a reprocessing request after a rename remains idempotent and preserves the title', async () => {
  const f = fixture();
  await f.upload('原文件.txt', 'first', 'same content');
  const request = { profileId: 'profile', idempotencyKey: 'reprocess' };
  const first = await f.core.reindexRevision(f.revisions[0].id, { type: 'PLATFORM' }, request);
  await f.upload('最新名称.txt', 'rename', 'same content');
  const replay = await f.core.reindexRevision(f.revisions[0].id, { type: 'PLATFORM' }, request);
  assert.equal(replay.id, first.id);
  assert.equal(f.document.title, '最新名称.txt');
});
