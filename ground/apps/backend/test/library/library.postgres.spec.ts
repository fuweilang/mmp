import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { LibraryError } from '../../src/library/library.errors.ts';
import { PrismaLibraryStore } from '../../src/library/library.prisma-store.ts';
import { LibraryService } from '../../src/library/library.service.ts';
import type { Actor, ChunkRecord, NodeRecord, VersionRecord } from '../../src/library/library.types.ts';

const databaseUrl = process.env.LIBRARY_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('LIBRARY_TEST_DATABASE_URL is required for the migrated Postgres library test');
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
    const service = new LibraryService(store);
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
    store.commitNewFile = async () => {
      throw new Error('forced commit failure');
    };
    const service = new LibraryService(store);
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
});
