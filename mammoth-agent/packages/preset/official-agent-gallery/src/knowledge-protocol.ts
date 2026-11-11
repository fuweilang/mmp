/** Validated Host-only protocol 2 snapshots and exact immutable source references. */
import { z } from 'zod';
/** Frozen routing, retrieval, model and package configuration accepted from Ground. */
export const executionConfigSchema = z.object({
    route: z.enum(['LEGACY', 'KNOWLEDGE_CORE']), releaseIds: z.array(z.string()), retrievalPolicy: z.enum(['REQUIRED', 'AUTO', 'OFF']), budgetTokens: z.number().int().min(256).max(8000), rerankProfileId: z.string().optional(),
    generationModel: z.discriminatedUnion('mode', [z.object({ mode: z.literal('AUTO') }).strict(), z.object({ mode: z.literal('FIXED'), modelId: z.string(), modelRef: z.string() }).strict()]),
    knowledge: z.array(z.object({ releaseId: z.string(), baseId: z.string(), indexes: z.array(z.object({ indexRevisionId: z.string(), revisionId: z.string(), documentId: z.string(), profileId: z.string(), configHash: z.string() }).strict()) }).strict()),
    skillPackages: z.array(z.object({ skillId: z.string(), packageRevision: z.number().int(), packageId: z.string() }).strict()), builtinToolRevision: z.string(),
}).strict();
/** Creator-owned preview identity and its operational usage purpose. */
export const previewSchema = z.object({ id: z.string().min(1), expiresAt: z.string(), actorUserId: z.string(), usagePurpose: z.literal('PLATFORM_OPERATIONAL_PREVIEW') }).strict();
/** Five immutable identifiers required to reopen an exact source chunk. */
export const sourceIdentitySchema = z.object({ knowledgeReleaseId: z.string().min(1), documentId: z.string().min(1), revisionId: z.string().min(1), indexRevisionId: z.string().min(1), chunkId: z.string().min(1) }).strict();
/** Exact source text, locator and optional ownership metadata returned by retrieval. */
export const evidenceSchema = sourceIdentitySchema.extend({ text: z.string(), locator: z.object({ sectionId: z.string().optional(), page: z.number().optional(), paragraph: z.number().optional(), rowStart: z.number().optional(), rowEnd: z.number().optional(), headingPath: z.array(z.string()).optional() }).strict(), sourceTitle: z.string().optional(), scope: z.discriminatedUnion('type', [z.object({ type: z.literal('PLATFORM') }).strict(), z.object({ type: z.literal('TENANT'), tenantId: z.string() }).strict()]).optional(), contentHash: z.string().optional(), tokenCount: z.number().optional() }).strict();
/** Retrieved evidence with its positive citation ordinal. */
export const citedEvidenceSchema = evidenceSchema.extend({ citation: z.number().int().positive() }).strict();
/** Bounded retrieval status, evidence and rendered context returned by Ground. */
export const knowledgeResultSchema = z.object({ retrievalId: z.string(), status: z.enum(['READY', 'NO_EVIDENCE', 'NOT_CONFIGURED', 'NOT_READY', 'FORBIDDEN', 'FAILED', 'CANCELLED']), queries: z.array(z.string()), evidence: z.array(citedEvidenceSchema), degradation: z.array(z.string()), timings: z.record(z.string(), z.number()), context: z.object({ context: z.string(), evidence: z.array(citedEvidenceSchema), tokenCount: z.number().nonnegative(), tokenizer: z.string(), truncated: z.boolean() }).strict(), queryStrategy: z.string() }).strict();
/** An authorized immutable source passage with its original byte offsets. */
export const openedSourceSchema = evidenceSchema.extend({ sourceStart: z.number(), sourceEnd: z.number() });
/** Validated frozen expert routing and retrieval configuration. */
export type ExpertExecutionConfig = z.infer<typeof executionConfigSchema>;
/** Creator-owned immutable preview reference. */
export type ExpertPreview = z.infer<typeof previewSchema>;
/** Validated retrieval result and its bounded rendered context. */
export type KnowledgeResult = z.infer<typeof knowledgeResultSchema>;
/** Immutable release, document, revision, index and chunk identifiers. */
export type ExactSource = z.infer<typeof sourceIdentitySchema>;
/** A retrieved immutable source passage and its locator. */
export type KnowledgeEvidence = z.infer<typeof evidenceSchema>;
/** An authorized source passage reopened at its exact stored offsets. */
export type OpenedSource = z.infer<typeof openedSourceSchema>;
/** Published expert version or creator-only preview selected by the Host. */
export type RuntimeBinding = {
    agentId: string;
    versionId: string | null;
    preview?: ExpertPreview | undefined;
};
/**
 * Transport identity is chosen by the Host, never supplied by tool arguments.
 * @param binding - Frozen published version or creator-owned preview.
 * @returns The protocol version and exactly one immutable runtime reference.
 */
export function runtimeReference(binding: RuntimeBinding): {
    executionProtocol: 2;
    versionId?: string;
    previewId?: string;
} {
    if (binding.preview)
        return { executionProtocol: 2, previewId: binding.preview.id };
    if (!binding.versionId)
        throw Error('EXPERT_BINDING_INVALID');
    return { executionProtocol: 2, versionId: binding.versionId };
}
/**
 * Copy only the five immutable source identifiers.
 * @param source - Source passage whose immutable identity is needed.
 * @returns The exact source identifiers without text or display metadata.
 */
export function exactSource(source: ExactSource): ExactSource { return { knowledgeReleaseId: source.knowledgeReleaseId, documentId: source.documentId, revisionId: source.revisionId, indexRevisionId: source.indexRevisionId, chunkId: source.chunkId }; }
