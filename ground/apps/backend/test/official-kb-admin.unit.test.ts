import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KbStatus } from '@prisma/client';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OfficialKbService } from '../src/official-agent/official-kb.service';

describe('OfficialKbService admin staging', () => {
  it('keeps previous active READY searchable when staging index fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'official-kb-'));
    process.env.UPLOAD_DIR = root;
    mkdirSync(join(root, 'official', 'agent-1'), { recursive: true });

    const docs: Array<Record<string, unknown>> = [
      {
        id: 'doc-old',
        agentId: 'agent-1',
        versionId: null,
        assetKey: '1.md',
        name: '旧资料',
        originalName: '1.md',
        mimeType: 'text/markdown',
        sizeBytes: 12,
        storagePath: 'official/agent-1/old.md',
        status: KbStatus.READY,
        indexError: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    writeFileSync(join(root, 'official/agent-1/old.md'), '# 旧正文 利基市场');

    const chunks: Array<Record<string, unknown>> = [
      { id: 'c1', agentId: 'agent-1', documentId: 'doc-old', ordinal: 0, content: '旧正文 利基市场' },
    ];

    const agent = {
      id: 'agent-1',
      key: 'niche',
      kind: 'GENERAL',
      toolScope: ['enterprise_knowledge'],
      onlineVersionId: null,
      officialDocuments: [{ id: 'doc-old' }],
      name: '利基战略',
      status: 'PUBLISHED',
    };

    let idSeq = 1;
    const prisma: any = {
      officialAgent: {
        findUnique: async () => ({ ...agent, officialDocuments: docs.filter((d) => d.active).map((d) => ({ id: d.id })) }),
        findMany: async () => [],
      },
      officialKbDocument: {
        findFirst: async ({ where }: any) =>
          docs.find(
            (d) =>
              d.agentId === where.agentId &&
              (!where.assetKey || d.assetKey === where.assetKey) &&
              (where.active === undefined || d.active === where.active) &&
              (!where.id || d.id === where.id),
          ) ?? null,
        findUnique: async ({ where }: any) => {
          const row = docs.find((d) => d.id === where.id);
          if (!row) return null;
          return {
            ...row,
            agent: { id: agent.id, key: agent.key, name: agent.name, kind: agent.kind, status: agent.status },
            version: null,
            _count: { chunks: chunks.filter((c) => c.documentId === row.id).length },
          };
        },
        findUniqueOrThrow: async ({ where }: any) => {
          const row = docs.find((d) => d.id === where.id);
          assert.ok(row);
          return row;
        },
        create: async ({ data }: any) => {
          const row = {
            ...data,
            id: `doc-new-${idSeq++}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            indexError: null,
          };
          docs.push(row);
          return row;
        },
        update: async ({ where, data }: any) => {
          const row = docs.find((d) => d.id === where.id);
          assert.ok(row);
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        },
        updateMany: async ({ where, data }: any) => {
          for (const row of docs) {
            if (where.agentId && row.agentId !== where.agentId) continue;
            if (where.assetKey && row.assetKey !== where.assetKey) continue;
            if (where.active !== undefined && row.active !== where.active) continue;
            if (where.id?.not && row.id === where.id.not) continue;
            if (where.id && !where.id.not && row.id !== where.id) continue;
            Object.assign(row, data);
          }
          return { count: 1 };
        },
        findMany: async () => docs,
        count: async ({ where }: any) =>
          docs.filter((d) => d.agentId === where.agentId && d.active === where.active && d.status === where.status)
            .length,
      },
      officialKbChunk: {
        findMany: async ({ where }: any) => {
          const activeReadyIds = new Set(
            docs.filter((d) => d.active && d.status === KbStatus.READY).map((d) => d.id),
          );
          return chunks
            .filter((c) => c.agentId === where.agentId && activeReadyIds.has(String(c.documentId)))
            .map((c) => ({
              ...c,
              document: { id: c.documentId, name: '旧资料' },
            }));
        },
        deleteMany: async ({ where }: any) => {
          for (let i = chunks.length - 1; i >= 0; i -= 1) {
            if (chunks[i].documentId === where.documentId) chunks.splice(i, 1);
          }
          return { count: 1 };
        },
        createMany: async ({ data }: any) => {
          for (const item of data) chunks.push({ id: `c-${chunks.length + 1}`, ...item });
          return { count: data.length };
        },
      },
      $transaction: async (fn: any) => fn(prisma),
    };

    const service = new OfficialKbService(prisma);

    // Force index failure by uploading empty-ish binary that extractText can't chunk meaningfully:
    // use a buffer that becomes empty after sanitize/extract — actually md with only spaces.
    // Better: mock by writing a file that index marks FAILED via empty chunks after extract.
    // `#` alone may still chunk; use empty markdown after trim via null bytes stripped to empty.
    const bad = Buffer.from('   \n\t  ');
    const result = await service.replaceAdminDocument('doc-old', {
      originalname: '1.md',
      mimetype: 'text/markdown',
      size: bad.length,
      buffer: bad,
    });

    assert.equal(result.status, KbStatus.FAILED);
    assert.equal(result.active, false);
    const old = docs.find((d) => d.id === 'doc-old');
    assert.equal(old?.active, true);
    assert.equal(old?.status, KbStatus.READY);

    const search = await service.search('agent-1', '利基市场');
    assert.ok(search.hits.length > 0, 'old active knowledge must still be searchable');
    assert.equal(await service.hasDocuments('agent-1'), true);
  });

  it('promotes staging to active and demotes previous on successful replace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'official-kb-ok-'));
    process.env.UPLOAD_DIR = root;
    mkdirSync(join(root, 'official', 'agent-1'), { recursive: true });
    writeFileSync(join(root, 'official/agent-1/old.md'), '# 旧正文');

    const docs: Array<Record<string, unknown>> = [
      {
        id: 'doc-old',
        agentId: 'agent-1',
        versionId: null,
        assetKey: '1.md',
        name: '旧资料',
        originalName: '1.md',
        mimeType: 'text/markdown',
        sizeBytes: 8,
        storagePath: 'official/agent-1/old.md',
        status: KbStatus.READY,
        indexError: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const chunks: Array<Record<string, unknown>> = [
      { id: 'c1', agentId: 'agent-1', documentId: 'doc-old', ordinal: 0, content: '旧正文' },
    ];
    const agent = {
      id: 'agent-1',
      key: 'gzh',
      kind: 'GENERAL',
      toolScope: ['enterprise_knowledge'],
      onlineVersionId: null,
      officialDocuments: [{ id: 'doc-old' }],
      name: '公众号改写',
      status: 'PUBLISHED',
    };
    let idSeq = 1;
    const prisma: any = {
      officialAgent: {
        findUnique: async () => ({
          ...agent,
          officialDocuments: docs.filter((d) => d.active).map((d) => ({ id: d.id })),
        }),
      },
      officialKbDocument: {
        findFirst: async ({ where }: any) =>
          docs.find(
            (d) =>
              d.agentId === where.agentId &&
              (!where.assetKey || d.assetKey === where.assetKey) &&
              (where.active === undefined || d.active === where.active),
          ) ?? null,
        findUnique: async ({ where }: any) => {
          const row = docs.find((d) => d.id === where.id);
          if (!row) return null;
          if (where) {
            /* include shape for getAdminDocument */
          }
          return {
            ...row,
            agent: { id: agent.id, key: agent.key, name: agent.name, kind: agent.kind, status: agent.status },
            version: null,
            _count: { chunks: chunks.filter((c) => c.documentId === row.id).length },
          };
        },
        findUniqueOrThrow: async ({ where }: any) => {
          const row = docs.find((d) => d.id === where.id);
          assert.ok(row);
          return row;
        },
        create: async ({ data }: any) => {
          const row = { ...data, id: `doc-new-${idSeq++}`, createdAt: new Date(), updatedAt: new Date(), indexError: null };
          docs.push(row);
          return row;
        },
        update: async ({ where, data }: any) => {
          const row = docs.find((d) => d.id === where.id);
          assert.ok(row);
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        },
        updateMany: async ({ where, data }: any) => {
          for (const row of docs) {
            if (where.agentId && row.agentId !== where.agentId) continue;
            if (where.assetKey && row.assetKey !== where.assetKey) continue;
            if (where.active !== undefined && row.active !== where.active) continue;
            if (where.id?.not && row.id === where.id.not) continue;
            if (typeof where.id === 'string' && row.id !== where.id) continue;
            Object.assign(row, data);
          }
          return { count: 1 };
        },
      },
      officialKbChunk: {
        deleteMany: async ({ where }: any) => {
          for (let i = chunks.length - 1; i >= 0; i -= 1) {
            if (chunks[i].documentId === where.documentId) chunks.splice(i, 1);
          }
          return { count: 1 };
        },
        createMany: async ({ data }: any) => {
          for (const item of data) chunks.push({ id: `c-${chunks.length + 1}`, ...item });
          return { count: data.length };
        },
        findMany: async () => [],
      },
      $transaction: async (fn: any) => fn(prisma),
    };

    const service = new OfficialKbService(prisma);
    const good = Buffer.from('# 新正文\n公众号改写知识库要点');
    const result = await service.replaceAdminDocument('doc-old', {
      originalname: '1.md',
      mimetype: 'text/markdown',
      size: good.length,
      buffer: good,
    });

    assert.equal(result.status, KbStatus.READY);
    assert.equal(result.active, true);
    assert.notEqual(result.id, 'doc-old');
    const old = docs.find((d) => d.id === 'doc-old');
    assert.equal(old?.active, false);
    const active = docs.filter((d) => d.active);
    assert.equal(active.length, 1);
    assert.equal(active[0].id, result.id);
    // staged file exists under upload root
    const staged = docs.find((d) => d.id === result.id);
    assert.ok(staged?.storagePath);
    assert.ok(readFileSync(join(root, String(staged?.storagePath)), 'utf8').includes('新正文'));
  });
});
