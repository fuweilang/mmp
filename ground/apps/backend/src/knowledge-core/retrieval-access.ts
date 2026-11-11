import type { KnowledgeScope } from './types';
import type { UserQueryContext } from './query-plan';
/** Server-only contract. Task4 resolves session ownership, expert/release binding and current private-document ACL here.
 * Never build authorize from a DTO or tool's base/release/tenant IDs. It is called again before every content read. */
export interface KnowledgeAccess {
  actorUserId: string;
  tenantId: string | null;
  conversationId: string;
  turnId: string;
  expertId?: string;
  expertVersionId?: string;
  previewId?: string;
  authorize(): Promise<AuthorizedRelease[]>;
}
export interface AuthorizedRelease {
  releaseId: string;
  scope: KnowledgeScope;
  documentIds?: string[];
}
export interface KnowledgeRetrievalInput {
  query: string;
  context?: UserQueryContext[];
  mode?: 'optional' | 'required';
  embeddingProfileId?: string;
  rerankProfileId?: string;
  budgetTokens?: number;
  signal?: AbortSignal;
}
export interface KnowledgeSourceReference {
  knowledgeReleaseId: string;
  documentId: string;
  revisionId: string;
  indexRevisionId: string;
  chunkId: string;
}
