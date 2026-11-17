import { buildAskPrompt, sanitizeAnswer } from './library.ask';
import type { LibraryAuthService } from './library.auth';
import type { LibraryContext } from './library.context';
import { LibraryError, libraryNotFound } from './library.errors';
import { fileExtension } from './library.files';
import { citationExcerpt, openLibraryBytes, quotableInChat } from './library.items';
import { canSee } from './library.policy';
import type { Actor, ChunkRecord, VersionRecord } from './library.types';

export type ModelComplete = (input: {
  model?: string;
  messages: { role: 'system' | 'user'; content: string }[];
}) => Promise<{ ok: true; modelRef: string; text: string } | { ok: false; reason: string }>;

/** 问答与引用：RAG 引用摘录、一次性补全、精确版本读取、来源使用标记。 */
export class LibraryAskService {
  constructor(
    private readonly ctx: LibraryContext,
    private readonly auth: LibraryAuthService,
  ) {}

  rebind(ctx: LibraryContext, auth: LibraryAuthService): LibraryAskService {
    return new LibraryAskService(ctx, auth);
  }

  async openCitation(actor: Actor, nodeId: string, versionId: string, locator?: string | null, recordAccess = true) {
    const node = await this.ctx.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.auth.custodiesFor(actor);
    if (!quotableInChat(actor, { ...node, state: 'ACTIVE' })) throw libraryNotFound();
    if (node.state === 'PURGED') {
      throw new LibraryError(410, '来源已彻底删除，不能改指向其他文件或版本', 'SOURCE_GONE');
    }
    if (node.state === 'RECYCLED') {
      throw new LibraryError(409, '资料在回收站，已停止下载和检索', 'RECYCLED');
    }
    const version = await this.ctx.store.getVersion(versionId);
    if (!version || version.nodeId !== node.id || version.tenantId !== node.tenantId) throw libraryNotFound();
    const chunks = await this.ctx.store.listChunks(version.id);
    const excerpt = citationExcerpt(chunks, locator, this.ctx.limits.askMaxChars);
    await this.auth.auditCustodyRead(actor, node);
    if (recordAccess && excerpt.quote) await this.auth.touch(actor, node);
    const precise = excerpt.matched?.locatorKind === 'page' && excerpt.matched.locator === locator;
    return {
      nodeId: node.id,
      versionId: version.id,
      versionNo: version.versionNo,
      name: node.name,
      locator: excerpt.locator,
      locatorKind: excerpt.locatorKind,
      quote: excerpt.quote,
      truncated: version.extractTruncated || chunks.map(row => row.content).join('\n\n').length > this.ctx.limits.askMaxChars,
      truncationNote: version.extractTruncated || chunks.map(row => row.content).join('\n\n').length > this.ctx.limits.askMaxChars
        ? '仅使用部分摘录，未读取全文。' : null,
      preciseHighlight: precise,
      highlightNote: precise ? null : '没有可靠页码，只能定位到当时使用的段落摘录。',
      replacementVersionId: null,
    };
  }

  /** Server-selected exact version only. No ordinal/character prefilter; owning ACL is rechecked on every read. */
  async readRetrievalVersion(actor: Actor, nodeId: string, versionId: string) {
    const opened = await openLibraryBytes(this.ctx, this.auth, actor, nodeId, versionId, false);
    if (opened.blocked || !opened.version || opened.version.parseStatus !== 'READY' || opened.version.extractTruncated)
      throw new LibraryError(409, '来源未完整就绪', 'SOURCE_NOT_READY');
    const chunks = await this.ctx.store.listChunks(opened.version.id);
    await this.auth.auditCustodyRead(actor, opened.node);
    return {nodeId:opened.node.id,versionId:opened.version.id,tenantId:opened.node.tenantId,
      name:opened.node.name,contentHash:opened.version.sha256,chunks};
  }

  async markUsed(actor: Actor, nodeId: string, versionId: string) {
    this.auth.requireMember(actor);
    const opened = await openLibraryBytes(this.ctx, this.auth, actor, nodeId, versionId, false);
    if (!quotableInChat(actor, opened.node)) throw libraryNotFound();
    const ext = opened.version ? fileExtension(opened.version.originalName) : ''
    const chatImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) && opened.version?.parseStatus === 'DOWNLOAD_ONLY'
    if (opened.blocked || !opened.version || (opened.version.parseStatus !== 'READY' && !chatImage)) throw new LibraryError(409, '资料当前不能加入任务', 'BLOCKED');
    await this.auth.touch(actor, opened.node);
    return { ok: true };
  }

  async ask(
    actor: Actor,
    versionIds: string[],
    question: string,
    model: string | undefined,
    complete: ModelComplete,
  ) {
    this.auth.requireMember(actor);
    await this.auth.sweep(actor.tenantId);
    const custodies = await this.auth.custodiesFor(actor);
    const notices: string[] = [];
    let hidden = 0;
    const ready: { name: string; version: VersionRecord; chunks: ChunkRecord[] }[] = [];
    const seen = new Set<string>();
    for (const versionId of versionIds) {
      if (seen.has(versionId)) continue;
      seen.add(versionId);
      const version = await this.ctx.store.getVersion(versionId);
      const node = version ? await this.ctx.store.getNode(version.nodeId) : null;
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
      ready.push({ name: node.name, version, chunks: await this.ctx.store.listChunks(version.id) });
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
    const prompt = buildAskPrompt(question, ready, this.ctx.limits.askMaxChars);
    if (prompt.truncationNote) notices.push(prompt.truncationNote);
    const result = await complete({ model, messages: prompt.messages });
    await this.auth.writeAudit(actor, 'library_ask', {
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
      const node = await this.ctx.store.getNode(source.nodeId);
      if (node && canSee(actor, node, await this.auth.custodiesFor(actor), this.ctx.now())) await this.auth.touch(actor, node);
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

}
