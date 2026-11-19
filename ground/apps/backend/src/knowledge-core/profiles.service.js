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
import { decryptApiKey } from '../llm/llm-key-crypto';
import { KnowledgeCoreError } from './errors';
const SAFE_PROFILE_SELECT = {
    id: true,
    providerId: true,
    task: true,
    adapter: true,
    model: true,
    endpoint: true,
    dimension: true,
    tokenizer: true,
    timeoutMs: true,
    batchSize: true,
    maxInputTokens: true,
    maxResponseBytes: true,
    enabled: true,
    predecessorId: true,
    createdAt: true,
};
function integer(n, min, max) {
    if (!Number.isSafeInteger(n) || n < min || n > max)
        throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    return n;
}
export function validateKnowledgeEndpoint(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new KnowledgeCoreError('PROVIDER_ENDPOINT_MISSING');
    }
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash)
        throw new KnowledgeCoreError('PROFILE_INVALID_ENDPOINT');
    return url.toString();
}
/** Local-only readiness shared by publication and runtime. Credentials remain internal. */
export function validateKnowledgeProfileDependency(profile, provider, task) {
    if (!profile)
        throw new KnowledgeCoreError('PROFILE_NOT_FOUND');
    if (!profile.enabled)
        throw new KnowledgeCoreError('PROFILE_DISABLED');
    if (profile.task !== task)
        throw new KnowledgeCoreError('PROFILE_TASK_MISMATCH');
    validateKnowledgeEndpoint(profile.endpoint);
    integer(profile.batchSize, 1, 128);
    if (!profile.model?.trim() || profile.adapter !== (task === 'EMBEDDING' ? 'OPENAI_EMBEDDINGS' : 'COMPATIBLE_RERANK') || (task === 'EMBEDDING' && (!Number.isInteger(profile.dimension) || Number(profile.dimension) < 1)))
        throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    if (!provider?.enabled)
        throw new KnowledgeCoreError('PROVIDER_DISABLED');
    if (!provider.apiKeyEnc)
        throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_MISSING');
    try {
        const apiKey = decryptApiKey(provider.apiKeyEnc);
        if (!apiKey.trim())
            throw new Error();
        return apiKey;
    }
    catch {
        throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_UNAVAILABLE');
    }
}
/** Trusted server/admin boundary. Controllers must supply super_admin authorization separately. */
let KnowledgeProfilesService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var KnowledgeProfilesService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            KnowledgeProfilesService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        constructor(prisma) {
            this.prisma = prisma;
        }
        async create(input) {
            if (!input ||
                !['EMBEDDING', 'RERANK'].includes(input.task) ||
                typeof input.model !== 'string' ||
                !input.model.trim() ||
                input.model.length > 200 ||
                /[\r\n\0]/.test(input.model))
                throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
            const provider = await this.prisma.llmProvider.findUnique({
                where: { id: input.providerId },
            });
            if (!provider)
                throw new KnowledgeCoreError('PROVIDER_UNCONFIGURED');
            if (!provider.enabled)
                throw new KnowledgeCoreError('PROVIDER_DISABLED');
            if (!provider.apiKeyEnc)
                throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_MISSING');
            try {
                if (!decryptApiKey(provider.apiKeyEnc).trim())
                    throw new Error();
            }
            catch {
                throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_UNAVAILABLE');
            }
            const endpoint = validateKnowledgeEndpoint(input.endpoint ??
                `${(provider.baseUrl ?? '').replace(/\/+$/, '')}/${input.task === 'EMBEDDING' ? 'embeddings' : 'rerank'}`);
            const tokenizer = input.tokenizer ?? 'cl100k_base';
            if (!['cl100k_base', 'o200k_base'].includes(tokenizer))
                throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
            if (input.task === 'RERANK' && input.dimension !== undefined)
                throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
            if (input.predecessorId) {
                const previous = await this.get(input.predecessorId);
                if (previous.task !== input.task)
                    throw new KnowledgeCoreError('PROFILE_SUCCESSOR_TASK_MISMATCH');
            }
            return this.prisma.knowledgeProfile.create({
                select: SAFE_PROFILE_SELECT,
                data: {
                    providerId: provider.id,
                    task: input.task,
                    adapter: input.task === 'EMBEDDING'
                        ? 'OPENAI_EMBEDDINGS'
                        : 'COMPATIBLE_RERANK',
                    model: input.model.trim(),
                    endpoint,
                    dimension: input.task === 'EMBEDDING'
                        ? integer(input.dimension, 1, 16000)
                        : null,
                    tokenizer,
                    timeoutMs: integer(input.timeoutMs ?? 30000, 1, 120000),
                    batchSize: integer(input.batchSize ?? 32, 1, 128),
                    maxInputTokens: integer(input.maxInputTokens ?? 8192, 1, 131072),
                    maxResponseBytes: integer(input.maxResponseBytes ?? 8 * 1024 * 1024, 1024, 16 * 1024 * 1024),
                    predecessorId: input.predecessorId,
                },
            });
        }
        async get(id) {
            const profile = await this.prisma.knowledgeProfile.findUnique({
                select: SAFE_PROFILE_SELECT,
                where: { id },
            });
            if (!profile)
                throw new KnowledgeCoreError('PROFILE_UNCONFIGURED');
            return profile;
        }
        list(task) {
            return this.prisma.knowledgeProfile.findMany({
                select: SAFE_PROFILE_SELECT,
                where: task ? { task } : {},
                orderBy: { createdAt: 'desc' },
            });
        }
        async setEnabled(id, enabled) {
            await this.get(id);
            if (typeof enabled !== 'boolean')
                throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
            return this.prisma.knowledgeProfile.update({
                select: SAFE_PROFILE_SELECT,
                where: { id },
                data: { enabled },
            });
        }
        /** Internal only: never serialize this result or place it in a trace. Endpoint stays frozen; only encrypted credential reference rotates. */
        async resolveForRequest(id, task) {
            const profile = await this.get(id);
            const provider = await this.prisma.llmProvider.findUnique({ where: { id: profile.providerId } });
            const apiKey = validateKnowledgeProfileDependency(profile, provider, task);
            return { ...profile, apiKey };
        }
        async recordUsage(input) {
            await this.prisma.knowledgeProviderUsage.create({ data: input });
        }
    };
    return KnowledgeProfilesService = _classThis;
})();
export { KnowledgeProfilesService };
//# sourceMappingURL=profiles.service.js.map