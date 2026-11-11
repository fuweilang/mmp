import { createHash } from 'crypto';
import { buildAskPrompt, sanitizeAnswer } from './library.ask';
import { FILE_PURGE_BLOCKED_REASON, LibraryError, libraryNotFound } from './library.errors';
import {
  assertAllowedUpload,
  assertMediaType,
  fileExtension,
  safeDisplayName,
  safeLinkUrl,
  safeNodeName,
  storageKeyFor,
} from './library.files';
import { libraryLimitsFromEnv, type LibraryLimits } from './library.limits';
import { listZipEntries, parseLibraryBytes } from './library.parse';
import { canKnow, canManage, canSee, matchingCustody } from './library.policy';
import type { LibraryStore } from './library.store';
import type {
  Actor,
  AuditRecord,
  ChunkRecord,
  CustodyRecord,
  LibraryItem,
  LibraryScope,
  LibraryView,
  NodeRecord,
  VersionBrief,
  VersionRecord,
} from './library.types';

export type ModelComplete = (input: {
  model?: string;
  messages: { role: 'system' | 'user'; content: string }[];
}) => Promise<{ ok: true; modelRef: string; text: string } | { ok: false; reason: string }>;

const LIBRARY_FILE_TYPE_BY_MIME: Record<string, string> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/gif': 'image', 'image/webp': 'image', 'image/avif': 'image',
  'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
  'application/pdf': 'pdf',
  'application/msword': 'word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'ppt',
  'text/plain': 'text', 'text/markdown': 'text', 'text/csv': 'text', 'text/html': 'text',
};

/** Same buckets as the Console file-type column. Unknown MIME stays other. */
export function libraryFileTypeKey(kind: string, mimeType?: string | null): string {
  if (kind === 'FOLDER') return 'folder';
  if (kind === 'LINK') return 'link';
  const mime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  return LIBRARY_FILE_TYPE_BY_MIME[mime] ?? 'other';
}

type UploadInput = {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  parentId?: string | null;
  scope?: LibraryScope;
  confirmShare?: boolean;
};

type CreationOptions = { scope?: LibraryScope; confirmShare?: boolean };
type ScopeOptions = { confirmUnshare?: boolean; expectedTreeRevision?: string };
type MoveOptions = { confirmShare?: boolean; expectedTreeRevision?: string };
type ScopeImpact = { total: number; changed: number; files: number; folders: number; links: number; treeRevision: string };

/** Chat opens a version without a locator, so the excerpt keeps every stored paragraph inside the existing character budget. */
function joinedExcerpt(
  chunks: { locator: string; locatorKind: string; content: string }[],
  maxChars: number,
): { locator: string | null; locatorKind: string | null; quote: string | null } {
  const parts: string[] = [];
  const locators: string[] = [];
  let used = 0;
  for (const row of chunks) {
    if (used >= maxChars) break;
    const separator = parts.length ? 2 : 0;
    const slice = row.content.slice(0, Math.max(0, maxChars - used - separator));
    if (!slice) break;
    parts.push(slice);
    locators.push(row.locator);
    used += separator + slice.length;
  }
  return {
    locator: locators.length ? locators.join(',') : null,
    locatorKind: chunks[0]?.locatorKind ?? null,
    quote: parts.length ? parts.join('\n\n') : null,
  };
}

/**
 * Native chat open sends nodeId and versionId only. One stored chunk is that
 * excerpt. Several chunks stay inside the ask budget. None stays empty.
 * An explicit unknown locator is rejected; it never silently points elsewhere.
 */
function citationExcerpt(
  chunks: { locator: string; locatorKind: string; content: string }[],
  locator: string | null | undefined,
  maxChars: number,
): { locator: string | null; locatorKind: string | null; quote: string | null; matched: { locator: string; locatorKind: string } | null } {
  if (chunks.length === 0) return { locator: null, locatorKind: null, quote: null, matched: null };
  if (locator) {
    const wanted = locator.split(',');
    const selected = chunks.filter(row => wanted.includes(row.locator));
    if (!selected.length || wanted.some(value => !selected.some(row => row.locator === value))) {
      throw libraryNotFound();
    }
    return { ...joinedExcerpt(selected, maxChars), matched: selected.length === 1 ? selected[0]! : null };
  }
  return { ...joinedExcerpt(chunks, maxChars), matched: null };
}

export type LibrarySearchHit = {
  nodeId: string;
  versionId: string;
  versionNo: number;
  name: string;
  locator: string;
  locatorKind: 'paragraph' | 'page' | 'image';
  quote: string;
  matched: 'text' | 'name';
  /** PNG、JPEG、WebP 或 GIF。调用方在模型接受图片时再取原图。 */
  image?: true;
};

const SEARCH_HITS = 8;
const SEARCH_FILES = 200;
const SEARCH_SNIPPET = 400;
const VIEWABLE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** 对话检索只看本人私人资料和已对企业共享、且可供引用的当前版本。企业管理员和平台管理身份不扩大这个范围。 */
function quotableInChat(actor: Actor, node: NodeRecord): boolean {
  if (!actor.activeMember || node.tenantId !== actor.tenantId || node.state !== 'ACTIVE' || node.kind !== 'FILE') return false;
  if (node.scope === 'PRIVATE') return node.ownerUserId === actor.userId;
  return node.scope === 'ENTERPRISE';
}

function excerptAround(content: string, needle: string): string {
  const at = content.toLowerCase().indexOf(needle);
  const start = at < 0 ? 0 : Math.max(0, at - 80);
  return content.slice(start, start + SEARCH_SNIPPET);
}

export class LibraryService {
  constructor(
    private readonly store: LibraryStore,
    private readonly limits: LibraryLimits = libraryLimitsFromEnv(),
    private readonly now: () => number = () => Date.now(),
    private readonly writing = false,
  ) {}

  private write<T>(actor: Actor, work: (service: LibraryService) => Promise<T>): Promise<T> {
    this.requireTenantActor(actor);
    return this.store.withTenantWrite(actor.tenantId, store => work(new LibraryService(store, this.limits, this.now, true)));
  }

  limitsView() {
    return {
      maxFileBytes: this.limits.maxFileBytes,
      tenantQuotaBytes: this.limits.tenantQuotaBytes,
      recycleDays: this.limits.recycleDays,
      askMaxChars: this.limits.askMaxChars,
      allowedExtensions: [...this.limits.allowedExtensions],
    };
  }

  async config(actor: Actor) {
    // A platform account that has not entered an enterprise workbench has no tenant
    // context. Report that state instead of failing every library request with 403,
    // so the client can explain how to enable the library.
    if (!actor.tenantId || !actor.activeMember) return {
      enabled: false,
      reason: 'NO_TENANT',
      message: '请先选择你已加入的有效企业；尚未加入企业时，请联系平台管理员配置成员关系。',
      ...this.limitsView(),
      usedBytes: 0,
    };
    this.requireTenantActor(actor);
    await this.sweep(actor.tenantId);
    return { enabled: true, ...this.limitsView(), usedBytes: await this.usedBytes(actor.tenantId) };
  }

  async ownerCounts(actor: Actor): Promise<Record<string, number>> {
    this.requireTenantActor(actor);
    if (!(actor.isOrgAdmin && actor.activeMember)) throw new LibraryError(403, '只有企业管理员可以查看成员资料', 'FORBIDDEN');
    const counts: Record<string, number> = {};
    for (const node of await this.store.listNodes(actor.tenantId)) {
      if (node.state !== 'ACTIVE') continue;
      counts[node.ownerUserId] = (counts[node.ownerUserId] ?? 0) + 1;
    }
    return counts;
  }

  /** Files the member can see at every depth. Folders stay in the sidebar tree. */
  async catalog(actor: Actor, q?: string, page = 1, pageSize = 10) {
    this.requireTenantActor(actor);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new LibraryError(400, '分页参数无效', 'BAD_PAGE');
    await this.sweep(actor.tenantId);
    const custodies = await this.custodiesFor(actor);
    const nodes = await this.store.listNodes(actor.tenantId);
    const query = q?.trim().toLowerCase();
    const rows = [];
    for (const node of nodes) {
      if (node.kind !== 'FILE' || node.state !== 'ACTIVE' || !canSee(actor, node, custodies, this.now())) continue;
      if (query && !node.name.toLowerCase().includes(query)) continue;
      if (await this.versionStatus(node) === 'FAILED') continue;
      rows.push(node);
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const items = [];
    for (const node of rows.slice((page - 1) * pageSize, page * pageSize)) {
      const location = node.ownerUserId === actor.userId ? 'mine' as const : 'shared' as const;
      const item = await this.toItem(actor, node, custodies, null);
      item.location = location;
      item.parentPath = this.catalogPath(node, nodes, actor, custodies, location);
      items.push(item);
    }
    return { items, total: rows.length, page, pageSize };
  }

  async list(actor: Actor, view: LibraryView, parentId?: string | null, q?: string, flat = false, page = 1, pageSize?: number, status = 'all', fileType?: string, owner?: string, agent = false) {
    this.requireTenantActor(actor);
    if (view === 'members' && !(actor.isOrgAdmin && actor.activeMember)) {
      throw new LibraryError(403, '只有企业管理员可以查看成员资料', 'FORBIDDEN');
    }
    const memberOwner = view === 'members' ? owner?.trim() || undefined : undefined;
    await this.sweep(actor.tenantId);
    const custodies = await this.custodiesFor(actor);
    const nodes = await this.store.listNodes(actor.tenantId);
    let parentScope: LibraryScope | null = null;
    let folderOwner: string | null = null;
    if (parentId) {
      const parent = nodes.find((row) => row.id === parentId) ?? await this.store.getNode(parentId);
      if (!parent || parent.kind !== 'FOLDER' || parent.state !== 'ACTIVE' || !canSee(actor, parent, custodies, this.now())) throw libraryNotFound();
      if (memberOwner && parent.ownerUserId !== memberOwner) throw libraryNotFound();
      parentScope = parent.scope;
      folderOwner = parent.ownerUserId;
    }
    const recent = view === 'recent' ? await this.store.listRecent(actor.userId, actor.tenantId) : [];
    const recentAt = new Map(recent.map((row) => [row.nodeId, row.accessedAt]));
    let rows = nodes.filter((node) => {
      if (view === 'trash') return node.state === 'RECYCLED' && canManage(actor, node, custodies, this.now());
      if (!canSee(actor, node, custodies, this.now()) || node.state !== 'ACTIVE') return false;
      if (view === 'mine') return node.ownerUserId === actor.userId;
      if (view === 'shared') return node.scope === 'ENTERPRISE';
      if (view === 'members') return !memberOwner || node.ownerUserId === memberOwner;
      if (view === 'managed') return matchingCustody(actor, node, custodies, this.now()) !== null;
      return recentAt.has(node.id);
    });
    const query = q?.trim().toLowerCase();
    if (!query && parentId) rows = rows.filter((node) => node.parentId === parentId);
    else if (!query && !flat && (view === 'mine' || view === 'shared' || view === 'members' || view === 'managed')) rows = rows.filter((node) => this.isRootForView(node, nodes, actor, custodies, view, memberOwner));
    if (query) rows = rows.filter((node) => node.name.toLowerCase().includes(query));
    if (agent) {
      const visible: NodeRecord[] = [];
      for (const node of rows) {
        if (node.kind === 'FILE' && await this.versionStatus(node) === 'FAILED') continue;
        visible.push(node);
      }
      rows = visible;
    }
    if (status === 'uncitable') {
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        if (node.kind === 'FILE' && await this.versionStatus(node) !== 'READY') matched.push(node);
      }
      rows = matched;
    } else if (status !== 'all') {
      const statuses = status === 'processing' ? ['PENDING', 'PROCESSING'] : [({ ready: 'READY', failed: 'FAILED', download: 'DOWNLOAD_ONLY' } as Record<string, string>)[status]].filter(value => value !== undefined);
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        const version = node.currentVersionId ? await this.store.getVersion(node.currentVersionId) : null;
        if (node.kind === 'FILE' && version && statuses.includes(version.parseStatus)) matched.push(node);
      }
      rows = matched;
    }
    if (fileType === 'content') rows = rows.filter((node) => node.kind !== 'FOLDER');
    else if (fileType) {
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        const version = node.kind === 'FILE' && node.currentVersionId ? await this.store.getVersion(node.currentVersionId) : null;
        if (libraryFileTypeKey(node.kind, version?.mimeType) === fileType) matched.push(node);
      }
      rows = matched;
    }
    if (view === 'recent') rows.sort((a, b) => (recentAt.get(b.id) ?? 0) - (recentAt.get(a.id) ?? 0));
    else rows.sort((a, b) => Number(b.kind === 'FOLDER') - Number(a.kind === 'FOLDER') || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const total = rows.length;
    if (pageSize !== undefined) {
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new LibraryError(400, '分页参数无效', 'BAD_PAGE');
      rows = rows.slice((page - 1) * pageSize, page * pageSize);
    }
    const items = [];
    for (const node of rows) {
      const item = await this.toItem(actor, node, custodies, recentAt.get(node.id) ?? null);
      if (flat && (view === 'mine' || view === 'members')) item.parentPath = node.parentId ? await this.breadcrumb(actor, node.parentId, custodies) : [];
      items.push(item);
      if (actor.custodyId) await this.auditCustodyRead(actor, node);
    }
    const breadcrumb = parentId ? await this.breadcrumb(actor, parentId, custodies) : [];
    return { items, breadcrumb, parentScope, total, page, pageSize: pageSize ?? total, ownerUserId: folderOwner };
  }

  /** 按正文或文件名做字面检索。视频和未解析的非图片文件不会出现。可查看的图片按文件名命中，即使没有抽出文字。 */
  async searchQuotes(actor: Actor, rawQuery: string) {
    this.requireMember(actor);
    const query = rawQuery.trim();
    if (query.length < 1 || query.length > 200) throw new LibraryError(400, '检索词需要 1 到 200 个字符', 'BAD_QUERY');
    const needle = query.toLowerCase();
    const nodes = (await this.store.listNodes(actor.tenantId))
      .filter((node) => quotableInChat(actor, node) && node.currentVersionId)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const hits: LibrarySearchHit[] = [];
    let examined = 0;
    for (const node of nodes) {
      if (hits.length >= SEARCH_HITS || examined >= SEARCH_FILES) break;
      examined += 1;
      const version = await this.store.getVersion(node.currentVersionId!);
      if (!version) continue;
      const viewable = (version.parseStatus === 'READY' || version.parseStatus === 'DOWNLOAD_ONLY')
        && VIEWABLE_IMAGE_EXTENSIONS.has(fileExtension(version.originalName));
      if (!viewable && version.parseStatus !== 'READY') continue;
      const chunks = version.parseStatus === 'READY' ? await this.store.listChunks(version.id) : [];
      const textHit = chunks.find((row) => row.content.toLowerCase().includes(needle));
      const nameHit = node.name.toLowerCase().includes(needle);
      const source = textHit ?? (nameHit ? chunks[0] : undefined);
      if (!source && !(viewable && nameHit)) continue;
      hits.push({
        nodeId: node.id,
        versionId: version.id,
        versionNo: version.versionNo,
        name: node.name,
        locator: source?.locator ?? 'image',
        locatorKind: source?.locatorKind ?? 'image',
        quote: source ? excerptAround(source.content, needle) : '',
        matched: textHit ? 'text' : 'name',
        ...(viewable ? { image: true as const } : {}),
      });
    }
    return { query, hits, truncated: hits.length >= SEARCH_HITS || examined < nodes.length && examined >= SEARCH_FILES };
  }

  async createFolder(actor: Actor, name: string, parentId?: string | null, options: CreationOptions = {}) {
    this.requireMember(actor);
    if (!parentId) this.scopeOrThrow(options.scope, options.confirmShare);
    return this.createOwnedFolder(actor, actor.userId, name, parentId, options.scope);
  }

  /** Explicitly authorized platform creation keeps the real actor separate from the target owner. */
  async createOwnedFolder(actor: Actor, ownerUserId: string, name: string, parentId?: string | null, requestedScope?: LibraryScope): Promise<LibraryItem> {
    if (!this.writing) return this.write(actor, service => service.createOwnedFolder(actor, ownerUserId, name, parentId, requestedScope));
    const { scope } = await this.creationTarget(actor, parentId, requestedScope);
    await this.assertCreation(actor, ownerUserId, scope);
    await this.sweep(actor.tenantId);
    const now = this.now();
    const node = { ...this.blankNode(actor, 'FOLDER', safeNodeName(name), parentId ?? null, now), ownerUserId, scope };
    await this.store.insertNode(node);
    await this.writeAudit(actor, 'library_folder', { nodeId: node.id });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async createLink(actor: Actor, name: string, url: string, parentId?: string | null, options: CreationOptions = {}): Promise<LibraryItem> {
    this.requireMember(actor);
    if (!this.writing) return this.write(actor, service => service.createLink(actor, name, url, parentId, options));
    if (!parentId) this.scopeOrThrow(options.scope, options.confirmShare);
    await this.sweep(actor.tenantId);
    const { scope } = await this.creationTarget(actor, parentId, options.scope);
    const now = this.now();
    const node = this.blankNode(actor, 'LINK', safeNodeName(name), parentId ?? null, now);
    node.scope = scope;
    node.linkUrl = safeLinkUrl(url);
    await this.store.insertNode(node);
    await this.writeAudit(actor, 'library_link', { nodeId: node.id });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async upload(actor: Actor, input: UploadInput) {
    this.requireMember(actor);
    return this.uploadOwned(actor, actor.userId, input);
  }

  async uploadOwned(actor: Actor, ownerUserId: string, input: UploadInput) {
    if (!input.parentId) this.scopeOrThrow(input.scope, input.confirmShare);
    const target = await this.creationTarget(actor, input.parentId, input.scope);
    await this.assertCreation(actor, ownerUserId, target.scope);
    await this.sweep(actor.tenantId);
    const scope = target.scope;
    const name = safeDisplayName(input.originalName);
    const ext = assertAllowedUpload(name, input.bytes, this.limits);
    await this.assertQuota(actor.tenantId, input.bytes.length);
    const now = this.now();
    const node = { ...this.blankNode(actor, 'FILE', name, input.parentId ?? null, now), ownerUserId };
    node.scope = scope;
    const prepared = await this.prepareVersion(actor, node, name, input.mimeType || 'application/octet-stream', input.bytes, ext, 1, now);
    node.currentVersionId = prepared.version.id;
    try {
      return await this.write(actor, async service => {
        const current = await service.creationTarget(actor, input.parentId, input.scope);
        if (current.scope !== scope || current.parentRevision !== target.parentRevision) {
          throw new LibraryError(409, '目标目录已变化，请确认保存位置后重试', 'SCOPE_CONFLICT');
        }
        await service.assertCreation(actor, ownerUserId, scope);
        await service.store.commitNewFile({ node, version: prepared.version, chunks: prepared.chunks, tenantQuotaBytes: this.limits.tenantQuotaBytes });
        await service.writeAudit(actor, 'library_upload', { nodeId: node.id, versionId: prepared.version.id, scope });
        return service.toItem(actor, node, await service.custodiesFor(actor), null);
      });
    } catch (error) {
      await this.store.deleteBlob(prepared.version.storageKey);
      throw error;
    }
  }

  async replaceVersion(actor: Actor, nodeId: string, originalName: string, mimeType: string, bytes: Buffer): Promise<LibraryItem> {
    const node = { ...await this.requireManage(actor, nodeId) };
    if (node.kind !== 'FILE' || node.state !== 'ACTIVE') throw new LibraryError(400, '只有使用中的文件可以替换版本', 'BAD_STATE');
    const name = safeDisplayName(originalName);
    const ext = assertAllowedUpload(name, bytes, this.limits);
    await this.assertQuota(actor.tenantId, bytes.length);
    const versions = await this.store.listVersions(node.id);
    const versionNo = versions.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1;
    const updatedAt = this.now();
    const prepared = await this.prepareVersion(actor, node, name, mimeType || 'application/octet-stream', bytes, ext, versionNo, updatedAt);
    try {
      return await this.write(actor, async service => {
        const current = await service.requireManage(actor, nodeId);
        if (current.state !== 'ACTIVE' || current.currentVersionId !== node.currentVersionId
          || current.scope !== node.scope || current.parentId !== node.parentId || current.updatedAt !== node.updatedAt) {
          throw new LibraryError(409, '资料已变化，请刷新后重试替换', 'VERSION_CONFLICT');
        }
        await service.store.commitReplacement({
          tenantQuotaBytes: this.limits.tenantQuotaBytes,
          nodeId: node.id,
          version: prepared.version,
          chunks: prepared.chunks,
          updatedAt,
        });
        await service.writeAudit(actor, 'library_replace', { nodeId: node.id, versionId: prepared.version.id, versionNo });
        return service.toItem(actor, { ...current, currentVersionId: prepared.version.id, updatedAt }, await service.custodiesFor(actor), null);
      });
    } catch (error) {
      await this.store.deleteBlob(prepared.version.storageKey);
      throw error;
    }
  }

  async rename(actor: Actor, nodeId: string, name: string): Promise<LibraryItem> {
    if (!this.writing) return this.write(actor, service => service.rename(actor, nodeId, name));
    const node = await this.requireManage(actor, nodeId);
    node.name = safeNodeName(name);
    node.updatedAt = this.now();
    await this.store.updateNode(node.id, { name: node.name, updatedAt: node.updatedAt });
    await this.writeAudit(actor, 'library_rename', { nodeId: node.id });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async move(actor: Actor, nodeId: string, parentId: string | null, options: MoveOptions = {}): Promise<LibraryItem> {
    if (!this.writing) return this.write(actor, service => service.move(actor, nodeId, parentId, options));
    const node = await this.requireManage(actor, nodeId);
    if (parentId) {
      const destinationActor = actor.targetCustodyId ? { ...actor, custodyId: actor.targetCustodyId } : actor;
      const parent = await this.requireVisibleFolder(destinationActor, parentId);
      if (actor.isPlatformAdmin && !actor.activeMember && !actor.libraryAdmin
        && matchingCustody(destinationActor, parent, await this.custodiesFor(destinationActor), this.now())?.powers !== 'CRUD') {
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
    node.updatedAt = this.now();
    await this.store.updateNode(node.id, { parentId, updatedAt: node.updatedAt });
    const stored = await this.store.getNode(node.id);
    if (!stored || stored.scope !== previousScope) {
      throw new LibraryError(500, '移动改变了可见性', 'SCOPE_DRIFT');
    }
    await this.writeAudit(actor, 'library_move', { nodeId: node.id, parentId });
    return this.toItem(actor, stored, await this.custodiesFor(actor), null);
  }

  async scopeImpact(actor: Actor, nodeId: string, scope: LibraryScope): Promise<ScopeImpact> {
    if (!this.writing) return this.write(actor, service => service.scopeImpact(actor, nodeId, scope));
    const node = await this.requireManage(actor, nodeId);
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
    if (!this.writing) return this.write(actor, service => service.setScope(actor, nodeId, scope, confirmShare, options));
    const node = await this.requireManage(actor, nodeId);
    const tree = await this.scopeTree(actor, node, scope);
    this.checkTreeRevision(tree, scope, options.expectedTreeRevision);
    if (scope === 'PRIVATE' && node.parentId) {
      const parent = await this.store.getNode(node.parentId);
      if (parent?.scope === 'ENTERPRISE' && parent.state !== 'PURGED') throw new LibraryError(409, '共享目录内的资料不能单独改为私有，请先移出目录', 'SHARED_PARENT');
    }
    if (!tree.some(row => row.scope !== scope)) return this.toItem(actor, node, await this.custodiesFor(actor), null);
    if (scope === 'ENTERPRISE' && confirmShare !== true) {
      throw new LibraryError(400, '变为企业共享需要明确确认', 'CONFIRM_SHARE');
    }
    if (scope === 'PRIVATE' && tree.length > 1 && options.confirmUnshare !== true) {
      throw new LibraryError(400, '取消共享会影响全部子项，请确认', 'CONFIRM_UNSHARE');
    }
    await this.applyScope(tree, scope);
    await this.writeAudit(actor, 'library_share', { nodeId: node.id, scope, affectedCount: tree.length });
    return this.toItem(actor, { ...node, scope, updatedAt: this.now() }, await this.custodiesFor(actor), null);
  }

  async recycle(actor: Actor, nodeId: string): Promise<{ ok: boolean }> {
    if (!this.writing) return this.write(actor, service => service.recycle(actor, nodeId));
    const node = await this.requireManage(actor, nodeId);
    const descendants = this.recycledSubtree(await this.store.listNodes(actor.tenantId), node.id);
    for (const child of descendants) {
      if (child.state === 'ACTIVE') await this.requireManage(actor, child.id);
    }
    const now = this.now();
    for (const child of descendants) {
      if (child.state !== 'ACTIVE') continue;
      await this.store.updateNode(child.id, { state: 'RECYCLED', recycledAt: now, updatedAt: now });
    }
    node.state = 'RECYCLED';
    node.recycledAt = now;
    node.updatedAt = now;
    await this.store.updateNode(node.id, { state: 'RECYCLED', recycledAt: node.recycledAt, updatedAt: node.updatedAt });
    await this.writeAudit(actor, 'library_recycle', { nodeId: node.id });
    return { ok: true };
  }

  async restore(actor: Actor, nodeId: string): Promise<LibraryItem> {
    if (!this.writing) return this.write(actor, service => service.restore(actor, nodeId));
    const node = await this.requireManage(actor, nodeId);
    if (node.state !== 'RECYCLED') throw new LibraryError(400, '资料不在回收站', 'BAD_STATE');
    if (node.parentId) {
      const parent = await this.store.getNode(node.parentId);
      if (parent && parent.state === 'RECYCLED') {
        throw new LibraryError(400, '上级文件夹在回收站，请先恢复上级', 'BAD_PARENT');
      }
      if (!parent || parent.state === 'PURGED') node.parentId = null;
    }
    node.state = 'ACTIVE';
    node.recycledAt = null;
    node.updatedAt = this.now();
    await this.store.updateNode(node.id, {
      state: 'ACTIVE',
      recycledAt: null,
      parentId: node.parentId,
      scope: node.scope,
      updatedAt: node.updatedAt,
    });
    await this.writeAudit(actor, 'library_restore', { nodeId: node.id, scope: node.scope });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async purge(actor: Actor, nodeId: string): Promise<{ ok: boolean; code: 'SOURCE_GONE' }> {
    const node = await this.requireManage(actor, nodeId);
    if (node.state !== 'RECYCLED') {
      throw new LibraryError(400, '请先回收到回收站再彻底删除', 'BAD_STATE');
    }
    if (node.kind === 'FILE') throw new LibraryError(409, FILE_PURGE_BLOCKED_REASON, 'REFERENCE_UNVERIFIED');
    const descendants = this.recycledSubtree(await this.store.listNodes(actor.tenantId), node.id);
    if (descendants.some(row => row.state === 'ACTIVE')) throw new LibraryError(400, '目录不为空', 'FOLDER_NONEMPTY');
    for (const child of descendants) {
      if (child.state === 'RECYCLED') await this.purgeStored(child);
    }
    await this.purgeStored(node);
    await this.writeAudit(actor, 'library_purge', { nodeId: node.id });
    return { ok: true, code: 'SOURCE_GONE' as const };
  }

  async retryParse(actor: Actor, nodeId: string) {
    const node = await this.requireManage(actor, nodeId);
    if (node.kind !== 'FILE' || !node.currentVersionId || node.state !== 'ACTIVE') {
      throw new LibraryError(400, '当前文件不能重新解析', 'BAD_STATE');
    }
    const version = await this.store.getVersion(node.currentVersionId);
    if (!version) throw libraryNotFound();
    // A successful extraction is part of this immutable citation version.
    // Retrying it must not silently remap old paragraph/page locators.
    // Download-only versions have no chunks, so a later parser may read them.
    if (version.parseStatus === 'READY') {
      return this.toItem(actor, node, await this.custodiesFor(actor), null);
    }
    const bytes = await this.store.getBlob(version.storageKey);
    if (!bytes) throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    const parsed = await parseLibraryBytes(version.originalName, bytes);
    await this.store.commitParseResult({
      tenantId: actor.tenantId,
      nodeId: node.id,
      versionId: version.id,
      parseStatus: parsed.status,
      parseReason: parsed.reason,
      extractTruncated: parsed.truncated,
      chunks: this.chunkRows(version, parsed.chunks),
      audit: {
        id: this.store.createId(), tenantId: actor.tenantId, userId: actor.userId,
        action: 'library_retry_parse',
        meta: { nodeId: node.id, versionId: version.id, status: parsed.status },
        createdAt: this.now(),
      },
    });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async preview(actor: Actor, nodeId: string, versionId?: string | null) {
    const opened = await this.openBytes(actor, nodeId, versionId, false);
    if (opened.blocked) {
      return {
        nodeId: opened.node.id,
        versionId: opened.version?.id ?? null,
        versionNo: opened.version?.versionNo ?? null,
        name: opened.node.name,
        previewKind: opened.node.kind === 'LINK' ? 'link' as const : 'blocked' as const,
        text: null,
        linkUrl: opened.node.kind === 'LINK' && opened.node.state === 'ACTIVE' ? opened.node.linkUrl : null,
        truncated: false,
        truncationNote: null,
        parseStatus: opened.version?.parseStatus ?? 'NOT_APPLICABLE',
        parseReason: opened.blocked,
        executable: false,
        preciseHighlight: false,
        highlightNote: opened.blocked,
      };
    }
    await this.auditCustodyRead(actor, opened.node);
    if (opened.node.kind === 'LINK') {
      await this.touch(actor, opened.node);
      return {
        nodeId: opened.node.id,
        versionId: null,
        versionNo: null,
        name: opened.node.name,
        previewKind: 'link' as const,
        text: null,
        linkUrl: opened.node.linkUrl,
        truncated: false,
        truncationNote: null,
        parseStatus: 'NOT_APPLICABLE' as const,
        parseReason: '链接只保存网址，不会抓取网页',
        executable: false,
        preciseHighlight: false,
        highlightNote: null,
      };
    }
    const version = opened.version;
    if (!version) throw libraryNotFound();
    const chunks = version.parseStatus === 'READY' ? await this.store.listChunks(version.id) : [];
    const fullText = chunks.map((chunk) => chunk.content).join('\n');
    const truncated = fullText.length > 20_000 || version.extractTruncated;
    const text = fullText.slice(0, 20_000);
    const ext = fileExtension(version.originalName);
    const mediaKind = ['.png','.jpg','.jpeg','.gif','.webp','.avif'].includes(ext) ? 'image' as const : ['.mp4','.webm','.mov'].includes(ext) ? 'video' as const : null;
    const page = chunks.some((chunk) => chunk.locatorKind === 'page');
    const entries = ext === '.zip' ? await this.zipPreviewEntries(version.storageKey) : undefined;
    if (text || entries) await this.touch(actor, opened.node);
    return {
      nodeId: opened.node.id,
      versionId: version.id,
      versionNo: version.versionNo,
      name: opened.node.name,
      originalName: version.originalName,
      mimeType: version.mimeType,
      previewKind: mediaKind ?? (version.parseStatus === 'READY' ? 'text' as const : 'download_only' as const),
      text: version.parseStatus === 'READY' ? text : null,
      linkUrl: null,
      ...(entries ? { entries } : {}),
      truncated,
      truncationNote: truncated ? '预览只显示前 20000 个字符，可下载原文件查看全文。' : null,
      parseStatus: version.parseStatus,
      parseReason: version.parseReason,
      executable: false,
      preciseHighlight: page,
      highlightNote: page ? null : '没有可靠页码，只显示提取出的文字。',
    };
  }

  private async zipPreviewEntries(storageKey: string) {
    const bytes = await this.store.getBlob(storageKey);
    if (!bytes) return [] as { name: string; size: number }[];
    try {
      return (await listZipEntries(bytes)).entries;
    } catch {
      return [] as { name: string; size: number }[];
    }
  }

  async download(actor: Actor, nodeId: string, versionId?: string | null, inline = false) {
    const opened = await this.openBytes(actor, nodeId, versionId, true);
    if (opened.blocked || !opened.version) throw new LibraryError(409, opened.blocked || '不能下载', 'BLOCKED');
    const bytes = await this.store.getBlob(opened.version.storageKey);
    if (!bytes) throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    const mediaType = inline ? assertMediaType(opened.version.originalName, bytes) : null;
    if (inline && !mediaType) throw new LibraryError(400, '此类型不允许内嵌预览，请下载原文件', 'BAD_TYPE');
    await this.auditCustodyRead(actor, opened.node);
    await this.touch(actor, opened.node);
    return {
      filename: opened.version.originalName,
      bytes,
      contentType: mediaType ?? 'application/octet-stream',
    };
  }

  async versions(actor: Actor, nodeId: string) {
    const node = await this.requireVisible(actor, nodeId);
    if (node.kind !== 'FILE') return [];
    const rows = await this.store.listVersions(node.id);
    return rows.map((row) => this.brief(row));
  }

  async openCitation(actor: Actor, nodeId: string, versionId: string, locator?: string | null, recordAccess = true) {
    const node = await this.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.custodiesFor(actor);
    if (!quotableInChat(actor, { ...node, state: 'ACTIVE' })) throw libraryNotFound();
    if (node.state === 'PURGED') {
      throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    }
    if (node.state === 'RECYCLED') {
      throw new LibraryError(409, '资料在回收站，已停止下载和检索', 'RECYCLED');
    }
    const version = await this.store.getVersion(versionId);
    if (!version || version.nodeId !== node.id || version.tenantId !== node.tenantId) throw libraryNotFound();
    const chunks = await this.store.listChunks(version.id);
    const excerpt = citationExcerpt(chunks, locator, this.limits.askMaxChars);
    await this.auditCustodyRead(actor, node);
    if (recordAccess && excerpt.quote) await this.touch(actor, node);
    const precise = excerpt.matched?.locatorKind === 'page' && excerpt.matched.locator === locator;
    return {
      nodeId: node.id,
      versionId: version.id,
      versionNo: version.versionNo,
      name: node.name,
      locator: excerpt.locator,
      locatorKind: excerpt.locatorKind,
      quote: excerpt.quote,
      truncated: version.extractTruncated || chunks.map(row => row.content).join('\n\n').length > this.limits.askMaxChars,
      truncationNote: version.extractTruncated || chunks.map(row => row.content).join('\n\n').length > this.limits.askMaxChars
        ? '仅使用部分摘录，未读取全文。' : null,
      preciseHighlight: precise,
      highlightNote: precise ? null : '没有可靠页码，只能定位到当时使用的段落摘录。',
      replacementVersionId: null,
    };
  }

  /** Server-selected exact version only. No ordinal/character prefilter; owning ACL is rechecked on every read. */
  async readRetrievalVersion(actor: Actor, nodeId: string, versionId: string) {
    const opened = await this.openBytes(actor, nodeId, versionId, false);
    if (opened.blocked || !opened.version || opened.version.parseStatus !== 'READY' || opened.version.extractTruncated)
      throw new LibraryError(409, '来源未完整就绪', 'SOURCE_NOT_READY');
    const chunks = await this.store.listChunks(opened.version.id);
    await this.auditCustodyRead(actor, opened.node);
    return {nodeId:opened.node.id,versionId:opened.version.id,tenantId:opened.node.tenantId,
      name:opened.node.name,contentHash:opened.version.sha256,chunks};
  }

  async markUsed(actor: Actor, nodeId: string, versionId: string) {
    this.requireMember(actor);
    const opened = await this.openBytes(actor, nodeId, versionId, false);
    if (!quotableInChat(actor, opened.node)) throw libraryNotFound();
    const ext = opened.version ? fileExtension(opened.version.originalName) : ''
    const chatImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) && opened.version?.parseStatus === 'DOWNLOAD_ONLY'
    if (opened.blocked || !opened.version || (opened.version.parseStatus !== 'READY' && !chatImage)) throw new LibraryError(409, '资料当前不能加入任务', 'BLOCKED');
    await this.touch(actor, opened.node);
    return { ok: true };
  }

  async ask(
    actor: Actor,
    versionIds: string[],
    question: string,
    model: string | undefined,
    complete: ModelComplete,
  ) {
    this.requireMember(actor);
    await this.sweep(actor.tenantId);
    const custodies = await this.custodiesFor(actor);
    const notices: string[] = [];
    let hidden = 0;
    const ready: { name: string; version: VersionRecord; chunks: ChunkRecord[] }[] = [];
    const seen = new Set<string>();
    for (const versionId of versionIds) {
      if (seen.has(versionId)) continue;
      seen.add(versionId);
      const version = await this.store.getVersion(versionId);
      const node = version ? await this.store.getNode(version.nodeId) : null;
      if (!version || !node || version.tenantId !== actor.tenantId || !quotableInChat(actor, { ...node, state: 'ACTIVE' })) {
        hidden += 1;
        continue;
      }
      if (node.state === 'PURGED') {
        notices.push('一份已选来源已彻底删除，不能改用其它版本。');
        continue;
      }
      if (node.state === 'RECYCLED') {
        notices.push(`《${node.name}》在回收站，已停止检索。`);
        continue;
      }
      if (version.parseStatus !== 'READY') {
        notices.push(`《${node.name}》${version.parseReason || '现在不能用于问答'}。`);
        continue;
      }
      ready.push({ name: node.name, version, chunks: await this.store.listChunks(version.id) });
    }
    if (hidden > 0) notices.push(`${hidden} 项所选资料当前无权访问，未显示名称，也未纳入问答。`);
    if (ready.length === 0) {
      return {
        status: 'no_evidence' as const,
        modelRef: null,
        modelVerified: false,
        answer: null,
        truncated: false,
        truncationNote: null,
        citations: [],
        notices,
      };
    }
    const prompt = buildAskPrompt(question, ready, this.limits.askMaxChars);
    if (prompt.truncationNote) notices.push(prompt.truncationNote);
    const result = await complete({ model, messages: prompt.messages });
    await this.writeAudit(actor, 'library_ask', {
      versions: prompt.sources.map((source) => source.versionId).join(','),
      model: result.ok ? result.modelRef : 'unavailable',
    });
    const citations = prompt.sources.map((source) => ({
      marker: source.marker,
      nodeId: source.nodeId,
      versionId: source.versionId,
      versionNo: source.versionNo,
      name: source.name,
      locator: source.locator,
      locatorKind: source.locatorKind,
      quote: source.quote,
    }));
    if (!result.ok) {
      return {
        status: 'model_unconfigured' as const,
        modelRef: null,
        modelVerified: false,
        answer: null,
        truncated: prompt.truncated,
        truncationNote: prompt.truncationNote,
        citations,
        notices: [...notices, result.reason],
      };
    }
    for (const source of prompt.sources) {
      const node = await this.store.getNode(source.nodeId);
      if (node && canSee(actor, node, await this.custodiesFor(actor), this.now())) await this.touch(actor, node);
    }
    const cleaned = sanitizeAnswer(result.text, prompt.sources.map((source) => source.marker));
    if (cleaned.stripped) notices.push('已去掉无法对应到真实版本的引用。');
    return {
      status: 'answered' as const,
      modelRef: result.modelRef,
      modelVerified: true,
      answer: cleaned.text,
      truncated: prompt.truncated,
      truncationNote: prompt.truncationNote,
      citations,
      notices,
    };
  }

  async batch(actor: Actor, ids: string[], action: 'recycle' | 'restore' | 'purge') {
    const ok: string[] = [];
    const failed: { id: string; message: string }[] = [];
    let skipped = 0;
    for (const id of ids) {
      const node = await this.store.getNode(id);
      const custodies = await this.custodiesFor(actor);
      if (!node || !canKnow(actor, node, custodies, this.now())) {
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

  async adminStats(actor: { userId: string; isPlatformAdmin: boolean }) {
    if (!actor.isPlatformAdmin) throw new LibraryError(403, '只有平台管理员可以查看资料概况', 'FORBIDDEN');
    const tenants = await this.store.listTenants();
    const rows = [];
    for (const tenant of tenants) {
      await this.sweep(tenant.id);
      const nodes = await this.store.listNodes(tenant.id);
      let usedBytes = 0;
      let versionCount = 0;
      const counts = { ready: 0, failed: 0, downloadOnly: 0, pending: 0, processing: 0 };
      for (const node of nodes) {
        if (node.kind !== 'FILE') continue;
        const versions = await this.store.listVersions(node.id);
        versionCount += versions.length;
        if (node.state !== 'PURGED') {
          for (const version of versions) usedBytes += version.sizeBytes;
        }
        const current = versions.find((version) => version.id === node.currentVersionId);
        if (!current || node.state === 'PURGED') continue;
        if (current.parseStatus === 'READY') counts.ready += 1;
        else if (current.parseStatus === 'FAILED') counts.failed += 1;
        else if (current.parseStatus === 'DOWNLOAD_ONLY') counts.downloadOnly += 1;
        else if (current.parseStatus === 'PROCESSING') counts.processing += 1;
        else counts.pending += 1;
      }
      rows.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        activeFiles: nodes.filter((node) => node.kind === 'FILE' && node.state === 'ACTIVE').length,
        recycledFiles: nodes.filter((node) => node.state === 'RECYCLED').length,
        purgedFiles: nodes.filter((node) => node.state === 'PURGED').length,
        versionCount,
        usedBytes,
        ...counts,
      });
    }
    return { limits: this.limitsView(), tenants: rows };
  }

  async grantCustody(actor: Actor, input: {
    tenantId: string;
    granteeUserId: string;
    contentScope: 'ENTERPRISE' | 'PRIVATE_OWNER';
    ownerUserId?: string | null;
    powers: 'READ' | 'CRUD';
    expiresAt: number;
    reason: string;
  }) {
    if (actor.userId === input.granteeUserId || !actor.activeMember || actor.tenantId !== input.tenantId
      || (input.contentScope === 'ENTERPRISE' ? !actor.isOrgAdmin : input.ownerUserId !== actor.userId)) {
      throw new LibraryError(403, '代管必须由本企业管理员批准共享范围，或由资料所有者批准私人范围', 'FORBIDDEN');
    }
    const reason = input.reason.trim();
    if (reason.length < 4) throw new LibraryError(400, '请写明代管原因', 'BAD_CUSTODY');
    if (input.expiresAt <= this.now()) throw new LibraryError(400, '代管到期时间必须晚于现在', 'BAD_CUSTODY');
    if (input.contentScope === 'PRIVATE_OWNER' && !input.ownerUserId) {
      throw new LibraryError(400, '代管私人资料必须指定所有者', 'BAD_CUSTODY');
    }
    const tenants = await this.store.listTenants();
    if (!tenants.some((tenant) => tenant.id === input.tenantId)) throw libraryNotFound();
    const now = this.now();
    const ownerUserId = input.contentScope === 'PRIVATE_OWNER' ? input.ownerUserId ?? null : null;
    // 同一组授权键只保留一条有效授权；重复批准时续期覆盖，避免撤销一条后旧授权仍然生效。
    const reusable = (await this.store.listCustodies()).find((row) =>
      row.tenantId === input.tenantId
      && row.granteeUserId === input.granteeUserId
      && row.contentScope === input.contentScope
      && row.ownerUserId === ownerUserId
      && row.powers === input.powers
      && row.revokedAt === null);
    const row: CustodyRecord = reusable
      ? { ...reusable, expiresAt: input.expiresAt, reason, createdAt: now }
      : {
        id: this.store.createId(),
        tenantId: input.tenantId,
        grantorUserId: actor.userId,
        granteeUserId: input.granteeUserId,
        contentScope: input.contentScope,
        ownerUserId,
        powers: input.powers,
        expiresAt: input.expiresAt,
        revokedAt: null,
        reason,
        createdAt: now,
      };
    if (reusable) {
      await this.store.updateCustody(row.id, { expiresAt: row.expiresAt, reason: row.reason, createdAt: row.createdAt });
    } else {
      await this.store.insertCustody(row);
    }
    await this.store.audit({
      id: this.store.createId(),
      tenantId: input.tenantId,
      userId: actor.userId,
      action: 'library_custody_grant',
      meta: { custodyId: row.id, contentScope: row.contentScope, powers: row.powers, granteeUserId: row.granteeUserId },
      createdAt: now,
    });
    return this.custodyView(row);
  }

  async revokeCustody(actor: Actor, custodyId: string) {
    const row = await this.store.getCustody(custodyId);
    if (!row || (!actor.isPlatformAdmin && !(actor.activeMember && actor.tenantId === row.tenantId
      && (row.grantorUserId === actor.userId || (row.contentScope === 'ENTERPRISE' && actor.isOrgAdmin))))) throw libraryNotFound();
    row.revokedAt = this.now();
    await this.store.updateCustody(row.id, { revokedAt: row.revokedAt });
    await this.store.audit({
      id: this.store.createId(),
      tenantId: row.tenantId,
      userId: actor.userId,
      action: 'library_custody_revoke',
      meta: { custodyId: row.id },
      createdAt: this.now(),
    });
    return {
      ...this.custodyView(row),
      message: '已撤销代管，之后不能再读取。已经发生的阅读不会被抹掉。',
    };
  }

  /** Resolve tenant and owner scope from the still-active grant, never from client tenantId. */
  async managedActor(actor: Pick<Actor, 'userId' | 'isPlatformAdmin'>, custodyId: string): Promise<Actor> {
    const grant = await this.store.getCustody(custodyId);
    if (!actor.isPlatformAdmin || !grant || grant.granteeUserId !== actor.userId || grant.revokedAt !== null || grant.expiresAt <= this.now()) throw libraryNotFound();
    return { userId: actor.userId, tenantId: grant.tenantId, isPlatformAdmin: true, isOrgAdmin: false, activeMember: false, custodyId: grant.id };
  }

  async listCustody(actor: Actor) {
    const rows = await this.store.listCustodies();
    return rows.filter(row => actor.isPlatformAdmin || (actor.activeMember && row.tenantId === actor.tenantId
      && (row.grantorUserId === actor.userId || (actor.isOrgAdmin && row.contentScope === 'ENTERPRISE'))))
      .map(row => this.custodyView(row));
  }

  private custodyView(row: CustodyRecord) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      granteeUserId: row.granteeUserId,
      contentScope: row.contentScope,
      ownerUserId: row.ownerUserId,
      powers: row.powers,
      expiresAt: new Date(row.expiresAt).toISOString(),
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
      reason: row.reason,
    };
  }

  private async openBytes(actor: Actor, nodeId: string, versionId: string | null | undefined, forDownload: boolean) {
    const node = await this.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.custodiesFor(actor);
    if (!canKnow(actor, node, custodies, this.now())) throw libraryNotFound();
    if (node.state === 'PURGED') {
      throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    }
    if (node.state === 'RECYCLED') {
      return { node, version: null, blocked: '资料在回收站，已停止下载和检索' };
    }
    if (node.kind === 'LINK') return { node, version: null, blocked: forDownload ? '链接没有文件' : null };
    if (node.kind === 'FOLDER') throw new LibraryError(400, '文件夹没有文件正文', 'BAD_STATE');
    const version = await this.store.getVersion(versionId || node.currentVersionId || '');
    if (!version || version.nodeId !== node.id) throw libraryNotFound();
    return { node, version, blocked: null as string | null };
  }

  private async prepareVersion(
    actor: Actor,
    node: NodeRecord,
    name: string,
    mimeType: string,
    bytes: Buffer,
    ext: string,
    versionNo: number,
    now: number,
  ) {
    const versionId = this.store.createId();
    const storageKey = storageKeyFor(actor.tenantId, versionId, ext || fileExtension(name));
    const parsed = await parseLibraryBytes(name, bytes);
    const version: VersionRecord = {
      id: versionId,
      nodeId: node.id,
      tenantId: actor.tenantId,
      versionNo,
      originalName: name,
      mimeType: assertMediaType(name, bytes) ?? mimeType,
      sizeBytes: bytes.length,
      storageKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      parseStatus: parsed.status,
      parseReason: parsed.reason,
      extractTruncated: parsed.truncated,
      createdByUserId: actor.userId,
      createdAt: now,
    };
    await this.store.putBlob(storageKey, bytes);
    return { version, chunks: this.chunkRows(version, parsed.chunks) };
  }

  private chunkRows(version: VersionRecord, chunks: { ordinal: number; content: string; locator: string; locatorKind: 'paragraph' | 'page' }[]): ChunkRecord[] {
    return chunks.map((chunk) => ({
      id: this.store.createId(),
      versionId: version.id,
      tenantId: version.tenantId,
      ordinal: chunk.ordinal,
      content: chunk.content,
      locator: chunk.locator,
      locatorKind: chunk.locatorKind,
    }));
  }

  private async creationTarget(actor: Actor, parentId?: string | null, requestedScope?: LibraryScope) {
    this.requireTenantActor(actor);
    if (!parentId) return { scope: requestedScope ?? 'PRIVATE' as LibraryScope, parentRevision: null };
    const parent = await this.requireVisibleFolder(actor, parentId);
    if (requestedScope !== undefined && requestedScope !== parent.scope) {
      throw new LibraryError(409, '目标目录可见范围已变化，请刷新后重试', 'SCOPE_CONFLICT');
    }
    return { scope: parent.scope, parentRevision: JSON.stringify([parent.id, parent.parentId, parent.scope, parent.updatedAt]) };
  }

  private async scopeTree(actor: Actor, root: NodeRecord, scope: LibraryScope): Promise<NodeRecord[]> {
    const tree = [root];
    if (root.kind === 'FOLDER') {
      const children = new Map<string, NodeRecord[]>();
      for (const node of await this.store.listNodes(actor.tenantId)) {
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
    const custodies = await this.custodiesFor(actor);
    for (const node of tree) {
      if (node.scope === scope) continue;
      if (!canManage(actor, node, custodies, this.now())) throw new LibraryError(403, '目录包含无权修改的资料，整次操作未执行', 'FORBIDDEN');
      if (actor.isPlatformAdmin && !actor.activeMember && !actor.libraryAdmin) {
        const grant = actor.targetCustodyId ? await this.store.getCustody(actor.targetCustodyId) : null;
        const target = { ...node, scope };
        if (!grant || matchingCustody(actor, target, [grant], this.now())?.powers !== 'CRUD') {
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
    const updatedAt = this.now();
    for (const node of tree) {
      if (node.scope !== scope) await this.store.updateNode(node.id, { scope, updatedAt });
    }
  }

  private async assertCreation(actor: Actor, ownerUserId: string, scope: LibraryScope) {
    if (actor.activeMember && actor.userId === ownerUserId) return;
    if (actor.libraryAdmin && actor.isPlatformAdmin) return;
    if (!actor.isPlatformAdmin || !actor.custodyId) throw new LibraryError(403, '需要明确的企业代管管理授权', 'FORBIDDEN');
    const candidate = { ...this.blankNode(actor, 'FILE', '', null, this.now()), ownerUserId, scope };
    const grant = matchingCustody(actor, candidate, await this.custodiesFor(actor), this.now());
    if (grant?.powers !== 'CRUD') throw new LibraryError(403, '当前授权不能为此所有者和可见范围新增资料', 'FORBIDDEN');
  }

  private blankNode(actor: Actor, kind: NodeRecord['kind'], name: string, parentId: string | null, now: number): NodeRecord {
    return {
      id: this.store.createId(),
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

  private async assertQuota(tenantId: string, extra: number) {
    const used = await this.usedBytes(tenantId);
    if (used + extra > this.limits.tenantQuotaBytes) {
      throw new LibraryError(400, '超出企业资料容量', 'QUOTA');
    }
  }

  private async usedBytes(tenantId: string) {
    const nodes = await this.store.listNodes(tenantId);
    let used = 0;
    for (const node of nodes) {
      if (node.state === 'PURGED' || node.kind !== 'FILE') continue;
      const versions = await this.store.listVersions(node.id);
      for (const version of versions) used += version.sizeBytes;
    }
    return used;
  }

  private async sweep(_tenantId: string) {
    // Retention cleanup requires a separately authorized maintenance operation.
    // Reading a list/config/summary must not permanently erase customer files.
  }

  private async purgeStored(node: NodeRecord) {
    const versions = await this.store.listVersions(node.id);
    for (const version of versions) {
      await this.store.deleteBlob(version.storageKey);
      await this.store.replaceChunks(version.id, node.tenantId, []);
    }
    const now = this.now();
    node.state = 'PURGED';
    node.purgedAt = now;
    node.updatedAt = now;
    await this.store.updateNode(node.id, { state: 'PURGED', purgedAt: now, updatedAt: now });
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
      const row = await this.store.getNode(current);
      current = row?.parentId ?? null;
    }
    return false;
  }

  private async requireVisibleFolder(actor: Actor, parentId: string) {
    const parent = await this.requireVisible(actor, parentId);
    if (parent.kind !== 'FOLDER' || parent.state !== 'ACTIVE') {
      throw new LibraryError(400, '上级不是可用文件夹', 'BAD_PARENT');
    }
    return parent;
  }

  private async requireVisible(actor: Actor, nodeId: string) {
    await this.sweep(actor.tenantId);
    const node = await this.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.custodiesFor(actor);
    if (!canSee(actor, node, custodies, this.now())) throw libraryNotFound();
    return node;
  }

  private async requireManage(actor: Actor, nodeId: string) {
    await this.sweep(actor.tenantId);
    const node = await this.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.custodiesFor(actor);
    if (!canKnow(actor, node, custodies, this.now())) throw libraryNotFound();
    if (!canManage(actor, node, custodies, this.now())) {
      throw new LibraryError(403, '不能修改该资料', 'FORBIDDEN');
    }
    return node;
  }

  private requireMember(actor: Actor) {
    this.requireTenantActor(actor);
    if (!actor.activeMember) throw new LibraryError(403, '离开企业后不能继续使用资料库', 'NOT_MEMBER');
  }

  private requireTenantActor(actor: Actor) {
    if (!actor.tenantId) throw new LibraryError(403, '缺少企业上下文', 'NO_TENANT');
  }

  private async custodiesFor(actor: Actor) {
    const rows = await this.store.listCustodies();
    return rows.filter((row) => row.tenantId === actor.tenantId && row.granteeUserId === actor.userId && (!actor.custodyId || row.id === actor.custodyId));
  }

  private async auditCustodyRead(actor: Actor, node: NodeRecord) {
    const custody = matchingCustody(actor, node, await this.custodiesFor(actor), this.now());
    if (custody) await this.writeAudit(actor, 'library_custody_read', { custodyId: custody.id, nodeId: node.id });
  }

  private async touch(actor: Actor, node: NodeRecord) {
    if (node.state !== 'ACTIVE') return;
    await this.store.touchRecent({
      id: this.store.createId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      nodeId: node.id,
      accessedAt: this.now(),
    });
  }

  private async writeAudit(actor: Actor, action: string, meta: AuditRecord['meta']) {
    await this.store.audit({
      id: this.store.createId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      action,
      meta,
      createdAt: this.now(),
    });
  }

  private brief(row: VersionRecord): VersionBrief {
    return {
      id: row.id,
      mimeType: row.mimeType,
      versionNo: row.versionNo,
      sizeBytes: row.sizeBytes,
      parseStatus: row.parseStatus,
      parseReason: row.parseReason,
      extractTruncated: row.extractTruncated,
      originalName: row.originalName,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private async toItem(actor: Actor, node: NodeRecord, custodies: CustodyRecord[], accessedAt: number | null): Promise<LibraryItem> {
    let parentName: string | null = null;
    let parentHidden = false;
    let parentId: string | null = node.parentId;
    if (node.parentId) {
      const parent = await this.store.getNode(node.parentId);
      if (!parent || !canSee(actor, parent, custodies, this.now())) {
        parentName = null;
        parentHidden = true;
        parentId = null;
      } else parentName = parent.name;
    }
    const version = node.currentVersionId ? await this.store.getVersion(node.currentVersionId) : null;
    return {
      id: node.id,
      kind: node.kind,
      name: node.name,
      scope: node.scope,
      state: node.state,
      ownerUserId: node.ownerUserId,
      ownerName: await this.store.userName(node.ownerUserId),
      parentId,
      parentName,
      parentHidden,
      linkUrl: node.kind === 'LINK' && node.state === 'ACTIVE' ? node.linkUrl : null,
      mine: node.ownerUserId === actor.userId,
      canManage: canManage(actor, node, custodies, this.now()),
      purgeBlockedReason: node.kind === 'FILE' ? FILE_PURGE_BLOCKED_REASON : null,
      currentVersion: version ? this.brief(version) : null,
      createdAt: new Date(node.createdAt).toISOString(),
      updatedAt: new Date(node.updatedAt).toISOString(),
      recycledAt: node.recycledAt ? new Date(node.recycledAt).toISOString() : null,
      accessedAt: accessedAt ? new Date(accessedAt).toISOString() : null,
    };
  }

  private isRootForView(
    node: NodeRecord,
    nodes: NodeRecord[],
    actor: Actor,
    custodies: CustodyRecord[],
    view: LibraryView,
    owner?: string,
  ) {
    if (!node.parentId) return true;
    const parent = nodes.find((row) => row.id === node.parentId);
    if (!parent || parent.state !== 'ACTIVE' || !canSee(actor, parent, custodies, this.now())) return true;
    const inView = (row: NodeRecord) => row.state === 'ACTIVE' && canSee(actor, row, custodies, this.now())
      && (view === 'mine' ? row.ownerUserId === actor.userId : view === 'shared' ? row.scope === 'ENTERPRISE' : view === 'members' && owner ? row.ownerUserId === owner : true);
    if (!inView(parent)) return true;
    // Old/corrupt cyclic metadata must not make an entire component disappear.
    // Expose one deterministic root; client expansion and breadcrumb both stop repeats.
    const visited = [node.id];
    let current: NodeRecord | undefined = parent;
    while (current && inView(current)) {
      const at = visited.indexOf(current.id);
      if (at >= 0) return node.id === visited.slice(at).sort()[0];
      visited.push(current.id);
      current = nodes.find(row => row.id === current?.parentId);
    }
    return false;
  }

  /** Ancestors that actually appear in the destination tree. A shared file under a private folder stays at that tree's root. */
  private async versionStatus(node: NodeRecord): Promise<string | null> {
    if (node.kind !== 'FILE' || !node.currentVersionId) return null;
    const version = await this.store.getVersion(node.currentVersionId);
    return version?.parseStatus ?? null;
  }

  private catalogPath(node: NodeRecord, nodes: NodeRecord[], actor: Actor, custodies: CustodyRecord[], location: 'mine' | 'shared') {
    const visible = (row: NodeRecord) => row.kind === 'FOLDER' && row.state === 'ACTIVE' && canSee(actor, row, custodies, this.now())
      && (location === 'mine' ? row.ownerUserId === actor.userId : row.scope === 'ENTERPRISE');
    const items: { id: string; name: string }[] = [];
    const seen = new Set([node.id]);
    let current = nodes.find((row) => row.id === node.parentId);
    while (current && !seen.has(current.id) && visible(current) && items.length < 32) {
      seen.add(current.id);
      items.push({ id: current.id, name: current.name });
      current = nodes.find((row) => row.id === current?.parentId);
    }
    return items.reverse();
  }

  private async breadcrumb(actor: Actor, parentId: string, custodies: CustodyRecord[]) {
    const items: { id: string; name: string }[] = [];
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const node = await this.store.getNode(current);
      if (!node || !canSee(actor, node, custodies, this.now())) break;
      items.push({ id: node.id, name: node.name });
      current = node.parentId;
    }
    return items.reverse();
  }
}
