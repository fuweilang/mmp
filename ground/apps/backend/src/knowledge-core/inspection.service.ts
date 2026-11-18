import { KnowledgeOcrService, supportsKnowledgeOcr, isKnowledgeImage } from './vision-ocr';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertSuperAdmin } from '../auth/super-admin';
import { KnowledgeBlobStorage } from './storage';
import { KnowledgeCoreError } from './errors';
import { storedUploadedName } from '../common/uploaded-name';
import { KnowledgeCoreService } from './knowledge-core.service';
import { KnowledgeProfilesService } from './profiles.service';
import { createPreparationPreviewKey, prepareKnowledgeDocument } from './preparation';
import { normalizeKnowledgeIndexConfig, type KnowledgeIndexConfiguration } from './index-config';
/** Privileged preparation inspection, independent of sealed release membership. No public/static storage path. */
@Injectable()
export class KnowledgeInspectionService {
  constructor(private readonly db: PrismaService, private readonly blobs: KnowledgeBlobStorage, private readonly core?: KnowledgeCoreService, private readonly profiles?: KnowledgeProfilesService, private readonly ocr?: KnowledgeOcrService) { }
  private async revision(actorUserId: string, documentId: string, revisionId: string) {
    await assertSuperAdmin(this.db, actorUserId);
    const revision = await this.db.knowledgeDocumentRevision.findUnique({
      where: {
        id: revisionId
      }, include: {
        document: {
          include: {
            base: true
          }
        },
        indexes: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!revision || revision.documentId !== documentId)
      throw new KnowledgeCoreError('KNOWLEDGE_REVISION_NOT_FOUND');
    const document = revision.document;
    if (document.deletedAt)
      throw new KnowledgeCoreError('KNOWLEDGE_REVISION_NOT_FOUND');
    if (document.base.scope !== 'PLATFORM' || document.base.tenantId !== null)
      throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
    if (!document.enabled || !document.base.enabled)
      throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
    return revision;
  }
  private async index(actorUserId: string, documentId: string, revisionId: string, indexRevisionId: string) {
    await this.revision(actorUserId, documentId, revisionId);
    const index = await this.db.knowledgeIndexRevision.findUnique({
      where: {
        id: indexRevisionId
      }, include: {
        profile: {
          select: {
            enabled: true
          }
        }
      }
    });
    if (!index || index.revisionId !== revisionId)
      throw new KnowledgeCoreError('KNOWLEDGE_INDEX_NOT_FOUND');
    if (index.status !== 'READY' || !index.profile.enabled)
      throw new KnowledgeCoreError('KNOWLEDGE_INDEX_NOT_READY');
    return index;
  }
  async original(actorUserId: string, documentId: string, revisionId: string) {
    const revision = await this.revision(actorUserId, documentId, revisionId);
    const bytes = await this.blobs.read(revision.storageKey);
    await this.revision(actorUserId, documentId, revisionId);
    return {
      bytes, originalName: storedUploadedName(revision.originalName), contentHash: revision.contentHash, documentId, revisionId
    };
  }
  async chunks(actorUserId: string, documentId: string, revisionId: string, indexRevisionId: string, offset = 0, limit = 50) {
    const index = await this.index(actorUserId, documentId, revisionId, indexRevisionId);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new KnowledgeCoreError('INVALID_PREVIEW_PAGE');
    const chunks = await this.db.knowledgeChunk.findMany({
      where: {
        indexRevisionId
      }, orderBy: {
        ordinal: 'asc'
      }, skip: offset, take: limit
    });
    if (Buffer.byteLength(JSON.stringify(chunks), 'utf8') > 1024 * 1024)
      throw new KnowledgeCoreError('PREVIEW_RESPONSE_LIMIT');
    await this.index(actorUserId, documentId, revisionId, indexRevisionId);
    return {
      documentId, revisionId, indexRevisionId, offset, limit, totalChunks: index.chunkCount, nextOffset: offset + chunks.length < index.chunkCount ? offset + chunks.length : null, chunks
    };
  }
  /** Window of immutable canonical source text reconstructed from stored source ranges, with overlap removed.
   * Rendered chunk context (e.g. repeated table headers) remains available from the chunk endpoint. */
  async extracted(actorUserId: string, documentId: string, revisionId: string, indexRevisionId: string, offset = 0, limit = 10000) {
    await this.index(actorUserId, documentId, revisionId, indexRevisionId);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20000)
      throw new KnowledgeCoreError('INVALID_PREVIEW_PAGE');
    const aggregate = await this.db.knowledgeChunk.aggregate({
      where: {
        indexRevisionId
      }, _max: {
        sourceEnd: true
      }
    });
    const totalCharacters = aggregate._max.sourceEnd ?? 0, end = Math.min(totalCharacters, offset + limit);
    const rows = await this.db.knowledgeChunk.findMany({
      where: {
        indexRevisionId, sourceEnd: {
          gt: offset
        }, sourceStart: {
          lt: offset + limit
        }
      },
      select: {
        sourceText: true, sourceStart: true, sourceEnd: true
      }, orderBy: [{
        sourceStart: 'asc'
      }, {
        ordinal: 'asc'
      }], take: 1001
    });
    if (rows.length > 1000)
      throw new KnowledgeCoreError('PREVIEW_WINDOW_TOO_DENSE');
    const chars = Array<string>(Math.max(0, end - offset)).fill('');
    for (const row of rows)
      for (let position = Math.max(offset, row.sourceStart); position < Math.min(end, row.sourceEnd); position++)
        chars[position - offset] = row.sourceText[position - row.sourceStart];
    await this.index(actorUserId, documentId, revisionId, indexRevisionId);
    return {
      documentId, revisionId, indexRevisionId, kind: 'immutable_canonical_source', offset, limit, totalCharacters, nextOffset: end < totalCharacters ? end : null,
      text: chars.join(''), hasGaps: chars.some(character => character === '')
    };
  }
  private async previewProfile(revision: { id: string; document: { baseId: string; requestedIndexId?: string | null }; indexes: Array<{ id: string; profileId: string; chunkerConfig: unknown }> }) {
    if (!this.profiles || !this.core) throw new KnowledgeCoreError('KNOWLEDGE_INTERNAL_ERROR');
    const requested = revision.indexes.find(row => row.id === revision.document.requestedIndexId);
    const indexes = requested ? [requested, ...revision.indexes.filter(row => row.id !== requested.id)] : revision.indexes;
    for (const index of indexes) {
      try { return { profile: await this.profiles.resolveForRequest(index.profileId, 'EMBEDDING'), index }; }
      catch (error) { if (!(error instanceof KnowledgeCoreError)) throw error; }
    }
    const id = await this.core.defaultProfile(revision.document.baseId);
    return { profile: await this.profiles.resolveForRequest(id, 'EMBEDDING'), index: undefined };
  }
  private async checkPreparationAccess(actorUserId: string, documentId: string, revisionId: string, profileId: string) {
    await this.profiles!.resolveForRequest(profileId, 'EMBEDDING');
    await this.revision(actorUserId, documentId, revisionId);
  }
  async preparationContext(actorUserId: string, documentId: string, revisionId: string) {
    const revision = await this.revision(actorUserId, documentId, revisionId);
    const { profile, index } = await this.previewProfile(revision);
    const capacityTokens = Math.min(8192, profile.maxInputTokens);
    let normalized;
    try { normalized = normalizeKnowledgeIndexConfig(index?.chunkerConfig as KnowledgeIndexConfiguration | undefined, capacityTokens); }
    catch { normalized = normalizeKnowledgeIndexConfig(undefined, capacityTokens); }
    let ocrModelId: string | undefined, ocrRouteHash: string | undefined;
    if (supportsKnowledgeOcr(revision.originalName) && this.ocr) { try { const model = await this.ocr.resolveModel(); ocrModelId = model.id; ocrRouteHash = model.revision; } catch { /* unavailable capability */ } }
    const ocrAvailable = !!ocrModelId;
    await this.checkPreparationAccess(actorUserId, documentId, revisionId, profile.id);
    return {
      documentId, revisionId, profileId: profile.id,
      tokenizer: profile.tokenizer as 'cl100k_base' | 'o200k_base', capacityTokens,
      capabilities: { ocrAvailable },
      defaultConfig: { parseMode: (isKnowledgeImage(revision.originalName) ? 'ocr' : revision.parserFormat==='.pdf'?'auto':'text') as 'text' | 'ocr' | 'auto', ...normalized.chunkerConfig, ...(ocrModelId ? {ocrModelId,ocrRouteHash} : {}) },
    };
  }
  async preparationPreview(actorUserId: string, documentId: string, revisionId: string, input: { config?: KnowledgeIndexConfiguration; textPage?: number; chunkPage?: number }, signal?: AbortSignal) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
    const textPage = input.textPage ?? 1, chunkPage = input.chunkPage ?? 1;
    if (!Number.isSafeInteger(textPage) || textPage < 1 || textPage > 250 || !Number.isSafeInteger(chunkPage) || chunkPage < 1 || chunkPage > 1000)
      throw new KnowledgeCoreError('INVALID_PREVIEW_PAGE');
    const revision = await this.revision(actorUserId, documentId, revisionId);
    const { profile } = await this.previewProfile(revision);
    const capacityTokens = Math.min(8192, profile.maxInputTokens);
    normalizeKnowledgeIndexConfig(input.config, capacityTokens);
    const resolvedConfig = (input.config?.parseMode === 'ocr'||input.config?.parseMode === 'auto') || isKnowledgeImage(revision.originalName) || revision.parserFormat==='.pdf' ? await this.core!.resolveIndexConfiguration(revision.originalName, input.config) : input.config;
    const bytes = await this.blobs.read(revision.storageKey);
    // Do not start costly parsing if permissions changed while reading the blob.
    await this.checkPreparationAccess(actorUserId, documentId, revisionId, profile.id);
    const prepared = await prepareKnowledgeDocument({
      name: revision.originalName, bytes, ocrPreview:true,
      tokenizer: profile.tokenizer as 'cl100k_base' | 'o200k_base', maxInputTokens: profile.maxInputTokens, config: resolvedConfig, signal,
      ...(resolvedConfig?.parseMode !== 'text' && resolvedConfig?.ocrModelId && (resolvedConfig.parseMode==='ocr'||resolvedConfig.ocrRouteHash) ? {ocrRecognizer:(name:string,bytes:Buffer,signal?:AbortSignal)=>this.ocr!.recognize(name,bytes,resolvedConfig!.ocrModelId!,signal,resolvedConfig!.ocrRouteHash)} : {}),
    });
    const textPageSize = 4000, chunkPageSize = 10;
    const textPageCount = Math.max(1, Math.ceil(prepared.originalText.length / textPageSize));
    const chunkPageCount = Math.max(1, Math.ceil(prepared.chunks.length / chunkPageSize));
    if (textPage > textPageCount || chunkPage > chunkPageCount) throw new KnowledgeCoreError('INVALID_PREVIEW_PAGE');
    let start = (textPage - 1) * textPageSize, end = Math.min(prepared.originalText.length, textPage * textPageSize);
    if (start && /[\uDC00-\uDFFF]/.test(prepared.originalText[start])) start--;
    if (/[\uD800-\uDBFF]/.test(prepared.originalText[end - 1] ?? '')) end++;
    const response = {
      previewKey: createPreparationPreviewKey({ documentId, revisionId, contentHash: revision.contentHash, profileId: profile.id,
        tokenizer: profile.tokenizer as 'cl100k_base' | 'o200k_base', capacityTokens, config: prepared.resolvedConfig }),
      profileId: profile.id, parseStatus: prepared.parseStatus,
      ...(prepared.failureReason ? { failureReason: prepared.failureReason } : {}),
      ...(prepared.ocrSample?{ocrSample:prepared.ocrSample,backgroundReprocessAvailable:['READY','DOWNLOAD_ONLY'].includes(prepared.parseStatus)}:{}),
      readyForReprocess: !prepared.ocrSample && prepared.parseStatus === 'READY' && !prepared.truncated && prepared.chunks.length > 0,
      resolvedConfig: prepared.resolvedConfig, displayText: prepared.originalText.slice(start, end),
      totalOriginalChars: prepared.totalOriginalChars, textPage, textPageCount, displayTextTruncated: textPageCount > 1,
      displayChunks: prepared.chunks.slice((chunkPage - 1) * chunkPageSize, chunkPage * chunkPageSize).map(chunk => ({
        ordinal: chunk.ordinal, text: chunk.text, tokenCount: chunk.tokenCount, locator: chunk.locator, sourceStart: chunk.sourceStart, sourceEnd: chunk.sourceEnd,
      })),
      totalChunkCount: prepared.chunks.length, totalChunkTokens: prepared.totalChunkTokens,
      chunkPage, chunkPageCount, displayChunkTruncated: chunkPageCount > 1,
      ...(prepared.whyPartial ? { whyPartial: prepared.whyPartial } : {}),
    };
    if (Buffer.byteLength(JSON.stringify(response), 'utf8') > 1024 * 1024) throw new KnowledgeCoreError('PREVIEW_RESPONSE_LIMIT');
    await this.checkPreparationAccess(actorUserId, documentId, revisionId, profile.id);
    if (resolvedConfig?.parseMode === 'ocr'||prepared.usedOcr) await this.ocr!.assertRoute(resolvedConfig!.ocrModelId!,resolvedConfig!.ocrRouteHash);
    return response;
  }
}
