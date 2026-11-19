var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { Injectable } from '@nestjs/common';
import { KnowledgeCoreError, safeKnowledgeError } from './errors';
import { createTokenCounter, countTokens } from './tokenizer';
const counters = new Map();
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
function counterFor(name) {
    let value = counters.get(name);
    if (!value) {
        if (name !== 'cl100k_base' && name !== 'o200k_base')
            throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
        value = createTokenCounter(name);
        counters.set(name, value);
    }
    return value;
}
export function validateEmbeddingVector(value, dimension) {
    if (!Array.isArray(value) ||
        value.length !== dimension ||
        value.some((x) => typeof x !== 'number' ||
            !Number.isFinite(x) ||
            Math.abs(x) > 3.4028234663852886e38) ||
        !value.some((x) => Math.fround(x) !== 0))
        throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
    return value;
}
function actualUsage(body) {
    const n = body?.usage?.total_tokens;
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
let KnowledgeHttpAdapter = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var KnowledgeHttpAdapter = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            KnowledgeHttpAdapter = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        profiles;
        constructor(profiles) {
            this.profiles = profiles;
        }
        measure(texts, profile) {
            if (!texts.length ||
                texts.length > 10000 ||
                texts.some((t) => typeof t !== 'string' || !t.trim()))
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
        async request(profile, payload, options) {
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
                if (signal.aborted)
                    throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
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
                    throw new KnowledgeCoreError(response.status === 429 || response.status >= 500
                        ? 'UPSTREAM_UNAVAILABLE'
                        : 'UPSTREAM_REJECTED', response.status === 429 || response.status >= 500);
                }
                const declared = Number(response.headers.get('content-length'));
                if (declared > profile.maxResponseBytes) {
                    await response.body?.cancel();
                    throw new KnowledgeCoreError('UPSTREAM_RESPONSE_TOO_LARGE');
                }
                if (!response.body)
                    throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
                const reader = response.body.getReader();
                const parts = [];
                let used = 0;
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        used += value.byteLength;
                        if (used > profile.maxResponseBytes) {
                            await reader.cancel();
                            throw new KnowledgeCoreError('UPSTREAM_RESPONSE_TOO_LARGE');
                        }
                        parts.push(value);
                    }
                }
                finally {
                    reader.releaseLock();
                }
                try {
                    return JSON.parse(Buffer.concat(parts).toString('utf8'));
                }
                catch {
                    throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
                }
            }
            catch (error) {
                if (timedOut)
                    throw new KnowledgeCoreError('UPSTREAM_TIMEOUT', true);
                if (options.signal?.aborted)
                    throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
                if (error instanceof KnowledgeCoreError)
                    throw error;
                throw new KnowledgeCoreError('UPSTREAM_NETWORK_ERROR', true);
            }
            finally {
                clearTimeout(timeout);
            }
        }
        async embed(id, texts, options = {}) {
            const initial = await this.profiles.resolveForRequest(id, 'EMBEDDING');
            const estimatedTokens = this.measure(texts, initial);
            const vectors = [];
            let total = 0, allActual = true;
            for (let offset = 0; offset < texts.length; offset += initial.batchSize) {
                // Recheck explicit disable / credentials during long batches; never substitute a profile.
                const profile = await this.profiles.resolveForRequest(id, 'EMBEDDING'), batch = texts.slice(offset, offset + profile.batchSize), estimated = this.measure(batch, profile);
                try {
                    const result = await this.request(profile, {
                        model: profile.model,
                        input: batch,
                        encoding_format: 'float',
                        // BGE-M3 has a fixed output size and rejects the dimensions parameter.
                        ...(profile.model === 'BAAI/bge-m3' ? {} : { dimensions: profile.dimension }),
                    }, options);
                    if (!Array.isArray(result?.data) || result.data.length !== batch.length)
                        throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
                    const mapped = new Map();
                    for (const item of result.data) {
                        if (!Number.isInteger(item?.index) ||
                            item.index < 0 ||
                            item.index >= batch.length ||
                            mapped.has(item.index))
                            throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
                        mapped.set(item.index, validateEmbeddingVector(item.embedding, profile.dimension));
                    }
                    for (let i = 0; i < batch.length; i++)
                        vectors.push(mapped.get(i));
                    const actual = actualUsage(result);
                    if (actual === null)
                        allActual = false;
                    else
                        total += actual;
                    await this.profiles.recordUsage({
                        profileId: id,
                        operationId: options.operationId,
                        task: 'EMBEDDING',
                        inputCount: batch.length,
                        estimatedTokens: estimated,
                        actualTokens: actual,
                        status: 'SUCCEEDED',
                    });
                }
                catch (error) {
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
        async rerank(id, query, texts, topN, options = {}) {
            const profile = await this.profiles.resolveForRequest(id, 'RERANK');
            if (!Number.isInteger(topN) ||
                topN < 1 ||
                topN > texts.length)
                throw new KnowledgeCoreError('INVALID_PROVIDER_INPUT');
            // Input is globally RRF ordered. Rerank one bounded prefix, never compare scores across batches.
            texts = texts.slice(0, profile.batchSize);
            topN = Math.min(topN, texts.length);
            const estimatedTokens = this.measure([query, ...texts], profile);
            try {
                const body = await this.request(profile, {
                    model: profile.model,
                    query,
                    documents: texts,
                    top_n: topN,
                    return_documents: false,
                }, options);
                if (!Array.isArray(body?.results) ||
                    body.results.length > topN ||
                    !body.results.length)
                    throw new KnowledgeCoreError('UPSTREAM_INVALID_RESPONSE');
                const indices = new Set();
                const results = [];
                for (const item of body.results) {
                    if (!Number.isInteger(item?.index) ||
                        item.index < 0 ||
                        item.index >= texts.length ||
                        indices.has(item.index) ||
                        typeof item.relevance_score !== 'number' ||
                        !Number.isFinite(item.relevance_score))
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
            }
            catch (error) {
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
    };
    return KnowledgeHttpAdapter = _classThis;
})();
export { KnowledgeHttpAdapter };
//# sourceMappingURL=provider.js.map