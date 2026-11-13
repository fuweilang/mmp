import type { LibraryContext } from './library.context';
import { FILE_PURGE_BLOCKED_REASON, LibraryError, libraryNotFound } from './library.errors';
import { canKnow, canManage, canSee } from './library.policy';
import type {
  Actor,
  CustodyRecord,
  LibraryItem,
  NodeRecord,
  VersionBrief,
  VersionRecord,
} from './library.types';

export const LIBRARY_FILE_TYPE_BY_MIME: Record<string, string> = {
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

/** Chat opens a version without a locator, so the excerpt keeps every stored paragraph inside the existing character budget. */
export function joinedExcerpt(
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
export function citationExcerpt(
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

export const SEARCH_HITS = 8;
export const SEARCH_FILES = 200;
export const SEARCH_SNIPPET = 400;
export const VIEWABLE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** 对话检索只看本人私人资料和已对企业共享、且可供引用的当前版本。企业管理员和平台管理身份不扩大这个范围。 */
export function quotableInChat(actor: Actor, node: NodeRecord): boolean {
  if (!actor.activeMember || node.tenantId !== actor.tenantId || node.state !== 'ACTIVE' || node.kind !== 'FILE') return false;
  if (node.scope === 'PRIVATE') return node.ownerUserId === actor.userId;
  return node.scope === 'ENTERPRISE';
}

export function excerptAround(content: string, needle: string): string {
  const at = content.toLowerCase().indexOf(needle);
  const start = at < 0 ? 0 : Math.max(0, at - 80);
  return content.slice(start, start + SEARCH_SNIPPET);
}

/** 一个版本对外的稳定摘要；资料库各读路径共用同一字段集合。 */
export function versionBrief(row: VersionRecord): VersionBrief {
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

export async function versionStatus(ctx: LibraryContext, node: NodeRecord): Promise<string | null> {
  if (node.kind !== 'FILE' || !node.currentVersionId) return null;
  const version = await ctx.store.getVersion(node.currentVersionId);
  return version?.parseStatus ?? null;
}

/**
 * 打开一个节点/版本的读取句柄。预览、下载、精确版本读取、来源使用标记共用同一套
 * 可见性判断（canKnow）与状态错误码。
 */
export async function openLibraryBytes(
  ctx: LibraryContext,
  auth: { custodiesFor(actor: Actor): Promise<CustodyRecord[]> },
  actor: Actor,
  nodeId: string,
  versionId: string | null | undefined,
  forDownload: boolean,
) {
  const node = await ctx.store.getNode(nodeId);
  if (!node) throw libraryNotFound();
  const custodies = await auth.custodiesFor(actor);
  if (!canKnow(actor, node, custodies, ctx.now())) throw libraryNotFound();
  if (node.state === 'PURGED') {
    throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
  }
  if (node.state === 'RECYCLED') {
    return { node, version: null, blocked: '资料在回收站，已停止下载和检索' };
  }
  if (node.kind === 'LINK') return { node, version: null, blocked: forDownload ? '链接没有文件' : null };
  if (node.kind === 'FOLDER') throw new LibraryError(400, '文件夹没有文件正文', 'BAD_STATE');
  const version = await ctx.store.getVersion(versionId || node.currentVersionId || '');
  if (!version || version.nodeId !== node.id) throw libraryNotFound();
  return { node, version, blocked: null as string | null };
}

export async function toLibraryItem(
  ctx: LibraryContext,
  actor: Actor,
  node: NodeRecord,
  custodies: CustodyRecord[],
  accessedAt: number | null,
): Promise<LibraryItem> {
  let parentName: string | null = null;
  let parentHidden = false;
  let parentId: string | null = node.parentId;
  if (node.parentId) {
    const parent = await ctx.store.getNode(node.parentId);
    if (!parent || !canSee(actor, parent, custodies, ctx.now())) {
      parentName = null;
      parentHidden = true;
      parentId = null;
    } else parentName = parent.name;
  }
  const version = node.currentVersionId ? await ctx.store.getVersion(node.currentVersionId) : null;
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    scope: node.scope,
    state: node.state,
    ownerUserId: node.ownerUserId,
    ownerName: await ctx.store.userName(node.ownerUserId),
    parentId,
    parentName,
    parentHidden,
    linkUrl: node.kind === 'LINK' && node.state === 'ACTIVE' ? node.linkUrl : null,
    mine: node.ownerUserId === actor.userId,
    canManage: canManage(actor, node, custodies, ctx.now()),
    purgeBlockedReason: node.kind === 'FILE' ? FILE_PURGE_BLOCKED_REASON : null,
    currentVersion: version ? versionBrief(version) : null,
    createdAt: new Date(node.createdAt).toISOString(),
    updatedAt: new Date(node.updatedAt).toISOString(),
    recycledAt: node.recycledAt ? new Date(node.recycledAt).toISOString() : null,
    accessedAt: accessedAt ? new Date(accessedAt).toISOString() : null,
  };
}
