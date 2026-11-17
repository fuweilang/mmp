import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { LibraryError } from '../../src/library/library.errors';
import { PrismaLibraryStore } from '../../src/library/library.prisma-store';
import { createLibraryService } from '../../src/library/library.service';
import type { Actor, ChunkRecord, NodeRecord, VersionRecord } from '../../src/library/library.types';

const databaseUrl = process.env.LIBRARY_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('LIBRARY_TEST_DATABASE_URL is required for the migrated Postgres library test');
}
const testTarget = new URL(databaseUrl);
if (testTarget.hostname !== '127.0.0.1' || testTarget.port !== '55439' || testTarget.pathname !== '/mmp_library_acceptance') {
  throw new Error('Refusing test mutations outside the dedicated local library acceptance database');
}
process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
let libraryDir = '';
let ownerId = '';
let mateId = '';
let otherId = '';
let tenantA = '';
let tenantB = '';

async function filesUnder(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const found: string[] = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...await filesUnder(path));
      else if ((await stat(path)).isFile()) found.push(path);
    }
    return found;
  } catch {
    return [];
  }
}

function actor(userId: string, tenantId: string, extra: Partial<Actor> = {}): Actor {
  return {
    userId,
    tenantId,
    isPlatformAdmin: false,
    isOrgAdmin: false,
    activeMember: true,
    ...extra,
  };
}

describe('library postgres', () => {
  before(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'library-pg-'));
    process.env.LIBRARY_DIR = libraryDir;
    const tail = String(Date.now()).slice(-7);
    const owner = await prisma.user.create({
      data: { phone: `139${tail}1`, passwordHash: 'not-a-login-secret', name: '库测甲' },
    });
    const mate = await prisma.user.create({
      data: { phone: `139${tail}2`, passwordHash: 'not-a-login-secret', name: '库测乙' },
    });
    const other = await prisma.user.create({
      data: { phone: `139${tail}3`, passwordHash: 'not-a-login-secret', name: '库测丙' },
    });
    const a = await prisma.tenant.create({
      data: { name: '库测企业甲', slug: `lib-a-${stamp}`, type: 'ENTERPRISE' },
    });
    const b = await prisma.tenant.create({
      data: { name: '库测企业乙', slug: `lib-b-${stamp}`, type: 'ENTERPRISE' },
    });
    await prisma.orgMember.createMany({
      data: [
        { userId: owner.id, tenantId: a.id, role: 'MEMBER' },
        { userId: mate.id, tenantId: a.id, role: 'MEMBER' },
        { userId: other.id, tenantId: b.id, role: 'MEMBER' },
      ],
    });
    ownerId = owner.id;
    mateId = mate.id;
    otherId = other.id;
    tenantA = a.id;
    tenantB = b.id;
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, mateId, otherId].filter(Boolean) } } });
    await prisma.$disconnect();
    if (libraryDir) await rm(libraryDir, { recursive: true, force: true });
  });

  it('persists the first markdown upload, parses it, and opens the real source', async () => {
    const store = new PrismaLibraryStore(prisma as never);
    const service = createLibraryService({ store });
    const owner = actor(ownerId, tenantA);
    const mate = actor(mateId, tenantA);
    const other = actor(otherId, tenantB);
    const item = await service.upload(owner, {
      originalName: 'first.md',
      mimeType: 'text/markdown',
      bytes: Buffer.from('第一段持久正文'),
    });
    assert.equal(item.scope, 'PRIVATE');
    assert.equal(item.currentVersion?.parseStatus, 'READY');
    const versionId = item.currentVersion?.id;
    assert.ok(versionId);
    const row = await prisma.libraryVersion.findUnique({ where: { id: versionId } });
    const node = await prisma.libraryNode.findUnique({ where: { id: item.id } });
    assert.equal(row?.nodeId, item.id);
    assert.equal(node?.currentVersionId, versionId);
    const chunks = await prisma.libraryChunk.findMany({ where: { versionId } });
    assert.match(chunks.map((chunk) => chunk.content).join('\n'), /第一段持久正文/);
    const blobCount = (await filesUnder(libraryDir)).length;
    assert.equal(blobCount, 1);
    const opened = await service.openCitation(owner, item.id, versionId, 'paragraph:1');
    assert.equal(opened.versionId, versionId);
    assert.match(opened.quote ?? '', /第一段持久正文/);
    assert.equal(opened.replacementVersionId, null);
    const hidden = await service.preview(other, item.id).then(() => {
      throw new Error('跨租户不应打开');
    }, (error: unknown) => error);
    assert.ok(hidden instanceof LibraryError);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.message.includes('第一段'), false);
    const mateHidden = await service.preview(mate, item.id).then(() => {
      throw new Error('同事不应看到私人资料');
    }, (error: unknown) => error);
    assert.ok(mateHidden instanceof LibraryError);
    assert.equal(mateHidden.status, 404);
    await service.setScope(owner, item.id, 'ENTERPRISE', true);
    assert.match((await service.preview(mate, item.id)).text ?? '', /第一段持久正文/);
    await service.setScope(owner, item.id, 'PRIVATE');
    const revoked = await service.download(mate, item.id).then(() => {
      throw new Error('收回共享后不应下载');
    }, (error: unknown) => error);
    assert.ok(revoked instanceof LibraryError);
    assert.equal(revoked.status, 404);
    const replaced = await service.replaceVersion(owner, item.id, 'first.md', 'text/markdown', Buffer.from('第二版正文'));
    const old = await service.openCitation(owner, item.id, versionId, 'paragraph:1');
    assert.match(old.quote ?? '', /第一段持久正文/);
    assert.notEqual(replaced.currentVersion?.id, versionId);
    await service.recycle(owner, item.id);
    const recycled = await service.download(owner, item.id, versionId).then(() => {
      throw new Error('回收后不应下载');
    }, (error: unknown) => error);
    assert.ok(recycled instanceof LibraryError);
    assert.equal(recycled.status, 409);
    console.log(JSON.stringify({
      upload: { id: item.id, versionId, parseStatus: item.currentVersion?.parseStatus },
      chunks: chunks.length,
      blobCount,
      replacedVersionId: replaced.currentVersion?.id,
    }));
  });

  it('rolls back metadata and deletes the blob when the first commit fails', async () => {
    const store = new PrismaLibraryStore(prisma as never);
    const beforeNodes = await prisma.libraryNode.count({ where: { tenantId: tenantA } });
    const beforeVersions = await prisma.libraryVersion.count({ where: { tenantId: tenantA } });
    const beforeFiles = (await filesUnder(libraryDir)).length;
    const write = store.withTenantWrite.bind(store);
    store.withTenantWrite = (tenantId, work) => write(tenantId, transactionStore => {
      transactionStore.commitNewFile = async () => { throw new Error('forced commit failure'); };
      return work(transactionStore);
    });
    const service = createLibraryService({ store });
    const error = await service.upload(actor(ownerId, tenantA), {
      originalName: 'orphan.md',
      mimeType: 'text/markdown',
      bytes: Buffer.from('不应留下'),
    }).then(() => {
      throw new Error('失败的提交不应成功');
    }, (caught: unknown) => caught);
    assert.ok(error instanceof Error);
    assert.match(error.message, /forced commit failure/);
    assert.equal(await prisma.libraryNode.count({ where: { tenantId: tenantA } }), beforeNodes);
    assert.equal(await prisma.libraryVersion.count({ where: { tenantId: tenantA } }), beforeVersions);
    assert.equal((await filesUnder(libraryDir)).length, beforeFiles);
    const node = store.createId();
    const version = store.createId();
    const broken: { node: NodeRecord; version: VersionRecord; chunks: ChunkRecord[] } = {
      node: {
        id: node,
        tenantId: tenantA,
        ownerUserId: ownerId,
        parentId: null,
        kind: 'FILE',
        name: 'bad.md',
        scope: 'PRIVATE',
        state: 'ACTIVE',
        linkUrl: null,
        currentVersionId: version,
        recycledAt: null,
        purgedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      version: {
        id: version,
        nodeId: node,
        tenantId: tenantA,
        versionNo: 1,
        originalName: 'bad.md',
        mimeType: 'text/markdown',
        sizeBytes: 1,
        storageKey: `${tenantA}/${version}.md`,
        sha256: 'abc',
        parseStatus: 'READY',
        parseReason: null,
        extractTruncated: false,
        createdByUserId: ownerId,
        createdAt: Date.now(),
      },
      chunks: [{
        id: store.createId(),
        versionId: version,
        tenantId: 'missing-tenant',
        ordinal: 0,
        content: '不应提交',
        locator: 'paragraph:1',
        locatorKind: 'paragraph',
      }],
    };
    const real = new PrismaLibraryStore(prisma as never);
    await assert.rejects(() => real.commitNewFile(broken));
    assert.equal(await prisma.libraryNode.findUnique({ where: { id: node } }), null);
    assert.equal(await prisma.libraryVersion.findUnique({ where: { id: version } }), null);
    assert.equal(await prisma.libraryChunk.count({ where: { versionId: version } }), 0);
  });
  it('persists shared roots, inherited uploads, recursive scope and concurrent tree writes', async () => {
    const first = createLibraryService({ store: new PrismaLibraryStore(prisma as never) });
    const second = createLibraryService({ store: new PrismaLibraryStore(prisma as never) });
    const owner = actor(ownerId, tenantA);
    const mate = actor(mateId, tenantA);
    const root = await first.createFolder(owner, '共享根', null, { scope: 'ENTERPRISE', confirmShare: true });
    const nested = await first.createFolder(mate, '同事目录', root.id);
    const file = await first.upload(owner, { parentId: nested.id, originalName: 'inherited.md', mimeType: 'text/markdown', bytes: Buffer.from('真实共享内容') });
    assert.equal(file.scope, 'ENTERPRISE');
    assert.equal((await prisma.libraryNode.findUnique({ where: { id: nested.id } }))?.ownerUserId, mateId);
    assert.match((await second.preview(mate, file.id)).text ?? '', /真实共享内容/);
    const privateRoot = await first.createFolder(owner, '递归目录');
    await Promise.all([
      first.createFolder(owner, '并发子目录', privateRoot.id),
      second.setScope(owner, privateRoot.id, 'ENTERPRISE', true),
    ]);
    const rows = await prisma.libraryNode.findMany({ where: { OR: [{ id: privateRoot.id }, { parentId: privateRoot.id }] } });
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.scope === 'ENTERPRISE'));
  });

  it('rolls back every recursive update and audit when Postgres rejects a descendant write', async () => {
    const service = createLibraryService({ store: new PrismaLibraryStore(prisma as never) });
    const owner = actor(ownerId, tenantA);
    const root = await service.createFolder(owner, '回滚根');
    const child = await service.createFolder(owner, '回滚子项', root.id);
    const name = 'library_share_fail_' + stamp;
    // All identifiers and UUIDs are generated by this isolated fixture, never external input.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${child.id}' AND NEW.scope = 'ENTERPRISE' THEN RAISE EXCEPTION 'recursive sharing failure fixture'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON library_node FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try {
      await assert.rejects(service.setScope(owner, root.id, 'ENTERPRISE', true), /recursive sharing failure fixture/);
      const rows = await prisma.libraryNode.findMany({ where: { id: { in: [root.id, child.id] } } });
      assert.ok(rows.every(row => row.scope === 'PRIVATE'));
      assert.equal(await prisma.auditLog.count({ where: { tenantId: tenantA, action: 'library_share', meta: { path: ['nodeId'], equals: root.id } } }), 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON library_node`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
    }
  });

  it('serializes concurrent tenant quota admissions and removes the rejected blob', async () => {
    const aggregate = await prisma.libraryVersion.aggregate({ where: { tenantId: tenantB, node: { state: { not: 'PURGED' } } }, _sum: { sizeBytes: true } });
    const store = new PrismaLibraryStore(prisma as never);
    const service = createLibraryService({ store, limits: { maxFileBytes: 1000, tenantQuotaBytes: (aggregate._sum.sizeBytes ?? 0) + 600, recycleDays: 30, askMaxChars: 12000, allowedExtensions: ['.md'] } });
    const before = (await filesUnder(libraryDir)).length;
    const outcomes = await Promise.allSettled(['a.md', 'b.md'].map(originalName => service.upload(actor(otherId, tenantB), { originalName, mimeType: 'text/markdown', bytes: Buffer.from('a'.repeat(400)) })));
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    const failure = outcomes.find(row => row.status === 'rejected');
    assert.equal(failure?.status === 'rejected' && failure.reason instanceof LibraryError && failure.reason.code, 'QUOTA');
    assert.equal((await filesUnder(libraryDir)).length, before + 1);
  });

  it('rolls back retry status and chunks when the transactional audit violates a database constraint', async () => {
    const store = new PrismaLibraryStore(prisma as never);
    const service = createLibraryService({ store });
    const item = await service.upload(actor(ownerId, tenantA), { originalName: 'retry-atomic.md', mimeType: 'text/markdown', bytes: Buffer.from('transaction source') });
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED', parseReason: 'retryable' });
    const before = await prisma.libraryVersion.findUniqueOrThrow({ where: { id: versionId } });
    const beforeChunks = await prisma.libraryChunk.findMany({ where: { versionId }, orderBy: { ordinal: 'asc' } });
    const existingAudit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: tenantA } });
    const input = {
      tenantId: tenantA, nodeId: item.id, versionId,
      parseStatus: 'READY' as const, parseReason: null, extractTruncated: false,
      chunks: [{ id: store.createId(), tenantId: tenantA, versionId, ordinal: 0, content: 'transaction source', locator: 'paragraph:1', locatorKind: 'paragraph' as const }],
      audit: { id: existingAudit.id, tenantId: tenantA, userId: ownerId, action: 'library_retry_parse', meta: { nodeId: item.id, versionId, status: 'READY' }, createdAt: Date.now() },
    };
    await assert.rejects(() => store.commitParseResult(input));
    assert.deepEqual(await prisma.libraryVersion.findUniqueOrThrow({ where: { id: versionId } }), before);
    assert.deepEqual(await prisma.libraryChunk.findMany({ where: { versionId }, orderBy: { ordinal: 'asc' } }), beforeChunks);
    input.audit.id = store.createId();
    assert.equal(await store.commitParseResult(input), 'committed');
    assert.equal((await store.getVersion(versionId))?.parseStatus, 'READY');
    const committedChunks = await store.listChunks(versionId);
    assert.equal(committedChunks.length, 1);
    assert.equal(await store.commitParseResult({ ...input, audit: { ...input.audit, id: store.createId() } }), 'unchanged');
    assert.deepEqual(await store.listChunks(versionId), committedChunks);
  });

  it('serializes retries from separate store instances without replacing a successful locator', async () => {
    const firstStore = new PrismaLibraryStore(prisma as never);
    const secondStore = new PrismaLibraryStore(prisma as never);
    const first = createLibraryService({ store: firstStore }), second = createLibraryService({ store: secondStore });
    const owner = actor(ownerId, tenantA);
    const item = await first.upload(owner, { originalName: 'parallel-retry.md', mimeType: 'text/markdown', bytes: Buffer.from('first\n\nsecond') });
    const versionId = item.currentVersion!.id;
    await firstStore.updateVersion(versionId, { parseStatus: 'FAILED' });
    let arrivals = 0;
    let release!: () => void;
    const bothReading = new Promise<void>(resolve => { release = resolve; });
    for (const store of [firstStore, secondStore]) {
      const read = store.getBlob.bind(store);
      store.getBlob = async key => { const bytes = await read(key); if (++arrivals === 2) release(); await bothReading; return bytes; };
    }
    await Promise.all([first.retryParse(owner, item.id), second.retryParse(owner, item.id)]);
    const chunks = await firstStore.listChunks(versionId);
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks.map(row => row.locator), ['paragraph:1', 'paragraph:2']);
    assert.equal(await prisma.auditLog.count({ where: { action: 'library_retry_parse', meta: { path: ['nodeId'], equals: item.id } } }), 1);
    await second.retryParse(owner, item.id);
    assert.deepEqual(await firstStore.listChunks(versionId), chunks);
  });

  for (const action of ['replace', 'recycle'] as const) it('rejects a stale PostgreSQL retry after ' + action, async () => {
    const store = new PrismaLibraryStore(prisma as never);
    const service = createLibraryService({ store }), owner = actor(ownerId, tenantA);
    const item = await service.upload(owner, { originalName: 'changed-retry.md', mimeType: 'text/markdown', bytes: Buffer.from('old source') });
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED' });
    const beforeChunks = await store.listChunks(versionId);
    const getBlob = store.getBlob.bind(store);
    store.getBlob = async key => {
      if (action === 'replace') await service.replaceVersion(owner, item.id, 'changed-retry.md', 'text/markdown', Buffer.from('new source'));
      else await service.recycle(owner, item.id);
      return getBlob(key);
    };
    await assert.rejects(() => service.retryParse(owner, item.id), (error: unknown) => error instanceof LibraryError && error.status === 409 && error.code === 'VERSION_CONFLICT');
    assert.equal((await store.getVersion(versionId))?.parseStatus, 'FAILED');
    assert.deepEqual(await store.listChunks(versionId), beforeChunks);
  });

});
