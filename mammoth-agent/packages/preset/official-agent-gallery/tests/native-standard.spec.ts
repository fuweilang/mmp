/** t174: native Harness tools/permissions retained; only model+Ground HTTP scripted. */
import {afterEach,describe,it,expect,vi} from 'vitest'
import {mkdtemp,rm,writeFile,readFile,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@mammoth-ai/cordis'
import {createRequire} from 'node:module'
import {z} from 'zod'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import {createUserMessage,type LlmResolvedModelInfo,type GenerateOptions,ToolCallId} from '@mammoth-ai/mmp-llm'
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
const defaultFixtureSkill=skill
class Adapter extends MockAdapter {override async resolveModel(p:string,m:string):Promise<LlmResolvedModelInfo>{return {...await super.resolveModel(p,m),context:{contextWindow:131072}}}}
async function nativeFixture(script:ConstructorParameters<typeof MockAdapter>[0],complete?:{instruction:string;data:Record<string,string|Uint8Array>;summary?:typeof defaultFixtureSkill;content?:unknown}){
 const skill=complete?.summary??defaultFixtureSkill
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
 ctx.provide('groundRequestAttribution',{bind:()=>{},unbind:()=>{},guard:()=>()=>{}} as never)
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
  if(url.includes('/content?')){contentReads++;if(contentReads===3&&holdContent){holdContent.started();await holdContent.wait}if(complete?.content)return json(complete.content);if(complete){const files=Object.entries(complete.data).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,bytes])=>({path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes),executable:path.endsWith('.sh')}));return json({id:skill.id,key:skill.key,name:skill.name,summary:skill.summary,packageRevision:1,instruction:complete.instruction,packageFormat:2,files,packageDigest:sha(JSON.stringify(files.map(f=>[f.path,f.bytes,f.sha256,f.executable]))),limits:{maxFiles:500,maxTotalBytes:10485760,maxInstructionBytes:102400}})}return json({id:skill.id,key:skill.key,name:skill.name,summary:skill.summary,packageRevision:1,instruction:corrupt?instruction+'CORRUPT':instruction,references:[]})}
  if(complete&&url.includes('/resources?'))return new Response(complete.data[new URL(url).searchParams.get('path')!] as BodyInit)
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
 it.skipIf(!process.env.MMP_REAL_SKILL_HANDOFF)('loads the user-supplied poster Skill with every file and runs its own Python helpers without external effects',async()=>{
  const fixturePath=process.env.MMP_REAL_SKILL_HANDOFF!
  const packet=z.object({content:z.record(z.string(),z.unknown()),data:z.record(z.string(),z.string()),report:z.object({archiveSha256:z.string(),archiveBytes:z.number(),packageDigest:z.string()}).passthrough()}).parse(JSON.parse(await readFile(fixturePath,'utf8')))
  const meta=z.object({id:z.string(),key:z.string(),name:z.string(),summary:z.string(),packageRevision:z.literal(1),instruction:z.string()}).passthrough().parse(packet.content)
  const data=Object.fromEntries(Object.entries(packet.data).map(([name,bytes])=>[name,Buffer.from(bytes,'base64')]))
  const selected={id:meta.id,key:meta.key,name:meta.name,summary:meta.summary,category:'content',packageRevision:1,enabledAt:'2026-11-10'}
  const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'"
  const python=process.env.MMP_REAL_SKILL_PYTHON??'python3'
  let root='',directory=''
  const command=(id:string,make:()=>string)=>()=>toolCallResponse(id,'bash',{command:make(),description:'Validate the uploaded Skill helper locally',workdir:directory})
  const astScript="import ast,pathlib,sys; files=sorted(pathlib.Path(sys.argv[1]).glob('scripts/*.py')); [ast.parse(p.read_text(encoding='utf-8'),filename=str(p)) for p in files]; print('SCRIPTS_PARSED',len(files)); print('PYTHON_VERSION',sys.version.split()[0])"
  const authScript="import pathlib,sys; sys.path.insert(0,str(pathlib.Path(sys.argv[1])/'scripts')); import mcp_client\ndef forbidden(*args,**kwargs): raise AssertionError('Unexpected remote call')\ntry: mcp_client.verify(state_dir=pathlib.Path(sys.argv[2]),post_json=forbidden)\nexcept mcp_client.CredentialsMissing as error: print('EXPECTED_AUTH_REQUIRED'); print(str(error))\nelse: raise AssertionError('Expected missing credentials')"
  const generationScript="import json,pathlib,sys; sys.path.insert(0,str(pathlib.Path(sys.argv[1])/'scripts')); import mcp_client\ndef forbidden(*args,**kwargs): raise AssertionError('External requests are disabled for this test')\narguments={'prompt':'Local invocation compatibility test only','model':'auto','count':1,'canvas':{'type':'preset','tier':'2K','aspect':'2:3'},'client_request_id':'local-poster-call-check-024'}\ntry: mcp_client.call_tool('beatra.images.generate',arguments,state_dir=pathlib.Path(sys.argv[2]),post_json=forbidden)\nexcept mcp_client.CredentialsMissing as error: print(json.dumps({'operation':'beatra.images.generate','status':'blocked_missing_credentials','remoteRequests':0,'error':str(error)}))\nelse: raise AssertionError('Expected authorization to block the call')"
  const f=await nativeFixture([
   ()=>toolCallResponse('uploaded-skill-invoke','skill',{name:meta.key}),
   request=>{const text=JSON.stringify(request.messages),match=/Base directory for this skill: ([^\\"<]+)/.exec(text);expect(match).not.toBeNull();root=match![1]!;return toolCallResponse('uploaded-guide','read',{file_path:join(root,'references/poster-routing.md')})},
   command('uploaded-client-help',()=>`${quote(python)} ${quote(join(root,'scripts/mcp_client.py'))} --help`),
   command('uploaded-update-help',()=>`${quote(python)} ${quote(join(root,'scripts/mcp_client.py'))} update --help`),
   command('uploaded-auth-help',()=>`${quote(python)} ${quote(join(root,'scripts/authorize.py'))} --help`),
   command('uploaded-uninstall-help',()=>`${quote(python)} ${quote(join(root,'scripts/uninstall.py'))} --help`),
   command('uploaded-python-parse',()=>`${quote(python)} -c ${quote(astScript)} ${quote(root)}`),
   command('uploaded-missing-auth',()=>`${quote(python)} -c ${quote(authScript)} ${quote(root)} ${quote(join(directory,'isolated-beatra-state'))}`),
   command('uploaded-generate-attempt',()=>`${quote(python)} -c ${quote(generationScript)} ${quote(root)} ${quote(join(directory,'isolated-beatra-state'))}`),
   textResponse('The uploaded Skill loaded locally; Beatra account authorization is required for real poster generation.'),
  ],{instruction:meta.instruction,data,summary:selected,content:packet.content});directory=f.directory
  const id=await f.ctx.officialAgentGallery.createSkill({skillId:meta.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  agent.followup(createUserMessage({content:[{type:'text',text:'Test the selected poster Skill locally: read its reference, inspect CLI help, parse its scripts, and report missing authentication. Do not authorize, update, upload files or generate paid media.'}],source:{kind:'user'}}));await agent.whenIdle()
  expect(Object.keys(data)).toHaveLength(22)
  for(const [path,bytes] of Object.entries(data))expect(await readFile(join(root,path))).toEqual(bytes)
  const results=agent.session.snapshotEvents().filter(event=>event.type==='tool/result').map(event=>({callId:event.data.message.toolCallId,isError:event.data.message.isError??false,content:event.data.message.content}))
  const toolText=(callId:string)=>results.find(result=>result.callId===callId)?.content.flatMap(block=>block.type==='text'?[block.text]:[]).join('\n')??''
  expect(toolText('uploaded-skill-invoke')).toContain('<skill_content name="poster-design-studio">')
  expect(toolText('uploaded-skill-invoke')).toContain(root)
  const attempt=z.object({operation:z.literal('beatra.images.generate'),status:z.literal('blocked_missing_credentials'),remoteRequests:z.literal(0),error:z.string()}).parse(JSON.parse(toolText('uploaded-generate-attempt').trim()))
  await evidence('UPLOADED-POSTER-024.json',JSON.stringify({archiveSha256:packet.report.archiveSha256,archiveBytes:packet.report.archiveBytes,packageDigest:packet.report.packageDigest,filesVerified:22,originalFilesUnchanged:true,model:'scripted mock',GroundHTTP:'fixture using actual import payload and bytes',execution:'real Loader/fs/bash and unmodified bundled Python helpers',BeatraRemoteCalled:false,paidGeneration:false,skillToolInvoked:true,skillToolName:meta.key,generationAttempt:attempt,pythonCommand:python,results},null,2))
  const final=JSON.stringify(f.adapter.requests.at(-1)?.messages)
  for(const marker of ['beatra.images.generate','Streamable HTTP','--auto','--platform','--help','SCRIPTS_PARSED 4','EXPECTED_AUTH_REQUIRED'])expect(final).toContain(marker)
  expect(final).not.toContain('Traceback (most recent call last)')
  expect(results).toHaveLength(9)
  expect(results.every(result=>!result.isError)).toBe(true)

 })
 it('automatically exposes the prepared directory in the first model prompt, records it, and removes idle packages on sign-out',async()=>{
  const body='Read references/guide.md using the prepared skill directory.'
  let root=''
  const f=await nativeFixture([request=>{
   const prompt=JSON.stringify(request.messages)
   const match=/Base directory for this skill: ([^\\"<]+)/.exec(prompt)
   expect(match).not.toBeNull()
   root=match![1]!
   return toolCallResponse('automatic-guide','read',{file_path:join(root,'references/guide.md')})
  },textResponse('Read the guide.')],{instruction:body,data:{'SKILL.md':body,'references/guide.md':'AUTOMATIC_GUIDE_OK'}})
  const id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  agent.followup(createUserMessage({content:[{type:'text',text:'Use the selected skill.'}],source:{kind:'user'}}));await agent.whenIdle()
  expect(await readFile(join(root,'references/guide.md'),'utf8')).toBe('AUTOMATIC_GUIDE_OK')
  expect(JSON.stringify(agent.session.snapshotEvents().filter(e=>e.type==='system/message'))).toContain(root)
  expect(f.adapter.requests[0]?.messages.some(m=>m.role==='tool')).toBe(false)
  await f.ctx.parallel('deepseek-account/signed-out')
  await expect(readFile(join(root,'SKILL.md'))).rejects.toThrow()
 })
 it('loads a complete package through real Loader tools and executes Node, Python and executable Shell resources',async()=>{
  const body='---\nname: test-skill\ndescription: Complete fixture\n---\nUse the native tools to read references/guide.md, run scripts/report.cjs, scripts/report.py and scripts/check.sh, then report any missing dependency honestly.'
  const data:Record<string,string|Uint8Array>={
   'SKILL.md':body,
   'references/guide.md':'READ_GUIDE_OK',
   'references/numbers.json':'[2,3]',
   'assets/settings.json':'{"bonus":5,"asset":"ASSET_OK"}',
   'assets/binary.dat':new Uint8Array([0,255,128,2]),
   'scripts/report.cjs':`const fs=require('node:fs'),p=require('node:path');const n=JSON.parse(fs.readFileSync(p.join(__dirname,'../references/numbers.json')));const a=JSON.parse(fs.readFileSync(p.join(__dirname,'../assets/settings.json')));fs.writeFileSync(process.argv[2],JSON.stringify({sum:n.reduce((x,y)=>x+y,0)+a.bonus,asset:a.asset}));console.log('NODE_SCRIPT_OK');`,
   'scripts/report.py':`import json, pathlib, sys\np=pathlib.Path(__file__).resolve().parent.parent\nn=json.loads((p/'references/numbers.json').read_text())\na=json.loads((p/'assets/settings.json').read_text())\npathlib.Path(sys.argv[1]).write_text(str(sum(n)+a['bonus']))\nprint('PYTHON_SCRIPT_OK')\n`,
   'scripts/check.sh':'#!/bin/sh\nprintf SHELL_SCRIPT_OK\n',
   'scripts/missing.cjs':`require('mmp_fixture_nonexistent_dependency_20261110')`,
  }
  let root='',dir=''
  const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'"
  const fromSkill=(request:GenerateOptions)=>{
   const texts=request.messages.flatMap(m=>m.role==='tool'?m.content:[]).flatMap(b=>b.type==='text'?[b.text]:[])
   const line=texts.join('\n').split('\n').find(line=>line.startsWith('Base directory for this skill: '))
   if(!line)throw Error('model did not receive a skill resource directory')
   return line.slice('Base directory for this skill: '.length)
  }
  const f=await nativeFixture([
   ()=>toolCallResponse('complete-load','skill',{name:skill.key}),
   request=>{root=fromSkill(request);return toolCallResponse('complete-guide','read',{file_path:join(root,'references/guide.md')})},
   ()=>toolCallResponse('complete-node','bash',{command:`${quote(process.execPath)} ${quote(join(root,'scripts/report.cjs'))} ${quote(join(dir,'report.json'))}`,description:'Run the fixture Node script against package references and assets',workdir:dir}),
   ()=>toolCallResponse('complete-python','bash',{command:`python3 ${quote(join(root,'scripts/report.py'))} ${quote(join(dir,'python.txt'))}`,description:'Run the fixture Python script',workdir:dir}),
   ()=>toolCallResponse('complete-shell','bash',{command:quote(join(root,'scripts/check.sh')),description:'Execute the fixture shell script directly using its executable flag',workdir:dir}),
   ()=>toolCallResponse('complete-missing','bash',{command:`${quote(process.execPath)} ${quote(join(root,'scripts/missing.cjs'))}`,description:'Observe the deliberately absent fixture dependency',workdir:dir}),
   textResponse('The report was generated. The deliberately absent dependency failed and was reported.'),
  ],{instruction:body,data});dir=f.directory
  const id=await f.ctx.officialAgentGallery.createSkill({skillId:skill.id,workspaceId:f.workspace.id}),agent=f.ctx.agents.get(id)!
  agent.followup(createUserMessage({content:[{type:'text',text:'Use the complete fixture skill, execute the packaged scripts and report real results.'}],source:{kind:'user'}}));await agent.whenIdle()
  const report=JSON.parse(await readFile(join(dir,'report.json'),'utf8'))
  expect(report).toEqual({sum:10,asset:'ASSET_OK'})
  expect(await readFile(join(dir,'python.txt'),'utf8')).toBe('10')
  expect(await readFile(join(root,'assets/binary.dat'))).toEqual(Buffer.from([0,255,128,2]))
  expect(root.startsWith(join(await realpath(dir),'.mmp/runtime/skill-packages/'))).toBe(true)
  const final=JSON.stringify(f.adapter.requests.at(-1)?.messages)
  for(const marker of ['READ_GUIDE_OK','NODE_SCRIPT_OK','PYTHON_SCRIPT_OK','SHELL_SCRIPT_OK','MODULE_NOT_FOUND','mmp_fixture_nonexistent_dependency_20261110'])expect(final).toContain(marker)
  const results=agent.session.snapshotEvents().filter(e=>e.type==='tool/result').map(e=>({callId:e.data.message.toolCallId,isError:e.data.message.isError??false}))
  expect({report,python:await readFile(join(dir,'python.txt'),'utf8'),results}).toMatchInlineSnapshot(`
    {
      "python": "10",
      "report": {
        "asset": "ASSET_OK",
        "sum": 10,
      },
      "results": [
        {
          "callId": "complete-load",
          "isError": false,
        },
        {
          "callId": "complete-guide",
          "isError": false,
        },
        {
          "callId": "complete-node",
          "isError": false,
        },
        {
          "callId": "complete-python",
          "isError": false,
        },
        {
          "callId": "complete-shell",
          "isError": false,
        },
        {
          "callId": "complete-missing",
          "isError": false,
        },
      ],
    }
  `)
  await evidence('COMPLETE-PACKAGE.json',JSON.stringify({ground:'synthetic HTTP fixture',model:'scripted mock',execution:'real Loader-composed standard Agent + filesystem + local Bash',report,python:'10',binarySHA:sha(await readFile(join(root,'assets/binary.dat'))),results},null,2))
 })
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
  if(kind==='expert'){
    expect(prompt).toContain('EXPERT_ROLE_APPEND_ONLY')
    expect(prompt).toContain('You are an AI agent powered by DeepSeek Harness.')
    expect(prompt).not.toContain('猛犸AI')
    expect(agent.session.snapshotEvents().some(e=>e.type==='official-gallery/answer-identity')).toBe(false)
  }
  if(kind==='skill')expect(prompt).toContain('FROZEN_NATIVE_METHOD')
  if(kind!=='expert'){
    expect(prompt).toContain('你是猛犸AI')
    expect(agent.session.snapshotEvents().some(e=>e.type==='official-gallery/answer-identity')).toBe(true)
  }
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
