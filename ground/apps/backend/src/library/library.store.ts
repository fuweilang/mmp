import { randomUUID } from 'crypto';
import { LibraryError } from './library.errors';
import type {
  AuditRecord,
  ChunkRecord,
  CustodyRecord,
  NodeRecord,
  RecentRecord,
  VersionRecord,
} from './library.types';

export type TenantBrief = { id: string; name: string };

/** 首次上传：节点必须先于版本落入同一事务，版本外键才能成立。 */
export type NewFileCommit = {
  tenantQuotaBytes?: number;
  node: NodeRecord;
  version: VersionRecord;
  chunks: ChunkRecord[];
};

/** 替换版本：节点已经存在，版本、摘录和当前版本指针一起提交。 */
export type ReplacementCommit = {
  tenantQuotaBytes?: number;
  nodeId: string;
  version: VersionRecord;
  chunks: ChunkRecord[];
  updatedAt: number;
};

/** Retry results and their success audit share one commit point. */
export type ParseCommit = {
  tenantId: string;
  nodeId: string;
  versionId: string;
  parseStatus: VersionRecord['parseStatus'];
  parseReason: string | null;
  extractTruncated: boolean;
  chunks: ChunkRecord[];
  audit: AuditRecord;
};

export interface LibraryStore {
  /** Serialize directory-tree writes for one tenant and roll back every database change on failure. */
  withTenantWrite<T>(tenantId: string, work: (store: LibraryStore) => Promise<T>): Promise<T>;
  createId(): string;
  listNodes(tenantId: string): Promise<NodeRecord[]>;
  getNode(id: string): Promise<NodeRecord | null>;
  insertNode(row: NodeRecord): Promise<void>;
  updateNode(id: string, patch: Partial<NodeRecord>): Promise<void>;
  listVersions(nodeId: string): Promise<VersionRecord[]>;
  getVersion(id: string): Promise<VersionRecord | null>;
  insertVersion(row: VersionRecord): Promise<void>;
  /** 节点、版本、摘录一次提交。失败时调用方删掉已经写入的文件。 */
  commitNewFile(input: NewFileCommit): Promise<void>;
  /** 新版本、摘录和当前版本指针一次提交。 */
  commitReplacement(input: ReplacementCommit): Promise<void>;
  commitParseResult(input: ParseCommit): Promise<'committed' | 'unchanged'>;
  updateVersion(id: string, patch: Partial<VersionRecord>): Promise<void>;
  listChunks(versionId: string): Promise<ChunkRecord[]>;
  replaceChunks(versionId: string, tenantId: string, chunks: ChunkRecord[]): Promise<void>;
  listRecent(userId: string, tenantId: string): Promise<RecentRecord[]>;
  touchRecent(row: RecentRecord): Promise<void>;
  listCustodies(): Promise<CustodyRecord[]>;
  getCustody(id: string): Promise<CustodyRecord | null>;
  insertCustody(row: CustodyRecord): Promise<void>;
  updateCustody(id: string, patch: Partial<CustodyRecord>): Promise<void>;
  putBlob(key: string, bytes: Buffer): Promise<void>;
  getBlob(key: string): Promise<Buffer | null>;
  deleteBlob(key: string): Promise<void>;
  audit(row: AuditRecord): Promise<void>;
  userName(userId: string): Promise<string | null>;
  tenantName(tenantId: string): Promise<string | null>;
  listTenants(): Promise<TenantBrief[]>;
}

/** 测试用内存库。生产用 Prisma。 */
export class MemoryLibraryStore implements LibraryStore {
  readonly nodes = new Map<string, NodeRecord>();
  readonly versions = new Map<string, VersionRecord>();
  readonly chunks = new Map<string, ChunkRecord>();
  readonly recents = new Map<string, RecentRecord>();
  readonly custodies = new Map<string, CustodyRecord>();
  readonly blobs = new Map<string, Buffer>();
  readonly audits: AuditRecord[] = [];
  readonly users = new Map<string, string>();
  readonly tenants = new Map<string, string>();
  private seq = 0;
  private writeTail: Promise<void> = Promise.resolve();

  async withTenantWrite<T>(_tenantId: string, work: (store: LibraryStore) => Promise<T>): Promise<T> {
    const previous = this.writeTail;
    let release!: () => void;
    this.writeTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const snapshot = this.snapshot();
    const auditLength = this.audits.length;
    try {
      return await work(this);
    } catch (error) {
      this.restore(snapshot);
      this.audits.length = auditLength;
      throw error;
    } finally {
      release();
    }
  }
  private parseCommitQueue: Promise<void> = Promise.resolve();
  /** 每个版本 replaceChunks 的调用次数，用来确认重试不是追加。 */
  readonly chunkWrites: number[] = [];

  createId(): string {
    this.seq += 1;
    return `id${this.seq.toString(16).padStart(8, '0')}`;
  }

  rememberUser(userId: string, name: string) {
    this.users.set(userId, name);
  }

  rememberTenant(tenantId: string, name: string) {
    this.tenants.set(tenantId, name);
  }

  async listNodes(tenantId: string) {
    return [...this.nodes.values()].filter((row) => row.tenantId === tenantId);
  }

  async getNode(id: string) {
    return this.nodes.get(id) ?? null;
  }

  async insertNode(row: NodeRecord) {
    this.nodes.set(row.id, row);
  }

  async updateNode(id: string, patch: Partial<NodeRecord>) {
    const current = this.nodes.get(id);
    if (!current) return;
    this.nodes.set(id, { ...current, ...patch });
  }

  async listVersions(nodeId: string) {
    return [...this.versions.values()]
      .filter((row) => row.nodeId === nodeId)
      .sort((a, b) => a.versionNo - b.versionNo);
  }

  async getVersion(id: string) {
    return this.versions.get(id) ?? null;
  }

  async insertVersion(row: VersionRecord) {
    this.versions.set(row.id, row);
  }

  async commitNewFile(input: NewFileCommit) {
    this.checkCommitQuota(input.version, input.tenantQuotaBytes);
    const snapshot = this.snapshot();
    try {
      if (this.nodes.has(input.node.id) || this.versions.has(input.version.id)) {
        throw new Error('资料已经存在');
      }
      this.nodes.set(input.node.id, { ...input.node, currentVersionId: input.version.id });
      this.versions.set(input.version.id, input.version);
      await this.replaceChunks(input.version.id, input.version.tenantId, input.chunks);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  async commitReplacement(input: ReplacementCommit) {
    this.checkCommitQuota(input.version, input.tenantQuotaBytes);
    const snapshot = this.snapshot();
    try {
      if (!this.nodes.has(input.nodeId)) throw new Error('资料不存在');
      this.versions.set(input.version.id, input.version);
      await this.replaceChunks(input.version.id, input.version.tenantId, input.chunks);
      await this.updateNode(input.nodeId, { currentVersionId: input.version.id, updatedAt: input.updatedAt });
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  async commitParseResult(input: ParseCommit): Promise<'committed' | 'unchanged'> {
    const commit = this.parseCommitQueue.then(async () => {
      const node = this.nodes.get(input.nodeId);
      const version = this.versions.get(input.versionId);
      if (!node || node.tenantId !== input.tenantId || node.state !== 'ACTIVE'
        || node.currentVersionId !== input.versionId || !version
        || version.nodeId !== node.id || version.tenantId !== input.tenantId) {
        throw new LibraryError(409, '资料已更新，请刷新后重试', 'VERSION_CONFLICT');
      }
      if (version.parseStatus === 'READY' || version.parseStatus === 'DOWNLOAD_ONLY') return 'unchanged' as const;
      const chunks = await this.listChunks(version.id);
      try {
        await this.updateVersion(version.id, {
          parseStatus: input.parseStatus, parseReason: input.parseReason, extractTruncated: input.extractTruncated,
        });
        await this.replaceChunks(version.id, input.tenantId, input.chunks);
        await this.audit(input.audit);
        return 'committed' as const;
      } catch (error) {
        this.versions.set(version.id, version);
        for (const [id, chunk] of this.chunks) if (chunk.versionId === version.id) this.chunks.delete(id);
        for (const chunk of chunks) this.chunks.set(chunk.id, chunk);
        const auditIndex = this.audits.findIndex(row => row.id === input.audit.id);
        if (auditIndex !== -1) this.audits.splice(auditIndex, 1);
        throw error;
      }
    });
    this.parseCommitQueue = commit.then(() => undefined, () => undefined);
    return commit;
  }

  private checkCommitQuota(version: VersionRecord, quota?: number) {
    if (quota === undefined) return;
    const used = [...this.versions.values()].filter(row => row.tenantId === version.tenantId && this.nodes.get(row.nodeId)?.state !== 'PURGED').reduce((sum, row) => sum + row.sizeBytes, 0);
    if (used + version.sizeBytes > quota) throw new LibraryError(409, '企业资料容量不足', 'QUOTA');
  }

  private snapshot() {
    return {
      nodes: structuredClone(this.nodes),
      versions: structuredClone(this.versions),
      chunks: structuredClone(this.chunks),
    };
  }

  private restore(snapshot: { nodes: Map<string, NodeRecord>; versions: Map<string, VersionRecord>; chunks: Map<string, ChunkRecord> }) {
    this.nodes.clear();
    this.versions.clear();
    this.chunks.clear();
    for (const [id, row] of snapshot.nodes) this.nodes.set(id, row);
    for (const [id, row] of snapshot.versions) this.versions.set(id, row);
    for (const [id, row] of snapshot.chunks) this.chunks.set(id, row);
  }

  async updateVersion(id: string, patch: Partial<VersionRecord>) {
    const current = this.versions.get(id);
    if (!current) return;
    this.versions.set(id, { ...current, ...patch });
  }

  async listChunks(versionId: string) {
    return [...this.chunks.values()]
      .filter((row) => row.versionId === versionId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  async replaceChunks(versionId: string, _tenantId: string, chunks: ChunkRecord[]) {
    for (const [id, row] of this.chunks) {
      if (row.versionId === versionId) this.chunks.delete(id);
    }
    for (const row of chunks) this.chunks.set(row.id, row);
    this.chunkWrites.push(chunks.length);
  }

  async listRecent(userId: string, tenantId: string) {
    return [...this.recents.values()]
      .filter((row) => row.userId === userId && row.tenantId === tenantId)
      .sort((a, b) => b.accessedAt - a.accessedAt);
  }

  async touchRecent(row: RecentRecord) {
    const existing = [...this.recents.values()].find((item) => item.userId === row.userId && item.nodeId === row.nodeId);
    if (existing) this.recents.set(existing.id, { ...existing, accessedAt: row.accessedAt });
    else this.recents.set(row.id, row);
  }

  async listCustodies() {
    return [...this.custodies.values()];
  }

  async getCustody(id: string) {
    return this.custodies.get(id) ?? null;
  }

  async insertCustody(row: CustodyRecord) {
    this.custodies.set(row.id, row);
  }

  async updateCustody(id: string, patch: Partial<CustodyRecord>) {
    const current = this.custodies.get(id);
    if (!current) return;
    this.custodies.set(id, { ...current, ...patch });
  }

  async putBlob(key: string, bytes: Buffer) {
    this.blobs.set(key, Buffer.from(bytes));
  }

  async getBlob(key: string) {
    const found = this.blobs.get(key);
    return found ? Buffer.from(found) : null;
  }

  async deleteBlob(key: string) {
    this.blobs.delete(key);
  }

  async audit(row: AuditRecord) {
    this.audits.push(row);
  }

  async userName(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async tenantName(tenantId: string) {
    return this.tenants.get(tenantId) ?? null;
  }

  async listTenants() {
    return [...this.tenants.entries()].map(([id, name]) => ({ id, name }));
  }
}

export function newEntityId(): string {
  return randomUUID();
}
