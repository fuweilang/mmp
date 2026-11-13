import { createHash } from 'crypto';
import type { LibraryAuthService } from './library.auth';
import type { LibraryContext } from './library.context';
import { LibraryError, libraryNotFound } from './library.errors';
import { assertMediaType, fileExtension, storageKeyFor } from './library.files';
import { openLibraryBytes, toLibraryItem } from './library.items';
import { listZipEntries, parseLibraryBytes } from './library.parse';
import type { Actor, ChunkRecord, NodeRecord, VersionRecord } from './library.types';

/** 媒体与解析：打开字节、预览、下载、准备版本、重新解析。 */
export class LibraryMediaService {
  constructor(
    private readonly ctx: LibraryContext,
    private readonly auth: LibraryAuthService,
  ) {}

  rebind(ctx: LibraryContext, auth: LibraryAuthService): LibraryMediaService {
    return new LibraryMediaService(ctx, auth);
  }

  async preview(actor: Actor, nodeId: string, versionId?: string | null) {
    const opened = await openLibraryBytes(this.ctx, this.auth, actor, nodeId, versionId, false);
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
    await this.auth.auditCustodyRead(actor, opened.node);
    if (opened.node.kind === 'LINK') {
      await this.auth.touch(actor, opened.node);
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
    const chunks = version.parseStatus === 'READY' ? await this.ctx.store.listChunks(version.id) : [];
    const fullText = chunks.map((chunk) => chunk.content).join('\n');
    const truncated = fullText.length > 20_000 || version.extractTruncated;
    const text = fullText.slice(0, 20_000);
    const ext = fileExtension(version.originalName);
    const mediaKind = ['.png','.jpg','.jpeg','.gif','.webp','.avif'].includes(ext) ? 'image' as const : ['.mp4','.webm','.mov'].includes(ext) ? 'video' as const : null;
    const page = chunks.some((chunk) => chunk.locatorKind === 'page');
    const entries = ext === '.zip' ? await this.zipPreviewEntries(version.storageKey) : undefined;
    if (text || entries) await this.auth.touch(actor, opened.node);
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
    const bytes = await this.ctx.store.getBlob(storageKey);
    if (!bytes) return [] as { name: string; size: number }[];
    try {
      return (await listZipEntries(bytes)).entries;
    } catch {
      return [] as { name: string; size: number }[];
    }
  }

  async download(actor: Actor, nodeId: string, versionId?: string | null, inline = false) {
    const opened = await openLibraryBytes(this.ctx, this.auth, actor, nodeId, versionId, true);
    if (opened.blocked || !opened.version) throw new LibraryError(409, opened.blocked || '不能下载', 'BLOCKED');
    const bytes = await this.ctx.store.getBlob(opened.version.storageKey);
    if (!bytes) throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    const mediaType = inline ? assertMediaType(opened.version.originalName, bytes) : null;
    if (inline && !mediaType) throw new LibraryError(400, '此类型不允许内嵌预览，请下载原文件', 'BAD_TYPE');
    await this.auth.auditCustodyRead(actor, opened.node);
    await this.auth.touch(actor, opened.node);
    return {
      filename: opened.version.originalName,
      bytes,
      contentType: mediaType ?? 'application/octet-stream',
    };
  }

  async prepareVersion(
    actor: Actor,
    node: NodeRecord,
    name: string,
    mimeType: string,
    bytes: Buffer,
    ext: string,
    versionNo: number,
    now: number,
  ) {
    const versionId = this.ctx.store.createId();
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
    await this.ctx.store.putBlob(storageKey, bytes);
    return { version, chunks: this.chunkRows(version, parsed.chunks) };
  }

  chunkRows(version: VersionRecord, chunks: { ordinal: number; content: string; locator: string; locatorKind: 'paragraph' | 'page' }[]): ChunkRecord[] {
    return chunks.map((chunk) => ({
      id: this.ctx.store.createId(),
      versionId: version.id,
      tenantId: version.tenantId,
      ordinal: chunk.ordinal,
      content: chunk.content,
      locator: chunk.locator,
      locatorKind: chunk.locatorKind,
    }));
  }

  async retryParse(actor: Actor, nodeId: string) {
    const node = await this.auth.requireManage(actor, nodeId);
    if (node.kind !== 'FILE' || !node.currentVersionId || node.state !== 'ACTIVE') {
      throw new LibraryError(400, '当前文件不能重新解析', 'BAD_STATE');
    }
    const version = await this.ctx.store.getVersion(node.currentVersionId);
    if (!version) throw libraryNotFound();
    // A successful extraction is part of this immutable citation version.
    // Retrying it must not silently remap old paragraph/page locators.
    // Download-only versions have no chunks, so a later parser may read them.
    if (version.parseStatus === 'READY') {
      return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
    }
    const bytes = await this.ctx.store.getBlob(version.storageKey);
    if (!bytes) throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    const parsed = await parseLibraryBytes(version.originalName, bytes);
    await this.ctx.store.commitParseResult({
      tenantId: actor.tenantId,
      nodeId: node.id,
      versionId: version.id,
      parseStatus: parsed.status,
      parseReason: parsed.reason,
      extractTruncated: parsed.truncated,
      chunks: this.chunkRows(version, parsed.chunks),
      audit: {
        id: this.ctx.store.createId(), tenantId: actor.tenantId, userId: actor.userId,
        action: 'library_retry_parse',
        meta: { nodeId: node.id, versionId: version.id, status: parsed.status },
        createdAt: this.ctx.now(),
      },
    });
    return toLibraryItem(this.ctx, actor, node, await this.auth.custodiesFor(actor), null);
  }
}
