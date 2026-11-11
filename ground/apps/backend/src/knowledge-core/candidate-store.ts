import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeScope, RetrievalEvidence } from './types';
import { lexicalTerms } from './query-plan';
import { storedUploadedName } from '../common/uploaded-name';
export interface Candidate extends RetrievalEvidence {
  ordinal: number;
  score: number;
  sourceStart: number;
  sourceEnd: number;
}
export interface CandidateScope {
  releaseId: string;
  scope: KnowledgeScope;
  indexIds: string[];
}
/** Whole authorized corpus ranking. Release boundaries never become relevance voters or prefix filters. */
@Injectable()
export class KnowledgeCandidateStore {
  constructor(private readonly db: PrismaService) { }
  private async read(scopes: CandidateScope[], predicate: Prisma.Sql, score: Prisma.Sql, limit: number): Promise<Candidate[]> {
    const allowed = scopes.filter(scope => scope.indexIds.length);
    if (!allowed.length)
      return [];
    const authorization = allowed.map(scope => Prisma.sql`(
      r.id=${scope.releaseId} AND i.id IN (${Prisma.join(scope.indexIds)}) AND b.scope=${scope.scope.type}
      AND b.tenant_id IS NOT DISTINCT FROM ${scope.scope.type === 'TENANT' ? scope.scope.tenantId : null})`);
    const rows = await this.db.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON (c.id) c.id AS "chunkId", c.index_revision_id AS "indexRevisionId", i.revision_id AS "revisionId",
          d.id AS "documentId", r.id AS "knowledgeReleaseId", c.text, c.locator, d.title AS "sourceTitle",
          c.content_hash AS "contentHash", c.token_count AS "tokenCount", c.ordinal,
          c.source_start AS "sourceStart", c.source_end AS "sourceEnd", b.scope AS "scopeType", b.tenant_id AS "tenantId", ${score} AS score
        FROM kc_chunk c JOIN kc_index_revision i ON i.id=c.index_revision_id
        JOIN kc_document_revision v ON v.id=i.revision_id JOIN kc_document d ON d.id=v.document_id
        JOIN kc_base b ON b.id=d.base_id JOIN kc_profile p ON p.id=i.profile_id
        JOIN kc_release_item ri ON ri.index_revision_id=i.id JOIN kc_release r ON r.id=ri.release_id
        LEFT JOIN kc_embedding e ON e.chunk_id=c.id
        WHERE (${Prisma.join(authorization, ' OR ')}) AND r.sealed=true AND r.base_id=b.id
          AND b.enabled=true AND d.enabled=true AND p.enabled=true AND i.status='READY' AND ${predicate}
        ORDER BY c.id, r.id
      ) authorized ORDER BY score DESC, "chunkId" ASC LIMIT ${limit}`);
    return rows.map(({ scopeType, tenantId, ...row }) => ({
      ...row, sourceTitle: typeof row.sourceTitle === 'string' ? storedUploadedName(row.sourceTitle) : row.sourceTitle, scope: scopeType === 'TENANT' ? {
        type: 'TENANT', tenantId
      } : {
        type: 'PLATFORM'
      }, score: Number(row.score),
    }));
  }
  dense(scopes: CandidateScope[] | CandidateScope, vector: number[]) {
    const encoded = `[${vector.join(',')}]`;
    return this.read(Array.isArray(scopes) ? scopes : [scopes], Prisma.sql`e.dimension=${vector.length}`, Prisma.sql`1 - (e.vector <=> ${encoded}::vector)`, 40);
  }
  lexical(scopes: CandidateScope[] | CandidateScope, query: string) {
    const terms = lexicalTerms(query);
    if (!terms.length)
      return Promise.resolve([]);
    const matches = Prisma.sql`SELECT COALESCE(SUM(length(term)),0) FROM unnest(ARRAY[${Prisma.join(terms)}]::text[]) term WHERE position(term IN lower(c.text))>0`;
    const score = Prisma.sql`(CASE WHEN position(${query.toLowerCase()} IN lower(c.text))>0 THEN 1000 ELSE 0 END) + (${matches})`;
    return this.read(Array.isArray(scopes) ? scopes : [scopes], Prisma.sql`(${matches})>0`, score, 30);
  }
  exact(scope: CandidateScope, chunkId: string) { return this.read([scope], Prisma.sql`c.id=${chunkId}`, Prisma.sql`0`, 1); }
  neighbors(scope: CandidateScope, indexId: string, ordinal: number) {
    return this.read([scope], Prisma.sql`c.index_revision_id=${indexId} AND c.ordinal IN (${ordinal - 2},${ordinal - 1},${ordinal + 1},${ordinal + 2})`, Prisma.sql`-abs(c.ordinal - ${ordinal})`, 4);
  }
}
