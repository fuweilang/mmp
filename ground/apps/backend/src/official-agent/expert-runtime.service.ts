import { authorizeExpertDisclosure, authorizeExpertHistoryDisclosure } from './expert-disclosure';
import { resolveChatProviderConfiguration } from '../llm/provider-configuration';
import { resolveDeepSeekSearchKey } from './web-search.service';
import { validateKnowledgeProfileDependency } from '../knowledge-core/profiles.service';
import { KnowledgeCoreError } from '../knowledge-core/errors';
import { KnowledgeCoreService } from '../knowledge-core/knowledge-core.service';
import { buildEvidenceContext } from '../knowledge-core/retrieval';
import { modelCapabilities } from '../llm/model-capabilities';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertSuperAdmin } from '../auth/super-admin';
import { KnowledgeRetrievalService } from '../knowledge-core/retrieval.service';
import { AuthorizedRelease, KnowledgeAccess, KnowledgeSourceReference } from '../knowledge-core/retrieval-access';
import { expertExecutionPrompt } from './expert-definition';
import type { ExpertExecutionConfig, FrozenExpertExecutionConfig } from '@mammoth/shared';
export const BUILTIN_TOOL_REVISION = 'ground-builtins-v1';
const builtinTools = new Set(['enterprise_knowledge', 'web_search', 'web_fetch', 'tabular_analyze', 'delegate_official_agent', 'delegate']);
function fail(message: string): never { throw new BadRequestException(message); }
export function normalizeExecutionConfig(value: unknown): ExpertExecutionConfig {
    const raw = (value ?? {}) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        fail('INVALID_EXECUTION_CONFIG');
    const allowed = ['route', 'releaseIds', 'retrievalPolicy', 'rerankProfileId', 'budgetTokens', 'generationModel'];
    if (Object.keys(raw).some(k => !allowed.includes(k)))
        fail('INVALID_EXECUTION_CONFIG_FIELD');
    const route = raw.route ?? 'LEGACY';
    if (route !== 'LEGACY' && route !== 'KNOWLEDGE_CORE')
        fail('INVALID_EXECUTION_ROUTE');
    const releaseIds = raw.releaseIds ?? [];
    if (!Array.isArray(releaseIds) || releaseIds.length > 20 || releaseIds.some(x => typeof x !== 'string' || !x || x.length > 128))
        fail('INVALID_RELEASE_SELECTION');
    const ids = [...new Set(releaseIds as string[])];
    const retrievalPolicy = raw.retrievalPolicy ?? (ids.length ? 'REQUIRED' : 'OFF');
    if (!['REQUIRED', 'AUTO', 'OFF'].includes(String(retrievalPolicy)))
        fail('INVALID_RETRIEVAL_POLICY');
    if (route === 'LEGACY' && ids.length)
        fail('LEGACY_CANNOT_BIND_RELEASES');
    if (route === 'KNOWLEDGE_CORE' && retrievalPolicy !== 'OFF' && !ids.length)
        fail('KNOWLEDGE_RELEASE_REQUIRED');
    const budgetTokens = raw.budgetTokens ?? 8000;
    if (!Number.isInteger(budgetTokens) || Number(budgetTokens) < 256 || Number(budgetTokens) > 8000)
        fail('INVALID_EVIDENCE_BUDGET');
    if (raw.rerankProfileId !== undefined && (typeof raw.rerankProfileId !== 'string' || !raw.rerankProfileId || raw.rerankProfileId.length > 128))
        fail('INVALID_RERANK_PROFILE');
    const generation = (raw.generationModel ?? { mode: 'AUTO' }) as Record<string, unknown>;
    if (!generation || typeof generation !== 'object' || Array.isArray(generation) || !['AUTO', 'FIXED'].includes(String(generation.mode)) || Object.keys(generation).some(k => !['mode', 'modelId'].includes(k)))
        fail('INVALID_GENERATION_POLICY');
    if (generation.mode === 'FIXED' && (typeof generation.modelId !== 'string' || !generation.modelId || generation.modelId.length > 128))
        fail('FIXED_MODEL_REQUIRED');
    return { route: route as ExpertExecutionConfig['route'], releaseIds: ids, retrievalPolicy: retrievalPolicy as ExpertExecutionConfig['retrievalPolicy'], budgetTokens: Number(budgetTokens), ...(raw.rerankProfileId ? { rerankProfileId: String(raw.rerankProfileId) } : {}), generationModel: generation.mode === 'FIXED' ? { mode: 'FIXED', modelId: String(generation.modelId) } : { mode: 'AUTO' } };
}
/** Strip runtime-only frozen references for draft/version comparison. */
export function executionDraftProjection(value: unknown): ExpertExecutionConfig {
    const raw = (value && typeof value === 'object' ? value : {}) as Record<string, any>;
    const picked = Object.fromEntries(Object.entries(raw).filter(([key]) => ['route', 'releaseIds', 'retrievalPolicy', 'rerankProfileId', 'budgetTokens'].includes(key)));
    return normalizeExecutionConfig({ ...picked, ...(raw.generationModel ? { generationModel: raw.generationModel.mode === 'FIXED' ? { mode: 'FIXED', modelId: raw.generationModel.modelId } : { mode: 'AUTO' } } : {}) });
}
export interface ExpertRuntimeBinding {
    agentId: string;
    versionId?: string;
    previewId?: string;
}
export interface ExpertTurnTransport {
    sessionId: string;
    turnId: string;
    context?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
}
@Injectable()
export class ExpertRuntimeService {
    constructor(private readonly db: PrismaService, private readonly retrieval: KnowledgeRetrievalService, private readonly knowledgeCore?: KnowledgeCoreService) { }
    async freeze(value: unknown, tools: string[], skills: Array<{
        id: string;
        packageRevision: number;
    }>, db: Prisma.TransactionClient | PrismaService = this.db): Promise<FrozenExpertExecutionConfig> {
        const config = normalizeExecutionConfig(value);
        if (tools.some(t => !builtinTools.has(t)))
            fail('UNKNOWN_BUILTIN_TOOL');
        if (tools.includes('web_search'))
            await resolveDeepSeekSearchKey(db);
        const knowledge: FrozenExpertExecutionConfig['knowledge'] = [];
        const profiles = new Set<string>();
        for (const releaseId of config.releaseIds) {
            const release = await db.knowledgeRelease.findUnique({ where: { id: releaseId }, include: { base: true, items: { include: { index: { include: { revision: { include: { document: true } }, profile: true } } } } } });
            if (!release?.sealed || release.base.scope !== 'PLATFORM' || release.base.tenantId !== null || !release.base.enabled || !release.items.length)
                fail('KNOWLEDGE_DEPENDENCY_NOT_READY');
            const indexes = release.items.filter(({ index: i }) => !release.base.autoUpdate || i.revision.document.enabled).map(({ index: i }) => {
                if (i.status !== 'READY' || !i.revision.document.enabled || !i.profile.enabled)
                    fail('KNOWLEDGE_DEPENDENCY_NOT_READY');
                profiles.add(i.profileId);
                return { indexRevisionId: i.id, revisionId: i.revision.id, documentId: i.revision.document.id, profileId: i.profileId, configHash: i.indexConfigHash };
            });
            knowledge.push({ releaseId, baseId: release.baseId, indexes });
        }
        if (profiles.size > 4)
            fail('KNOWLEDGE_PROFILE_LIMIT');
        const validateProfile = async (id: string, task: 'EMBEDDING' | 'RERANK') => {
            const profile = await db.knowledgeProfile.findUnique({ where: { id }, include: { provider: true } });
            try {
                validateKnowledgeProfileDependency(profile, profile?.provider ?? null, task);
            }
            catch (error) {
                if (error instanceof KnowledgeCoreError)
                    throw new BadRequestException({ code: error.code, message: error.code });
                throw error;
            }
        };
        for (const id of profiles)
            await validateProfile(id, 'EMBEDDING');
        if (config.rerankProfileId)
            await validateProfile(config.rerankProfileId, 'RERANK');
        let generationModel: FrozenExpertExecutionConfig['generationModel'] = config.generationModel;
        if (config.generationModel.mode === 'FIXED') {
            const model = await db.llmModel.findUnique({ where: { id: config.generationModel.modelId }, include: { provider: true } });
            if (!model?.enabled || !model.provider.enabled || !model.provider.apiKeyEnc)
                fail('GENERATION_MODEL_NOT_READY');
            resolveChatProviderConfiguration(model.provider);
            if (tools.length && !modelCapabilities(model).tools)
                fail('GENERATION_MODEL_CAPABILITY');
            generationModel = { mode: 'FIXED', modelId: model.id, modelRef: `${model.provider.name}/${model.modelId}` };
        }
        const skillPackages = [];
        for (const skill of skills) {
            const pkg = await db.officialSkillPackage.findUnique({ where: { skillId_revision: { skillId: skill.id, revision: skill.packageRevision } } });
            if (!pkg)
                fail('SKILL_PACKAGE_NOT_READY');
            skillPackages.push({ skillId: skill.id, packageRevision: skill.packageRevision, packageId: pkg.id });
        }
        return { ...config, generationModel, knowledge, skillPackages, builtinToolRevision: BUILTIN_TOOL_REVISION };
    }
    async load(user: User, tenantId: string | null, binding: ExpertRuntimeBinding) {
        const current = await this.db.user.findUnique({ where: { id: user.id } });
        if (!current || current.status !== 'active')
            throw new ForbiddenException('ACCOUNT_INACTIVE');
        if (tenantId) {
            const member = await this.db.orgMember.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } }, include: { tenant: true } });
            if (!member || member.tenant.status !== 'active')
                throw new ForbiddenException('TENANT_ACCESS_REVOKED');
        }
        if (binding.previewId) {
            await assertSuperAdmin(this.db, user.id);
            const preview = await this.db.officialExpertPreview.findUnique({ where: { id: binding.previewId } });
            if (!preview || preview.actorUserId !== user.id || preview.agentId !== binding.agentId || preview.expiresAt.getTime() <= Date.now() || binding.versionId)
                throw new ForbiddenException('PREVIEW_EXPIRED_OR_FORBIDDEN');
            return { execution: preview.snapshot as unknown as Record<string, any>, preview };
        }
        if (!binding.versionId)
            fail('EXPERT_VERSION_REQUIRED');
        const agent = await this.db.officialAgent.findUnique({ where: { id: binding.agentId } });
        if (!agent || agent.status !== 'PUBLISHED' || !agent.onlineVersionId)
            throw new ForbiddenException('EXPERT_OFFLINE');
        const version = await this.db.officialAgentVersion.findFirst({ where: { id: binding.versionId, agentId: agent.id } });
        if (!version)
            throw new ForbiddenException('EXPERT_VERSION_FORBIDDEN');
        return { execution: { agentId: agent.id, key: agent.key, kind: agent.kind, versionId: version.id, version: version.version, systemPrompt: expertExecutionPrompt(version.systemPrompt, version.expertDefinition), toolScope: version.toolScope, linkedSkills: version.linkedSkillSummaries, executionConfig: version.executionConfig }, preview: null };
    }
    config(value: unknown): FrozenExpertExecutionConfig {
        if (!value || typeof value !== 'object' || !(value as any).builtinToolRevision)
            return { ...normalizeExecutionConfig(undefined), knowledge: [], skillPackages: [], builtinToolRevision: BUILTIN_TOOL_REVISION };
        return value as FrozenExpertExecutionConfig;
    }
    private async liveConfiguration(config: FrozenExpertExecutionConfig, agentId: string, source?: KnowledgeSourceReference, useCurrentSelection = false): Promise<{config: FrozenExpertExecutionConfig; releases: AuthorizedRelease[]}> {
        if (!this.knowledgeCore?.resolveExpertKnowledge) return { config, releases: config.knowledge.map(k => ({ releaseId: k.releaseId, scope: { type: 'PLATFORM' as const } })) };
        const live = await this.knowledgeCore.resolveExpertKnowledge(agentId, config.knowledge, source, useCurrentSelection);
        const policy = live.selectionPolicy ?? config.retrievalPolicy;
        if (!live.ownsKnowledge && (policy === 'OFF' || (!useCurrentSelection && config.route !== 'KNOWLEDGE_CORE'))) return { config: {...config,retrievalPolicy:'OFF',releaseIds:[],knowledge:[]}, releases: [] };
        const knowledge: FrozenExpertExecutionConfig['knowledge'] = [];
        for (const selected of live.releases) {
            const inventory = await this.knowledgeCore.getReleaseInventory(selected.releaseId, selected.scope);
            const allowed = inventory.filter(i => i.revision.document.enabled && i.profile.enabled && i.status === 'READY' && (selected.documentIds === undefined || selected.documentIds.includes(i.revision.document.id)));
            if (!allowed.length) continue;
            knowledge.push({ releaseId: selected.releaseId, baseId: allowed[0]!.revision.document.baseId, indexes: allowed.map(i => ({ indexRevisionId: i.id, revisionId: i.revision.id, documentId: i.revision.document.id, profileId: i.profileId, configHash: i.indexConfigHash })) });
        }
        return { config: { ...config, route: live.ownsKnowledge || useCurrentSelection ? 'KNOWLEDGE_CORE' : config.route, retrievalPolicy: knowledge.length ? (live.ownsKnowledge && policy === 'OFF' ? 'REQUIRED' : policy) : 'OFF', releaseIds: knowledge.map(k => k.releaseId), knowledge }, releases: live.releases };
    }
    async resolve(user: User, tenantId: string | null, binding: ExpertRuntimeBinding) {
        const { execution, preview } = await this.load(user, tenantId, binding);
        const { config } = await this.liveConfiguration(this.config(execution.executionConfig), binding.agentId, undefined, !binding.previewId);
        const { executionConfig, ...legacy } = execution;
        return { ...legacy, executionProtocol: 2 as const, executionConfig: config, ...(preview ? { preview: { id: preview.id, expiresAt: preview.expiresAt.toISOString(), actorUserId: user.id, usagePurpose: 'PLATFORM_OPERATIONAL_PREVIEW' } } : {}) };
    }
    private transport(input: ExpertTurnTransport) {
        for (const key of ['sessionId', 'turnId'] as const)
            if (typeof input[key] !== 'string' || !input[key] || input[key].length > 128 || /[\x00-\x1f]/.test(input[key]))
                fail('INVALID_HOST_TURN');
        if (input.context !== undefined && (!Array.isArray(input.context) || input.context.length > 8 || input.context.some(x => !x || !['user', 'assistant'].includes(x.role) || typeof x.content !== 'string' || x.content.length > 2000)))
            fail('INVALID_VISIBLE_CONTEXT');
    }
    async access(user: User, tenantId: string | null, binding: ExpertRuntimeBinding, transport: ExpertTurnTransport, source?: KnowledgeSourceReference): Promise<{
        access: KnowledgeAccess;
        config: FrozenExpertExecutionConfig;
    }> {
        this.transport(transport);
        const loaded = await this.load(user, tenantId, binding), { config } = await this.liveConfiguration(this.config(loaded.execution.executionConfig), binding.agentId, source, !binding.previewId);
        if (config.route !== 'KNOWLEDGE_CORE' || config.retrievalPolicy === 'OFF')
            throw new ForbiddenException('KNOWLEDGE_RETRIEVAL_DISABLED');
        const namespace = createHash('sha256').update(JSON.stringify([user.id, tenantId, binding.agentId, binding.versionId ?? null, binding.previewId ?? null, transport.sessionId])).digest('hex');
        return { config, access: { actorUserId: user.id, tenantId, expertId: binding.agentId, expertVersionId: binding.versionId, previewId: binding.previewId, conversationId: namespace, turnId: transport.turnId, authorize: async () => {
                    const latest = await this.load(user, tenantId, binding);
                    const frozen = this.config(latest.execution.executionConfig);
                    if (this.knowledgeCore?.resolveExpertKnowledge) return (await this.knowledgeCore.resolveExpertKnowledge(binding.agentId, frozen.knowledge, source, !binding.previewId)).releases;
                    return frozen.knowledge.map(k => ({ releaseId: k.releaseId, scope: { type: 'PLATFORM' as const } }));
                } } };
    }
    async retrieve(user: User, tenantId: string | null, binding: ExpertRuntimeBinding, transport: ExpertTurnTransport, query: string, signal?: AbortSignal) {
        const { access, config } = await this.access(user, tenantId, binding, transport);
        const result = await this.retrieval.retrieve(access, { query, context: transport.context?.map(x => ({ conversationId: access.conversationId, role: x.role, text: x.content, visible: true })), mode: config.retrievalPolicy === 'REQUIRED' ? 'required' : 'optional', rerankProfileId: config.rerankProfileId, budgetTokens: config.budgetTokens, signal });
        try {
            if (signal?.aborted)
                throw new Error('cancelled');
            // Core's last trace write is an awaited boundary: reopen every exact source afterwards.
            for (const evidence of result.evidence) {
                await this.retrieval.openSource(access, evidence);
                if (signal?.aborted)
                    throw new Error('cancelled');
            }
            const authorized = await access.authorize();
            if (signal?.aborted)
                throw new Error('cancelled');
            // A later reopen may race revocation of an earlier source. Check the entire returned
            // set against fresh inventories once all content I/O has finished.
            for (const releaseId of new Set(result.evidence.map(e => e.knowledgeReleaseId))) {
                const selected = authorized.find(r => r.releaseId === releaseId);
                if (!selected)
                    throw new ForbiddenException('KNOWLEDGE_FORBIDDEN');
                const inventory = await this.knowledgeCore!.getReleaseInventory(releaseId, selected.scope);
                if (signal?.aborted)
                    throw new Error('cancelled');
                for (const evidence of result.evidence.filter(e => e.knowledgeReleaseId === releaseId)) {
                    const index = inventory.find(i => i.id === evidence.indexRevisionId);
                    if (!index || index.status !== 'READY' || !index.profile.enabled || !index.revision.document.enabled || index.revision.id !== evidence.revisionId || index.revision.document.id !== evidence.documentId || (selected.documentIds !== undefined && !selected.documentIds.includes(evidence.documentId)))
                        throw new ForbiddenException('KNOWLEDGE_FORBIDDEN');
                }
            }
            // One final statement, not alternating actor/source rechecks: both authority halves
            // share the same database snapshot. Nothing asynchronous follows a successful decision.
            const allowed = await authorizeExpertDisclosure(this.db, user.id, tenantId, binding, result.evidence);
            if (signal?.aborted) throw new Error('cancelled');
            if (!allowed) throw new ForbiddenException('KNOWLEDGE_FORBIDDEN');
        }
        catch {
            result.status = signal?.aborted ? 'CANCELLED' : 'FORBIDDEN';
            result.evidence = [];
            result.context = buildEvidenceContext([], 0);
            result.degradation = [...new Set([...result.degradation, signal?.aborted ? 'RETRIEVAL_CANCELLED' : 'KNOWLEDGE_FORBIDDEN'])];
            const persist = () => this.db.knowledgeRetrievalTrace.updateMany({ where: { id: result.retrievalId, actorUserId: user.id }, data: { status: result.status, evidence: [], releaseIds: [], degradation: result.degradation } });
            await persist();
            // Cancellation can arrive while the fail-closed trace is being persisted too.
            if (signal?.aborted && result.status !== 'CANCELLED') {
                result.status = 'CANCELLED';
                result.degradation = [...new Set([...result.degradation, 'RETRIEVAL_CANCELLED'])];
                await persist();
            }
        }
        return result;
    }
    async authorizeHistory(user: User, tenantId: string | null, expected: {userId:string;scope:string}, entries: Array<{binding:ExpertRuntimeBinding;sources:KnowledgeSourceReference[]}>) {
        if (expected.userId !== user.id || expected.scope !== (tenantId ? `tenant:${tenantId}` : 'personal')) throw new ForbiddenException('EXPERT_SOURCE_ACCESS_CHANGED');
        if (!entries.length || entries.length > 1024 || entries.reduce((sum,entry)=>sum+entry.sources.length,0)>1024) fail('EXPERT_SOURCE_HISTORY_LIMIT');
        if (!await authorizeExpertHistoryDisclosure(this.db,user.id,tenantId,entries)) throw new ForbiddenException('KNOWLEDGE_FORBIDDEN');
        return {authorized:true as const};
    }
    async source(user: User, tenantId: string | null, binding: ExpertRuntimeBinding, ref: KnowledgeSourceReference) {
        const { access } = await this.access(user, tenantId, binding, { sessionId: 'source-open', turnId: 'source-open' }, ref);
        const result = await this.retrieval.openSource(access, ref);
        if (!await authorizeExpertDisclosure(this.db, user.id, tenantId, binding, [ref]))
            throw new ForbiddenException('KNOWLEDGE_FORBIDDEN');
        return result;
    }
    async authorizeTool(user: User, tenantId: string | null, binding: ExpertRuntimeBinding, tool: string) {
        const { execution } = await this.load(user, tenantId, binding);
        if (!Array.isArray(execution.toolScope) || !execution.toolScope.includes(tool))
            throw new ForbiddenException('EXPERT_TOOL_NOT_AUTHORIZED');
        if (this.config(execution.executionConfig).builtinToolRevision !== BUILTIN_TOOL_REVISION)
            throw new ForbiddenException('BUILTIN_TOOL_REVISION_UNAVAILABLE');
    }
    async enforceModel(user: User, tenantId: string | null, binding: ExpertRuntimeBinding) {
        const { execution, preview } = await this.load(user, tenantId, binding);
        const policy = this.config(execution.executionConfig).generationModel;
        if (policy.mode === 'AUTO')
            return { model: undefined, preview };
        const model = await this.db.llmModel.findUnique({ where: { id: policy.modelId }, include: { provider: true, tenantAssignments: tenantId ? { where: { tenantId, blocked: true } } : false } });
        if (!model?.enabled || !model.provider.enabled || !model.provider.apiKeyEnc || (model as any).tenantAssignments?.length || `${model.provider.name}/${model.modelId}` !== policy.modelRef)
            throw new ForbiddenException('FIXED_GENERATION_MODEL_UNAVAILABLE');
        resolveChatProviderConfiguration(model.provider);
        return { model: policy.modelRef, preview };
    }
}
