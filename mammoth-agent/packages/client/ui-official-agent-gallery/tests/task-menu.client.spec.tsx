// @vitest-environment jsdom
/** Real Cordis + composer + input-trigger/controller + command registry + gallery selectors.
 * Only transport/catalog/Session prompt are fixture doubles; no user records or cloud calls. */
import '../../ui-conversation/tests/control-row-dom.ts'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { act, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages, stubConfigForm } from '@mammoth-ai/mmp-client-test-runtime'
import { LocaleRuntime } from '@mammoth-ai/mmp-client-locale/client'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import { apply as menus, inject as menusInject } from '@mammoth-ai/mmp-client-ui-context-menu/client'
import { apply as triggers, inject as triggersInject } from '@mammoth-ai/mmp-client-ui-input-trigger/client'
import { apply as commands, inject as commandsInject } from '@mammoth-ai/mmp-client-ui-commands/client'
import { apply as conversation, inject as conversationInject } from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { PropsRenderSlots } from '@mammoth-ai/mmp-client-ui-slots'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import * as gallerySource from '../src/client/index.ts'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as Primitives from '@mammoth-ai/mmp-client-ui-primitives'
import * as Store from '@mammoth-ai/mmp-client-store'
import {createClientModuleSystem,type ClientModuleLoaderTarget,type MmpWindow} from '../../modules/src/client/index.ts'
async function loadBuilt(){
 const win=window as MmpWindow,previous=win.__ModuleLoader__
 const target:ClientModuleLoaderTarget={mode:'queue',pendingQueue:[],load(registration){this.pendingQueue.push(registration)},create(options){return createClientModuleSystem(this,{id:'@mammoth-ai/mmp-client-modules',exports:{}},options)}}
 win.__ModuleLoader__=target
 try{
  const loader=target.create({boot:{rev:'t175',entries:[],batches:[]},staticModules:{react:React,'react/jsx-runtime':JsxRuntime,'@mammoth-ai/mmp-client-ui-primitives':Primitives,'@mammoth-ai/mmp-client-store':Store}})
  // The actual registration script, native ModuleSystem materialization and CSS injection.
  new Function('window',readFileSync(process.cwd()+'/packages/client/ui-official-agent-gallery/lib/client.js','utf8'))(window)
  const loaded=await loader.import('@mammoth-ai/mmp-client-ui-official-agent-gallery')
  if(typeof loaded!=='object'||loaded===null||!('apply'in loaded)||typeof loaded.apply!=='function'||!('inject'in loaded)||!Array.isArray(loaded.inject))throw Error('Invalid built gallery exports')
  return loaded as typeof gallerySource
 }finally{if(previous===undefined)delete win.__ModuleLoader__;else win.__ModuleLoader__=previous}
}
const {apply:gallery,inject:galleryInject}=process.env.MMP_T175_BUILT==='1'?await loadBuilt():gallerySource
usePinnedBrowserLanguages('zh-CN')
HTMLElement.prototype.scrollIntoView=()=>{}
Range.prototype.getBoundingClientRect=()=>({top:0,bottom:0,left:0,right:0,width:0,height:0,x:0,y:0,toJSON:()=>({})})
beforeEach(()=>{localStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const sid=SessionId('t175-isolated-fixture')
function Root({renderSlot}:PropsRenderSlots<'main'|'shell.overlay'>){return <>{renderSlot('main',{}, {entryKey:'conversation'})}{renderSlot('shell.overlay',{})}</>}
const expert={id:'expert-fixture',key:'writer',name:'写作专家',summary:'优化表达',versionId:'version-fixture',version:1,kind:'GENERAL',category:'content',openingQuestions:[],capabilities:[],avatarUrl:null,executionGranted:true}
const skill={id:'skill-fixture',key:'document',name:'文档技能',summary:'整理文档',avatarUrl:null,packageRevision:2,detail:{starters:[]}}
async function bench(){
 const r=await SlotTestRuntime.create();onTestFinished(()=>r.dispose())
 const locale=new LocaleRuntime(r.ctx);r.ctx.provide('locale',locale);r.slots.installLocale(locale)
 r.ctx.provide('configForms',{developerTools:{enabled:createSnapshotStore(true)},get:()=>stubConfigForm().scope} as never)
 r.ctx.provide('shortcuts',{catalog:createSnapshotStore([])})
 r.ctx.provide('uiWorkspace',{openSession:vi.fn(),workspaceForNewSession:()=>undefined} as never)
 const prompt=vi.fn(async()=>({ok:true as const,value:{accepted:true as const}}))
 await r.sessions.add({id:sid,summary:{title:'Fixture',displayTitle:'Fixture',cwd:'/tmp'},session:{prompt}})
 r.sessions.retainFor(r.ctx,sid,{source:'mainView'})
 r.remote.provideNamespaces({commands:{list:async()=>({ok:true,value:[]})},officialAgentGallery:{
  preferences:async(kind:string)=>({ok:true,value:[{resourceId:kind==='expert'?expert.id:skill.id}]}),
  expertCard:async()=>({ok:true,value:expert}),catalogDetail:async()=>({ok:true,value:skill}),
  favourite:async()=>({ok:true,value:null}),pageExperts:async()=>({ok:true,value:{items:[expert],hasMore:false,nextCursor:null}}),pageSkills:async()=>({ok:true,value:{items:[skill],hasMore:false,nextCursor:null}})
 }})
 await r.mount({inject:[...menusInject],apply:menus})
 await r.root.declare({'main':{kind:'keyed',scope:'root'},'shell.overlay':{kind:'list',scope:'root'}} as const,Root)
 await r.mount({inject:[...triggersInject],apply:triggers})
 await r.mount({inject:[...commandsInject],apply:commands})
 await r.mount({inject:[...conversationInject],apply:conversation})
 await r.mount({inject:[...galleryInject],apply:gallery})
 const view=r.renderRoot();const binding=r.sessions.binding(sid)!;const input=r.ctx.conversation.input.for(binding.ctx)
 return {r,view,binding,input,prompt}
}
async function open(f:Awaited<ReturnType<typeof bench>>){
 fireEvent.click(f.view.getByRole('button',{name:'添加文件或调用指令'}))
 await waitFor(()=>expect(f.view.getByRole('option',{name:/引用企业资料/})).toBeTruthy())
 expect(f.view.getByRole('option',{name:/选择专家/})).toBeTruthy()
 expect(f.view.getByRole('option',{name:/选择技能/})).toBeTruthy()
}
it('t175 actual + opens all three contributions using id-only session context, not SessionFace',async()=>{
 const f=await bench();await open(f)
 expect(f.view.getByRole('listbox')).toBeTruthy()
})
it('t175 + expert/skill choose removable tags; cancelling preserves user text and next send is standard',async()=>{
 const f=await bench();await act(async()=>{f.input.setDraft('原始问题')});await open(f)
 fireEvent.mouseDown(f.view.getByRole('option',{name:/选择专家/}))
 const expertDialog=await f.view.findByRole('dialog',{name:'选择专家'})
 await waitFor(()=>expect(within(expertDialog).getByText('写作专家')).toBeTruthy())
 fireEvent.click(within(expertDialog).getByRole('button',{name:'选择'}))
 await waitFor(()=>expect(f.input.state.getSnapshot().catalogSelection?.expertRef?.id).toBe(expert.id))
 expect(f.input.state.getSnapshot().draft).toBe('原始问题')
 await open(f);fireEvent.mouseDown(f.view.getByRole('option',{name:/选择技能/}))
 const skillDialog=await f.view.findByRole('dialog',{name:'选择技能'})
 await waitFor(()=>expect(within(skillDialog).getByText('文档技能')).toBeTruthy())
 fireEvent.click(within(skillDialog).getByRole('button',{name:'选择'}))
 await waitFor(()=>expect(f.input.state.getSnapshot().catalogSelection?.skillRef?.revision).toBe(2))
 fireEvent.click(f.view.getByRole('button',{name:'发送消息'}))
 await waitFor(()=>expect(f.prompt).toHaveBeenCalledTimes(1))
 const accepted=f.prompt.mock.calls[0] as readonly unknown[]
 expect(accepted[0]).toEqual([{type:'text',text:'原始问题'}])
 expect(accepted[4]).toMatchObject({protocol:1,expertRef:{id:expert.id,versionId:expert.versionId},skillRef:{id:skill.id,revision:2}})
 await waitFor(()=>expect(f.input.state.getSnapshot().phase).toBe('plain'))
 await act(async()=>{f.input.setDraft('原始问题')})
 fireEvent.click(f.view.getByRole('button',{name:/^移除专家/}));fireEvent.click(f.view.getByRole('button',{name:/^移除技能/}))
 expect(f.input.state.getSnapshot().catalogSelection).toMatchObject({expertRef:null,skillRef:null})
 expect(f.input.state.getSnapshot().draft).toBe('原始问题')
 fireEvent.click(f.view.getByRole('button',{name:'发送消息'}))
 await waitFor(()=>expect(f.prompt).toHaveBeenCalledTimes(2))
 const cleared=f.prompt.mock.calls[1] as readonly unknown[]
 expect(cleared[4]).toMatchObject({expertRef:null,skillRef:null})
})
it('t175 + enterprise reference checks state and tag cancellation does not edit text or retrieve',async()=>{
 const f=await bench();const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 await act(async()=>{f.input.setDraft('企业资料是普通文字')});await open(f)
 fireEvent.mouseDown(f.view.getByRole('option',{name:/引用企业资料/}))
 await waitFor(()=>expect(f.input.state.getSnapshot().enterpriseKnowledge).toBe(true))
 expect(f.input.state.getSnapshot().draft).toBe('企业资料是普通文字')
 fireEvent.click(f.view.getByRole('button',{name:'取消引用企业资料'}))
 expect(f.input.state.getSnapshot().enterpriseKnowledge).not.toBe(true)
 expect(f.input.state.getSnapshot().draft).toBe('企业资料是普通文字');expect(fetch).not.toHaveBeenCalled()
})
