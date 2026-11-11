import type { ExpertExecutionConfig, KnowledgeProfileCreate } from '../api/admin';
export function canAuthorExperts(session: {
    platformRoleKey?: string | null;
    user?: {
        platformRoleKey?: string | null;
    };
} | null | undefined): boolean {
    return (session?.platformRoleKey ?? session?.user?.platformRoleKey) === 'super_admin';
}
export function releaseEligibleIndexes(documents: Array<{
    enabled: boolean;
    revisions: Array<{
        indexes: Array<{
            id: string;
            status: string;
            profileId: string;
        }>;
    }>;
}>, profiles: Array<{
    id: string;
    enabled: boolean;
    task: string;
}>): string[] {
    const enabled = new Set(profiles.filter(p => p.enabled && p.task === 'EMBEDDING').map(p => p.id));
    return documents.filter(d => d.enabled).flatMap(d => d.revisions.flatMap(r => r.indexes.filter(i => i.status === 'READY' && enabled.has(i.profileId)).map(i => i.id)));
}
export function knowledgeStateLabel(status: string): string {
    return ({ READY: '语义索引已就绪', SUCCEEDED: '任务完成（以索引状态为准）', PARTIAL: '部分解析（不能发布 / 提供语义证据）', DOWNLOAD_ONLY: '仅可下载（不能提供语义证据）', QUEUED: '上传成功，语义未就绪（排队）', RUNNING: '处理中，语义未就绪', PENDING: '待处理，语义未就绪', FAILED: '失败', CANCELLED: '已取消' } as Record<string, string>)[status] ?? status;
}
export function profileCreatePayload(form: Record<string, unknown>): KnowledgeProfileCreate {
    const output: Record<string, unknown> = {};
    for (const key of ['providerId', 'task', 'model', 'tokenizer', 'endpoint', 'timeoutMs', 'batchSize', 'maxInputTokens', 'maxResponseBytes', 'predecessorId'])
        if (form[key] !== undefined && form[key] !== null && form[key] !== '')
            output[key] = form[key];
    if (form.task === 'EMBEDDING')
        output.dimension = form.dimension;
    return output as KnowledgeProfileCreate;
}
export function editableExecutionConfig(value?: Partial<ExpertExecutionConfig>): ExpertExecutionConfig {
    return { route: value?.route ?? 'LEGACY', releaseIds: [...(value?.releaseIds ?? [])], retrievalPolicy: value?.retrievalPolicy ?? (value?.releaseIds?.length ? 'REQUIRED' : 'OFF'), budgetTokens: value?.budgetTokens ?? 8000, ...(value?.rerankProfileId ? { rerankProfileId: value.rerankProfileId } : {}), generationModel: value?.generationModel?.mode === 'FIXED' ? { mode: 'FIXED', modelId: value.generationModel.modelId } : { mode: 'AUTO' } };
}
export function previewLaunchPath(value: {
    agentId: string;
    previewId: string;
    launch: {
        path: string;
    };
}): string {
    const path = value.launch.path;
    const url = new URL(path, 'http://local.invalid');
    if (!path.startsWith('/agent?') || url.origin !== 'http://local.invalid' || url.pathname !== '/agent' || url.searchParams.get('expertPreview') !== value.previewId || url.searchParams.get('expertId') !== value.agentId)
        throw new Error('预览启动地址无效');
    return path;
}
export type ExpertDependencies = {
    loaded: boolean;
    error?: string;
    releaseIndexIds: Record<string, string[]>;
    readyIndexProfiles: Record<string, string>;
    availableReranks: string[];
    models: Array<{
        id: string;
        enabled: boolean;
        providerEnabled: boolean;
        providerConfigured: boolean;
        supportsTools?: boolean;
    }>;
    skills: Array<{
        enabled: boolean;
        packageRevision: number;
    }>;
    toolScope: string[];
};
export function expertDependencyBlockers(config: ExpertExecutionConfig, d: ExpertDependencies): string[] {
    const issues: string[] = [];
    if (!d.loaded)
        issues.push(d.error || '正在检查依赖');
    if (config.route === 'KNOWLEDGE_CORE') {
        // OFF skips runtime retrieval, but freeze still validates every retained release reference.
        if (config.retrievalPolicy !== 'OFF' && !config.releaseIds.length)
            issues.push('请选择至少一个已发布知识版本');
        if (config.releaseIds.length > 20)
            issues.push('知识版本不能超过 20 个');
        const profiles = new Set<string>();
        for (const id of config.releaseIds) {
            const indexes = d.releaseIndexIds[id];
            if (!indexes?.length) {
                issues.push('部分知识发布版本已不可用');
                continue;
            }
            for (const index of indexes) {
                const p = d.readyIndexProfiles[index];
                if (!p)
                    issues.push('知识版本含停用或未就绪索引 / 服务');
                else
                    profiles.add(p);
            }
        }
        if (profiles.size > 4)
            issues.push('最多允许 4 个不同 Embedding 配置');
    }
    if (config.rerankProfileId && !d.availableReranks.includes(config.rerankProfileId))
        issues.push('Rerank 本地配置不可用');
    if (config.generationModel.mode === 'FIXED') {
        const id = config.generationModel.modelId, m = d.models.find(m => m.id === id);
        if (!m?.enabled || !m.providerEnabled || !m.providerConfigured)
            issues.push('请选择已启用且配置凭据的固定聊天模型');
        else if (d.toolScope.length && !m.supportsTools)
            issues.push('固定聊天模型不支持所选工具');
    }
    if (d.skills.some(s => !s.enabled || s.packageRevision < 1))
        issues.push('关联技能已停用或缺少技能包版本');
    return [...new Set(issues)];
}
export function previewHostLaunchUrl(value: {agentId:string;previewId:string;launch:{path:string}}, hostBaseUrl:string): string {
 const validated=new URL(previewLaunchPath(value),'http://local.invalid');
 let host:URL;
 try {host=new URL(hostBaseUrl);if(!['http:','https:'].includes(host.protocol) || host.username || host.password)throw new Error();}
 catch {throw new Error('未配置专家会话地址，请管理员配置后重试');}
 host.searchParams.set('expertPreview',validated.searchParams.get('expertPreview')!);
 host.searchParams.set('expertId',validated.searchParams.get('expertId')!);
 return host.href;
}
