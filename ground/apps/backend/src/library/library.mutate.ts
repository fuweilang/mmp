import { createHash } from 'crypto';
import type { LibraryAuthService } from './library.auth';
import { withWrite, type LibraryContext } from './library.context';
import { FILE_PURGE_BLOCKED_REASON, LibraryError, libraryNotFound } from './library.errors';
import { assertAllowedUpload, safeDisplayName, safeLinkUrl, safeNodeName } from './library.files';
import { toLibraryItem } from './library.items';
import type { LibraryMediaService } from './library.media';
import { canKnow, canManage, matchingCustody } from './library.policy';
import type { LibraryReadService } from './library.read';
import type { LibraryStatsService } from './library.stats';
import type { Actor, LibraryItem, LibraryScope, NodeRecord } from './library.types';

export type UploadInput = {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  parentId?: string | null;
  scope?: LibraryScope;
  confirmShare?: boolean;
};

export type CreationOptions = { scope?: LibraryScope; confirmShare?: boolean };
export type ScopeOptions = { confirmUnshare?: boolean; expectedTreeRevision?: string };
export type MoveOptions = { confirmShare?: boolean; expectedTreeRevision?: string };
export type ScopeImpact = { total: number; changed: number; files: number; folders: number; links: number; treeRevision: string };

/**
 * 写与树：创建、上传、替换、移动、共享、回收、彻底删、批处理，
 * 以及乐观锁/可见域树工具。事务只有一个入口（withWrite）。
 */
export class LibraryMutateService {
  constructor(
    private readonly ctx: LibraryContext,
    private readonly auth: LibraryAuthService,
    private readonly read: LibraryReadService,
    private readonly media: LibraryMediaService,
    private readonly stats: LibraryStatsService,
  ) {}

  private rebind(ctx: LibraryContext): LibraryMutateService {
    const auth = this.auth.rebind(ctx);
    return new LibraryMutateService(ctx, auth, this.read.rebind(ctx, auth), this.media.rebind(ctx, auth), this.stats.rebind(ctx, auth));
  }

  private write<T>(actor: Actor, work: (service: LibraryMutateService) => Promise<T>): Promise<T> {
    return withWrite(this.ctx, actor, ctx => work(this.rebind(ctx)));
  }

  async createFolder(actor: Actor, name: string, parentId?: string | null, options: CreationOptions = {}) {
    this.auth.requireMember(actor);
    if (!parentId) this.scopeOrThrow(options.scope, options.confirmShare);
    return this.createOwnedFolder(actor, actor.userId, name, parentId, options.scope);
  }

  /** Explicitly authorized platform creation keeps the real actor separate from the target owner. */
  async createOwnedFolder(actor: Actor, ownerUserId: string, name: string, parentId?: string | null, requestedScope?: LibraryScope): Promise<LibraryItem> {
    if (!this.ctx.writing) return this.write(actor, service => service.createOwnedFolder(actor, ownerUserId, name, parentId, requestedScope));
    const { scope } = await this.creationTarget(actor, parentId, requestedScope);
    await this.assertCreation(actor, ownerUserId, scope);
    await this.auth.sweep(actor.tenantId);
    const now = this.ctx.now();
    const node = { ...this.blankNode(actor, 'FOLDER', safeNodeName(name), parentId ?? null, now), ownerUserId, scope };
    await this.ctx.store.insertNode(node);
    await this.auth.writeAudit(actor, 'library_folder', { nodeId: node.id });
    return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
  }

  async createLink(actor: Actor, name: string, url: string, parentId?: string | null, options: CreationOptions = {}): Promise<LibraryItem> {
    this.auth.requireMember(actor);
    if (!this.ctx.writing) return this.write(actor, service => service.createLink(actor, name, url, parentId, options));
    if (!parentId) this.scopeOrThrow(options.scope, options.confirmShare);
    await this.auth.sweep(actor.tenantId);
    const { scope } = await this.creationTarget(actor, parentId, options.scope);
    const now = this.ctx.now();
    const node = this.blankNode(actor, 'LINK', safeNodeName(name), parentId ?? null, now);
    node.scope = scope;
    node.linkUrl = safeLinkUrl(url);
    await this.ctx.store.insertNode(node);
    await this.auth.writeAudit(actor, 'library_link', { nodeId: node.id });
    return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
  }

  async upload(actor: Actor, input: UploadInput) {
    this.auth.requireMember(actor);
    return this.uploadOwned(actor, actor.userId, input);
  }

  async uploadOwned(actor: Actor, ownerUserId: string, input: UploadInput) {
    if (!input.parentId) this.scopeOrThrow(input.scope, input.confirmShare);
    const target = await this.creationTarget(actor, input.parentId, input.scope);
    await this.assertCreation(actor, ownerUserId, target.scope);
    await this.auth.sweep(actor.tenantId);
    const scope = target.scope;
    const name = safeDisplayName(input.originalName);
    const ext = assertAllowedUpload(name, input.bytes, this.ctx.limits);
    await this.stats.assertQuota(actor.tenantId, input.bytes.length);
    const now = this.ctx.now();
    const node = { ...this.blankNode(actor, 'FILE', name, input.parentId ?? null, now), ownerUserId };
    node.scope = scope;
    const prepared = await this.media.prepareVersion(actor, node, name, input.mimeType || 'application/octet-stream', input.bytes, ext, 1, now);
    node.currentVersionId = prepared.version.id;
    try {
      return await this.write(actor, async service => {
        const current = await service.creationTarget(actor, input.parentId, input.scope);
        if (current.scope !== scope || current.parentRevision !== target.parentRevision) {
          throw new LibraryError(409, '目标目录已变化，请确认保存位置后重试', 'SCOPE_CONFLICT');
        }
        await service.assertCreation(actor, ownerUserId, scope);
        await service.ctx.store.commitNewFile({ node, version: prepared.version, chunks: prepared.chunks, tenantQuotaBytes: this.ctx.limits.tenantQuotaBytes });
        await service.auth.writeAudit(actor, 'library_upload', { nodeId: node.id, versionId: prepared.version.id, scope });
        return toLibraryItem(service.ctx, actor, node, await service.auth.custodiesFor(actor), null);
      });
    } catch (error) {
      await this.ctx.store.deleteBlob(prepared.version.storageKey);
      throw error;
    }
  }

  async replaceVersion(actor: Actor, nodeId: string, originalName: string, mimeType: string, bytes: Buffer): Promise<LibraryItem> {
    const node = { ...await this.auth.requireManage(actor, nodeId) };
    if (node.kind !== 'FILE' || node.state !== 'ACTIVE') throw new LibraryError(400, '只有使用中的文件可以替换版本', 'BAD_STATE');
    const name = safeDisplayName(originalName);
    const ext = assertAllowedUpload(name, bytes, this.ctx.limits);
    await this.stats.assertQuota(actor.tenantId, bytes.length);
    const versions = await this.ctx.store.listVersions(node.id);
    const versionNo = versions.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1;
    const updatedAt = this.ctx.now();
    const prepared = await this.media.prepareVersion(actor, node, name, mimeType || 'application/octet-stream', bytes, ext, versionNo, updatedAt);
    try {
      return await this.write(actor, async service => {
        const current = await service.auth.requireManage(actor, nodeId);
        if (current.state !== 'ACTIVE' || current.currentVersionId !== node.currentVersionId
          || current.scope !== node.scope || current.parentId !== node.parentId || current.updatedAt !== node.updatedAt) {
          throw new LibraryError(409, '资料已变化，请刷新后重试替换', 'VERSION_CONFLICT');
        }
        await service.ctx.store.commitReplacement({
          tenantQuotaBytes: this.ctx.limits.tenantQuotaBytes,
          nodeId: node.id,
          version: prepared.version,
          chunks: prepared.chunks,
          updatedAt,
        });
        await service.auth.writeAudit(actor, 'library_replace', { nodeId: node.id, versionId: prepared.version.id, versionNo });
        return toLibraryItem(service.ctx, actor, { ...current, currentVersionId: prepared.version.id, updatedAt }, await service.auth.custodiesFor(actor), null);
      });
    } catch (error) {
      await this.ctx.store.deleteBlob(prepared.version.storageKey);
      throw error;
    }
  }

  async rename(actor: Actor, nodeId: string, name: string): Promise<LibraryItem> {
    if (!this.ctx.writing) return this.write(actor, service => service.rename(actor, nodeId, name));
    const node = await this.auth.requireManage(actor, nodeId);
    node.name = safeNodeName(name);
    node.updatedAt = this.ctx.now();
    await this.ctx.store.updateNode(node.id, { name: node.name, updatedAt: node.updatedAt });
    await this.auth.writeAudit(actor, 'library_rename', { nodeId: node.id });
    return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
  }

  async move(actor: Actor, nodeId: string, parentId: string | null, options: MoveOptions = {}): Promise<LibraryItem> {
    if (!this.ctx.writing) return this.write(actor, service => service.move(actor, nodeId, parentId, options));
    const node = await this.auth.requireManage(actor, nodeId);
    if (parentId) {
      const destinationActor = actor.targetCustodyId ? { ...actor, custodyId: actor.targetCustodyId } : actor;
      const parent = await this.auth.requireVisibleFolder(destinationActor, parentId);
      if (actor.isPlatformAdmin && !actor.activeMember && !actor.libraryAdmin
        && matchingCustody(destinationActor, parent, await this.auth.custodiesFor(destinationActor), this.ctx.now())?.powers !== 'CRUD') {
        throw libraryNotFound();
      }
      if (parent.id === node.id || await this.isDescendant(node.id, parent.id)) {
        throw new LibraryError(400, '不能移动到自己的子目录', 'BAD_PARENT');
      }
      if (parent.scope === 'ENTERPRISE') {
        const tree = await this.scopeTree(actor, node, 'ENTERPRISE');
        this.checkTreeRevision(tree, 'ENTERPRISE', options.expectedTreeRevision);
        if (tree.some(row => row.scope !== 'ENTERPRISE')) {
          if (options.confirmShare !== true) throw new LibraryError(400, '移入共享目录会共享该资料及全部子项，请确认', 'CONFIRM_SHARE');
          await this.applyScope(tree, 'ENTERPRISE');
          node.scope = 'ENTERPRISE';
        }
      }
    }
    const previousScope = node.scope;
    node.parentId = parentId;
    node.updatedAt = this.ctx.now();
    await this.ctx.store.updateNode(node.id, { parentId, updatedAt: node.updatedAt });
    const stored = await this.ctx.store.getNode(node.id);
    if (!stored || stored.scope !== previousScope) {
      throw new LibraryError(500, '移动改变了可见性', 'SCOPE_DRIFT');
    }
    await this.auth.writeAudit(actor, 'library_move', { nodeId: node.id, parentId });
    return toLibraryItem(this.ctx, actor, stored, await this.auth.custodiesFor(actor), null);
  }

  async scopeImpact(actor: Actor, nodeId: string, scope: LibraryScope): Promise<ScopeImpact> {
    if (!this.ctx.writing) return this.write(actor, service => service.scopeImpact(actor, nodeId, scope));
    const node = await this.auth.requireManage(actor, nodeId);
    const tree = await this.scopeTree(actor, node, scope);
    return {
      total: tree.length,
      changed: tree.filter(row => row.scope !== scope).length,
      files: tree.filter(row => row.kind === 'FILE').length,
      folders: tree.filter(row => row.kind === 'FOLDER').length,
      links: tree.filter(row => row.kind === 'LINK').length,
      treeRevision: this.treeRevision(tree, scope),
    };
  }

  async setScope(actor: Actor, nodeId: string, scope: LibraryScope, confirmShare?: boolean, options: ScopeOptions = {}): Promise<LibraryItem> {
    if (!this.ctx.writing) return this.write(actor, service => service.setScope(actor, nodeId, scope, confirmShare, options));
    const node = await this.auth.requireManage(actor, nodeId);
    const tree = await this.scopeTree(actor, node, scope);
    this.checkTreeRevision(tree, scope, options.expectedTreeRevision);
    if (scope === 'PRIVATE' && node.parentId) {
      const parent = await this.ctx.store.getNode(node.parentId);
      if (parent?.scope === 'ENTERPRISE' && parent.state !== 'PURGED') throw new LibraryError(409, '共享目录内的资料不能单独改为私有，请先移出目录', 'SHARED_PARENT');
    }
    if (!tree.some(row => row.scope !== scope)) return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
    if (scope === 'ENTERPRISE' && confirmShare !== true) {
      throw new LibraryError(400, '变为企业共享需要明确确认', 'CONFIRM_SHARE');
    }
    if (scope === 'PRIVATE' && tree.length > 1 && options.confirmUnshare !== true) {
      throw new LibraryError(400, '取消共享会影响全部子项，请确认', 'CONFIRM_UNSHARE');
    }
    await this.applyScope(tree, scope);
    await this.auth.writeAudit(actor, 'library_share', { nodeId: node.id, scope, affectedCount: tree.length });
    return toLibraryItem(this.ctx, actor, { ...node, scope, updatedAt: this.ctx.now() }, await this.auth.custodiesFor(actor), null);
  }

  async recycle(actor: Actor, nodeId: string): Promise<{ ok: boolean }> {
    if (!this.ctx.writing) return this.write(actor, service => service.recycle(actor, nodeId));
    const node = await this.auth.requireManage(actor, nodeId);
    const descendants = this.recycledSubtree(await this.ctx.store.listNodes(actor.tenantId), node.id);
    for (const child of descendants) {
      if (child.state === 'ACTIVE') await this.auth.requireManage(actor, child.id);
    }
    const now = this.ctx.now();
    for (const child of descendants) {
      if (child.state !== 'ACTIVE') continue;
      await this.ctx.store.updateNode(child.id, { state: 'RECYCLED', recycledAt: now, updatedAt: now });
    }
    node.state = 'RECYCLED';
    node.recycledAt = now;
    node.updatedAt = now;
    await this.ctx.store.updateNode(node.id, { state: 'RECYCLED', recycledAt: node.recycledAt, updatedAt: node.updatedAt });
    await this.auth.writeAudit(actor, 'library_recycle', { nodeId: node.id });
    return { ok: true };
  }

  async restore(actor: Actor, nodeId: string): Promise<LibraryItem> {
    if (!this.ctx.writing) return this.write(actor, service => service.restore(actor, nodeId));
    const node = await this.auth.requireManage(actor, nodeId);
    if (node.state !== 'RECYCLED') throw new LibraryError(400, '资料不在回收站', 'BAD_STATE');
    if (node.parentId) {
      const parent = await this.ctx.store.getNode(node.parentId);
      if (parent && parent.state === 'RECYCLED') {
        throw new LibraryError(400, '上级文件夹在回收站，请先恢复上级', 'BAD_PARENT');
      }
      if (!parent || parent.state === 'PURGED') node.parentId = null;
    }
    node.state = 'ACTIVE';
    node.recycledAt = null;
    node.updatedAt = this.ctx.now();
    await this.ctx.store.updateNode(node.id, {
      state: 'ACTIVE',
      recycledAt: null,
      parentId: node.parentId,
      scope: node.scope,
      updatedAt: node.updatedAt,
    });
    await this.auth.writeAudit(actor, 'library_restore', { nodeId: node.id, scope: node.scope });
    return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
  }

  async purge(actor: Actor, nodeId: string): Promise<{ ok: boolean; code: 'SOURCE_GONE' }> {
    const node = await this.auth.requireManage(actor, nodeId);
    if (node.state !== 'RECYCLED') {
      throw new LibraryError(400, '请先回收到回收站再彻底删除', 'BAD_STATE');
    }
    if (node.kind === 'FILE') throw new LibraryError(409, FILE_PURGE_BLOCKED_REASON, 'REFERENCE_UNVERIFIED');
    const descendants = this.recycledSubtree(await this.ctx.store.listNodes(actor.tenantId), node.id);
    if (descendants.some(row => row.state === 'ACTIVE' || row.kind === 'FILE')) throw new LibraryError(400, '目录不为空', 'FOLDER_NONEMPTY');
    for (const child of descendants) {
      if (child.state === 'RECYCLED') await this.purgeStored(child);
    }
    await this.purgeStored(node);
    await this.auth.writeAudit(actor, 'library_purge', { nodeId: node.id });
    return { ok: true, code: 'SOURCE_GONE' as const };
  }

  async batch(actor: Actor, ids: string[], action: 'recycle' | 'restore' | 'purge') {
    const ok: string[] = [];
    const failed: { id: string; message: string }[] = [];
    let skipped = 0;
    for (const id of ids) {
      const node = await this.ctx.store.getNode(id);
      const custodies = await this.auth.custodiesFor(actor);
      if (!node || !canKnow(actor, node, custodies, this.ctx.now())) {
        skipped += 1;
        continue;
      }
      try {
        if (action === 'recycle') await this.recycle(actor, id);
        else if (action === 'restore') await this.restore(actor, id);
        else await this.purge(actor, id);
        ok.push(id);
      } catch (error) {
        failed.push({ id, message: error instanceof LibraryError ? error.message : '操作失败' });
      }
    }
    return { ok, failed, skipped };
  }

  private async creationTarget(actor: Actor, parentId?: string | null, requestedScope?: LibraryScope) {
    this.auth.requireTenantActor(actor);
    if (!parentId) return { scope: requestedScope ?? 'PRIVATE' as LibraryScope, parentRevision: null };
    const parent = await this.auth.requireVisibleFolder(actor, parentId);
    if (requestedScope !== undefined && requestedScope !== parent.scope) {
      throw new LibraryError(409, '目标目录可见范围已变化，请刷新后重试', 'SCOPE_CONFLICT');
    }
    return { scope: parent.scope, parentRevision: JSON.stringify([parent.id, parent.parentId, parent.scope, parent.updatedAt]) };
  }

  private async scopeTree(actor: Actor, root: NodeRecord, scope: LibraryScope): Promise<NodeRecord[]> {
    const tree = [root];
    if (root.kind === 'FOLDER') {
      const children = new Map<string, NodeRecord[]>();
      for (const node of await this.ctx.store.listNodes(actor.tenantId)) {
        if (node.parentId && node.state !== 'PURGED') {
          const siblings = children.get(node.parentId) ?? [];
          siblings.push(node);
          children.set(node.parentId, siblings);
        }
      }
      const seen = new Set([root.id]);
      for (let i = 0; i < tree.length; i++) {
        for (const child of children.get(tree[i]!.id) ?? []) {
          if (seen.has(child.id)) throw new LibraryError(409, '目录关系异常，请先处理目录结构', 'BAD_PARENT');
          seen.add(child.id);
          tree.push(child);
        }
      }
    }
    const custodies = await this.auth.custodiesFor(actor);
    for (const node of tree) {
      if (node.scope === scope) continue;
      if (!canManage(actor, node, custodies, this.ctx.now())) throw new LibraryError(403, '目录包含无权修改的资料，整次操作未执行', 'FORBIDDEN');
      if (actor.isPlatformAdmin && !actor.activeMember && !actor.libraryAdmin) {
        const grant = actor.targetCustodyId ? await this.ctx.store.getCustody(actor.targetCustodyId) : null;
        const target = { ...node, scope };
        if (!grant || matchingCustody(actor, target, [grant], this.ctx.now())?.powers !== 'CRUD') {
          throw new LibraryError(403, '需要全部待变更资料的目标范围管理授权', 'FORBIDDEN');
        }
      }
    }
    return tree;
  }

  private treeRevision(tree: NodeRecord[], scope: LibraryScope) {
    const rows = tree.map(row => [row.id, row.parentId, row.ownerUserId, row.scope, row.state, row.updatedAt]);
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return createHash('sha256').update(JSON.stringify([scope, rows])).digest('hex');
  }

  private checkTreeRevision(tree: NodeRecord[], scope: LibraryScope, expected?: string) {
    if (expected && expected !== this.treeRevision(tree, scope)) throw new LibraryError(409, '目录内容已变化，请重新确认影响范围', 'TREE_CONFLICT');
  }

  private async applyScope(tree: NodeRecord[], scope: LibraryScope) {
    const updatedAt = this.ctx.now();
    for (const node of tree) {
      if (node.scope !== scope) await this.ctx.store.updateNode(node.id, { scope, updatedAt });
    }
  }

  private async assertCreation(actor: Actor, ownerUserId: string, scope: LibraryScope) {
    if (actor.activeMember && actor.userId === ownerUserId) return;
    if (actor.libraryAdmin && actor.isPlatformAdmin) return;
    if (!actor.isPlatformAdmin || !actor.custodyId) throw new LibraryError(403, '需要明确的企业代管管理授权', 'FORBIDDEN');
    const candidate = { ...this.blankNode(actor, 'FILE', '', null, this.ctx.now()), ownerUserId, scope };
    const grant = matchingCustody(actor, candidate, await this.auth.custodiesFor(actor), this.ctx.now());
    if (grant?.powers !== 'CRUD') throw new LibraryError(403, '当前授权不能为此所有者和可见范围新增资料', 'FORBIDDEN');
  }

  private blankNode(actor: Actor, kind: NodeRecord['kind'], name: string, parentId: string | null, now: number): NodeRecord {
    return {
      id: this.ctx.store.createId(),
      tenantId: actor.tenantId,
      ownerUserId: actor.userId,
      parentId,
      kind,
      name,
      scope: 'PRIVATE',
      state: 'ACTIVE',
      linkUrl: null,
      currentVersionId: null,
      recycledAt: null,
      purgedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private scopeOrThrow(scope: LibraryScope | undefined, confirmShare: boolean | undefined): LibraryScope {
    if (scope === 'ENTERPRISE') {
      if (confirmShare !== true) throw new LibraryError(400, '变为企业共享需要明确确认', 'CONFIRM_SHARE');
      return 'ENTERPRISE';
    }
    return 'PRIVATE';
  }

  private async purgeStored(node: NodeRecord) {
    const versions = await this.ctx.store.listVersions(node.id);
    for (const version of versions) {
      await this.ctx.store.deleteBlob(version.storageKey);
      await this.ctx.store.replaceChunks(version.id, node.tenantId, []);
    }
    const now = this.ctx.now();
    node.state = 'PURGED';
    node.purgedAt = now;
    node.updatedAt = now;
    await this.ctx.store.updateNode(node.id, { state: 'PURGED', purgedAt: now, updatedAt: now });
  }

  /** Children before their parent, so a recycled folder can be purged with its recycled contents. */
  private recycledSubtree(nodes: NodeRecord[], rootId: string): NodeRecord[] {
    const children = new Map<string, NodeRecord[]>();
    for (const row of nodes) {
      if (!row.parentId) continue;
      const list = children.get(row.parentId) ?? [];
      list.push(row);
      children.set(row.parentId, list);
    }
    const ordered: NodeRecord[] = [];
    const seen = new Set<string>();
    const walk = (id: string) => {
      for (const child of children.get(id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        walk(child.id);
        ordered.push(child);
      }
    };
    walk(rootId);
    return ordered;
  }

  private async isDescendant(nodeId: string, parentId: string) {
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current) {
      if (current === nodeId || seen.has(current)) return true;
      seen.add(current);
      const row = await this.ctx.store.getNode(current);
      current = row?.parentId ?? null;
    }
    return false;
  }
}
