import { adminHttp } from '../http';
import type { AdminLlmProviderCreate, AdminLlmProviderRow, AdminLlmProviderUpdate } from './models';

// Immutable knowledge-core authoring (credentials stay in existing provider configuration).
export type KnowledgeProfileCreate = {
    providerId: string;
    task: 'EMBEDDING' | 'RERANK';
    model: string;
    dimension?: number;
    tokenizer?: 'cl100k_base' | 'o200k_base';
    endpoint?: string;
    timeoutMs?: number;
    batchSize?: number;
    maxInputTokens?: number;
    maxResponseBytes?: number;
    predecessorId?: string;
};
export type KnowledgeProfile = KnowledgeProfileCreate & {
    id: string;
    enabled: boolean;
    createdAt: string;
};
export type KnowledgeBase = {
    id: string;
    name: string;
    enabled: boolean;
    ownerAgentId?: string | null;
    ownerAgentName?: string | null;
    ownerAgent?: { id: string; name: string } | null;
    autoUpdate?: boolean;
    currentReleaseId?: string | null;
    _count?: { documents: number };
};
export type KnowledgeIndex = {
    id: string;
    profileId: string;
    status: string;
    reasonCode?: string;
    chunkCount: number;
    tokenCount: number;
    createdAt?: string;
    job?: {id:string;status:string;errorCode?:string|null} | null;
    profile?: {enabled:boolean};
};
export type KnowledgeRevision = {
    id: string;
    originalName: string;
    parserFormat: string;
    sizeBytes: number;
    createdAt: string;
    indexes: KnowledgeIndex[];
};
export type KnowledgeDocument = {
    id: string;
    title: string;
    enabled: boolean;
    baseId?: string;
    deletedAt?: string | null;
    requestedIndexId?: string | null;
    effectiveIndexId?: string | null;
    updatedAt?: string;
    revisions: KnowledgeRevision[];
};
export type KnowledgeRelease = {
    id: string;
    baseId: string;
    version: number;
    items: Array<{
        indexRevisionId: string;
    }>;
};
export type KnowledgeJob = {
    id: string;
    status: string;
    stage: string;
    errorCode?: string;
    attempts: number;
    index?: KnowledgeIndex;
};
export type KnowledgeSource = {
    knowledgeReleaseId: string;
    documentId: string;
    revisionId: string;
    indexRevisionId: string;
    chunkId: string;
};
export type KnowledgeEvidence = KnowledgeSource & {
    text: string;
    sourceTitle: string;
    locator: Record<string, unknown>;
    citation?: number;
    tokenCount?: number;
};
export type KnowledgeTestResult = {
    status: string;
    queries: string[];
    degradation: string[];
    timings: Record<string, number>;
    evidence: KnowledgeEvidence[];
    context: {
        tokenCount: number;
        truncated: boolean;
    };
    diagnostics: {
        counts: Record<string, number>;
        timings: Record<string, number>;
        truncated: boolean;
        candidates: Array<KnowledgeSource & {
            sourceTitle: string;
            snippet: string;
            locator: Record<string, unknown>;
            retained: boolean;
            reason: string;
            fusionRank?: number;
            rerankRank?: number;
            finalRank?: number;
            routeRanks: unknown[];
        }>;
    };
};
const kc = '/knowledge-core';
const kcPost = <T>(path: string, body?: unknown, signal?: AbortSignal) => adminHttp<T>(`${kc}/${path}`, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}), signal });
export const adminKnowledgeCoreApi = {
    editorCatalog: () => adminHttp<Array<{base:KnowledgeBase;documents:KnowledgeDocument[];releases:KnowledgeRelease[]}>>(`${kc}/editor-catalog`),
  providers: () => adminHttp<AdminLlmProviderRow[]>('/knowledge-core/providers'),
  createProvider: (body: Omit<AdminLlmProviderCreate, 'models'>) => adminHttp<AdminLlmProviderRow>('/knowledge-core/providers', { method: 'POST', body: JSON.stringify(body) }),
  updateProvider: (id: string, body: AdminLlmProviderUpdate & { clearApiKey?: boolean }) => adminHttp<AdminLlmProviderRow>(`/knowledge-core/providers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    profiles: () => adminHttp<KnowledgeProfile[]>(`${kc}/profiles`), createProfile: (body: KnowledgeProfileCreate) => kcPost<KnowledgeProfile>('profiles', body),
    enableProfile: (id: string, enabled: boolean) => adminHttp<KnowledgeProfile>(`${kc}/profiles/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    health: (id: string) => adminHttp<{
        configured: boolean;
        providerProbed: false;
        errorCode?: string;
    }>(`${kc}/profiles/${id}/health`),
    probe: (id: string) => kcPost<{
        available: boolean;
        errorCode?: string;
        estimatedTokens?: number;
        actualTokens?: number | null;
        durationMs: number;
    }>(`profiles/${id}/probe`),
    bases: () => adminHttp<KnowledgeBase[]>(`${kc}/bases`), createBase: (name: string, ownerAgentId?: string) => kcPost<KnowledgeBase>('bases', { name, ...(ownerAgentId ? { ownerAgentId } : {}) }),
    updateBase: (id: string, body: {
        name?: string;
        enabled?: boolean;
    }) => adminHttp<KnowledgeBase>(`${kc}/bases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    documents: (id: string) => adminHttp<KnowledgeDocument[]>(`${kc}/bases/${id}/documents`),
    upload: (id: string, body: FormData) => adminHttp<KnowledgeJob>(`${kc}/bases/${id}/documents`, { method: 'POST', body }),
    enableDocument: (id: string, enabled: boolean) => adminHttp<KnowledgeDocument>(`${kc}/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    deleteDocument: (id: string) => adminHttp<{ id: string; deleted: true }>(`${kc}/documents/${id}`, { method: 'DELETE' }),
    usage: (id: string) => adminHttp<Array<{id: string; name: string}>>(`${kc}/documents/${id}/usage`),
    reindex: (id: string, profileId: string) => kcPost<KnowledgeJob>(`revisions/${id}/reindex`, { profileId, idempotencyKey: crypto.randomUUID() }),
    job: (id: string) => adminHttp<KnowledgeJob>(`${kc}/jobs/${id}`), jobAction: (id: string, action: 'retry' | 'cancel') => kcPost<KnowledgeJob>(`jobs/${id}/${action}`),
    releases: (id: string) => adminHttp<KnowledgeRelease[]>(`${kc}/bases/${id}/releases`), release: (id: string, indexRevisionIds: string[]) => kcPost<KnowledgeRelease>(`bases/${id}/releases`, { indexRevisionIds }),
    chunks: (documentId: string, revisionId: string, indexId: string, offset = 0) => adminHttp<{
        chunks: Array<{
            id: string;
            ordinal: number;
            text: string;
            locator: Record<string, unknown>;
            sourceStart: number;
            sourceEnd: number;
        }>;
        nextOffset: number | null;
        totalChunks: number;
    }>(`${kc}/documents/${documentId}/revisions/${revisionId}/indexes/${indexId}/chunks?offset=${offset}&limit=20`),
    extracted: (documentId: string, revisionId: string, indexId: string, offset = 0) => adminHttp<{
        text: string;
        nextOffset: number | null;
        hasGaps: boolean;
    }>(`${kc}/documents/${documentId}/revisions/${revisionId}/indexes/${indexId}/extracted?offset=${offset}&limit=10000`),
    originalUrl: (documentId: string, revisionId: string, inline = false) => `/admin/api${kc}/documents/${encodeURIComponent(documentId)}/revisions/${encodeURIComponent(revisionId)}/original${inline ? '?inline=1' : ''}`,
    test: (body: {
        query: string;
        releaseIds: string[];
        mode: 'required' | 'optional';
        budgetTokens: number;
        rerankProfileId?: string;
        embeddingProfileId?: string;
    }, signal?: AbortSignal) => kcPost<KnowledgeTestResult>('retrieval-test/diagnostics', body, signal),
    openSource: (body: KnowledgeSource) => kcPost<KnowledgeEvidence & {
        sourceStart: number;
        sourceEnd: number;
    }>('sources/open', body),
};
