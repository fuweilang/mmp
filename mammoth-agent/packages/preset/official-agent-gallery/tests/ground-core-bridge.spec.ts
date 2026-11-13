import { expect, it } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import { Context } from '@mammoth-ai/cordis';
import Loader from '@mammoth-ai/cordis-plugin-loader';
import { createUserMessage, type Message } from '@mammoth-ai/mmp-llm';
import { WorkspaceId } from '@mammoth-ai/mmp-workspace';
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '../../../test-support/agent-loop-testkit/src/index.ts';
import Skills from '../../../skill/skill/src/index.ts';
import { AgentPresetRegistry } from '../../agent-preset-registry/src/index.ts';
import { GroundLlmAdapter } from '../../../llm/llm-ground/src/adapter.ts';
import { GroundRequestAttribution } from '../../../llm/llm-ground/src/attribution.ts';
import Gallery from '../src/index.ts';
import { BasicCompactionEngine } from '@mammoth-ai/mmp-compaction-basic';
import type { Agent } from '@mammoth-ai/mmp-agent';
import { SessionId } from '@mammoth-ai/mmp-session';
import { executeSessionTitleLlm, resolveSessionTitleLlmConfig } from '@mammoth-ai/mmp-session-title-llm';
import { SessionTitleProviderId } from '@mammoth-ai/mmp-session-title';
import { exactSource, type KnowledgeEvidence } from '../src/knowledge-protocol.ts';
class BridgeCompaction extends BasicCompactionEngine {
  summarizeConversation(messages:readonly Message[],agent:Agent){return this.summarize({messages},agent);}
}


interface GroundBridge {
  origin: string; token: string; agentId: string; versionId: string; legacyVersionId: string;
  releaseId: string; indexId: string; documentId: string; revisionId: string; modelRef: string;
  wires: Record<string, unknown>[];
  userId:string; helperModelRef:string;
  retrievals:{transport:{context?:{role:string;content:string}[]};query:string;strategy:string;queries:string[];evidence:KnowledgeEvidence[]}[];
  historyDecisions:{allowed:boolean;entries:unknown[]}[]; sourceReads:string[];
  request(path:string,method?:string,body?:unknown):Promise<unknown>;
  pairRelease():Promise<{versionId:string;releaseId:string}>;
  alternate(documents:string[]):Promise<void>; restoreSources():Promise<void>;
  usage(sessionId:string):Promise<{model:string;threadId:string;agentId:string;modelCalls:number;idempotencyKey:string;meta:Record<string,unknown>}[]>;
  expiringPreview():Promise<{id:string;expiresAt:string}>; waitPreviewExpiry(id:string):Promise<void>;
  rerankCapacity(size:number):Promise<{result:{status:string;degradation:string[];diagnostics:{counts:{mergedCandidates:number;rerankCandidates:number}}};wire:{documents:string[]};profileId:string}>;
  close(): Promise<void>;
  failEmbedding(value: boolean): void;
  replaceAndReindex(): Promise<{versionId: string; releaseId: string; indexId: string; revisionId: string}>;
  cancelAndRetry(): Promise<{status: string}>;
  revoke(enabled: boolean): Promise<void>;
  rollback(): Promise<void>;
}
// Runtime-only boundary: Ground has its own build and dependency graph. No fake Ground HTTP responses.
const { createGroundBridge } = await import(new URL('../../../../../ground/apps/backend/test/knowledge-core/ground-harness.fixture.cjs', import.meta.url).href) as {createGroundBridge(): Promise<GroundBridge>};

it.skipIf(!process.env.RAG_TEST_DATABASE_URL)('real Ground upload/worker/release/publication reaches actual Harness wire and exact historical sources', async () => {
  const ground = await createGroundBridge();
  const ctx = new Context();
  try {
    // Same native AgentLoop composition as current-request-rag.spec.ts; only the Ground transport changes.
    await mountAgentLoopTestDependencies(ctx, { systemPrompt: { personaPrefix: 'STANDARD_NATIVE' } });
    await ctx.plugin(Skills);
    await ctx.plugin(Loader);
    ctx.loader.internal = {version:'v2',loadCache:new Map(),import:async()=>({apply(){}}),register(){},getOrCreateModuleJob(){throw Error('unused');},resolveSync(){throw Error('unused');},load(){throw Error('unused');}};
    await ctx.plugin(AgentPresetRegistry,{default:'standard'});await ctx.agentPresets.register({id:'standard',plugins:[]});
    const workspace={id:WorkspaceId('rag7-workspace'),path:'/tmp',attachSession:async()=>{}};
    ctx.provide('workspaceRegistry',{get:()=>workspace} as never);ctx.provide('attachments',{} as never);
    const account={resolveToken:async()=>ground.token,rejectToken:async()=>{}};ctx.provide('deepseekAccount',account as never);
    const attribution=new GroundRequestAttribution();ctx.provide('groundRequestAttribution',attribution);
    ctx.llm.registerAdapter(['mammoth-ground'],new GroundLlmAdapter({providerId:'mammoth-ground',displayName:'local bridge',origin:ground.origin,account:()=>account as never,officialFor:id=>attribution.officialFor(id),validateWire:(request,body)=>attribution.validateWire(request,body)}));
    await ctx.plugin(Gallery,{groundOrigin:ground.origin});await mountAgentLoopTestHarness(ctx);
    const create=async()=>ctx.agents.get(await ctx.officialAgentGallery.create({agentId:ground.agentId,workspaceId:workspace.id}))!;
    const ask=async(agent:Awaited<ReturnType<typeof create>>,text:string)=>{agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await agent.whenIdle();};
    const original=await create();await ask(original,'项目 XJ-UNIQUE-7 的退款期限是几天？');
    expect(ground.wires).toHaveLength(1);
    expect(JSON.stringify(ground.wires[0])).toContain('BRIDGE_FACT_OLD');
    expect(ground.wires[0]!.model).toBe('engineering-chat');
    const source=ctx.sessionProjections.snapshot(original.session).values.officialExpertKnowledge![0]!;
    expect(source.label).toBe('T1L1S1');
    const opened=await ctx.officialAgentGallery.openKnowledgeSource(original,source.recordId,source.label);
    expect(opened).toMatchObject({knowledgeReleaseId:ground.releaseId,documentId:ground.documentId,revisionId:ground.revisionId,indexRevisionId:ground.indexId,text:'BRIDGE_FACT_OLD：退款期限三天。',locator:{paragraph:1}});
    expect(JSON.stringify(original.session.snapshotEvents())).not.toContain(ground.token);
    expect(original.session.snapshotEvents().some(event=>event.type==='assistant/message')).toBe(true);

    const changed=await ground.replaceAndReindex();
    expect(changed.indexId).not.toBe(ground.indexId);expect(changed.revisionId).not.toBe(ground.revisionId);
    const beforeOldFollowup=ground.wires.length, beforeOldEvents=original.session.snapshotEvents().length;
    await ask(original,'那它的期限呢？');
    expect(ground.wires).toHaveLength(beforeOldFollowup+1);
    expect(ground.retrievals.at(-1)).toMatchObject({query:'那它的期限呢？',strategy:'DETERMINISTIC_CONTEXT'});
    expect(ground.retrievals.at(-1)!.queries.some(q=>q.includes('XJ-UNIQUE-7'))).toBe(true);
    expect(ground.retrievals.at(-1)!.transport.context).toEqual(expect.arrayContaining([{role:'user',content:'项目 XJ-UNIQUE-7 的退款期限是几天？'}]));
    expect(original.session.snapshotEvents().slice(beforeOldEvents).findLast(event=>event.type==='turn/end')).toMatchObject({data:{reason:{kind:'completed'}}});
    expect(JSON.stringify(ground.wires.at(-1))).toContain('BRIDGE_FACT_OLD');
    expect(JSON.stringify(ground.wires.at(-1))).not.toContain('BRIDGE_FACT_NEW');
    expect(await ctx.officialAgentGallery.openKnowledgeSource(original,source.recordId,source.label)).toEqual(opened);
    const latest=await create();await ask(latest,'新的退款期限？');
    expect(JSON.stringify(ground.wires.at(-1))).toContain('BRIDGE_FACT_NEW');
    expect(JSON.stringify(ground.wires.at(-1))).not.toContain('BRIDGE_FACT_OLD');
    const nextSource=ctx.sessionProjections.snapshot(latest.session).values.officialExpertKnowledge![0]!;
    expect(await ctx.officialAgentGallery.openKnowledgeSource(latest,nextSource.recordId,nextSource.label)).toMatchObject({knowledgeReleaseId:changed.releaseId,indexRevisionId:changed.indexId,revisionId:changed.revisionId,locator:{paragraph:1}});

    expect((await ground.cancelAndRetry()).status).toBe('READY');
    ground.failEmbedding(true);
    const failed=await create(), beforeFailure=ground.wires.length;
    await ask(failed,'退款规则？');expect(ground.wires).toHaveLength(beforeFailure);
    expect(failed.session.snapshotEvents().findLast(event=>event.type==='turn/end')).toMatchObject({data:{reason:{kind:'error',error:{code:'EXPERT_KNOWLEDGE_FAILED'}}}});
    ground.failEmbedding(false);
    await ground.revoke(false);
    await expect(ctx.officialAgentGallery.openKnowledgeSource(original,source.recordId,source.label)).rejects.toThrow('403');
    await ask(original,'继续');expect(ground.wires).toHaveLength(beforeFailure);
    await ground.revoke(true);
    await ground.rollback();
    const legacy=await create();await ask(legacy,'不检索的旧路由问题');
    expect(ground.wires).toHaveLength(beforeFailure+1);
    expect(JSON.stringify(ground.wires.at(-1))).not.toContain('BRIDGE_FACT_');
    expect(ctx.sessionProjections.snapshot(legacy.session).values.officialExpertKnowledge).toEqual([]);
    // Rollback changes the new-session default, never the pinned old source.
    expect(await ctx.officialAgentGallery.openKnowledgeSource(original,source.recordId,source.label)).toEqual(opened);
    // Twenty globally fused candidates cross the actual UI profile payload -> supplier boundary.
    const ui=await readFile(new URL('../../../../../ground/apps/frontend/src/components/admin/KnowledgeCoreAdmin.vue',import.meta.url),'utf8');
    const defaultBatch=Number(ui.match(/batchSize: (\d+)/)![1]);
    const capacityReceipts=[];
    for(const size of [defaultBatch,3]){
      const receipt=await ground.rerankCapacity(size); capacityReceipts.push(receipt);
      expect(receipt.result.status).toBe('READY');
      expect(receipt.result.diagnostics.counts.mergedCandidates).toBe(20);
      expect(receipt.wire.documents).toHaveLength(Math.min(size,20));
      expect(receipt.result.diagnostics.counts.rerankCandidates).toBe(Math.min(size,20));
      expect(receipt.result.degradation).not.toContain('RERANK_FAILED_RRF_FALLBACK');
      if(size<20)expect(receipt.result.degradation).toContain('RERANK_GLOBAL_PREFIX_LIMIT');
    }
    const pair=await ground.pairRelease(); const pairAgent=await create(); await ask(pairAgent,'退款和保修期限');
    const pairLookup=ground.retrievals.at(-1)!; expect(pairLookup.evidence).toHaveLength(2);
    const docs=pairLookup.evidence.map(e=>e.documentId), pairSources=pairLookup.evidence.map(exactSource);
    const historyPath=`official-agents/${ground.agentId}/runtime/history/authorize`;
    const batch={userId:ground.userId,scope:'personal',entries:[
      {agentId:ground.agentId,versionId:ground.versionId,executionProtocol:2,sources:[exactSource(opened)]},
      {agentId:ground.agentId,versionId:pair.versionId,executionProtocol:2,sources:pairSources},
    ]};
    expect(await ground.request(historyPath,'POST',batch)).toEqual({authorized:true});
    // The corpus permits A+/B- only: one atomic text+authority proof must reject
    // the set without attempting separate source reads or exporting either body.
    const beforeAlternating=ground.wires.length;
    await ground.alternate(docs); await ask(pairAgent,'继续这些资料');
    expect(ground.sourceReads).toEqual([]);
    expect(ground.historyDecisions.at(-1)?.allowed).toBe(false);
    expect(ground.wires).toHaveLength(beforeAlternating);
    expect(pairAgent.session.snapshotEvents().findLast(e=>e.type==='turn/end')).toMatchObject({data:{reason:{kind:'error'}}});
    const summarizer=new BridgeCompaction(ctx,{auto:false,maxTokens:8192,summarizationProvider:'mammoth-ground',summarizationModel:ground.helperModelRef});
    await ground.alternate(docs);
    await expect(summarizer.summarizeConversation([createUserMessage({content:[{type:'text',text:'Historical visible answer'}],source:{kind:'user'}})],pairAgent)).rejects.toThrow();
    expect(ground.sourceReads).toEqual([]);expect(ground.wires).toHaveLength(beforeAlternating);
    await ground.restoreSources();
    const replay=await ctx.agents.create({sessionId:SessionId('bridge-history-replay'),seed:pairAgent.session.snapshotEvents(),agentOptions:{provider:'mammoth-ground',model:ground.modelRef},setup:async c=>{await ctx.agentPresets.mount(c,'standard');}});
    await ground.alternate(docs); await ask(replay.agent,'重放后的追问');
    expect(ground.sourceReads).toEqual([]);expect(ground.wires).toHaveLength(beforeAlternating);
    await ground.restoreSources();

    const preview=await ground.expiringPreview();
    const previewId=preview.id;
    expect(await ground.request(historyPath,'POST',{...batch,entries:[{agentId:ground.agentId,previewId,executionProtocol:2,sources:pairSources}]})).toEqual({authorized:true});
    const previewAgent=ctx.agents.get(await ctx.officialAgentGallery.createPreview({agentId:ground.agentId,previewId,workspaceId:workspace.id}))!;
    await ask(previewAgent,'项目 TITLE-ORIGIN 的退款期限');
    const human=previewAgent.session.snapshotEvents().find(e=>e.type==='user/message'&&e.data.source.kind==='user');
    if(human?.type!=='user/message')throw Error('missing visible question '+JSON.stringify(previewAgent.session.snapshotEvents().filter(e=>e.type==='turn/end'||e.type==='official-agent/knowledge')));
    const beforeHelpers=ground.wires.length;
    await executeSessionTitleLlm(ctx,resolveSessionTitleLlmConfig({maxInputBytes:4000,maxOutputTokens:100,timeoutMs:10000,provider:'mammoth-ground',model:ground.helperModelRef}),{session:previewAgent.session,messages:[{seq:human.seq,text:'项目 TITLE-ORIGIN 的退款期限'}],signal:new AbortController().signal},SessionTitleProviderId('bridge-title'),{system:'Return a title.',input:'项目 TITLE-ORIGIN 的退款期限',messageSeqs:[human.seq],selectReasoningEffort:()=>undefined});
    await summarizer.summarizeConversation([human.data],previewAgent);
    expect(ground.wires).toHaveLength(beforeHelpers+2);
    expect(ground.wires.slice(-2).map(w=>w.model)).toEqual(['engineering-helper','engineering-helper']);
    await expect.poll(async()=> (await ground.usage(previewAgent.id)).length).toBe(3);
    const usage=await ground.usage(previewAgent.id);
    expect(new Set(usage.map(row=>row.idempotencyKey)).size).toBe(3);
    expect(usage.map(row=>row.modelCalls)).toEqual([1,1,1]);
    expect(usage.every(row=>row.threadId===previewAgent.id&&row.agentId===ground.agentId&&row.meta.actorUserId===ground.userId&&row.meta.previewId===previewId&&row.meta.usagePurpose==='PLATFORM_OPERATIONAL_PREVIEW')).toBe(true);
    expect(usage.map(row=>row.meta.helperPurpose)).toEqual([null,'session-title','compaction']);
    // A purpose header can never disable ordinary FIXED enforcement when ordinary binding is supplied.
    const direct=await fetch(ground.origin+'/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${ground.token}`,'content-type':'application/json','x-mmp-session-id':previewAgent.id,'x-mmp-official-agent-id':ground.agentId,'x-mmp-expert-preview-id':previewId,'x-mmp-helper-purpose':'compaction'},body:JSON.stringify({model:ground.helperModelRef,messages:[{role:'user',content:'main request policy check'}],stream:true})});
    await direct.text();expect(ground.wires.at(-1)!.model).toBe('engineering-chat');
    await ground.waitPreviewExpiry(previewId);
    const afterHelpers=ground.wires.length;
    await expect(ground.request(historyPath,'POST',{...batch,entries:[...batch.entries,{agentId:ground.agentId,previewId,executionProtocol:2,sources:pairSources}]})).rejects.toThrow('403');
    await expect(summarizer.summarizeConversation([human.data],previewAgent)).rejects.toThrow();
    expect(ground.wires).toHaveLength(afterHelpers);
    if (process.env.RAG_BRIDGE_REPORT_PATH) await writeFile(process.env.RAG_BRIDGE_REPORT_PATH, JSON.stringify({
      engineeringOnly:true, supplier:'LOCAL_SYNTHETIC', priceInput:'LOCAL_ENGINEERING_FAKE_PRICE_NOT_INVOICE',
      oldSource:opened, newSource:await ctx.officialAgentGallery.openKnowledgeSource(latest,nextSource.recordId,nextSource.label),
      oldVersionId:ground.versionId, newVersionId:changed.versionId, rollbackVersionId:ground.legacyVersionId,
      wires:ground.wires, retrievals:ground.retrievals, historyDecisions:ground.historyDecisions, capacityReceipts, helperUsage:usage, alternatingModelHttpDelta:0, scenarios:['upload-worker-ready-release-publish','current-wire-exact-source','replacement-new-index','frozen-old-version','cancel-retry','upstream-failure-no-generation','revocation-no-generation','legacy-rollback'],
    }, null, 2)+'\n');
  } finally { await ctx.fiber.dispose(); await ground.close(); }
}, 120_000);
