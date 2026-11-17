export type KnowledgeScope = { type: 'PLATFORM' } | { type: 'TENANT'; tenantId: string };

/** Locators refer to the original immutable document. Offsets use UTF-16 code units. */
export interface SourceLocator {
  sectionId?: string;
  page?: number;
  paragraph?: number;
  rowStart?: number;
  rowEnd?: number;
  headingPath?: string[];
}

export interface TextSection {
  text: string;
  locator: SourceLocator;
  sourceOffset?: number;
  /** Paragraph starts within grouped Markdown text, in UTF-16 code units. */
  paragraphOffsets?: { offset: number; paragraph: number }[];
  headingPath?: string[];
  /** Separate original table header; text contains data rows with newline delimiters. */
  tableHeader?: string;
}

export interface KnowledgeChunkInput {
  ordinal: number;
  text: string;
  sourceText: string;
  tokenCount: number;
  tokenizer: string;
  contentHash: string;
  sourceStart: number;
  sourceEnd: number;
  locator: SourceLocator;
}

export interface TokenCounter {
  encoding: string;
  count(text: string): number;
}

export interface ChunkingOptions {
  targetTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
  tokenCounter?: TokenCounter;
}

export interface RetrievalEvidence {
  chunkId: string;
  documentId: string;
  revisionId: string;
  indexRevisionId: string;
  knowledgeReleaseId: string;
  text: string;
  locator: SourceLocator;
  sourceTitle?: string;
  scope?: KnowledgeScope;
  contentHash?: string;
  tokenCount?: number;
}

export type RetrievalStatus = 'READY' | 'NO_EVIDENCE' | 'NOT_CONFIGURED' | 'NOT_READY'
  | 'FORBIDDEN' | 'FAILED' | 'CANCELLED';

export interface RetrievalResult {
  retrievalId: string;
  status: RetrievalStatus;
  queries: string[];
  evidence: RetrievalEvidence[];
  /** Safe internal codes only, never raw upstream error messages. */
  degradation: string[];
  timings: Record<string, number>;
}

export interface CitedEvidence extends RetrievalEvidence { citation: number }
export interface EvidenceContext {
  context: string;
  evidence: CitedEvidence[];
  tokenCount: number;
  tokenizer: string;
  truncated: boolean;
}
