import { Injectable } from '@nestjs/common';
import type { KnowledgeProfile } from '@prisma/client';
import { KnowledgeProfilesService } from './profiles.service';
import { KnowledgeCoreError, safeKnowledgeError } from './errors';
import { createTokenCounter, countTokens } from './tokenizer';
import type { TokenCounter } from './types';
export interface ProviderCallOptions {
  signal?: AbortSignal;
  operationId?: string;
}
export interface EmbeddingBatchResult {
  vectors: number[][];
  actualTokens: number | null;
  estimatedTokens: number;
}
export interface RerankBatchResult {
  inputCount: number;
  results: { index: number; score: number }[];
  actualTokens: number | null;
  estimatedTokens: number;
}
const counters = new Map<string, TokenCounter>();
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
function counterFor(name: string) {
  let value = counters.get(name);
  if (!value) {
    if (name !== 'cl100k_base' && name !== 'o200k_base')
      throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    value = createTokenCounter(name);
    counters.set(name, value);
  }
  return value;
}
export function validateEmbeddingVector(
  value: unknown,
  dimension: number,
): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== dimension ||
    value.some(
      (x) =>
        typeof x !== 'number' ||
        !Number.isFinite(x) ||
        Math.abs(x) > 3.4028234663852886e38,
    ) ||
    !value.some((x) => Math.fround(x) !== 0)
  )
    throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
  return value;
}
function actualUsage(body: any): number | null {
  const n = body?.usage?.total_tokens;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
@Injectable()
export class KnowledgeHttpAdapter {
  constructor(private readonly profiles: KnowledgeProfilesService) {}
  private measure(texts: readonly string[], profile: KnowledgeProfile): number {
    if (
      !texts.length ||
      texts.length > 10000 ||
      texts.some((t) => typeof t !== 'string' || !t.trim())
    )
      throw new KnowledgeCoreError('INVALID_PROVIDER_INPUT');
    const counter = counterFor(profile.tokenizer);
    let sum = 0;
    for (const text of texts) {
      if (Buffer.byteLength(text) > MAX_REQUEST_BYTES)
        throw new KnowledgeCoreError('INPUT_BYTE_LIMIT');
      const n = countTokens(text, counter);
      if (n > profile.maxInputTokens)
        throw new KnowledgeCoreError('INPUT_TOKEN_LIMIT');
      sum += n;
    }
    return sum;
  }
  private async request(
    profile: KnowledgeProfile & { apiKey: string },
    payload: unknown,
    options: ProviderCallOptions,
  ): Promise<any> {
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES)
      throw new KnowledgeCoreError('INPUT_BYTE_LIMIT');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, profile.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    try {
      if (signal.aborted) throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
      const response = await fetch(profile.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${profile.apiKey}`,
          'content-type': 'application/json',
        },
        body,
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new KnowledgeCoreError(
          response.status === 429 || response.status >= 500
            ? 'UPSTREAM_UNAVAILABLE'
            : 'UPSTREAM_REJECTED',
          response.status === 429 || response.status >= 500,
        );
      }
      const declared = Number(response.headers.get('content-length'));
      if (declared > profile.maxResponseBytes) {
        await response.body?.cancel();
        throw new KnowledgeCoreError('UPSTREAM_RESPONSE_TOO_LARGE');
      }
      if (!response.body)
        throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
      const reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let used = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          used += value.byteLength;
          if (used > profile.maxResponseBytes) {
            await reader.cancel();
            throw new KnowledgeCoreError('UPSTREAM_RESPONSE_TOO_LARGE');
          }
          parts.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
      }
    } catch (error) {
      if (timedOut) throw new KnowledgeCoreError('UPSTREAM_TIMEOUT', true);
      if (options.signal?.aborted)
        throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
      if (error instanceof KnowledgeCoreError) throw error;
      throw new KnowledgeCoreError('UPSTREAM_NETWORK_ERROR', true);
    } finally {
      clearTimeout(timeout);
    }
  }
  async embed(
    id: string,
    texts: string[],
    options: ProviderCallOptions = {},
  ): Promise<EmbeddingBatchResult> {
    const initial = await this.profiles.resolveForRequest(id, 'EMBEDDING');
    const estimatedTokens = this.measure(texts, initial);
    const vectors: number[][] = [];
    let total = 0,
      allActual = true;
    for (let offset = 0; offset < texts.length; offset += initial.batchSize) {
      // Recheck explicit disable / credentials during long batches; never substitute a profile.
      const profile = await this.profiles.resolveForRequest(id, 'EMBEDDING'),
        batch = texts.slice(offset, offset + profile.batchSize),
        estimated = this.measure(batch, profile);
      try {
        const result = await this.request(
          profile,
          {
            model: profile.model,
            input: batch,
            encoding_format: 'float',
            dimensions: profile.dimension,
          },
          options,
        );
        if (!Array.isArray(result?.data) || result.data.length !== batch.length)
          throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
        const mapped = new Map<number, number[]>();
        for (const item of result.data) {
          if (
            !Number.isInteger(item?.index) ||
            item.index < 0 ||
            item.index >= batch.length ||
            mapped.has(item.index)
          )
            throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
          mapped.set(
            item.index,
            validateEmbeddingVector(item.embedding, profile.dimension!),
          );
        }
        for (let i = 0; i < batch.length; i++) vectors.push(mapped.get(i)!);
        const actual = actualUsage(result);
        if (actual === null) allActual = false;
        else total += actual;
        await this.profiles.recordUsage({
          profileId: id,
          operationId: options.operationId,
          task: 'EMBEDDING',
          inputCount: batch.length,
          estimatedTokens: estimated,
          actualTokens: actual,
          status: 'SUCCEEDED',
        });
      } catch (error) {
        const safe = safeKnowledgeError(error);
        await this.profiles.recordUsage({
          profileId: id,
          operationId: options.operationId,
          task: 'EMBEDDING',
          inputCount: batch.length,
          estimatedTokens: estimated,
          actualTokens: null,
          status: 'FAILED',
          errorCode: safe.code,
        });
        throw safe;
      }
    }
    return { vectors, estimatedTokens, actualTokens: allActual ? total : null };
  }
  async rerank(
    id: string,
    query: string,
    texts: string[],
    topN: number,
    options: ProviderCallOptions = {},
  ): Promise<RerankBatchResult> {
    const profile = await this.profiles.resolveForRequest(id, 'RERANK');
    if (
      !Number.isInteger(topN) ||
      topN < 1 ||
      topN > texts.length
    )
      throw new KnowledgeCoreError('INVALID_PROVIDER_INPUT');
    // Input is globally RRF ordered. Rerank one bounded prefix, never compare scores across batches.
    texts = texts.slice(0, profile.batchSize);
    topN = Math.min(topN, texts.length);
    const estimatedTokens = this.measure([query, ...texts], profile);
    try {
      const body = await this.request(
        profile,
        {
          model: profile.model,
          query,
          documents: texts,
          top_n: topN,
          return_documents: false,
        },
        options,
      );
      if (
        !Array.isArray(body?.results) ||
        body.results.length > topN ||
        !body.results.length
      )
        throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
      const indices = new Set<number>();
      const results: { index: number; score: number }[] = [];
      for (const item of body.results) {
        if (
          !Number.isInteger(item?.index) ||
          item.index < 0 ||
          item.index >= texts.length ||
          indices.has(item.index) ||
          typeof item.relevance_score !== 'number' ||
          !Number.isFinite(item.relevance_score)
        )
          throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
        indices.add(item.index);
        results.push({ index: item.index, score: item.relevance_score });
      }
      const actualTokens = actualUsage(body);
      await this.profiles.recordUsage({
        profileId: id,
        operationId: options.operationId,
        task: 'RERANK',
        inputCount: texts.length,
        estimatedTokens,
        actualTokens,
        status: 'SUCCEEDED',
      });
      return { results, actualTokens, estimatedTokens, inputCount: texts.length };
    } catch (error) {
      const safe = safeKnowledgeError(error);
      await this.profiles.recordUsage({
        profileId: id,
        operationId: options.operationId,
        task: 'RERANK',
        inputCount: texts.length,
        estimatedTokens,
        actualTokens: null,
        status: 'FAILED',
        errorCode: safe.code,
      });
      throw safe;
    }
  }
}
