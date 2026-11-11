import { createHash } from 'node:crypto';
import { KnowledgeCoreError } from './errors';
/** Versions are server selected. New code versions create a new immutable index identity. */
export const KNOWLEDGE_PARSER_VERSION = 'knowledge-parser-v4';
export const KNOWLEDGE_CHUNKER_VERSION = 'token-chunker-v2';
export const KNOWLEDGE_EMBEDDING_INPUT_VERSION = 'chapter-context-v1';
export interface KnowledgeIndexConfiguration {
  targetTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
}
export function normalizeKnowledgeIndexConfig(
  input: KnowledgeIndexConfiguration | undefined,
  maxInputTokens: number,
) {
  if (
    input !== undefined &&
    (!input || typeof input !== 'object' || Array.isArray(input))
  )
    throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
  if (
    input &&
    Object.keys(input).some(
      (key) => !['targetTokens', 'maxTokens', 'overlapTokens'].includes(key),
    )
  )
    throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
  const maxTokens = input?.maxTokens ?? Math.min(900, maxInputTokens),
    targetTokens = input?.targetTokens ?? Math.min(600, maxTokens),
    overlapTokens = input?.overlapTokens ?? Math.min(80, targetTokens - 1);
  if (
    [targetTokens, maxTokens, overlapTokens].some(
      (n) => !Number.isSafeInteger(n),
    ) ||
    targetTokens < 1 ||
    maxTokens < targetTokens ||
    maxTokens > maxInputTokens ||
    overlapTokens < 0 ||
    overlapTokens >= targetTokens
  )
    throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
  const canonical = {
    parserVersion: KNOWLEDGE_PARSER_VERSION,
    chunkerVersion: KNOWLEDGE_CHUNKER_VERSION,
    embeddingInputVersion: KNOWLEDGE_EMBEDDING_INPUT_VERSION,
    targetTokens,
    maxTokens,
    overlapTokens,
  };
  return {
    parserVersion: canonical.parserVersion,
    chunkerVersion: canonical.chunkerVersion,
    chunkerConfig: { targetTokens, maxTokens, overlapTokens },
    indexConfigHash: createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex'),
  };
}
