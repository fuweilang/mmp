import { KnowledgeProfilesService } from './profiles.service';
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
    results: {
        index: number;
        score: number;
    }[];
    actualTokens: number | null;
    estimatedTokens: number;
}
export declare function validateEmbeddingVector(value: unknown, dimension: number): number[];
export declare class KnowledgeHttpAdapter {
    private readonly profiles;
    constructor(profiles: KnowledgeProfilesService);
    private measure;
    private request;
    embed(id: string, texts: string[], options?: ProviderCallOptions): Promise<EmbeddingBatchResult>;
    rerank(id: string, query: string, texts: string[], topN: number, options?: ProviderCallOptions): Promise<RerankBatchResult>;
}
//# sourceMappingURL=provider.d.ts.map