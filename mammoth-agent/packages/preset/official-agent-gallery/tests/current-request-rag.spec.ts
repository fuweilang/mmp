import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from '@mammoth-ai/cordis';
import { BasicCompactionEngine } from '@mammoth-ai/mmp-compaction-basic';
import type { Agent } from '@mammoth-ai/mmp-agent';
import type { Message } from '@mammoth-ai/mmp-llm';
import Loader from '@mammoth-ai/cordis-plugin-loader';
import { createUserMessage, createSystemMessage, ToolCallId } from '@mammoth-ai/mmp-llm';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha } from '../src/managed-runtime.ts';
import { fileURLToPath } from 'node:url';
import { restoreReleasedV4Artifact } from '../../../session/session-format-v3-to-v4/src/index.ts';
import { KNOWN_SESSION_EVENT_TYPES, SessionId } from '@mammoth-ai/mmp-session';
import { executeToolFixture } from '@mammoth-ai/mmp-tool-testkit';
import { WorkspaceId } from '@mammoth-ai/mmp-workspace';
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '../../../test-support/agent-loop-testkit/src/index.ts';
import Skills from '../../../skill/skill/src/index.ts';
import { AgentPresetRegistry } from '../../agent-preset-registry/src/index.ts';
import Gallery from '../src/index.ts';
// Runtime contract import keeps the independent Ground project out of Harness's composite tsc graph.
const { buildEvidenceContext } = await import(new URL('../../../../../ground/apps/backend/src/knowledge-core/retrieval.ts', import.meta.url).href) as {buildEvidenceContext(evidence: readonly import('../src/knowledge-protocol.ts').KnowledgeEvidence[], budget?: number): import('../src/knowledge-protocol.ts').KnowledgeResult['context']};
import { knowledgeResultSchema } from '../src/knowledge-protocol.ts';
import { knowledgeProjection, type KnowledgeState } from '../src/knowledge-runtime.ts';
import { GroundLlmAdapter } from '../../../llm/llm-ground/src/adapter.ts';
import { GroundRequestAttribution } from '../../../llm/llm-ground/src/attribution.ts';
const contexts: Context[] = [];
const packageRoots: string[] = [];
afterEach(async () => {
    try {
        for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
    } finally {
        try {
            for (const root of packageRoots.splice(0)) await rm(root, {recursive:true,force:true});
        } finally {
            vi.unstubAllGlobals();
        }
    }
});
const card = { id: 'expert', key: 'expert', kind: 'GENERAL', category: 'common', versionId: 'v1', version: 1, name: 'Expert', summary: '', openingQuestions: [], capabilities: [], avatarUrl: null, executionGranted: true };
const evidence = { knowledgeReleaseId: 'release1', documentId: 'doc1', revisionId: 'rev1', indexRevisionId: 'index1', chunkId: 'chunk1', text: 'FROZEN_EVIDENCE_ONE', locator: { page: 2 }, sourceTitle: 'Exact document' };
async function fixture(policy: 'REQUIRED' | 'AUTO' | 'OFF' = 'REQUIRED', status = 'READY', completeSkill = false) {
    const ctx = new Context();
    contexts.push(ctx);
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: completeSkill, systemPrompt: { personaPrefix: 'STANDARD_NATIVE' } });
    await ctx.plugin(Skills);
    await ctx.plugin(Loader);
    ctx.loader.internal = { version: 'v2', loadCache: new Map(), import: async () => ({ apply() { } }), register() { }, getOrCreateModuleJob() { throw Error('unused'); }, resolveSync() { throw Error('unused'); }, load() { throw Error('unused'); } };
    await ctx.plugin(AgentPresetRegistry, { default: 'standard' });
    await ctx.agentPresets.register({ id: 'standard', plugins: [] });
    const directory = completeSkill ? await mkdtemp(join(tmpdir(), 'mmp-rag-complete-')) : '/tmp';
    if (completeSkill) packageRoots.push(directory);
    const workspace = { id: WorkspaceId('rag-workspace'), path: directory, attachSession: async () => { } };
    ctx.provide('workspaceRegistry', { get: () => workspace } as never);
    ctx.provide('attachments', {} as never);
    const account = { resolveToken: async () => 'synthetic-rag-test-token', rejectToken: async () => { } };
    ctx.provide('deepseekAccount', account as never);
    const attribution = new GroundRequestAttribution();
    ctx.provide('groundRequestAttribution', attribution);
    const wires: {
        body: Record<string, unknown>;
        headers: Headers;
    }[] = [], retrieves: Record<string, unknown>[] = [], opens: Record<string, unknown>[] = [];
    let revoked = false, scope = 'tenant:one', preview = false, large = false, expired = false, pressure = false, supplementalFailed = false, alternating = false, automaticTool = true, hiddenReasoning = false;
    let hold: undefined | {
        ready: () => void;
        wait: Promise<void>;
    };
    const linkedSkill = {id:'complete-method',key:'complete-method',name:'Complete method',summary:'RAG companion',category:null,packageRevision:1,enabledAt:'2026-11-11'};
    const packageData: Record<string,string> = {'SKILL.md':'# Complete method\nCOMPLETE_RAG_METHOD: read references/guide.md.', 'references/guide.md':'COMPLETE_RAG_GUIDE'};
    const files = Object.entries(packageData).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,bytes])=>({path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes),executable:false}));
    const execution = { agentId: card.id, key: card.key, kind: 'GENERAL', versionId: 'v1', version: 1, systemPrompt: 'EXPERT_ROLE', toolScope: [], linkedSkills: completeSkill ? [linkedSkill] : [], executionProtocol: 2, executionConfig: { route: 'KNOWLEDGE_CORE', releaseIds: ['release1'], retrievalPolicy: policy, budgetTokens: 8000, generationModel: { mode: 'FIXED', modelId: 'db-model', modelRef: 'cloud/fixed' }, knowledge: [{ releaseId: 'release1', baseId: 'base1', indexes: [{ indexRevisionId: 'index1', revisionId: 'rev1', documentId: 'doc1', profileId: 'profile1', configHash: 'hash' }] }], skillPackages: [], builtinToolRevision: 'ground-builtins-v1' } };
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : {};
        if (completeSkill && url.includes('/api/official-skills/complete-method/content?')) {
            expect(new URL(url).searchParams.get('packageFormat')).toBe('2');
            return json({...linkedSkill,category:undefined,enabledAt:undefined,instruction:packageData['SKILL.md'],packageFormat:2,files,packageDigest:sha(JSON.stringify(files.map(f=>[f.path,f.bytes,f.sha256,f.executable]))),limits:{maxFiles:500,maxTotalBytes:10485760,maxInstructionBytes:102400}});
        }
        if (completeSkill && url.includes('/api/official-skills/complete-method/resources?')) return new Response(packageData[new URL(url).searchParams.get('path')!]);
        if (url.endsWith('/models'))
            return json({ data: [{ id: 'cloud/fixed', capabilities: { contextWindow: pressure ? 16384 : 64000 } }, { id: 'cloud/other', is_preferred: true, capabilities: { contextWindow: 128000 } }] });
        if (url.endsWith('/chat/completions')) {
            wires.push({ body, headers: new Headers(init?.headers) });
            const delta = wires.length === 1 && policy !== 'OFF' && automaticTool ? { tool_calls: [{ index: 0, id: 'lookup1', type: 'function', function: { name: 'enterprise_knowledge', arguments: JSON.stringify({ query: 'supplemental' }) } }] } : { content: 'Answer [S1].' };
            return new Response('data: ' + JSON.stringify({ choices: [{ index: 0, delta: {...delta,...hiddenReasoning?{reasoning_content:'HIDDEN_REASONING_ONLY'}:{}}, finish_reason: null }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
        }
        if (url.endsWith('/catalog-preferences/scope'))
            return json({ userId: 'user1', scope });
        if (url.endsWith('/catalog-card'))
            return json(card);
        if (url.endsWith('/resolve'))
            return expired ? json({message: 'preview expired'}, 403) : json(preview ? { ...execution, versionId: null, version: 0, preview: { id: 'preview-one', expiresAt: '2026-11-10T10:00:00Z', actorUserId: 'user1', usagePurpose: 'PLATFORM_OPERATIONAL_PREVIEW' } } : execution);
        if (url.endsWith('/runtime/retrieve')) {
            retrieves.push(body);
            if (hold) {
                hold.ready();
                await hold.wait;
            }
            const e = { ...evidence, chunkId: retrieves.length === 1 ? 'chunk1' : 'chunk2', text: pressure ? 'EVIDENCE_START ' + 'x'.repeat(6100) + ' EVIDENCE_END' : large ? '中文证据'.repeat(200) : retrieves.length === 1 ? 'FROZEN_EVIDENCE_ONE' : 'FROZEN_EVIDENCE_TWO' };
            const currentStatus = supplementalFailed && retrieves.length > 1 ? 'FAILED' : status;
            const context = buildEvidenceContext(currentStatus === 'READY' ? [e] : [], 100_000);
            return json({ retrievalId: 'lookup' + retrieves.length, status: currentStatus, queries: [body.query], evidence: context.evidence, degradation: [], timings: {}, context, queryStrategy: 'ORIGINAL' });
        }
        if (url.endsWith('/runtime/history/authorize')) return (revoked || alternating) ? json({message:'revoked'},403) : json({authorized:true});
        if (url.endsWith('/runtime/sources/open')) {
            opens.push(body);
            return revoked ? json({ message: 'revoked' }, 403) : json({ ...evidence, chunkId: body.chunkId, text: pressure ? 'EVIDENCE_START ' + 'x'.repeat(6100) + ' EVIDENCE_END' : large ? '中文证据'.repeat(200) : body.chunkId === 'chunk2' ? 'FROZEN_EVIDENCE_TWO' : evidence.text, sourceStart: 0, sourceEnd: 19 });
        }
        throw Error('Unexpected URL ' + url);
    }));
    const adapter = new GroundLlmAdapter({ providerId: 'mammoth-ground', displayName: 'fixture', origin: 'https://rag.test', account: () => account as never, officialFor: id => attribution.officialFor(id), validateWire: (request, body) => attribution.validateWire(request, body) });
    ctx.llm.registerAdapter(['mammoth-ground'], adapter);
    await ctx.plugin(Gallery, { groundOrigin: 'https://rag.test' });
    await mountAgentLoopTestHarness(ctx);
    return { ctx, adapter, workspace, wires, retrieves, opens, execution, noAutomaticTool:()=>{automaticTool=false;}, hiddenReasoning:()=>{hiddenReasoning=true;}, alternate: () => { alternating = true; }, pressure: () => { pressure = true; }, failSupplement: () => { supplementalFailed = true; }, preview: () => { preview = true; }, expire: () => { expired = true; }, large: () => { large = true; execution.executionConfig.budgetTokens = 512; }, hold: () => { let ready!: () => void, release!: () => void; const started = new Promise<void>(r => ready = r), wait = new Promise<void>(r => release = r); hold = { ready, wait }; return { started, release }; }, revoke: () => { revoked = true; }, changeScope: () => { scope = 'tenant:two'; } };
}
async function run(f: Awaited<ReturnType<typeof fixture>>) {
    const id = await f.ctx.officialAgentGallery.create({ agentId: 'expert', workspaceId: f.workspace.id });
    const agent = f.ctx.agents.get(id)!;
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Current visible question' }], source: { kind: 'user' } }));
    await agent.whenIdle();
    return agent;
}
describe('current-request evidence in actual Ground model wire', () => {
    it('admits REQUIRED before first send, supplemental once without duplicate bodies, fixed route and exact citations', async () => {
        const f = await fixture();
        const agent = await run(f);
        expect(f.wires).toHaveLength(2);
        expect(f.wires.map(w => w.body)).toMatchSnapshot('required first and supplemental second actual model requests');
        const first = JSON.stringify(f.wires[0]!.body), second = JSON.stringify(f.wires[1]!.body);
        expect(first).toContain('FROZEN_EVIDENCE_ONE');
        expect(first).toContain('Conclusions must use only returned evidence.');
        expect(first).not.toContain('FROZEN_EVIDENCE_TWO');
        expect(second.match(/FROZEN_EVIDENCE_ONE/g)).toHaveLength(1);
        expect(second.match(/FROZEN_EVIDENCE_TWO/g)).toHaveLength(1);
        expect(f.wires[0]!.body.model).toBe('cloud/fixed');
        expect(f.wires[0]!.headers.get('x-mmp-official-agent-version-id')).toBe('v1');
        expect(f.retrieves).toHaveLength(2);
        expect(f.retrieves[0]).toMatchObject({ query: 'Current visible question', executionProtocol: 2, versionId: 'v1' });
        expect(f.retrieves[0]).not.toHaveProperty('tenantId');
        expect(JSON.stringify(agent.session.snapshotEvents())).not.toContain('synthetic-rag-test-token');
    });
    it('reauthorizes historical exact source before resending any request', async () => {
        const f = await fixture();
        const agent = await run(f);
        expect(f.wires).toHaveLength(2);
        f.revoke();
        agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Continue' }], source: { kind: 'user' } }));
        await agent.whenIdle();
        expect(f.wires).toHaveLength(2);
        expect(f.opens.some(o => o.chunkId === 'chunk1' && o.revisionId === 'rev1')).toBe(true);
    });
});
async function supplemental(f: Awaited<ReturnType<typeof fixture>>, agent: Awaited<ReturnType<typeof run>>, query = 'extra') {
    const toolSet = await agent.ctx.tools.resolve({ agent, modelSelection: { provider: 'mammoth-ground', model: 'cloud/fixed' }, signal: new AbortController().signal });
    try {
        return await executeToolFixture(f.ctx, { agent, toolSet, name: 'enterprise_knowledge', callId: ToolCallId('extra'), arguments: { query }, signal: new AbortController().signal });
    }
    finally {
        toolSet.dispose();
    }
}
it.each(['NO_EVIDENCE', 'FAILED', 'NOT_CONFIGURED', 'NOT_READY'])('stops REQUIRED %s deterministically before any model request and exposes distinct status', async (status) => {
    const f = await fixture('REQUIRED', status);
    const agent = await run(f);
    expect(f.wires).toHaveLength(0);
    expect(agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')).toMatchObject({data: {reason: {kind: 'error', error: {code: 'EXPERT_KNOWLEDGE_' + status}}}});
    expect(agent.session.snapshotEvents().some(e => e.type === 'assistant/message')).toBe(false);
    expect(f.retrieves).toHaveLength(1);
});
it('AUTO starts without evidence and permits first lookup plus one supplemental lookup', async () => {
    const f = await fixture('AUTO');
    const agent = await run(f);
    expect(f.wires).toHaveLength(2);
    expect(JSON.stringify(f.wires[0]!.body)).not.toContain('FROZEN_EVIDENCE');
    expect(JSON.stringify(f.wires[1]!.body)).toContain('FROZEN_EVIDENCE_ONE');
    await supplemental(f, agent);
    await supplemental(f, agent);
    expect(f.retrieves).toHaveLength(2);
});
it('OFF does not query or expose enterprise_knowledge', async () => { const f = await fixture('OFF'); const agent = await run(f); expect(f.retrieves).toHaveLength(0); expect(f.wires).toHaveLength(1); expect(agent.ctx.tools.get('enterprise_knowledge', agent)).toBeUndefined(); });
it('REQUIRED allows one supplemental lookup, and repeated assembly has no new billable retrieval', async () => {
    const f = await fixture();
    const agent = await run(f);
    await supplemental(f, agent);
    await agent.ctx.systemPrompt.assemble({ scope: agent });
    await agent.ctx.systemPrompt.assemble({ scope: agent });
    expect(f.retrieves).toHaveLength(2);
});
it('immutable preview uses the same actual provider route and creator-attribution headers', async () => {
    const f = await fixture();
    f.preview();
    const id = await f.ctx.officialAgentGallery.createPreview({ agentId: 'expert', previewId: 'preview-one', workspaceId: f.workspace.id });
    const agent = f.ctx.agents.get(id)!;
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Preview question' }], source: { kind: 'user' } }));
    await agent.whenIdle();
    expect(f.wires).toHaveLength(2);
    expect(f.wires[0]!.headers.get('x-mmp-expert-preview-id')).toBe('preview-one');
    expect(f.wires[0]!.headers.has('x-mmp-official-agent-version-id')).toBe(false);
    expect(f.retrieves[0]).toMatchObject({ previewId: 'preview-one' });
    expect(f.retrieves[0]).not.toHaveProperty('versionId');
});
it('limits multibyte body plus wrappers across the combined second request', async () => {
    const f = await fixture();
    f.large();
    await run(f);
    expect(f.wires).toHaveLength(2);
    const second = f.wires[1]!.body.messages as {
        role: string;
        content?: string | null;
    }[];
    const context = second.filter(m => m.content?.includes('Retrieved document data')).map(m => m.content!).join('');
    expect(context.length).toBeGreaterThan(0);
    const toolBytes = second.filter(m => m.role === 'tool').reduce((total, m) => total + Buffer.byteLength(m.content ?? ''), 0);
    // Assert actual context plus status-only results, not just stored budget metadata.
    expect(Buffer.byteLength(context.replace('Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n', '')) + toolBytes).toBeLessThanOrEqual(512);
});
it('cancellation or account switch while retrieval is pending never admits stale evidence', async () => {
    const f = await fixture();
    const hold = f.hold();
    const id = await f.ctx.officialAgentGallery.create({ agentId: 'expert', workspaceId: f.workspace.id }), agent = f.ctx.agents.get(id)!;
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'pending question' }], source: { kind: 'user' } }));
    await hold.started;
    f.changeScope();
    hold.release();
    await agent.whenIdle();
    expect(f.wires).toHaveLength(0);
    expect(f.ctx.sessionProjections.snapshot(agent.session).values.officialExpertKnowledge).toEqual([]);
});
it('historical citation stays on its original exact tuple after another turn; unknown labels reject', async () => {
    const f = await fixture();
    const agent = await run(f);
    const sources = f.ctx.sessionProjections.snapshot(agent.session).values.officialExpertKnowledge!;
    const old = sources[0]!;
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'different question' }], source: { kind: 'user' } }));
    await agent.whenIdle();
    await f.ctx.officialAgentGallery.openKnowledgeSource(agent, old.recordId, old.label);
    expect(f.opens.at(-1)).toMatchObject({ revisionId: 'rev1', chunkId: 'chunk1', versionId: 'v1' });
    await expect(f.ctx.officialAgentGallery.openKnowledgeSource(agent, old.recordId, 'S99')).rejects.toThrow('EXPERT_SOURCE_NOT_FOUND');
    f.revoke();
    await expect(f.ctx.officialAgentGallery.openKnowledgeSource(agent, old.recordId, old.label)).rejects.toThrow('403');
});
it('replayed compacted history retains lineage and refuses revoked facts before any new wire', async () => {
    const f = await fixture();
    const agent = await run(f);
    const rows = agent.session.surface.nodes;
    const first = rows[1]!, last = rows.at(-1)!;
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Summary derived from FROZEN_EVIDENCE_ONE' }], source: { kind: 'user' } }), { surfaceOp: { op: 'replace', startSeq: first, endSeq: last }, sourceEventSeqs: rows.slice(1) });
    const replay = await f.ctx.agents.create({ sessionId: SessionId('replayed-knowledge'), seed: agent.session.snapshotEvents(), agentOptions: { provider: 'mammoth-ground', model: 'cloud/fixed' }, setup: async (c) => { await f.ctx.agentPresets.mount(c, 'standard'); } });
    expect(f.ctx.sessionProjections.snapshot(replay.agent.session).values.officialExpertKnowledge).toHaveLength(2);
    f.revoke();
    replay.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue summary' }], source: { kind: 'user' } }));
    await replay.agent.whenIdle();
    expect(f.wires).toHaveLength(2);
});
it('cancels pending retrieval before any evidence or user request is admitted', async () => {
    const f = await fixture();
    const hold = f.hold(), id = await f.ctx.officialAgentGallery.create({ agentId: 'expert', workspaceId: f.workspace.id }), agent = f.ctx.agents.get(id)!;
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'cancel this question' }], source: { kind: 'user' } }));
    await hold.started;
    agent.cancel({ kind: 'user' });
    hold.release();
    await agent.whenIdle();
    expect(f.wires).toHaveLength(0);
    expect(f.ctx.sessionProjections.snapshot(agent.session).values.officialExpertKnowledge).toEqual([]);
});
it('replays a keyless recorded session through actual AgentLoop, then opens its exact original source', async () => {
    const f = await fixture();
    const path = fileURLToPath(new URL('./fixtures/required-knowledge.events.jsonl', import.meta.url));
    if (process.env.MMP_RAG_RECORD === '1') {
        const recorded = await run(f);
        const ids = new Map<string, string>();
        let count = 0;
        const serialized = JSON.stringify(recorded.session.snapshotEvents(), (key, value) => {
            if (key === 'time')
                return 0;
            if (typeof value === 'string' && (/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value) || /^[0-9a-f]{64}$/.test(value))) {
                if (!ids.has(value))
                    ids.set(value, `recorded-id-${++count}`);
                return ids.get(value);
            }
            return value;
        });
        await writeFile(path, (JSON.parse(serialized) as object[]).map(e => JSON.stringify(e)).join('\n') + '\n');
    }
    const seed = String(await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const restored = await f.ctx.agents.create({ sessionId: SessionId('keyless-recorded-knowledge'), seed, agentOptions: { provider: 'mammoth-ground', model: 'cloud/fixed' }, setup: async (c) => { await f.ctx.agentPresets.mount(c, 'standard'); } });
    const sources = f.ctx.sessionProjections.snapshot(restored.agent.session).values.officialExpertKnowledge!;
    expect(sources.map(s => s.label)).toEqual(['T1L1S1', 'T1L2S1']);
    const before = f.wires.length;
    f.revoke();
    restored.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue recorded facts' }], source: { kind: 'user' } }));
    await restored.agent.whenIdle();
    expect(f.wires).toHaveLength(before);
    await expect(f.ctx.officialAgentGallery.openKnowledgeSource(restored.agent, sources[0]!.recordId, sources[0]!.label)).rejects.toThrow('403');
});
it('an older required-event vocabulary refuses the new recorded knowledge event', async () => {
    const seed = String(await readFile(new URL('./fixtures/required-knowledge.events.jsonl', import.meta.url), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const oldVocabulary = new Set(KNOWN_SESSION_EVENT_TYPES);
    oldVocabulary.delete('official-agent/knowledge');
    expect(() => restoreReleasedV4Artifact({ header: { version: 4, id: 'old-reader', createdAt: 0, isSeeded: false, delegationDepth: 0 }, events: seed, inheritedEventCount: 0 }, oldVocabulary)).toThrow(/unknown event type/);
});

it('never retargets a completed durable citation record during replay', async () => {
    const seed = (await readFile(new URL('./fixtures/required-knowledge.events.jsonl', import.meta.url), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const events = seed.filter(e => e.type === 'official-agent/knowledge');
    let state: KnowledgeState = knowledgeProjection.init();
    for (const event of events) state = knowledgeProjection.apply(state, event);
    const completed = events.findLast(e => e.data.status !== 'PENDING');
    expect(() => knowledgeProjection.apply(state, {...completed, data: {...completed.data, evidence: completed.data.evidence.map((e: Record<string, unknown>) => ({...e, chunkId: 'retargeted'}))}})).toThrow('EXPERT_KNOWLEDGE_RECORD_IMMUTABLE');
});

it('an expired preview cannot send through the standard runtime', async () => {
    const f = await fixture(); f.preview();
    const id = await f.ctx.officialAgentGallery.createPreview({agentId: 'expert', previewId: 'preview-one', workspaceId: f.workspace.id});
    const agent = f.ctx.agents.get(id)!;
    f.expire();
    agent.followup(createUserMessage({content: [{type: 'text', text: 'preview question'}], source: {kind: 'user'}}));
    await agent.whenIdle();
    expect(f.wires).toHaveLength(0); expect(f.retrieves).toHaveLength(0);
});

it('the minimum configured budget admits a bounded explicit exhausted status', async () => {
    const f = await fixture(); f.execution.executionConfig.budgetTokens = 256;
    const agent = await run(f);
    expect(f.wires).toHaveLength(0);
    expect(agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')).toMatchObject({data: {reason: {kind: 'error', error: {code: 'EXPERT_KNOWLEDGE_BUDGET_EXHAUSTED'}}}});
});

it('strictly consumes the real Core cited-evidence builder output in both evidence arrays', () => {
    const context = buildEvidenceContext([evidence]);
    const wire = {retrievalId: 'actual-core-builder', status: 'READY', queries: ['question'], evidence: context.evidence, context, degradation: [], timings: {}, queryStrategy: 'ORIGINAL'};
    const parsed = knowledgeResultSchema.parse(wire);
    expect(parsed.evidence[0]).toMatchObject({citation: 1, chunkId: 'chunk1'});
    expect(parsed.context.evidence).toEqual(parsed.evidence);
    expect(knowledgeResultSchema.safeParse({...wire, evidence: [{...context.evidence[0], inventedControl: true}]}).success).toBe(false);
});

it('fails closed before actual HTTP if final provider fitting changes the recorded evidence section', async () => {
    const f = await fixture(); f.pressure();
    const agent = await run(f);
    expect(f.wires).toHaveLength(2);
    const record = agent.session.snapshotEvents().findLast(e => e.type === 'official-agent/knowledge' && e.data.status !== 'PENDING');
    if (record?.type !== 'official-agent/knowledge') throw Error('missing evidence record');
    const section = record.data.context;
    expect(Buffer.byteLength(section)).toBeLessThanOrEqual(8000);
    const request = {provider: 'mammoth-ground', model: 'cloud/fixed', sessionId: agent.id, messages: [createSystemMessage('S'.repeat(8000)), createUserMessage({content: [{type: 'text', text: 'question'}], source: {kind: 'user'}}), createUserMessage({content: [{type: 'text', text: 'OTHER_NATIVE_CONTEXT ' + 'n'.repeat(14000) + '\n' + section}], source: {kind: 'official-expert-evidence-retired' as const, form: 'snapshot' as const, sections: [{name: 'OTHER_NATIVE_CONTEXT', text: 'n'.repeat(14000)}, {name: 'OFFICIAL_EXPERT_KNOWLEDGE', text: section}]}})]};
    await expect(async () => {for await (const _ of f.adapter.stream(request)) {}}).rejects.toMatchObject({code: 'EXPERT_KNOWLEDGE_WIRE_CHANGED'});
    expect(f.wires).toHaveLength(2);
});

it('a failed supplemental lookup retains valid current evidence and may continue REQUIRED', async () => {
    const f = await fixture(); f.failSupplement();
    const agent = await run(f);
    expect(f.wires).toHaveLength(2);
    expect(JSON.stringify(f.wires[1]!.body)).toContain('FROZEN_EVIDENCE_ONE');
    expect(JSON.stringify(f.wires[1]!.body)).toContain('Lookup 2: FAILED');
    expect(JSON.stringify(f.wires[1]!.body)).not.toContain('FROZEN_EVIDENCE_TWO');
    expect(agent.session.snapshotEvents().findLast(e => e.type === 'turn/end')).toMatchObject({data: {reason: {kind: 'completed'}}});
});
it('AUTO retains explicit failure degradation without imposing REQUIRED no-generation behavior', async () => {
    const f = await fixture('AUTO', 'FAILED'); await run(f);
    expect(f.wires).toHaveLength(2);
    expect(JSON.stringify(f.wires[1]!.body)).toContain('No source text. Disclose status.');
    expect(JSON.stringify(f.wires[1]!.body)).toContain('FAILED');
    expect(JSON.stringify(f.wires)).not.toContain('FROZEN_EVIDENCE');
});


// Expose the owning engine's documented summarizer hook, as its own tests do.
// The real engine builds the request and appends its source-less instruction.
class KnowledgeCompactionEngine extends BasicCompactionEngine {
    summarizeConversation(messages: readonly Message[], agent: Agent) {
        return this.summarize({messages}, agent);
    }
}
it.each([false, true])('real compaction summarizer preserves the registered wire invariant (fit pressure=%s)', async (pressure) => {
    const f = await fixture();
    if (pressure) f.pressure();
    const agent = await run(f);
    expect(f.wires).toHaveLength(2);
    const record = agent.session.snapshotEvents().findLast(e => e.type === 'official-agent/knowledge' && e.data.status !== 'PENDING');
    if (record?.type !== 'official-agent/knowledge') throw Error('missing evidence record');
    const section = record.data.context;
    const native = pressure ? 'n'.repeat(14000) : 'ordinary native context';
    const messages = [createSystemMessage(pressure ? 'S'.repeat(8000) : 'STANDARD_NATIVE'), createUserMessage({
        content: [{type: 'text', text: native + '\n' + section}],
        source: {kind: 'official-expert-evidence-retired' as const, form: 'snapshot' as const, sections: [
            {name: 'OTHER_NATIVE_CONTEXT', text: native}, {name: 'OFFICIAL_EXPERT_KNOWLEDGE', text: section},
        ]},
    })];
    const compaction = new KnowledgeCompactionEngine(f.ctx, {auto: false, maxTokens: 8192});
    const result = compaction.summarizeConversation(messages, agent);
    if (pressure) {
        await expect(result).rejects.toMatchObject({code: 'EXPERT_KNOWLEDGE_WIRE_CHANGED'});
        expect(f.wires).toHaveLength(2);
    } else {
        await expect(result).resolves.toMatchObject({llmStreamCall: true, summary: [{type: 'text', text: 'Answer [S1].'}]});
        expect(f.wires).toHaveLength(3);
        const wire = f.wires[2]!;
        expect(JSON.stringify(wire.body)).toContain(JSON.stringify(section).slice(1, -1));
        expect(wire.body.messages).toEqual(expect.arrayContaining([expect.objectContaining({role: 'user', content: expect.stringContaining('You are now acting as a compaction engine')})]));
        expect(wire.headers.get('x-mmp-official-agent-id')).toBeNull();
    }
});


it('native follow-up transport uses visible transcript and excludes current question and hidden snapshots', async () => {
    const f = await fixture(); const agent = await run(f);
    agent.followup(createUserMessage({content:[{type:'text',text:'那它的期限呢？'}],source:{kind:'user'}}));
    await agent.whenIdle();
    expect(f.retrieves.at(-1)).toMatchObject({query:'那它的期限呢？', context:[{role:'user',content:'Current visible question'},{role:'assistant',content:'Answer [S1].'}]});
    expect(JSON.stringify(f.retrieves.at(-1)!.context)).not.toContain('FROZEN_EVIDENCE');
    expect(f.wires).toHaveLength(3);
    expect(f.retrieves.at(-1)!.context).toMatchSnapshot('native visible follow-up context');
});

it('terminal batch denial prevents historical alternating-source model resend and compaction', async () => {
    const f=await fixture(); const agent=await run(f); f.alternate();
    agent.followup(createUserMessage({content:[{type:'text',text:'Continue'}],source:{kind:'user'}})); await agent.whenIdle();
    expect(f.wires).toHaveLength(2);
    expect(agent.session.snapshotEvents().findLast(e=>e.type==='turn/end')).toMatchObject({data:{reason:{kind:'error'}}});
    const compaction = new KnowledgeCompactionEngine(f.ctx,{auto:false,maxTokens:8192});
    await expect(compaction.summarizeConversation([createUserMessage({content:[{type:'text',text:'previous answer'}],source:{kind:'user'}})],agent)).rejects.toThrow();
    expect(f.wires).toHaveLength(2);
});


it('visible transcript survives model-only replacement and remains bounded before actual follow-up retrieval', async () => {
    const f=await fixture(); f.hiddenReasoning(); const agent=await run(f);
    expect(JSON.stringify(agent.session.snapshotEvents())).toContain('HIDDEN_REASONING_ONLY');
    const human=agent.session.snapshotEvents().find(e=>e.type==='user/message'&&e.data.source.kind==='user');
    if(!human)throw Error('missing human event');
    agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'HIDDEN_MODEL_SUMMARY'}],source:{kind:'user'}}),{surfaceOp:{op:'replace',startSeq:human.seq,endSeq:human.seq},sourceEventSeqs:[human.seq]});
    agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'HIDDEN_RUNTIME_SNAPSHOT'}],source:{kind:'runtime-context',form:'snapshot',sections:[]}}),{surfaceOp:'append'});
    agent.followup(createUserMessage({content:[{type:'text',text:'那它呢？'}],source:{kind:'user'}}));await agent.whenIdle();
    expect(f.retrieves.at(-1)!.context).toEqual([{role:'user',content:'Current visible question'},{role:'assistant',content:'Answer [S1].'}]);
    for(let i=0;i<12;i++)agent.session.append('user/message',createUserMessage({content:[{type:'text',text:`VISIBLE_${i}:`+'字'.repeat(2500)}],source:{kind:'user'}}),{surfaceOp:'append'});
    agent.followup(createUserMessage({content:[{type:'text',text:'末尾追问'}],source:{kind:'user'}}));await agent.whenIdle();
    const context=f.retrieves.at(-1)!.context as {role:string;content:string}[];
    expect(context).toHaveLength(8);expect(context.every(row=>row.content.length===2000)).toBe(true);
    expect(context[0]!.content).toContain('VISIBLE_4:');expect(context.at(-1)!.content).toContain('VISIBLE_11:');
});
it('binding or account-space attempt boundaries clear visible recall while retaining exact historical lineage', async () => {
    const f=await fixture();const agent=await run(f);
    let state:KnowledgeState=knowledgeProjection.init();for(const event of agent.session.snapshotEvents())state=knowledgeProjection.apply(state,event);
    const binding=agent.session.snapshotEvents().find(e=>e.type==='official-agent/bound');if(binding?.type!=='official-agent/bound')throw Error('missing binding');
    expect(state.visible.length).toBeGreaterThan(0);
    state=knowledgeProjection.apply(state,agent.session.append('official-agent/bound',{...binding.data,versionId:'changed'}));
    expect(state.visible).toEqual([]);expect(state.records).toHaveLength(2);
    state=knowledgeProjection.apply(state,agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'isolated account text'}],source:{kind:'user'}}),{surfaceOp:'append'}));
    state=knowledgeProjection.apply(state,agent.session.append('official-gallery/attempt',{protocol:1,requestId:'scope-change',messageId:'scope-change',authScope:{userId:'other',scope:'tenant:other'},selection:{protocol:1,selectionVersion:1,expertRef:null,skillRef:null},selectionHash:'selection',inputHash:'input',compositionHash:'composition',expert:null,skill:null,skillHash:null}));
    expect(state.visible).toEqual([]);expect(state.records).toHaveLength(2);
});
it('long distinct history stops before source I/O and model HTTP instead of truncating lineage',async()=>{
    const f=await fixture();const agent=await run(f);
    const record=agent.session.snapshotEvents().findLast(e=>e.type==='official-agent/knowledge'&&e.data.status!=='PENDING');
    if(record?.type!=='official-agent/knowledge')throw Error('missing record');
    for(let i=0;i<128;i++)agent.session.append('official-agent/knowledge',{...record.data,id:`history-${i}`,evidence:record.data.evidence.map(e=>({...e,chunkId:`historical-${i}`}))});
    const opens=f.opens.length;
    agent.followup(createUserMessage({content:[{type:'text',text:'continue long history'}],source:{kind:'user'}}));await agent.whenIdle();
    expect(f.opens).toHaveLength(opens);expect(f.wires).toHaveLength(2);
    expect(JSON.stringify(agent.session.snapshotEvents().findLast(e=>e.type==='turn/end'))).toContain('EXPERT_SOURCE_HISTORY_LIMIT');
});

it('AUTO cannot export unscoped pre-retrieval history after an account-space switch',async()=>{
 const f=await fixture('AUTO');f.noAutomaticTool();const agent=await run(f);
 expect(f.retrieves).toHaveLength(0);f.changeScope();
 agent.followup(createUserMessage({content:[{type:'text',text:'New space question'}],source:{kind:'user'}}));await agent.whenIdle();
 await supplemental(f,agent);
 expect(f.retrieves[0]!.context).toEqual([]);
});

it('places exact citation and creative-claim rules in the system role without spending the source budget', async () => {
    const f = await fixture();
    await run(f);
    const system = (f.wires.at(-1)!.body.messages as {role:string;content?:string|null}[]).filter(message=>message.role==='system').map(message=>message.content??'').join('\n');
    expect(system).toContain('Cite document facts and methods with their exact returned labels in square brackets');
    expect(system).toContain('File names, headings and guessed URLs are not citations');
    expect(system).toContain('Never quote or reconstruct a passage absent from the returned evidence');
});

it('keeps complete skill copies and REQUIRED evidence together across turns under the real wire guard', async () => {
    const f = await fixture('REQUIRED', 'READY', true);
    f.noAutomaticTool();
    const id = await f.ctx.officialAgentGallery.create({agentId:'expert',workspaceId:f.workspace.id});
    const agent = f.ctx.agents.get(id)!;
    await f.ctx.skills.get('complete-method',{scope:agent,cwd:f.workspace.path});
    const ask = async (text: string) => {
        agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));
        await agent.whenIdle();
    };
    const directoryFrom = (body: Record<string,unknown>) => {
        const match = /Base directory for this skill: ([^\\"<]+)/.exec(JSON.stringify(body));
        expect(match).not.toBeNull();
        return match![1]!;
    };
    await ask('Use the complete method and cite the current evidence.');
    expect(f.wires).toHaveLength(1);
    const first = directoryFrom(f.wires[0]!.body);
    expect(await readFile(join(first,'references/guide.md'),'utf8')).toBe('COMPLETE_RAG_GUIDE');
    expect(JSON.stringify(f.wires[0]!.body)).toContain('COMPLETE_RAG_METHOD');
    expect(JSON.stringify(f.wires[0]!.body)).toContain('FROZEN_EVIDENCE_ONE');
    await ask('Use the same frozen method for this follow-up.');
    expect(f.wires).toHaveLength(2);
    const second = directoryFrom(f.wires[1]!.body);
    expect(second).not.toBe(first);
    await expect(readFile(join(first,'SKILL.md'))).rejects.toThrow();
    expect(await readFile(join(second,'references/guide.md'),'utf8')).toBe('COMPLETE_RAG_GUIDE');
    expect(JSON.stringify(f.wires[1]!.body)).toContain('COMPLETE_RAG_METHOD');
    expect(JSON.stringify(f.wires[1]!.body)).toContain('FROZEN_EVIDENCE_TWO');
    for (const wire of f.wires) {
        expect(wire.body.model).toBe('cloud/fixed');
        expect(wire.headers.get('x-mmp-official-agent-version-id')).toBe('v1');
    }
    const changedWire = {provider:'mammoth-ground',model:'cloud/fixed',sessionId:agent.id,messages:[createUserMessage({content:[{type:'text',text:'Evidence section removed after native assembly.'}],source:{kind:'user'}})]};
    await expect(async () => { for await (const _ of f.adapter.stream(changedWire)) {} }).rejects.toMatchObject({code:'EXPERT_KNOWLEDGE_WIRE_CHANGED'});
    expect(f.wires).toHaveLength(2);
    f.revoke();
    await ask('Do not resend revoked source text.');
    expect(f.wires).toHaveLength(2);
    await f.ctx.parallel('deepseek-account/signed-out');
    await expect(readFile(join(second,'SKILL.md'))).rejects.toThrow();
});
