import type { RetrievalEvidence } from './types';
export interface CandidateDiagnostic {
  chunkId: string;
  documentId: string;
  revisionId: string;
  indexRevisionId: string;
  knowledgeReleaseId: string;
  sourceTitle?: string;
  snippet: string;
  locator: RetrievalEvidence['locator'];
  routeRanks: {
    route: 'dense' | 'lexical';
    profileId?: string;
    queryIndex: number;
    rank: number;
    score: number;
  }[];
  denseRank?: number;
  lexicalRank?: number;
  fusionRank?: number;
  fusionScore?: number;
  rerankRank?: number;
  rerankScore?: number;
  finalRank?: number;
  retained: boolean;
  reason: 'RETAINED' | 'BUDGET' | 'DUPLICATE_CONTENT' | 'DIVERSITY_LIMIT' | 'FINAL_LIMIT' | 'ADJACENCY_REPLACED' | 'FUSION_LIMIT' | 'ROUTE_LIMIT';
}
/** Ephemeral admin-only payload: max100 candidates, max240 UTF-16 snippet units, max15 route ranks each. */
export interface RetrievalDiagnostics {
  policy: {
    dense: 40;
    lexical: 30;
    merged: 20;
    final: 6;
    maxProfiles: 4;
    maxQueries: 3;
    maxRawRows: 570;
    maxDiagnosticCandidates: 100;
  };
  counts: Record<string, number>;
  timings: Record<string, number>;
  candidates: CandidateDiagnostic[];
  truncated: boolean;
}
export function newRetrievalDiagnostics(): RetrievalDiagnostics {
  return {
    policy: {
      dense: 40, lexical: 30, merged: 20, final: 6, maxProfiles: 4, maxQueries: 3, maxRawRows: 570, maxDiagnosticCandidates: 100
    }, counts: {}, timings: {}, candidates: [], truncated: false
  };
}
