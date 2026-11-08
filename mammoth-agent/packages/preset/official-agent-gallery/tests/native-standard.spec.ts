/** t174: native Harness tools/permissions retained; only model+Ground HTTP scripted. */
import {afterEach,describe,it,expect,vi} from 'vitest'
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@mammoth-ai/cordis'
import {createRequire} from 'node:module'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import {createUserMessage,type LlmResolvedModelInfo,ToolCallId} from '@mammoth-ai/mmp-llm'
import {SessionId} from '@mammoth-ai/mmp-session'
import * as JsonlPersistence from '../../../session/session-persistence-jsonl/src/index.ts'
import Skills from '../../../skill/skill/src/index.ts'
import {WorkspaceId} from '@mammoth-ai/mmp-workspace'
import {mountAgentLoopTestDependencies,mountAgentLoopTestHarness} from '../../../test-support/agent-loop-testkit/src/index.ts'
import {MockAdapter,textResponse,toolCallResponse} from '../../../core/agent-loop/tests/mock-adapter.ts'
import {AgentPresetRegistry} from '../../agent-preset-registry/src/index.ts'
import * as SkillTool from '../../../skill/tool-skill/src/index.ts'
import * as Instructions from '../../../context/agent-instructions/src/index.ts'
import * as NativeFsTools from '../../../fs/tool-fs/src/index.ts'
import * as NativeBashTool from '../../../shell/tool-bash/src/index.ts'
import FsSandbox from '../../../fs/fs-sandbox/src/index.ts'
import SandboxPolicy,{setSandboxMode} from '../../../sandbox/sandbox-policy/src/index.ts'
import WorkingDirectory from '../../../session/working-directory/src/index.ts'
import SubprocessLocal from '../../../subprocess/subprocess-local/src/index.ts'
import BashLocal from '../../../shell/bash-local/src/index.ts'
import * as ShellEnv from '../../../shell/shell-env/src/index.ts'
import LocalAttachments from '../../../attachment/attachment-local/src/index.ts'
import GallerySource from '../src/index.ts'
import type {} from '../src/task-composition.ts'
import {GroundLlmAdapter} from '../../../llm/llm-ground/src/adapter.ts'
import {executeToolFixture} from '@mammoth-ai/mmp-tool-testkit'
import {sha,compositionOf} from '../src/managed-runtime.ts'
const Gallery=process.env.MMP_GALLERY_TEST_BUILT==='1'?(createRequire(import.meta.url)('../lib/index.js') as typeof import('../src/index.ts')).default:GallerySource
const roots:{ctx:Context;directory:string}[]=[]
afterEach(async()=>{vi.unstubAllGlobals();for(const r of roots.splice(0)){await r.ctx.fiber.dispose();await rm(r.directory,{recursive:true,force:true})}})
async function evidence(name:string,data:string){const directory=process.env.MMP_GALLERY_EVIDENCE_DIR;if(directory)await writeFile(join(directory,name),data)}
const instruction='---\nname: test-skill\ndescription: fixture only\n---\nFROZEN_NATIVE_METHOD: use the original Harness tools; do not execute package scripts.'
const skill={id:'fixture-skill',key:'test-skill',name:'Fixture skill',summary:'Fixture data report',category:'analytics',enabledAt:'2026-11-07T00:00:00Z',packageRevision:1}
const expert={id:'fixture-expert',key:'fixture-expert',kind:'GENERAL',category:'analytics',versionId:'fixture-v1',version:1,name:'Fixture expert',summary:'Fixture only',openingQuestions:[],capabilities:[],avatarUrl:null,executionGranted:true,linkedSkills:[skill]}
class Adapter extends MockAdapter {override async resolveModel(p:string,m:string):Promise<LlmResolvedModelInfo>{return {...await super.resolveModel(p,m),context:{contextWindow:131072}}}}
async function nativeFixture(script:ConstructorParameters<typeof MockAdapter>[0]){
 const ctx=new Context(),directory=await mkdtemp(join(tmpdir(),'mmp-gallery-business-'));roots.push({ctx,directory})
 await writeFile(join(directory,'AGENTS.md'),'PRIVATE_WORKSPACE_RULE_SENTINEL')
 await ctx.plugin(JsonlPersistence,{root:join(directory,'actual-host-logs'),compression:'zstd'})
 await mountAgentLoopTestDependencies(ctx,{workingDirectory:false,systemPrompt:{personaPrefix:'STANDARD_SAFE_BASE'}})
 await ctx.plugin(SandboxPolicy,{mode:'workspace-write',workspaceRoot:directory})
 await ctx.plugin(FsSandbox,{cwd:directory})
 await ctx.plugin(WorkingDirectory)
 await ctx.plugin(SubprocessLocal)
 await ctx.plugin(ShellEnv)
 await ctx.plugin(BashLocal,{cwd:directory,timeoutMs:10000,graceMs:200})
 await ctx.plugin(Skills)
 const privateReads=vi.fn(async()=>[]);ctx.skills.registerProvider(()=>({name:'private-filesystem-fixture',list:privateReads,get:async()=>undefined}))
 await ctx.plugin(LocalAttachments,{mmpHome:directory})
 await ctx.plugin(Loader)
 const modules=new Map<string,unknown>([['skill-fixture',SkillTool],['instructions-fixture',Instructions],['native-fs',NativeFsTools],['native-bash',NativeBashTool]])
 ctx.loader.internal={version:'v2',loadCache:new Map(),import:async(specifier:string)=>{if(!modules.has(specifier))throw new Error('Unexpected fixture module');return modules.get(specifier)},register:()=>{},getOrCreateModuleJob:()=>{throw Error('unused')},resolveSync:()=>{throw Error('unused')},load:()=>{throw Error('unused')}}
 await ctx.plugin(AgentPresetRegistry,{default:'standard'})
 await ctx.agentPresets.register({id:'standard',plugins:[{id:'native-files',name:'native-fs'},{id:'native-bash',name:'native-bash'},{id:'fixture-skill-tool',name:'skill-fixture'},{id:'fixture-instructions',name:'instructions-fixture',config:{mmpHome:directory,agentsHome:directory,maxBytes:65536}}]})
 await ctx.loader.await()
 const workspace={id:WorkspaceId('fixture-workspace'),path:directory,attachSession:vi.fn(async()=>{})}
 ctx.provide('workspaceRegistry',{get:(id:string)=>id===workspace.id?workspace:undefined} as never)
 ctx.provide('deepseekAccount',{resolveToken:async()=> 'fixture-token-not-a-live-credential'} as never)
 ctx.provide('groundRequestAttribution',{bind:()=>{},unbind:()=>{}} as never)
 const wires:Record<string,unknown>[]=[]
 let deny=false,corrupt=false,scope='tenant:fixture',contentReads=0,holdContent:undefined|{started:()=>void;wait:Promise<void>}
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}})
 vi.stubGlobal('fetch',vi.fn(async(input:unknown,init?:RequestInit)=>{
  const url=String(input)
  if(deny)return json({message:'revoked'},403)
  if(url.endsWith('/models'))return json({data:[{id:'cloud/native-active',is_preferred:true,capabilities:{contextWindow:131072}}]})
 if(url.endsWith('/chat/completions')){wires.push(JSON.parse(String(init?.body)));return new Response('data: '+JSON.stringify({id:'native-fixture',choices:[{index:0,delta:{content:'wire accepted'},finish_reason:null}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})}
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
 return {ctx,adapter,workspace,directory,privateReads,wires,holdThirdContent:()=>{let started!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{started=r}),wait=new Promise<void>(r=>{release=r});holdContent={started,wait};return {ready,release}},changeScope:()=>{scope='tenant:different-fixture'},revoke:()=>{deny=true},corrupt:()=>{corrupt=true}}
}

describe('t174 actual native standard execution',()=>{
 it.each(['ordinary','expert','skill'] as const)('%s inherits native tools and really writes/reads/lists/runs bash under native policy',async kind=>{
  let dir='';const f=await nativeFixture([
   ()=>toolCallResponse('native-write','write',{file_path:join(dir,'proof.txt'),content:'NATIVE_FILE_OK\n'}),
   ()=>toolCallResponse('native-read','read',{file_path:join(dir,'proof.txt')}),
   ()=>toolCallResponse('native-command','bash',{command:"pwd; ls -1; printf 'NATIVE_COMMAND_OK\\n'",description:'List isolated fixture directory and print marker',workdir:dir}),
   textResponse('native tools completed'),
  ]);dir=f.directory
  const id=kind==='expert'?await f.ctx.officialAgentGallery.create({agentId:expert.id,workspaceId:f.workspace.id}):kind==='skill'?await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}): (await f.ctx.agents.create({sessionId:SessionId('native-ordinary'),meta:{cwd:dir,agentPreset:'standard'},agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}})).agent.id
  const agent=f.ctx.agents.get(id)!;expect(compositionOf(agent.session)).toBeNull()
  const nativeNames=agent.ctx.tools.definitions(agent).map(t=>t.name).sort()
  expect(nativeNames).toEqual(expect.arrayContaining(['read','write','edit','bash','skill']))
  expect(nativeNames).not.toContain('create_document');expect(nativeNames).not.toContain('read_uploaded_text')
  agent.followup(createUserMessage({content:[{type:'text',text:'Write proof.txt, read it and list this temporary working directory using native tools'}],source:{kind:'user'}}));await agent.whenIdle()
  expect(await readFile(join(dir,'proof.txt'),'utf8')).toBe('NATIVE_FILE_OK\n')
  expect(f.adapter.requests).toHaveLength(4)
  const first=f.adapter.requests[0]!;expect(first.tools?.map(t=>t.name).sort()).toEqual(nativeNames)
  const final=JSON.stringify(f.adapter.requests[3]?.messages);expect(final).toContain('NATIVE_FILE_OK');expect(final).toContain('NATIVE_COMMAND_OK');expect(final).toContain('proof.txt')
  const prompt=JSON.stringify(first.messages);expect(prompt).toContain('STANDARD_SAFE_BASE');expect(prompt).toContain('PRIVATE_WORKSPACE_RULE_SENTINEL');expect(prompt).not.toContain('Host-enforced managed document profile')
  if(kind==='expert')expect(prompt).toContain('EXPERT_ROLE_APPEND_ONLY')
  if(kind==='skill')expect(prompt).toContain('FROZEN_NATIVE_METHOD')
  expect(f.privateReads.mock.calls.length).toBeGreaterThan(0)
  // Real adapter serializes the same tool list after native body budgeting; only HTTP/model are mocked.
  const cloud=new GroundLlmAdapter({providerId:'mammoth-ground',displayName:'fixture',origin:'https://fixture.invalid',account:()=>({resolveToken:async()=> 'synthetic-fixture-not-user-token'} as never)})
  for await(const _chunk of cloud.stream(first)){}
  const wire=f.wires[0] as {tools?:{function:{name:string}}[];model?:string}
  expect(wire.tools?.map(t=>t.function.name).sort()).toEqual(nativeNames);expect(['auto','cloud/native-active']).toContain(wire.model)
  await evidence(`NATIVE-${kind}.json`,JSON.stringify({model:'scripted mock, not live cloud',ground:'synthetic fixture HTTP',execution:'real native AgentLoop + tool-fs + tool-bash + LocalSubprocessRuntime + FsSandbox',nativeNames,wireTools:wire.tools?.map(t=>t.function.name).sort(),fileSHA:sha(await readFile(join(dir,'proof.txt'))),actualReadWriteDirectoryListAndBash:true,standardAndAgentInstructionsRetained:true,profileCompositionWritten:false},null,2))
  setSandboxMode(agent.session,'read-only')
  const toolSet=await agent.ctx.tools.resolve({agent,modelSelection:{provider:'mammoth-ground',model:'auto'},signal:new AbortController().signal})
  try{const denied=await executeToolFixture(f.ctx,{agent,toolSet,name:'write',callId:ToolCallId('native-denied'),arguments:{file_path:join(dir,'must-not-exist.txt'),content:'no'},signal:new AbortController().signal});expect(denied.isError).toBe(true);await expect(readFile(join(dir,'must-not-exist.txt'))).rejects.toThrow()}finally{toolSet.dispose()}
 })
 it('an ordinary explicit null selection installs no catalog runtime or new required event; old managed marker resumes with native tools',async()=>{
  const f=await nativeFixture([textResponse('native old resume')]);const handle=await f.ctx.agents.create({sessionId:SessionId('native-legacy-marker'),meta:{cwd:f.directory,agentPreset:'standard'},agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}}),agent=handle.agent
  const message=createUserMessage({content:[{type:'text',text:'ordinary'}],source:{kind:'user'}})
  await f.ctx.serial('task/prepare-prompt',agent,{requestId:'null-only',mode:'queue',content:message.content,catalogSelection:{protocol:1,selectionVersion:1,expertRef:null,skillRef:null}},message)
  expect(agent.session.snapshotEvents().some(e=>e.type==='official-gallery/attempt')).toBe(false)
  agent.session.append('official-gallery/composition',{version:3,profile:'managed-documents',preset:'standard',selected:null})
  const before=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/composition');const id=agent.id;await handle.dispose()
  const resumed=await f.ctx.agents.resume({resumeSessionId:id,agentOptions:{provider:'mammoth-ground',model:'auto'},setup:async c=>{await f.ctx.agentPresets.mount(c,'standard')}})
  expect(resumed.agent.session.snapshotEvents().find(e=>e.type==='official-gallery/composition')).toEqual(before)
  resumed.agent.followup(createUserMessage({content:[{type:'text',text:'continue original native standard'}],source:{kind:'user'}}));await resumed.agent.whenIdle()
  expect(f.adapter.requests[0]?.tools?.map(t=>t.name)).toEqual(expect.arrayContaining(['read','write','bash']))
  await resumed.dispose()
 })
})
