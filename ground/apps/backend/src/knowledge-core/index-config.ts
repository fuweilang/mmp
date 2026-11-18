import { createHash } from 'node:crypto';
import { KnowledgeCoreError } from './errors';
/** Versions are server selected. New code versions create a new immutable index identity. */
export const KNOWLEDGE_PARSER_VERSION = 'knowledge-parser-v9';
export const KNOWLEDGE_CHUNKER_VERSION = 'token-chunker-v5';
export const KNOWLEDGE_EMBEDDING_INPUT_VERSION = 'chapter-context-v1';
export interface KnowledgeIndexConfiguration {
  parseMode?: 'text' | 'ocr' | 'auto';
  ocrModelId?: string;
  ocrRouteHash?: string;
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
      (key) => !['parseMode', 'ocrModelId', 'ocrRouteHash', 'targetTokens', 'maxTokens', 'overlapTokens'].includes(key),
    )
  )
    throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
  if (input?.ocrModelId !== undefined && (typeof input.ocrModelId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.ocrModelId))) throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
  if (input?.ocrRouteHash !== undefined && (typeof input.ocrRouteHash !== 'string' || !/^[0-9a-f]{64}$/.test(input.ocrRouteHash))) throw new KnowledgeCoreError('INVALID_INDEX_CONFIGURATION');
  const parseMode = input?.parseMode ?? 'text';
  if (!['text', 'ocr', 'auto'].includes(parseMode))
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
    ...(parseMode !== 'text' ? { parseMode, ...(input?.ocrModelId ? {ocrModelId:input.ocrModelId} : {}), ...(input?.ocrRouteHash ? {ocrRouteHash:input.ocrRouteHash} : {}) } : {}),
    targetTokens,
    maxTokens,
    overlapTokens,
  };
  return {
    parserVersion: canonical.parserVersion,
    chunkerVersion: canonical.chunkerVersion,
    chunkerConfig: parseMode !== 'text' ? { parseMode, ...(input?.ocrModelId ? {ocrModelId:input.ocrModelId} : {}), ...(input?.ocrRouteHash ? {ocrRouteHash:input.ocrRouteHash} : {}), targetTokens, maxTokens, overlapTokens } : { targetTokens, maxTokens, overlapTokens },
    indexConfigHash: createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex'),
  };
}
