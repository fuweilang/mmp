import test from 'node:test';
import assert from 'node:assert/strict';
import { canAuthorExperts, releaseEligibleIndexes, knowledgeStateLabel, profileCreatePayload, editableExecutionConfig, previewLaunchPath } from '../src/utils/knowledge-admin';
test('platform admin flag never grants authoring; exact session role does', () => {
    assert.equal(canAuthorExperts({ user: { isPlatformAdmin: true } }), false);
    assert.equal(canAuthorExperts({ platformRoleKey: 'super_admin' }), true);
    assert.equal(canAuthorExperts({ user: { platformRoleKey: 'super_admin' } }), true);
    assert.equal(canAuthorExperts(null), false);
});
test('release selection excludes partial, disabled documents and disabled embedding profiles', () => {
    const documents = [{ enabled: true, revisions: [{ indexes: [{ id: 'ok', status: 'READY', profileId: 'p' }, { id: 'partial', status: 'PARTIAL', profileId: 'p' }, { id: 'old', status: 'READY', profileId: 'off' }] }] }, { enabled: false, revisions: [{ indexes: [{ id: 'disabled', status: 'READY', profileId: 'p' }] }] }];
    assert.deepEqual(releaseEligibleIndexes(documents, [{ id: 'p', enabled: true, task: 'EMBEDDING' }, { id: 'off', enabled: false, task: 'EMBEDDING' }]), ['ok']);
    assert.match(knowledgeStateLabel('PARTIAL'), /不能/);
    assert.match(knowledgeStateLabel('DOWNLOAD_ONLY'), /下载/);
    assert.match(knowledgeStateLabel('QUEUED'), /未就绪/);
});
test('successor profile strips mutable and credential fields; rerank never sends dimension', () => {
    assert.deepEqual(profileCreatePayload({ id: 'old', providerId: 'provider', task: 'RERANK', model: 'rank', dimension: 1536, tokenizer: 'cl100k_base', enabled: true, apiKey: 'secret', predecessorId: 'old' }), { providerId: 'provider', task: 'RERANK', model: 'rank', tokenizer: 'cl100k_base', predecessorId: 'old' });
});
test('editing published policy removes frozen-only dependencies and preserves fixed DB model id', () => {
    assert.deepEqual(editableExecutionConfig({ route: 'KNOWLEDGE_CORE', releaseIds: ['r'], retrievalPolicy: 'REQUIRED', budgetTokens: 4000, generationModel: { mode: 'FIXED', modelId: 'db-model', modelRef: 'supplier' }, knowledge: [{ releaseId: 'r' }], skillPackages: [] }), { route: 'KNOWLEDGE_CORE', releaseIds: ['r'], retrievalPolicy: 'REQUIRED', budgetTokens: 4000, generationModel: { mode: 'FIXED', modelId: 'db-model' } });
});
test('preview launcher only accepts exact standard Host binding, never external URLs', () => {
    assert.equal(previewLaunchPath({ agentId: 'a', previewId: 'p', launch: { path: '/agent?expertPreview=p&expertId=a' } }), '/agent?expertPreview=p&expertId=a');
    for (const path of ['https://evil.test', '//evil.test', '/agent?expertPreview=other&expertId=a'])
        assert.throws(() => previewLaunchPath({ agentId: 'a', previewId: 'p', launch: { path } }));
});
test('publication dependency check permits prompt-only legacy and blocks unhealthy corpus, profile fanout, missing fixed models and skills', async () => {
    const { expertDependencyBlockers } = await import('../src/utils/knowledge-admin');
    const base = { loaded: true, releaseIndexIds: { r: ['i'] }, readyIndexProfiles: { i: 'p' }, availableReranks: [], models: [], skills: [], toolScope: [] };
    assert.deepEqual(expertDependencyBlockers(editableExecutionConfig(), base), []);
    const config = editableExecutionConfig({ route: 'KNOWLEDGE_CORE', releaseIds: ['r'], retrievalPolicy: 'REQUIRED' });
    assert.deepEqual(expertDependencyBlockers(config, base), []);
    assert.match(expertDependencyBlockers(config, { ...base, readyIndexProfiles: {} }).join(' '), /未就绪/);
    assert.match(expertDependencyBlockers({ ...config, releaseIds: ['unknown'] }, base).join(' '), /不可用/);
    assert.match(expertDependencyBlockers(config, { ...base, releaseIndexIds: { r: ['a', 'b', 'c', 'd', 'e'] }, readyIndexProfiles: { a: '1', b: '2', c: '3', d: '4', e: '5' } }).join(' '), /4/);
    assert.match(expertDependencyBlockers({ ...config, generationModel: { mode: 'FIXED', modelId: 'db' } }, base).join(' '), /聊天模型/);
    assert.match(expertDependencyBlockers({ ...config, generationModel: { mode: 'FIXED', modelId: 'db' } }, { ...base, models: [{ id: 'db', enabled: true, providerEnabled: true, providerConfigured: true, supportsTools: false }], toolScope: ['web_search'] }).join(' '), /工具/);
    assert.match(expertDependencyBlockers(config, { ...base, skills: [{ enabled: false, packageRevision: 1 }] }).join(' '), /技能/);
});

test('preview links use configured Host origin and base path; missing Host and mismatched identities never launch', async () => {
    const { previewHostLaunchUrl } = await import('../src/utils/knowledge-admin');
    const preview={agentId:'agent-a',previewId:'preview-p',launch:{path:'/agent?expertPreview=preview-p&expertId=agent-a'}};
    assert.equal(previewHostLaunchUrl(preview,'https://host.example.test/terminal/?workspace=one'),'https://host.example.test/terminal/?workspace=one&expertPreview=preview-p&expertId=agent-a');
    assert.equal(previewHostLaunchUrl(preview,'http://127.0.0.1:5201/agent/'),'http://127.0.0.1:5201/agent/?expertPreview=preview-p&expertId=agent-a');
    assert.throws(()=>previewHostLaunchUrl(preview,''),/未配置专家会话地址/);
    assert.throws(()=>previewHostLaunchUrl({...preview,previewId:'another'},'https://host.example.test/terminal/'),/无效/);
    assert.throws(()=>previewHostLaunchUrl(preview,'javascript:alert(1)'),/未配置专家会话地址/);
});

test('OFF retains bindings but checks every publication dependency after REQUIRED or AUTO transitions and permits clearing', async () => {
    const { expertDependencyBlockers } = await import('../src/utils/knowledge-admin');
    const ready = { loaded: true, releaseIndexIds: { release: ['index'] }, readyIndexProfiles: { index: 'embedding' }, availableReranks: [], models: [], skills: [], toolScope: [] };
    for (const retrievalPolicy of ['REQUIRED', 'AUTO'] as const) {
        const bound = editableExecutionConfig({ route: 'KNOWLEDGE_CORE', releaseIds: ['release'], retrievalPolicy });
        assert.deepEqual(expertDependencyBlockers(bound, ready), []);
        const off = { ...bound, retrievalPolicy: 'OFF' as const };
        assert.deepEqual(off.releaseIds, ['release']);
        assert.deepEqual(expertDependencyBlockers(off, ready), []);
        assert.match(expertDependencyBlockers(off, { ...ready, releaseIndexIds: {} }).join(' '), /不可用/);
        assert.match(expertDependencyBlockers(off, { ...ready, readyIndexProfiles: {} }).join(' '), /未就绪/);
        assert.deepEqual(expertDependencyBlockers({ ...off, releaseIds: [] }, { ...ready, releaseIndexIds: {} }), []);
    }
    const existingOff = editableExecutionConfig({ route: 'KNOWLEDGE_CORE', retrievalPolicy: 'OFF', releaseIds: ['archived'] });
    assert.match(expertDependencyBlockers(existingOff, ready).join(' '), /不可用/);
    const five = { ...ready, releaseIndexIds: { archived: ['a', 'b', 'c', 'd', 'e'] }, readyIndexProfiles: { a: '1', b: '2', c: '3', d: '4', e: '5' } };
    assert.match(expertDependencyBlockers(existingOff, five).join(' '), /4/);
});
