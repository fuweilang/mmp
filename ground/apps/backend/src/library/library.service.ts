import { createHash } from 'crypto';
import { buildAskPrompt, sanitizeAnswer } from './library.ask';
import { LibraryError, libraryNotFound } from './library.errors';
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
import { parseLibraryBytes } from './library.parse';
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

type UploadInput = {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  parentId?: string | null;
  scope?: LibraryScope;
  confirmShare?: boolean;
};

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

export class LibraryService {
  constructor(
    private readonly store: LibraryStore,
    private readonly limits: LibraryLimits = libraryLimitsFromEnv(),
    private readonly now: () => number = () => Date.now(),
  ) {}

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
    this.requireTenantActor(actor);
    await this.sweep(actor.tenantId);
    return { ...this.limitsView(), usedBytes: await this.usedBytes(actor.tenantId) };
  }

  async list(actor: Actor, view: LibraryView, parentId?: string | null, q?: string, flat = false, page = 1, pageSize?: number, status = 'all') {
    this.requireTenantActor(actor);
    await this.sweep(actor.tenantId);
    const custodies = await this.custodiesFor(actor);
    const nodes = await this.store.listNodes(actor.tenantId);
    if (parentId) {
      const parent = nodes.find((row) => row.id === parentId) ?? await this.store.getNode(parentId);
      if (!parent || parent.kind !== 'FOLDER' || parent.state !== 'ACTIVE' || !canSee(actor, parent, custodies, this.now())) throw libraryNotFound();
    }
    const recent = view === 'recent' ? await this.store.listRecent(actor.userId, actor.tenantId) : [];
    const recentAt = new Map(recent.map((row) => [row.nodeId, row.accessedAt]));
    let rows = nodes.filter((node) => {
      if (view === 'trash') return node.state === 'RECYCLED' && canManage(actor, node, custodies, this.now());
      if (!canSee(actor, node, custodies, this.now()) || node.state !== 'ACTIVE') return false;
      if (view === 'mine') return node.ownerUserId === actor.userId;
      if (view === 'shared') return node.scope === 'ENTERPRISE';
      if (view === 'managed') return matchingCustody(actor, node, custodies, this.now()) !== null;
      return recentAt.has(node.id);
    });
    const query = q?.trim().toLowerCase();
    if (!query && parentId) rows = rows.filter((node) => node.parentId === parentId);
    else if (!query && !flat && (view === 'mine' || view === 'shared' || view === 'managed')) rows = rows.filter((node) => this.isRootForView(node, nodes, actor, custodies, view));
    if (query) rows = rows.filter((node) => node.name.toLowerCase().includes(query));
    if (status !== 'all') {
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        const version = node.currentVersionId ? await this.store.getVersion(node.currentVersionId) : null;
        if (node.kind === 'FILE' && version?.parseStatus === ({ ready: 'READY', failed: 'FAILED', download: 'DOWNLOAD_ONLY' } as Record<string, string>)[status]) matched.push(node);
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
      if (flat && view === 'mine') item.parentPath = node.parentId ? await this.breadcrumb(actor, node.parentId, custodies) : [];
      items.push(item);
      if (actor.custodyId) await this.auditCustodyRead(actor, node);
    }
    const breadcrumb = parentId ? await this.breadcrumb(actor, parentId, custodies) : [];
    return { items, breadcrumb, total, page, pageSize: pageSize ?? total };
  }

  async createFolder(actor: Actor, name: string, parentId?: string | null) {
    this.requireMember(actor);
    return this.createOwnedFolder(actor, actor.userId, name, parentId);
  }

  /** Explicitly authorized platform creation keeps the real actor separate from the target owner. */
  async createOwnedFolder(actor: Actor, ownerUserId: string, name: string, parentId?: string | null, scope: LibraryScope = 'PRIVATE') {
    await this.assertCreation(actor, ownerUserId, scope);
    await this.sweep(actor.tenantId);
    if (parentId) await this.requireVisibleFolder(actor, parentId);
    const now = this.now();
    const node = { ...this.blankNode(actor, 'FOLDER', safeNodeName(name), parentId ?? null, now), ownerUserId, scope };
    await this.store.insertNode(node);
    await this.writeAudit(actor, 'library_folder', { nodeId: node.id });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async createLink(actor: Actor, name: string, url: string, parentId?: string | null) {
    this.requireMember(actor);
    await this.sweep(actor.tenantId);
    if (parentId) await this.requireVisibleFolder(actor, parentId);
    const now = this.now();
    const node = this.blankNode(actor, 'LINK', safeNodeName(name), parentId ?? null, now);
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
    await this.assertCreation(actor, ownerUserId, this.scopeOrThrow(input.scope, input.confirmShare));
    await this.sweep(actor.tenantId);
    const scope = this.scopeOrThrow(input.scope, input.confirmShare);
    if (input.parentId) await this.requireVisibleFolder(actor, input.parentId);
    const name = safeDisplayName(input.originalName);
    const ext = assertAllowedUpload(name, input.bytes, this.limits);
    await this.assertQuota(actor.tenantId, input.bytes.length);
    const now = this.now();
    const node = { ...this.blankNode(actor, 'FILE', name, input.parentId ?? null, now), ownerUserId };
    node.scope = scope;
    const prepared = await this.prepareVersion(actor, node, name, input.mimeType || 'application/octet-stream', input.bytes, ext, 1, now);
    node.currentVersionId = prepared.version.id;
    try {
      await this.store.commitNewFile({ node, version: prepared.version, chunks: prepared.chunks, tenantQuotaBytes: this.limits.tenantQuotaBytes });
    } catch (error) {
      await this.store.deleteBlob(prepared.version.storageKey);
      throw error;
    }
    await this.writeAudit(actor, 'library_upload', { nodeId: node.id, versionId: prepared.version.id, scope });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async replaceVersion(actor: Actor, nodeId: string, originalName: string, mimeType: string, bytes: Buffer) {
    const node = await this.requireManage(actor, nodeId);
    if (node.kind !== 'FILE' || node.state !== 'ACTIVE') throw new LibraryError(400, '只有使用中的文件可以替换版本', 'BAD_STATE');
    const name = safeDisplayName(originalName);
    const ext = assertAllowedUpload(name, bytes, this.limits);
    await this.assertQuota(actor.tenantId, bytes.length);
    const versions = await this.store.listVersions(node.id);
    const versionNo = versions.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1;
    const updatedAt = this.now();
    const prepared = await this.prepareVersion(actor, node, name, mimeType || 'application/octet-stream', bytes, ext, versionNo, updatedAt);
    try {
      await this.store.commitReplacement({
        tenantQuotaBytes: this.limits.tenantQuotaBytes,
        nodeId: node.id,
        version: prepared.version,
        chunks: prepared.chunks,
        updatedAt,
      });
    } catch (error) {
      await this.store.deleteBlob(prepared.version.storageKey);
      throw error;
    }
    node.currentVersionId = prepared.version.id;
    node.updatedAt = updatedAt;
    await this.writeAudit(actor, 'library_replace', { nodeId: node.id, versionId: prepared.version.id, versionNo });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async rename(actor: Actor, nodeId: string, name: string) {
    const node = await this.requireManage(actor, nodeId);
    node.name = safeNodeName(name);
    node.updatedAt = this.now();
    await this.store.updateNode(node.id, { name: node.name, updatedAt: node.updatedAt });
    await this.writeAudit(actor, 'library_rename', { nodeId: node.id });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async move(actor: Actor, nodeId: string, parentId: string | null) {
    const node = await this.requireManage(actor, nodeId);
    if (parentId) {
      const parent = await this.requireVisibleFolder(actor, parentId);
      if (parent.id === node.id || await this.isDescendant(node.id, parent.id)) {
        throw new LibraryError(400, '不能移动到自己的子目录', 'BAD_PARENT');
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

  async setScope(actor: Actor, nodeId: string, scope: LibraryScope, confirmShare?: boolean) {
    const node = await this.requireManage(actor, nodeId);
    if (scope === node.scope) return this.toItem(actor, node, await this.custodiesFor(actor), null);
    if (scope === 'ENTERPRISE' && confirmShare !== true) {
      throw new LibraryError(400, '变为企业共享需要明确确认', 'CONFIRM_SHARE');
    }
    node.scope = scope;
    node.updatedAt = this.now();
    await this.store.updateNode(node.id, { scope, updatedAt: node.updatedAt });
    await this.writeAudit(actor, 'library_share', { nodeId: node.id, scope });
    return this.toItem(actor, node, await this.custodiesFor(actor), null);
  }

  async recycle(actor: Actor, nodeId: string) {
    const node = await this.requireManage(actor, nodeId);
    // 已在回收站的子项不阻止父目录回收，恢复时再按父子顺序处理。
    await this.assertNoLiveChildren(actor.tenantId, node.id, { allowRecycled: true });
    node.state = 'RECYCLED';
    node.recycledAt = this.now();
    node.updatedAt = node.recycledAt;
    await this.store.updateNode(node.id, { state: 'RECYCLED', recycledAt: node.recycledAt, updatedAt: node.updatedAt });
    await this.writeAudit(actor, 'library_recycle', { nodeId: node.id });
    return { ok: true };
  }

  async restore(actor: Actor, nodeId: string) {
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

  async purge(actor: Actor, nodeId: string) {
    const node = await this.requireManage(actor, nodeId);
    if (node.state !== 'RECYCLED') {
      throw new LibraryError(400, '请先回收到回收站再彻底删除', 'BAD_STATE');
    }
    await this.assertNoLiveChildren(actor.tenantId, node.id);
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
    if (version.parseStatus === 'READY' || version.parseStatus === 'DOWNLOAD_ONLY') {
      return this.toItem(actor, node, await this.custodiesFor(actor), null);
    }
    const bytes = await this.store.getBlob(version.storageKey);
    if (!bytes) throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    const parsed = await parseLibraryBytes(version.originalName, bytes);
    await this.store.updateVersion(version.id, {
      parseStatus: parsed.status,
      parseReason: parsed.reason,
      extractTruncated: parsed.truncated,
    });
    await this.store.replaceChunks(version.id, version.tenantId, this.chunkRows(version, parsed.chunks));
    await this.writeAudit(actor, 'library_retry_parse', { nodeId: node.id, versionId: version.id, status: parsed.status });
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
    if (text) await this.touch(actor, opened.node);
    const ext = fileExtension(version.originalName);
    const mediaKind = ['.png','.jpg','.jpeg','.gif','.webp','.avif'].includes(ext) ? 'image' as const : ['.mp4','.webm','.mov'].includes(ext) ? 'video' as const : null;
    const page = chunks.some((chunk) => chunk.locatorKind === 'page');
    return {
      nodeId: opened.node.id,
      versionId: version.id,
      versionNo: version.versionNo,
      name: opened.node.name,
      previewKind: mediaKind ?? (version.parseStatus === 'READY' ? 'text' as const : 'download_only' as const),
      text: version.parseStatus === 'READY' ? text : null,
      linkUrl: null,
      truncated,
      truncationNote: truncated ? '预览只显示前 20000 个字符，可下载原文件查看全文。' : null,
      parseStatus: version.parseStatus,
      parseReason: version.parseReason,
      executable: false,
      preciseHighlight: page,
      highlightNote: page ? null : '没有可靠页码，只显示提取出的文字。',
    };
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
    if (!canKnow(actor, node, custodies, this.now())) throw libraryNotFound();
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

  async markUsed(actor: Actor, nodeId: string, versionId: string) {
    this.requireMember(actor);
    const opened = await this.openBytes(actor, nodeId, versionId, false);
    if (opened.blocked || !opened.version || opened.version.parseStatus !== 'READY') throw new LibraryError(409, '资料当前不能加入任务', 'BLOCKED');
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
      if (!version || !node || version.tenantId !== actor.tenantId || !canKnow(actor, node, custodies, this.now())) {
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

  private async assertCreation(actor: Actor, ownerUserId: string, scope: LibraryScope) {
    if (actor.activeMember && actor.userId === ownerUserId) return;
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

  private async assertNoLiveChildren(tenantId: string, nodeId: string, options: { allowRecycled?: boolean } = {}) {
    const nodes = await this.store.listNodes(tenantId);
    const blocking = options.allowRecycled ? ['ACTIVE'] : ['ACTIVE', 'RECYCLED'];
    if (nodes.some((node) => node.parentId === nodeId && blocking.includes(node.state))) {
      throw new LibraryError(400, '目录不为空', 'FOLDER_NONEMPTY');
    }
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
  ) {
    if (!node.parentId) return true;
    const parent = nodes.find((row) => row.id === node.parentId);
    if (!parent || parent.state !== 'ACTIVE' || !canSee(actor, parent, custodies, this.now())) return true;
    const inView = (row: NodeRecord) => row.state === 'ACTIVE' && canSee(actor, row, custodies, this.now())
      && (view === 'mine' ? row.ownerUserId === actor.userId : view === 'shared' ? row.scope === 'ENTERPRISE' : true);
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
