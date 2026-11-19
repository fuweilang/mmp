import type { KnowledgeProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export type KnowledgeProfileTask = 'EMBEDDING' | 'RERANK';
export interface CreateKnowledgeProfile {
    providerId: string;
    task: KnowledgeProfileTask;
    model: string;
    dimension?: number;
    tokenizer?: 'cl100k_base' | 'o200k_base';
    endpoint?: string;
    timeoutMs?: number;
    batchSize?: number;
    maxInputTokens?: number;
    maxResponseBytes?: number;
    predecessorId?: string;
}
declare const SAFE_PROFILE_SELECT: {
    readonly id: true;
    readonly providerId: true;
    readonly task: true;
    readonly adapter: true;
    readonly model: true;
    readonly endpoint: true;
    readonly dimension: true;
    readonly tokenizer: true;
    readonly timeoutMs: true;
    readonly batchSize: true;
    readonly maxInputTokens: true;
    readonly maxResponseBytes: true;
    readonly enabled: true;
    readonly predecessorId: true;
    readonly createdAt: true;
};
/** Explicit allowlist: neither provider relations nor encrypted/plaintext credentials are returned. */
export type SafeKnowledgeProfile = Pick<KnowledgeProfile, keyof typeof SAFE_PROFILE_SELECT>;
export interface ProviderUsageInput {
    profileId: string;
    operationId?: string;
    task: KnowledgeProfileTask;
    inputCount: number;
    estimatedTokens: number;
    actualTokens: number | null;
    status: 'SUCCEEDED' | 'FAILED';
    errorCode?: string;
}
export declare function validateKnowledgeEndpoint(raw: string): string;
/** Local-only readiness shared by publication and runtime. Credentials remain internal. */
export declare function validateKnowledgeProfileDependency(profile: KnowledgeProfile | null, provider: {
    enabled: boolean;
    apiKeyEnc: string | null;
} | null, task: KnowledgeProfileTask): string;
/** Trusted server/admin boundary. Controllers must supply super_admin authorization separately. */
export declare class KnowledgeProfilesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(input: CreateKnowledgeProfile): Promise<SafeKnowledgeProfile>;
    get(id: string): Promise<SafeKnowledgeProfile>;
    list(task?: KnowledgeProfileTask): Promise<SafeKnowledgeProfile[]>;
    setEnabled(id: string, enabled: boolean): Promise<SafeKnowledgeProfile>;
    /** Internal only: never serialize this result or place it in a trace. Endpoint stays frozen; only encrypted credential reference rotates. */
    resolveForRequest(id: string, task: KnowledgeProfileTask): Promise<KnowledgeProfile & {
        apiKey: string;
    }>;
    recordUsage(input: ProviderUsageInput): Promise<void>;
}
export {};
//# sourceMappingURL=profiles.service.d.ts.map