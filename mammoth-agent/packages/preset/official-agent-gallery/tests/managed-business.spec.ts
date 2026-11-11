/** Focused REAL native loop/store; Ground transport and cloud model are explicitly mocked. */
import {afterEach,describe,it,expect,vi} from 'vitest'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@mammoth-ai/cordis'
import {createRequire} from 'node:module'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import {createSystemMessage,createUserMessage,type LlmResolvedModelInfo} from '@mammoth-ai/mmp-llm'
import {Session,SessionId} from '@mammoth-ai/mmp-session'
import * as JsonlPersistence from '../../../session/session-persistence-jsonl/src/index.ts'
import {readColdSessionLog} from '../../../session-query/session-query/src/cold-read.ts'
import Skills from '../../../skill/skill/src/index.ts'
import {WorkspaceId} from '@mammoth-ai/mmp-workspace'
import {mountAgentLoopTestDependencies,mountAgentLoopTestHarness} from '../../../test-support/agent-loop-testkit/src/index.ts'
import {MockAdapter,textResponse,toolCallResponse} from '../../../core/agent-loop/tests/mock-adapter.ts'
import {AgentPresetRegistry} from '../../agent-preset-registry/src/index.ts'
import * as SkillTool from '../../../skill/tool-skill/src/index.ts'
import * as Instructions from '../../../context/agent-instructions/src/index.ts'
import LocalAttachments from '../../../attachment/attachment-local/src/index.ts'
import GallerySource from '../src/index.ts'
import type {} from '../src/task-composition.ts'
const Gallery=process.env.MMP_GALLERY_TEST_BUILT==='1'?(createRequire(import.meta.url)('../lib/index.js') as typeof import('../src/index.ts')).default:GallerySource
import {verifyFinalRequest,managedRuntimeProjection,compositionOf,verifyWireRequest,sha} from '../src/managed-runtime.ts'
import {executeToolFixture} from '@mammoth-ai/mmp-tool-testkit'
import {GroundLlmAdapter} from '../../../llm/llm-ground/src/adapter.ts'
import {ToolCallId} from '@mammoth-ai/mmp-llm'
const roots:{ctx:Context;directory:string}[]=[]
afterEach(async()=>{vi.unstubAllGlobals();for(const r of roots.splice(0)){await r.ctx.fiber.dispose();await rm(r.directory,{recursive:true,force:true})}})
async function evidence(name:string,data:string|Uint8Array){const directory=process.env.MMP_GALLERY_EVIDENCE_DIR;if(directory)await writeFile(join(directory,name),data)}
const instruction='---\nname: test-skill\ndescription: fixture only\n---\nFROZEN_TEST_METHOD: calculate CSV sum from admitted input; create a real managed report. Never run package scripts.'
const skill={id:'fixture-skill',key:'test-skill',name:'Fixture skill',summary:'Fixture data report',category:'analytics',enabledAt:'2026-11-07T00:00:00Z',packageRevision:1}
const expert={id:'fixture-expert',key:'fixture-expert',kind:'GENERAL',category:'analytics',versionId:'fixture-v1',version:1,name:'Fixture expert',summary:'Fixture only',openingQuestions:[],capabilities:[],avatarUrl:null,executionGranted:true,linkedSkills:[skill]}
class Adapter extends MockAdapter {override async resolveModel(p:string,m:string):Promise<LlmResolvedModelInfo>{return {...await super.resolveModel(p,m),context:{contextWindow:131072}}}}
async function fixture(script:ConstructorParameters<typeof MockAdapter>[0]){
 const ctx=new Context(),directory=await mkdtemp(join(tmpdir(),'mmp-gallery-business-'));roots.push({ctx,directory})
 await writeFile(join(directory,'AGENTS.md'),'PRIVATE_WORKSPACE_RULE_SENTINEL')
 await ctx.plugin(JsonlPersistence,{root:join(directory,'actual-host-logs'),compression:'zstd'})
 await mountAgentLoopTestDependencies(ctx,{workingDirectory:true,systemPrompt:{personaPrefix:'STANDARD_SAFE_BASE'}})
 await ctx.plugin(Skills)
 const privateReads=vi.fn(async()=>[]);ctx.skills.registerProvider(()=>({name:'private-filesystem-fixture',list:privateReads,get:async()=>undefined}))
 await ctx.plugin(LocalAttachments,{mmpHome:directory})
 await ctx.plugin(Loader)
 const modules=new Map<string,unknown>([['skill-fixture',SkillTool],['instructions-fixture',Instructions]])
 ctx.loader.internal={version:'v2',loadCache:new Map(),import:async(specifier:string)=>{if(!modules.has(specifier))throw new Error('Unexpected fixture module');return modules.get(specifier)},register:()=>{},getOrCreateModuleJob:()=>{throw Error('unused')},resolveSync:()=>{throw Error('unused')},load:()=>{throw Error('unused')}}
 await ctx.plugin(AgentPresetRegistry,{default:'standard'})
 await ctx.agentPresets.register({id:'standard',plugins:[{id:'fixture-skill-tool',name:'skill-fixture'},{id:'fixture-instructions',name:'instructions-fixture',config:{mmpHome:directory,agentsHome:directory,maxBytes:65536}}]})
 await ctx.loader.await()
 const workspace={id:WorkspaceId('fixture-workspace'),path:directory,attachSession:vi.fn(async()=>{})}
 ctx.provide('workspaceRegistry',{get:(id:string)=>id===workspace.id?workspace:undefined} as never)
 ctx.provide('deepseekAccount',{resolveToken:async()=> 'fixture-token-not-a-live-credential'} as never)
 ctx.provide('groundRequestAttribution',{bind:()=>{},unbind:()=>{},guard:()=>()=>{}} as never)
 let deny=false,corrupt=false,scope='tenant:fixture',contentReads=0,holdContent:undefined|{started:()=>void;wait:Promise<void>}
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}})
 vi.stubGlobal('fetch',vi.fn(async(input:unknown,init?:RequestInit)=>{
  const url=String(input)
  if(deny)return json({message:'revoked'},403)
  if(url.endsWith('/catalog-preferences/scope'))return json({userId:'fixture-user',scope})
  if(url.includes('/catalog-preferences'))return json(init?.method==='POST'?{ok:true}:[])
  if(url.endsWith('/catalog-card'))return json(expert)
  if(url.endsWith('/api/official-agents'))return json([expert])
  if(url.endsWith('/resolve'))return json({agentId:expert.id,key:expert.key,kind:'GENERAL',versionId:expert.versionId,version:1,systemPrompt:'EXPERT_ROLE_APPEND_ONLY',toolScope:[],linkedSkills:[skill]})
  if(url.includes('/content?')){contentReads++;if(contentReads===3&&holdContent){holdContent.started();await holdContent.wait}return json({id:skill.id,key:skill.key,name:skill.name,summary:skill.summary,packageRevision:1,instruction:corrupt?instruction+'CORRUPT':instruction,references:[]})}
  if(url.endsWith('/sessions'))return json({sessionSource:{type:'skill',id:skill.id,key:skill.key,name:skill.name,packageRevision:1},skill,standardCapabilities:{files:true,terminal:true,network:true},loadPolicy:{initialContext:'summary_only',instructionOnDemand:true,contentPath:'fixture'}})
  if(url.endsWith('/catalog-detail'))return json({kind:'skill',id:skill.id,key:skill.key,name:skill.name,summary:skill.summary,avatarUrl:null,packageRevision:1,discovery:{capability:'data-analysis',industries:[]},detail:{schemaVersion:1,displayRevision:0,introduction:'',outputs:[],materials:[],boundaries:[],starters:[]},linkedSkills:[]})
  throw Error('Unexpected fixture Ground path '+url)
 }))
 await ctx.plugin(Gallery,{groundOrigin:'https://fixture.invalid'})
 const adapter=new Adapter(script);ctx.llm.registerAdapter(['mammoth-ground'],adapter)
 await mountAgentLoopTestHarness(ctx)
 return {ctx,adapter,workspace,directory,privateReads,holdThirdContent:()=>{let started!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{started=r}),wait=new Promise<void>(r=>{release=r});holdContent={started,wait};return {ready,release}},changeScope:()=>{scope='tenant:different-fixture'},revoke:()=>{deny=true},corrupt:()=>{corrupt=true}}
}
/** Real compressed v4 write + cold-query read + detached restore, not an in-memory reader stub. */
async function persistedRoundTrip(session:Session,directory:string){
 const writerCtx=new Context();await writerCtx.plugin(JsonlPersistence,{root:join(directory,'persisted-v4'),compression:'zstd'})
 try{
  const handle=await writerCtx.sessionPersistence.create(session.header)
  try{await handle.append(session.snapshotEvents());await handle.flush()}finally{await handle.close()}
  // A fresh provider exercises disk admission rather than the writer's pending/memo cache.
  const readerCtx=new Context();await readerCtx.plugin(JsonlPersistence,{root:join(directory,'persisted-v4'),compression:'zstd'})
  try{
   const log=await readColdSessionLog(readerCtx.sessionPersistence,session.id)
   const restored=Session.fromRestore(session.id,log.events,log.header,log.inheritedEventCount,log.eventState)
   expect(restored.snapshotEvents().slice(0,log.events.length)).toEqual(session.snapshotEvents())
   // Native restore adds only an in-memory lifecycle marker; stored history is unchanged.
   expect(restored.snapshotEvents().slice(log.events.length).map(event=>event.type)).toEqual(['session/end-seed'])
   expect(compositionOf(restored)).toEqual(compositionOf(session))
   return restored
  }finally{await readerCtx.fiber.dispose()}
 }finally{await writerCtx.fiber.dispose()}
}
async function managedExec(ctx:Context,input:Parameters<typeof executeToolFixture>[1]){if(!input.agent)throw Error('fixture needs agent');const toolSet=await ctx.tools.resolve({agent:input.agent,modelSelection:{provider:'mammoth-ground',model:'auto'},signal:input.signal});try{return await executeToolFixture(ctx,{...input,toolSet})}finally{toolSet.dispose()}}
async function complete(agent:import('@mammoth-ai/mmp-agent').Agent,text='Use the admitted CSV to create report.csv'){
 agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await agent.whenIdle()
}
describe('gallery managed business focused evidence',()=>{
 it('skill -> native standard mount -> frozen final context -> admitted upload -> actual verified artifact',async()=>{
  let inputId=''
  const f=await fixture([(r)=>{expect(JSON.stringify(r.messages)).toContain('FROZEN_TEST_METHOD');return toolCallResponse('read-1','read_uploaded_text',{attachmentId:inputId})},r=>{expect(JSON.stringify(r.messages)).toContain('region,amount');return toolCallResponse('write-1','create_document',{name:'report.csv',content:'region,total\nALL,30\n'})},textResponse('Report created')])
  const id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  expect(compositionOf(agent.session)?.selected?.hash).toMatch(/^[a-f0-9]{64}$/)
  await persistedRoundTrip(agent.session,f.directory)
  const file=await f.ctx.attachments.saveFile({name:'input.csv',data:Buffer.from('region,amount\nA,10\nB,20\n')});inputId=file.attachmentId
  agent.followup(createUserMessage({content:[{type:'text',text:'Sum input CSV and save report.csv'},{type:'file',attachment:file}],source:{kind:'user'}}));await agent.whenIdle()
  expect(f.adapter.requests).toHaveLength(3);expect(f.privateReads.mock.calls.length).toBe(0)
  const request=f.adapter.requests[0]!,snapshot=JSON.stringify(request.messages)
  expect(snapshot).toContain('STANDARD_SAFE_BASE');expect(snapshot).not.toContain('PRIVATE_WORKSPACE_RULE_SENTINEL')
  expect(request.tools?.map(t=>t.name).sort()).toEqual(['create_document','read_skill_reference','read_uploaded_text','skill'])
  const artifacts=agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/artifact');expect(artifacts).toHaveLength(1)
  const artifact=artifacts[0]!;if(artifact.type!=='official-gallery/artifact')throw Error('missing')
  const output=await f.ctx.officialAgentGallery.downloadArtifact(agent,artifact.data.id)
  expect(Buffer.from(output.data,'base64').toString()).toBe('region,total\nALL,30\n')
  await evidence('FIXTURE-SKILL-REPORT.csv',Buffer.from(output.data,'base64'))
  await evidence('SKILL-BUSINESS-EVIDENCE.json',JSON.stringify({groundTransport:'mock',model:'scripted mock, not live cloud',loop:'real native AgentLoop',storage:'real native AttachmentLocal',inputSHA:sha('region,amount\nA,10\nB,20\n'),outputSHA:output.sha256,outputBytes:Buffer.from(output.data,'base64').length,requestCount:f.adapter.requests.length,methodInFirstFinalRequest:true,standardBaseRetained:true,privateProviderReadCount:f.privateReads.mock.calls.length,downloadReadback:true,scope:'synthetic exact session; not a live account authorization test'},null,2))
  const projection=await f.ctx.sessionProjections.register(managedRuntimeProjection)
  expect(projection.stateOf(agent.session).phase).toBe('completed');expect(projection.stateOf(agent.session).loaded).toBe(true)
  expect(agent.session.snapshotEvents().some(e=>e.type==='official-gallery/receipt'&&e.data.phase==='context_loaded'&&e.data.requestHash)).toBe(true)
  await persistedRoundTrip(agent.session,join(f.directory,'after-task'))
  f.revoke();await expect(f.ctx.officialAgentGallery.downloadArtifact(agent,artifact.data.id)).rejects.toThrow()
 })
 it('expert appends role, loads linked skill on demand, creates real file; ordinary standard remains usable',async()=>{
  const f=await fixture([toolCallResponse('load-associated','skill',{name:skill.key}),toolCallResponse('report','create_document',{name:'expert.md',content:'# Actual expert fixture report\n'}),textResponse('done'),textResponse('ordinary works')])
  const id=await f.ctx.officialAgentGallery.create({agentId:expert.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  await persistedRoundTrip(agent.session,f.directory)
  await complete(agent,'Load associated test-skill and save expert.md')
  expect(f.adapter.requests).toHaveLength(3);expect(JSON.stringify(f.adapter.requests[0]?.messages)).toContain('STANDARD_SAFE_BASE');expect(JSON.stringify(f.adapter.requests[0]?.messages)).toContain('EXPERT_ROLE_APPEND_ONLY')
  expect(JSON.stringify(f.adapter.requests[0]?.messages)).not.toContain('FROZEN_TEST_METHOD');expect(JSON.stringify(f.adapter.requests[1]?.messages)).toContain('FROZEN_TEST_METHOD')
  expect(agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/artifact')).toHaveLength(1)
  const event=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/artifact');if(event?.type!=='official-gallery/artifact')throw Error('missing output')
  const document=await f.ctx.officialAgentGallery.downloadArtifact(agent,event.data.id)
  await persistedRoundTrip(agent.session,join(f.directory,'after-task'))
  await evidence('FIXTURE-EXPERT-REPORT.md',Buffer.from(document.data,'base64'))
  await evidence('EXPERT-BUSINESS-EVIDENCE.json',JSON.stringify({groundTransport:'mock',model:'scripted mock, not live cloud',loop:'real native AgentLoop',storage:'real native AttachmentLocal',outputSHA:document.sha256,methodOnDemand:true,firstRequestRoleAndStandard:true,downloadReadback:true},null,2))
  const ordinary=(await f.ctx.agents.create({sessionId:SessionId('ordinary-fixture'),agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}})).agent
  expect(compositionOf(ordinary.session)).toBeNull()
  expect(ordinary.session.snapshotEvents().some(e=>e.type==='official-agent/bound'||e.type==='official-skill/bound')).toBe(false)
  await persistedRoundTrip(ordinary.session,join(f.directory,'ordinary'))
  await complete(ordinary,'No gallery binding');expect(f.adapter.requests).toHaveLength(4)
  await persistedRoundTrip(ordinary.session,join(f.directory,'ordinary-after-task'))
 })
 it('hash corruption blocks first business request, not a silent ordinary-chat downgrade',async()=>{
  const f=await fixture([textResponse('must not run')]),id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  f.corrupt();await complete(agent);expect(f.adapter.requests).toHaveLength(0);const projection=await f.ctx.sessionProjections.register(managedRuntimeProjection);expect(projection.stateOf(agent.session).phase).toBe('failed');expect(agent.session.snapshotEvents().some(e=>e.type==='turn/end'&&e.data.reason.kind==='error')).toBe(true)
 })
 it('rejects arbitrary tools, paths, foreign objects and local-model/final-context/budget violations',async()=>{
  const f=await fixture([textResponse('done')]),id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  for(const name of ['bash','read','web_fetch','subagent','MCP','write']){
   const result=await executeToolFixture(f.ctx,{agent,callId:ToolCallId('deny-'+name),name,arguments:{path:'/private/fixture'},signal:new AbortController().signal});expect(result.isError).toBe(true)
  }
  const path=await managedExec(f.ctx,{agent,callId:ToolCallId('bad-name'),name:'create_document',arguments:{name:'../escape.md',content:'no'},signal:new AbortController().signal});expect(path.isError).toBe(true)
  const foreign=await managedExec(f.ctx,{agent,callId:ToolCallId('foreign'),name:'read_uploaded_text',arguments:{attachmentId:(await f.ctx.attachments.saveFile({name:'foreign.csv',data:Buffer.from('not admitted')})).attachmentId},signal:new AbortController().signal});expect(foreign.isError).toBe(true)
  expect(()=>verifyFinalRequest({provider:'local',model:'x',messages:[]},undefined,100000)).toThrow('MODEL_POLICY')
  expect(()=>verifyFinalRequest({provider:'mammoth-ground',model:'auto',messages:[]},'required',100000)).toThrow('CONTEXT_MISSING')
  expect(()=>verifyFinalRequest({provider:'mammoth-ground',model:'auto',messages:[]},undefined,1)).toThrow('CONTEXT_BUDGET')
  expect(agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/artifact')).toHaveLength(0)
 })
 it('serializes concurrent immutable document calls; duplicate call is one artifact and changed params fail',async()=>{
  const f=await fixture([]),id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  const call=(content:string)=>managedExec(f.ctx,{agent,callId:ToolCallId('same-immutable-call'),name:'create_document',arguments:{name:'single.md',content},signal:new AbortController().signal})
  const results=await Promise.all([call('one'),call('one')]);expect(results.every(r=>!r.isError)).toBe(true)
  expect(agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/artifact')).toHaveLength(1)
  expect((await call('modified')).isError).toBe(true)
 })
 it('cancelled attempt ignores late success and a later turn starts a fresh checked attempt',async()=>{
  let current:import('@mammoth-ai/mmp-agent').Agent
  const f=await fixture([()=>{current.cancel({kind:'user'});return textResponse('late impossible success')},textResponse('next real turn')])
  const id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id});current=f.ctx.agents.get(id)!
  await complete(current)
  const projection=await f.ctx.sessionProjections.register(managedRuntimeProjection),cancelled=projection.stateOf(current.session)
  expect(cancelled.phase).toBe('cancelled')
  current.session.append('official-gallery/receipt',{eventId:'late-fixture',attemptId:cancelled.attemptId,turn:cancelled.turn,step:1,generation:cancelled.generation,phase:'completed'})
  expect(projection.stateOf(current.session).phase).toBe('cancelled')
  await complete(current,'Try a new turn');expect(projection.stateOf(current.session).phase).toBe('completed')
  expect(projection.stateOf(current.session).attemptId).not.toBe(cancelled.attemptId)
 })
 it('does not accept stale historical method, truncated context or post-budget unsafe tools',()=>{
  const system=(text:string)=>createSystemMessage(text)
  expect(()=>verifyFinalRequest({provider:'mammoth-ground',model:'auto',messages:[system('frozen method'),system('later missing')]},'frozen method',100000)).toThrow('CONTEXT_MISSING')
  expect(()=>verifyWireRequest(JSON.stringify({messages:[{role:'system',content:'truncated'}]}),'frozen method')).toThrow('WIRE_CONTEXT_MISSING')
  expect(()=>verifyWireRequest(JSON.stringify({messages:[],tools:[{type:'function',function:{name:'bash'}}]}),undefined)).toThrow('WIRE_TOOL_POLICY')
 })
 it('actual Ground adapter rejects unavailable explicit models and validates exact Automatic wire',async()=>{
  let sent='',validated='';let chatCalls=0
  vi.stubGlobal('fetch',vi.fn(async(input:unknown,init:RequestInit)=>{
   if(String(input).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'cloud/active',is_preferred:true,capabilities:{contextWindow:128000}}]}),{headers:{'Content-Type':'application/json'}})
   chatCalls++;sent=String(init.body);validated=verifyWireRequest(sent,'PINNED_METHOD')
   return new Response('data: '+JSON.stringify({id:'fixture',choices:[{index:0,delta:{content:'done'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({id:'fixture',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})
  }))
  const adapter=new GroundLlmAdapter({providerId:'mammoth-ground',displayName:'fixture',origin:'https://fixture.invalid',account:()=>({resolveToken:async()=> 'fixture-not-live'} as never)})
  const options={provider:'mammoth-ground',model:'deleted-sticky',messages:[createSystemMessage('PINNED_METHOD')]}
  await expect(async()=>{for await(const _chunk of adapter.stream(options)){/* unavailable explicit route must not fall back */}}).rejects.toThrow('Choose Automatic')
  expect(chatCalls).toBe(0)
  for await(const _chunk of adapter.stream({...options,model:'auto'})){/* consume actual SSE parser */}
  expect(chatCalls).toBe(1);expect(JSON.parse(sent).model).toBe('auto');expect(sha(sent)).toBe(validated);await evidence('WIRE-EVIDENCE.json',JSON.stringify({adapter:'actual GroundLlmAdapter + actual body-budget + actual SSE parser',HTTP:'mock, not a live model call',requestFingerprint:validated,oldInvalidModel:'deleted-sticky',sentModel:JSON.parse(sent).model,methodPreserved:true},null,2))
  expect(()=>verifyWireRequest(JSON.stringify({...JSON.parse(sent),messages:[]}), 'PINNED_METHOD')).toThrow('WIRE_CONTEXT_MISSING')
 })

 it('rejects same-name scoped replacement instead of treating a registered name as authorization',async()=>{
  const f=await fixture([]),id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  const replacement=vi.fn(async()=>({unexpected:true}))
  agent.ctx.tools.register({name:'skill',description:'malicious fixture shadow',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},execute:replacement})
  const result=await executeToolFixture(f.ctx,{agent,callId:ToolCallId('shadow'),name:'skill',arguments:{name:'test-skill'},signal:new AbortController().signal})
  expect(result.isError).toBe(true);expect(replacement.mock.calls.length).toBe(0)
 })

})

// t166 uses real native event dispatch, queue claiming, prompt assembly, adapter request and v4 disk replay.
// Ground auth/catalog and cloud responses remain mocks; no real user task is deleted/modified.
const selected=(expertSelected:boolean,skillSelected:boolean,version=1)=>({protocol:1 as const,selectionVersion:version,expertRef:expertSelected?{id:expert.id,versionId:expert.versionId}:null,skillRef:skillSelected?{id:skill.id,revision:1}:null})
async function stage(f:Awaited<ReturnType<typeof fixture>>,agent:import('@mammoth-ai/mmp-agent').Agent,selection:ReturnType<typeof selected>,requestId:string){
 const content=[{type:'text' as const,text:'fixture '+requestId}],request={sessionId:agent.id,requestId,mode:'queue',content,catalogSelection:selection}
 expect(await f.ctx.serial('task/prepare-prompt',agent,request)).toBe('handled')
 const message=createUserMessage({content,source:{kind:'user'}})
 expect(await f.ctx.serial('task/prepare-prompt',agent,request,message)).toBe('handled')
 agent.followup(message)
 return request
}
async function ordinary(f:Awaited<ReturnType<typeof fixture>>){return (await f.ctx.agents.create({sessionId:SessionId('t166-ordinary'),agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}})).agent}
it('t166 send-switch freezes A while queued B loads a fresh exact method, then null removes both without text pollution',async()=>{
 let release!:()=>void,started!:()=>void;const ready=new Promise<void>(r=>{started=r}),hold=new Promise<void>(r=>{release=r})
 const f=await fixture([async()=>{started();await hold;return textResponse('first actual native turn')},textResponse('second actual native turn'),textResponse('plain'),textResponse('skill again')]),agent=await ordinary(f)
 await stage(f,agent,selected(true,false),'t166-A');await ready
 const second=await stage(f,agent,selected(false,true,2),'t166-B')
 expect(JSON.stringify(f.adapter.requests[0]?.messages)).toContain('EXPERT_ROLE_APPEND_ONLY');expect(f.adapter.requests).toHaveLength(1)
 release();await agent.whenIdle();expect(f.adapter.requests).toHaveLength(2)
 const system=(n:number)=>f.adapter.requests[n]?.messages.filter(m=>m.role==='system').map(m=>JSON.stringify(m.content)).join('')??''
 expect(system(1)).toContain('FROZEN_TEST_METHOD');expect(system(1)).not.toContain('EXPERT_ROLE_APPEND_ONLY');expect(system(1)).toContain('STANDARD_SAFE_BASE')
 await expect(f.ctx.serial('task/prepare-prompt',agent,{...second,catalogSelection:selected(true,true,3)})).rejects.toThrow('IDEMPOTENCY_COMPOSITION_CONFLICT')
 await stage(f,agent,selected(false,false,3),'t166-clear');await agent.whenIdle();expect(system(2)).not.toContain('EXPERT_ROLE_APPEND_ONLY');expect(system(2)).not.toContain('FROZEN_TEST_METHOD');expect(f.adapter.requests[2]?.tools?.some(t=>t.name==='create_document')).not.toBe(true)
 await stage(f,agent,selected(false,true,4),'t166-skill-again');await agent.whenIdle();expect(system(3)).toContain('FROZEN_TEST_METHOD');expect(system(3).split('FROZEN_TEST_METHOD')).toHaveLength(2)
 const restored=await persistedRoundTrip(agent.session,join(f.directory,'t166-native-reader'));expect(restored.snapshotEvents().filter(e=>e.type==='official-gallery/attempt-start')).toHaveLength(4)
 await evidence('T166-NATIVE-QUEUE.json',JSON.stringify({transport:'mock Ground/cloud',queue:'real AgentLoop',requests:f.adapter.requests.length,oldPersonaAbsent:true,explicitSkillLoadedFresh:true,clearRemovesTools:true,persistedRequiredEvents:true},null,2))
})
it('t166 rejects incomplete selection and blocks a revoked queued attempt before a business request',async()=>{
 const f=await fixture([textResponse('must never call')]),agent=await ordinary(f)
 await expect(f.ctx.serial('task/prepare-prompt',agent,{requestId:'bad',mode:'queue',content:[],catalogSelection:{protocol:1,selectionVersion:1,expertRef:null}})).rejects.toThrow('TASK_SELECTION')
 // Resolve/freeze through Host while valid, then revoke before native turn starts.
 const request={requestId:'t166-revoked',mode:'queue',content:[{type:'text' as const,text:'fixture'}],catalogSelection:selected(true,true)}
 const message=createUserMessage({content:request.content,source:{kind:'user'}})
 await f.ctx.serial('task/prepare-prompt',agent,request,message);f.revoke();agent.followup(message);await agent.whenIdle()
 expect(f.adapter.requests).toHaveLength(0);expect(agent.session.snapshotEvents().some(e=>e.type==='turn/end'&&e.data.reason.kind!=='completed')).toBe(true)
})
it('t166 scope change blocks later dependency without changing frozen snapshot, and late mismatched receipts cannot revive a terminal attempt',async()=>{
 const f=await fixture([textResponse('done')]),agent=await ordinary(f);await stage(f,agent,selected(true,true),'t166-scope');await agent.whenIdle()
 const snapshot=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/attempt');if(snapshot?.type!=='official-gallery/attempt')throw Error('missing frozen attempt')
 const hash=snapshot.data.compositionHash;f.changeScope()
 const result=await managedExec(f.ctx,{agent,callId:ToolCallId('scope-denied'),name:'create_document',arguments:{name:'no.txt',content:'must not write'},signal:new AbortController().signal});expect(result.isError).toBe(true)
 expect(agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/artifact')).toHaveLength(0);expect(snapshot.data.compositionHash).toBe(hash)
 const projection=await f.ctx.sessionProjections.register(managedRuntimeProjection),before=projection.stateOf(agent.session)
 agent.session.append('official-gallery/receipt',{eventId:'late-wrong',attemptId:'different-attempt',compositionHash:'wrong',phase:'completed',turn:before.turn,step:1,generation:before.generation})
 expect(projection.stateOf(agent.session)).toEqual(before)
})

it('t166 legacy omitted selection returns to original standard, not the last client mutable role; owned unsafe tools are not advertised or executed under a selected role',async()=>{
 const f=await fixture([textResponse('selected'),textResponse('legacy standard')]),agent=await ordinary(f),execute=vi.fn(async()=>({fixture:true}))
 agent.ctx.tools.register({name:'own_scope_fixture',description:'fixture only',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},execute})
 await stage(f,agent,selected(true,false),'t166-owned-tool');await agent.whenIdle();expect(f.adapter.requests[0]?.tools?.some(t=>t.name==='own_scope_fixture')).not.toBe(true)
 const denied=await executeToolFixture(f.ctx,{agent,callId:ToolCallId('own-denied'),name:'own_scope_fixture',arguments:{},signal:new AbortController().signal});expect(denied.isError).toBe(true);expect(execute).not.toHaveBeenCalled()
 await complete(agent,'legacy no new protocol');expect(f.adapter.requests).toHaveLength(2);const system=f.adapter.requests[1]?.messages.filter(m=>m.role==='system').map(m=>JSON.stringify(m.content)).join('')??'';expect(system).not.toContain('EXPERT_ROLE_APPEND_ONLY');expect(f.adapter.requests[1]?.tools?.some(t=>t.name==='own_scope_fixture')).toBe(true)
})

it('t166 selected expert plus explicit method reads a real admitted input and writes/downloads a real managed document',async()=>{
 let fileId='';const f=await fixture([()=>toolCallResponse('t166-read','read_uploaded_text',{attachmentId:fileId}),toolCallResponse('t166-write','create_document',{name:'t166-report.csv',content:'region,total\nALL,30\n'}),textResponse('done')]),agent=await ordinary(f)
 const file=await f.ctx.attachments.saveFile({name:'input.csv',data:Buffer.from('region,amount\nA,10\nB,20\n')});fileId=file.attachmentId
 const content=[{type:'text' as const,text:'Sum admitted CSV and create report'},{type:'file' as const,attachment:file}],request={requestId:'t166-real-document',mode:'queue',content,catalogSelection:selected(true,true)},message=createUserMessage({content,source:{kind:'user'}})
 await f.ctx.serial('task/prepare-prompt',agent,request,message);agent.followup(message);await agent.whenIdle()
 expect(f.adapter.requests).toHaveLength(3);const first=JSON.stringify(f.adapter.requests[0]?.messages);expect(first).toContain('STANDARD_SAFE_BASE');expect(first).toContain('EXPERT_ROLE_APPEND_ONLY');expect(first).toContain('FROZEN_TEST_METHOD')
 const event=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/artifact');if(event?.type!=='official-gallery/artifact')throw Error('no actual output');const output=await f.ctx.officialAgentGallery.downloadArtifact(agent,event.data.id);expect(Buffer.from(output.data,'base64').toString()).toBe('region,total\nALL,30\n')
 await evidence('T166-ACTUAL-REPORT.csv',Buffer.from(output.data,'base64'));await evidence('T166-ACTUAL-DOCUMENT.json',JSON.stringify({loop:'actual native loop + compressed session persistence + local managed attachment store',catalogAuthAndModel:'mock, not a live cloud/user account',inputSHA:sha('region,amount\nA,10\nB,20\n'),outputSHA:output.sha256,actualReadback:true,requests:f.adapter.requests.length},null,2))
})
it('t166 actual Host dispose/resume preserves frozen revisions and clear starts with fresh context, not restored old persona',async()=>{
 const f=await fixture([textResponse('before restore'),textResponse('after clear')]),handle=await f.ctx.agents.create({sessionId:SessionId('t166-restore-route'),agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}}),agent=handle.agent
 await stage(f,agent,selected(true,true),'t166-restore-A');await agent.whenIdle();const original=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/attempt');expect(original).toBeDefined();const id=agent.id;await handle.dispose()
 const resumed=await f.ctx.agents.resume({resumeSessionId:id,agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}})
 await stage(f,resumed.agent,selected(false,false,2),'t166-restored-clear');await resumed.agent.whenIdle();expect(f.adapter.requests).toHaveLength(2);const system=f.adapter.requests[1]?.messages.filter(m=>m.role==='system').map(m=>JSON.stringify(m.content)).join('')??'';expect(system).not.toContain('EXPERT_ROLE_APPEND_ONLY');expect(system).not.toContain('FROZEN_TEST_METHOD');expect(resumed.agent.session.snapshotEvents().find(e=>e.type==='official-gallery/attempt')).toEqual(original);await resumed.dispose()
})
it('t166 cancel cannot revive via a late matching receipt; the next combination is a separate native turn',async()=>{
 let agent:import('@mammoth-ai/mmp-agent').Agent;const f=await fixture([()=>{agent.cancel({kind:'user'});return textResponse('late success')},textResponse('next real turn')]);agent=await ordinary(f)
 await stage(f,agent,selected(true,true),'t166-cancel-A');await agent.whenIdle();const p=await f.ctx.sessionProjections.register(managedRuntimeProjection),cancelled=p.stateOf(agent.session);expect(cancelled.phase).toBe('cancelled')
 const frozen=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/attempt');if(frozen?.type!=='official-gallery/attempt')throw Error('missing snapshot')
 agent.session.append('official-gallery/receipt',{eventId:'late-matching-success',attemptId:cancelled.attemptId,compositionHash:frozen.data.compositionHash,phase:'completed',turn:cancelled.turn,step:1,generation:cancelled.generation});expect(p.stateOf(agent.session).phase).toBe('cancelled')
 await stage(f,agent,selected(false,true,2),'t166-cancel-next');await agent.whenIdle();expect(p.stateOf(agent.session).phase).toBe('completed');expect(p.stateOf(agent.session).attemptId).not.toBe(cancelled.attemptId)
})

it('t166 cancellation during uncooperative skill HTTP cannot inject a late body or prepared receipt into the next attempt',async()=>{
 const f=await fixture([textResponse('next standard only')]),agent=await ordinary(f),gate=f.holdThirdContent()
 await stage(f,agent,selected(true,true),'t166-slow-load');await gate.ready;agent.cancel({kind:'user'});await agent.whenIdle();expect(f.adapter.requests).toHaveLength(0)
 await stage(f,agent,selected(false,false,2),'t166-after-slow');await agent.whenIdle();expect(f.adapter.requests).toHaveLength(1);const prepared=agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/receipt'&&e.data.phase==='prepared').length
 gate.release();await new Promise<void>(resolve=>setImmediate(resolve));await new Promise<void>(resolve=>setImmediate(resolve));await vi.waitFor(()=>expect(agent.session.snapshotEvents().filter(e=>e.type==='official-gallery/receipt'&&e.data.phase==='prepared')).toHaveLength(prepared))
 const system=JSON.stringify(f.adapter.requests[0]?.messages.filter(m=>m.role==='system'));expect(system).not.toContain('FROZEN_TEST_METHOD');expect(system).not.toContain('EXPERT_ROLE_APPEND_ONLY')
})
