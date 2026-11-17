import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertSuperAdmin } from '../auth/super-admin';
import { KnowledgeBlobStorage } from './storage';
import { KnowledgeCoreError } from './errors';
import { storedUploadedName } from '../common/uploaded-name';
/** Privileged preparation inspection, independent of sealed release membership. No public/static storage path. */
@Injectable()
export class KnowledgeInspectionService {
  constructor(private readonly db: PrismaService, private readonly blobs: KnowledgeBlobStorage) { }
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
        }
      }
    });
    if (!revision || revision.documentId !== documentId)
      throw new KnowledgeCoreError('KNOWLEDGE_REVISION_NOT_FOUND');
    const document = revision.document;
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
}
