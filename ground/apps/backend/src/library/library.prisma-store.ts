import { randomUUID } from 'crypto';
import { mkdir, readFile, realpath, unlink, writeFile } from 'fs/promises';
import { dirname, relative, resolve, sep } from 'path';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LibraryError } from './library.errors';
import { resolveUnderRoot } from './library.files';
import type { LibraryStore, NewFileCommit, ParseCommit, ReplacementCommit, TenantBrief } from './library.store';
import type {
  AuditRecord,
  ChunkRecord,
  CustodyRecord,
  NodeRecord,
  RecentRecord,
  VersionRecord,
} from './library.types';
import { PrismaService } from '../prisma/prisma.service';

function rootDir() {
  return process.env.LIBRARY_DIR || resolve(process.cwd(), 'library-data');
}

async function containedPath(storageKey: string): Promise<string> {
  const abs = resolveUnderRoot(rootDir(), storageKey);
  await mkdir(dirname(abs), { recursive: true });
  const realRoot = await realpath(resolve(rootDir()));
  const realParent = await realpath(dirname(abs));
  const rel = relative(realRoot, realParent);
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) {
    throw new LibraryError(400, '存储路径无效', 'BAD_PATH');
  }
  return abs;
}

function ms(value: Date | null): number | null {
  return value ? value.getTime() : null;
}

@Injectable()
export class PrismaLibraryStore implements LibraryStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | Prisma.TransactionClient) {}

  /** Reuse the caller's Prisma transaction for platform operations; ordinary calls keep their original transaction. */
  private transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return '$transaction' in this.prisma ? this.prisma.$transaction(work, { maxWait: 10_000, timeout: 60_000 }) : work(this.prisma);
  }

  async withTenantWrite<T>(tenantId: string, work: (store: LibraryStore) => Promise<T>): Promise<T> {
    return this.transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'library-tree:' + tenantId}))`;
      return work(new PrismaLibraryStore(tx));
    });
  }

  createId(): string {
    return randomUUID();
  }

  async listNodes(tenantId: string): Promise<NodeRecord[]> {
    const rows = await this.prisma.libraryNode.findMany({ where: { tenantId } });
    return rows.map(toNode);
  }

  async getNode(id: string): Promise<NodeRecord | null> {
    const row = await this.prisma.libraryNode.findUnique({ where: { id } });
    return row ? toNode(row) : null;
  }

  async insertNode(row: NodeRecord): Promise<void> {
    await this.prisma.libraryNode.create({ data: nodeData(row) });
  }

  async updateNode(id: string, patch: Partial<NodeRecord>): Promise<void> {
    const data: Prisma.LibraryNodeUncheckedUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.parentId !== undefined) data.parentId = patch.parentId;
    if (patch.scope !== undefined) data.scope = patch.scope;
    if (patch.state !== undefined) data.state = patch.state;
    if (patch.currentVersionId !== undefined) data.currentVersionId = patch.currentVersionId;
    if (patch.linkUrl !== undefined) data.linkUrl = patch.linkUrl;
    if (patch.recycledAt !== undefined) data.recycledAt = patch.recycledAt ? new Date(patch.recycledAt) : null;
    if (patch.purgedAt !== undefined) data.purgedAt = patch.purgedAt ? new Date(patch.purgedAt) : null;
    if (patch.updatedAt !== undefined) data.updatedAt = new Date(patch.updatedAt);
    await this.prisma.libraryNode.update({ where: { id }, data });
  }

  async listVersions(nodeId: string): Promise<VersionRecord[]> {
    const rows = await this.prisma.libraryVersion.findMany({ where: { nodeId }, orderBy: { versionNo: 'asc' } });
    return rows.map(toVersion);
  }

  async getVersion(id: string): Promise<VersionRecord | null> {
    const row = await this.prisma.libraryVersion.findUnique({ where: { id } });
    return row ? toVersion(row) : null;
  }

  async insertVersion(row: VersionRecord): Promise<void> {
    await this.prisma.libraryVersion.create({ data: versionData(row) });
  }

  async commitNewFile(input: NewFileCommit): Promise<void> {
    await this.transaction(async (tx) => {
      await this.lockAndCheckQuota(tx, input.version, input.tenantQuotaBytes);
      await tx.libraryNode.create({
        data: nodeData({ ...input.node, currentVersionId: input.version.id }),
      });
      await tx.libraryVersion.create({ data: versionData(input.version) });
      if (input.chunks.length > 0) {
        await tx.libraryChunk.createMany({ data: input.chunks.map(chunkData) });
      }
    });
  }

  async commitReplacement(input: ReplacementCommit): Promise<void> {
    await this.transaction(async (tx) => {
      await this.lockAndCheckQuota(tx, input.version, input.tenantQuotaBytes);
      const latest = await tx.libraryVersion.aggregate({ where: { nodeId: input.nodeId }, _max: { versionNo: true } });
      await tx.libraryVersion.create({ data: versionData({ ...input.version, versionNo: (latest._max.versionNo ?? 0) + 1 }) });
      if (input.chunks.length > 0) {
        await tx.libraryChunk.createMany({ data: input.chunks.map(chunkData) });
      }
      await tx.libraryNode.update({
        where: { id: input.nodeId },
        data: { currentVersionId: input.version.id, updatedAt: new Date(input.updatedAt) },
      });
    });
  }

  /** Serialize tenant storage admissions across processes without changing the applied schema. */
  private async lockAndCheckQuota(tx: Prisma.TransactionClient, version: VersionRecord, quota?: number): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'library-quota:' + version.tenantId}))`;
    if (quota === undefined) return;
    const aggregate = await tx.libraryVersion.aggregate({ where: { tenantId: version.tenantId, node: { state: { not: 'PURGED' } } }, _sum: { sizeBytes: true } });
    if ((aggregate._sum.sizeBytes ?? 0) + version.sizeBytes > quota) throw new LibraryError(409, '企业资料容量不足', 'QUOTA');
  }

  async commitParseResult(input: ParseCommit): Promise<'committed' | 'unchanged'> {
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM library_node WHERE id=${input.nodeId} AND tenant_id=${input.tenantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM library_version WHERE id=${input.versionId} AND tenant_id=${input.tenantId} FOR UPDATE`;
      const node = await tx.libraryNode.findUnique({ where: { id: input.nodeId } });
      const version = await tx.libraryVersion.findUnique({ where: { id: input.versionId } });
      if (!node || node.tenantId !== input.tenantId || node.state !== 'ACTIVE'
        || node.currentVersionId !== input.versionId || !version
        || version.nodeId !== node.id || version.tenantId !== input.tenantId) {
        throw new LibraryError(409, '资料已更新，请刷新后重试', 'VERSION_CONFLICT');
      }
      if (version.parseStatus === 'READY' || version.parseStatus === 'DOWNLOAD_ONLY') return 'unchanged';
      await tx.libraryVersion.update({ where: { id: version.id }, data: {
        parseStatus: input.parseStatus, parseReason: input.parseReason, extractTruncated: input.extractTruncated,
      } });
      await tx.libraryChunk.deleteMany({ where: { versionId: version.id, tenantId: input.tenantId } });
      if (input.chunks.length) await tx.libraryChunk.createMany({ data: input.chunks.map(chunkData) });
      await tx.auditLog.create({ data: {
        id: input.audit.id, tenantId: input.audit.tenantId, userId: input.audit.userId,
        action: input.audit.action, meta: input.audit.meta, createdAt: new Date(input.audit.createdAt),
      } });
      return 'committed';
    });
  }

  async updateVersion(id: string, patch: Partial<VersionRecord>): Promise<void> {
    await this.prisma.libraryVersion.update({
      where: { id },
      data: {
        ...(patch.parseStatus !== undefined ? { parseStatus: patch.parseStatus } : {}),
        ...(patch.parseReason !== undefined ? { parseReason: patch.parseReason } : {}),
        ...(patch.extractTruncated !== undefined ? { extractTruncated: patch.extractTruncated } : {}),
      },
    });
  }

  async listChunks(versionId: string): Promise<ChunkRecord[]> {
    const rows = await this.prisma.libraryChunk.findMany({ where: { versionId }, orderBy: { ordinal: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      versionId: row.versionId,
      tenantId: row.tenantId,
      ordinal: row.ordinal,
      content: row.content,
      locator: row.locator,
      locatorKind: row.locatorKind === 'page' ? 'page' : 'paragraph',
    }));
  }

  async replaceChunks(versionId: string, tenantId: string, chunks: ChunkRecord[]): Promise<void> {
    await this.transaction(async tx => {
      await tx.libraryChunk.deleteMany({ where: { versionId, tenantId } });
      if (chunks.length) await tx.libraryChunk.createMany({ data: chunks.map(chunk => ({ id: chunk.id, versionId, tenantId, ordinal: chunk.ordinal, content: chunk.content, locator: chunk.locator, locatorKind: chunk.locatorKind })) });
    });
  }

  async listRecent(userId: string, tenantId: string): Promise<RecentRecord[]> {
    const rows = await this.prisma.libraryRecent.findMany({
      where: { userId, tenantId },
      orderBy: { accessedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      nodeId: row.nodeId,
      accessedAt: row.accessedAt.getTime(),
    }));
  }

  async touchRecent(row: RecentRecord): Promise<void> {
    const accessedAt = new Date(row.accessedAt);
    await this.prisma.libraryRecent.upsert({
      where: { userId_nodeId: { userId: row.userId, nodeId: row.nodeId } },
      update: { tenantId: row.tenantId, accessedAt },
      create: {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        nodeId: row.nodeId,
        accessedAt,
      },
    });
  }

  async listCustodies(): Promise<CustodyRecord[]> {
    const rows = await this.prisma.libraryCustody.findMany();
    return rows.map(toCustody);
  }

  async getCustody(id: string): Promise<CustodyRecord | null> {
    const row = await this.prisma.libraryCustody.findUnique({ where: { id } });
    return row ? toCustody(row) : null;
  }

  async insertCustody(row: CustodyRecord): Promise<void> {
    await this.prisma.libraryCustody.create({
      data: {
        id: row.id,
        tenantId: row.tenantId,
        grantorUserId: row.grantorUserId,
        granteeUserId: row.granteeUserId,
        contentScope: row.contentScope,
        ownerUserId: row.ownerUserId,
        powers: row.powers,
        expiresAt: new Date(row.expiresAt),
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
        reason: row.reason,
        createdAt: new Date(row.createdAt),
      },
    });
  }

  async updateCustody(id: string, patch: Partial<CustodyRecord>): Promise<void> {
    await this.prisma.libraryCustody.update({
      where: { id },
      data: {
        ...(patch.revokedAt !== undefined ? { revokedAt: patch.revokedAt ? new Date(patch.revokedAt) : null } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: new Date(patch.expiresAt) } : {}),
        ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
        ...(patch.createdAt !== undefined ? { createdAt: new Date(patch.createdAt) } : {}),
      },
    });
  }

  async putBlob(key: string, bytes: Buffer): Promise<void> {
    await writeFile(await containedPath(key), bytes);
  }

  async getBlob(key: string): Promise<Buffer | null> {
    try {
      return await readFile(await containedPath(key));
    } catch (error) {
      if (error instanceof LibraryError) throw error;
      return null;
    }
  }

  async deleteBlob(key: string): Promise<void> {
    try {
      await unlink(await containedPath(key));
    } catch (error) {
      if (error instanceof LibraryError) throw error;
    }
  }

  async audit(row: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        action: row.action,
        meta: row.meta,
      },
    });
  }

  async userName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return user?.name ?? null;
  }

  async tenantName(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name ?? null;
  }

  async listTenants(): Promise<TenantBrief[]> {
    return this.prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  }
}

function nodeData(row: NodeRecord): Prisma.LibraryNodeUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    scope: row.scope,
    state: row.state,
    linkUrl: row.linkUrl,
    currentVersionId: row.currentVersionId,
    recycledAt: row.recycledAt ? new Date(row.recycledAt) : null,
    purgedAt: row.purgedAt ? new Date(row.purgedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function chunkData(chunk: ChunkRecord): Prisma.LibraryChunkUncheckedCreateInput {
  return {
    id: chunk.id,
    versionId: chunk.versionId,
    tenantId: chunk.tenantId,
    ordinal: chunk.ordinal,
    content: chunk.content,
    locator: chunk.locator,
    locatorKind: chunk.locatorKind,
  };
}

function versionData(row: VersionRecord): Prisma.LibraryVersionUncheckedCreateInput {
  return {
    id: row.id,
    nodeId: row.nodeId,
    tenantId: row.tenantId,
    versionNo: row.versionNo,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    sha256: row.sha256,
    parseStatus: row.parseStatus,
    parseReason: row.parseReason,
    extractTruncated: row.extractTruncated,
    createdByUserId: row.createdByUserId,
    createdAt: new Date(row.createdAt),
  };
}

type NodeRow = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  parentId: string | null;
  kind: NodeRecord['kind'];
  name: string;
  scope: NodeRecord['scope'];
  state: NodeRecord['state'];
  linkUrl: string | null;
  currentVersionId: string | null;
  recycledAt: Date | null;
  purgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toNode(row: NodeRow): NodeRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    scope: row.scope,
    state: row.state,
    linkUrl: row.linkUrl,
    currentVersionId: row.currentVersionId,
    recycledAt: ms(row.recycledAt),
    purgedAt: ms(row.purgedAt),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

type VersionRow = {
  id: string;
  nodeId: string;
  tenantId: string;
  versionNo: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  parseStatus: VersionRecord['parseStatus'];
  parseReason: string | null;
  extractTruncated: boolean;
  createdByUserId: string;
  createdAt: Date;
};

function toVersion(row: VersionRow): VersionRecord {
  return {
    id: row.id,
    nodeId: row.nodeId,
    tenantId: row.tenantId,
    versionNo: row.versionNo,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    sha256: row.sha256,
    parseStatus: row.parseStatus,
    parseReason: row.parseReason,
    extractTruncated: row.extractTruncated,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.getTime(),
  };
}

type CustodyRow = {
  id: string;
  tenantId: string;
  grantorUserId: string;
  granteeUserId: string;
  contentScope: CustodyRecord['contentScope'];
  ownerUserId: string | null;
  powers: CustodyRecord['powers'];
  expiresAt: Date;
  revokedAt: Date | null;
  reason: string;
  createdAt: Date;
};

function toCustody(row: CustodyRow): CustodyRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    grantorUserId: row.grantorUserId,
    granteeUserId: row.granteeUserId,
    contentScope: row.contentScope,
    ownerUserId: row.ownerUserId,
    powers: row.powers,
    expiresAt: row.expiresAt.getTime(),
    revokedAt: ms(row.revokedAt),
    reason: row.reason,
    createdAt: row.createdAt.getTime(),
  };
}
