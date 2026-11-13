/** 跨域共享的 admin 契约类型。 */

// Immutable knowledge-core authoring (credentials stay in existing provider configuration).
export type ExpertExecutionConfig = {
  route: 'LEGACY' | 'KNOWLEDGE_CORE';
  releaseIds: string[];
  retrievalPolicy: 'REQUIRED' | 'AUTO' | 'OFF';
  rerankProfileId?: string;
  budgetTokens: number;
  generationModel:
    | {
        mode: 'AUTO';
      }
    | {
        mode: 'FIXED';
        modelId: string;
      };
};
