// @vitest-environment jsdom
import { Context, Service } from '@mammoth-ai/cordis'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ClientWorkspaceModel, WorkspaceController } from '@mammoth-ai/mmp-api-workspace-controller/client'
import type {} from '@mammoth-ai/mmp-api-remotes/client'

class RootRemote extends Service { constructor(ctx: Context) { super(ctx, 'remote') } }
class SessionNamespace extends Service { constructor(ctx: Context) { super(ctx, 'remote.session') } }
class WorkspaceNamespace extends Service { constructor(ctx: Context) { super(ctx, 'remote.workspace') } }

describe('t170/t171 real Cordis negative controls', () => {
  it('root remote injection alone reproduces the exact production namespace denial after apply returns', async () => {
    const ctx = new Context();await ctx.plugin({apply(c){new RootRemote(c)}}).await();await ctx.plugin({apply(c){new SessionNamespace(c)}}).await();await ctx.plugin({apply(c){new WorkspaceNamespace(c)}}).await()
    let read = () => ctx.remote.session
    const legacy=ctx.plugin({inject:['remote'],apply(c){read=()=>c.remote.session}});await legacy.await()
    expect(()=>read()).toThrow('cannot get property "remote.session" without inject')
    let correct=()=>ctx.remote.session
    const fixed=ctx.plugin({inject:['remote','remote.session','remote.workspace'],apply(c){correct=()=>c.remote.session;expect(c.remote.workspace).toBeDefined()}});await fixed.await()
    await Promise.resolve();expect(correct()).toBeDefined()
    await ctx.fiber.dispose()
  })
  it('the production workspace model methods really require their receiver (not a fake arrow-function store)', () => {
    // This remote is never called: the constructor only creates the pending native model snapshot.
    const ctx=new Context();new RootRemote(ctx);new WorkspaceNamespace(ctx)
    const model=new ClientWorkspaceModel(ctx.remote.workspace)
    const snapshot=model.getSnapshot
    expect(()=>snapshot()).toThrow()
    expect(model.getSnapshot().phase).toBe('pending')
    const subscribe=model.subscribe
    expect(()=>subscribe(()=>{})).toThrow()
  })
})

// Native renderer/slot registration and sibling Cordis services; no real user/Host/data.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages, RemoteError, StaticRemoteAccess } from '@mammoth-ai/mmp-client-test-runtime'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import { LocaleRuntime } from '@mammoth-ai/mmp-client-locale/client'
import { apply as menusApply, inject as menusInject } from '@mammoth-ai/mmp-client-ui-context-menu/client'
import { apply as workspaceApply, inject as workspaceInject } from '../src/client/index.ts'
import { apply as settingsApply, inject as settingsInject } from '../../ui-settings-general/src/client/index.ts'
import type { PropsRenderSlots } from '@mammoth-ai/mmp-client-ui-slots'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { WorkspaceId } from '@mammoth-ai/mmp-api-workspace-controller/client'
usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)
const SID='t170-fixture' as SessionId
const WID='t170-workspace' as WorkspaceId
function Frame({renderSlot}:PropsRenderSlots<'sidebar.settings'|'shell.overlay'>){return <>{renderSlot('sidebar.settings',{wide:true})}{renderSlot('shell.overlay',{})}</>}
class UiRemote extends Service {
  readonly $host={isLoopback:false,home:undefined}
  constructor(c:Context){super(c,'remote')}
  $on(){return ()=>{}}
}
async function fixture(options:{archived?:boolean;count?:number;failure?:string;running?:boolean;deny?:boolean;legacy?:boolean}={}){
 const runtime=await SlotTestRuntime.create()
 const ctx=runtime.ctx.isolate('remote').isolate('remote.session').isolate('remote.workspace').isolate('workspaces').isolate('remoteAccess')
 new UiRemote(ctx)
 ctx.provide('remote.directoryPicker',{})
 ctx.provide('remote.settings',{})
 ctx.provide('connection',{state:createSnapshotStore('connected'),reconnect:vi.fn()})
 ctx.provide('configForms',{})
 ctx.provide('modules',{entries:{releaseChange:createSnapshotStore(null),dismissRelease:vi.fn()}})
 ctx.provide('shortcuts',{catalog:createSnapshotStore([]),register:()=>()=>{}})
 ctx.provide('layout',{selectPanel:vi.fn(),beginNavigation:()=>new AbortController().signal})
 const locale=new LocaleRuntime(ctx);ctx.provide('locale',locale);runtime.slots.installLocale(locale)
 const calls:string[]=[];let allowed=!options.deny;let uiAllowed=true
 new StaticRemoteAccess(ctx,action=>action!=='session/deleteTask'||uiAllowed)
 const remove=vi.fn(async()=>{
  if(!allowed)return {ok:false as const,error:new RemoteError('gateway/internal','permission denied',{})}
  if(options.running)calls.push('stop')
  if(options.failure)return {ok:false as const,error:new RemoteError('gateway/internal',options.failure,{})}
  calls.push('delete');return {ok:true as const,value:{}}
 })
 await ctx.plugin({apply(c){class SessionRemote extends Service {
  constructor(){super(c,'remote.session')}
  deleteTask=remove
  events=vi.fn(async()=>({ok:true as const,value:{records:[],cursor:0,hasMore:false}}))
 };new SessionRemote()}}).await()
 let model:ClientWorkspaceModel
 const baseline=(ids:SessionId[])=>({items:[{workspaceId:WID,title:'Fixture workspace',path:'/fixture',sessionIds:ids,createdAt:'0',updatedAt:'0'}],archivedSessionIds:options.archived?ids:[],pinnedSessionIds:[]})
 const ids=Array.from({length:options.count??1},(_,i)=>(i?`fixture-${i}`:SID) as SessionId)
 await ctx.plugin({apply(c){class WorkspaceRemote extends Service {
  constructor(){super(c,'remote.workspace')}
  async archiveSession(){calls.push('archive');return {ok:true as const,value:{archivedSessionIds:ids}}}
  async unarchiveSession(){calls.push('restore');model.replaceArchived([]);return {ok:true as const,value:{archivedSessionIds:[]}}}
 };new WorkspaceRemote()}}).await()
 model=new ClientWorkspaceModel(ctx.remote.workspace)
 model.replaceBaseline(baseline(ids))
 const retry=vi.fn(async()=>{model.replaceBaseline(baseline(ids))})
 new WorkspaceController(ctx,model,retry)
 for (const [i,id] of ids.entries())await runtime.sessions.add({id,summary:{title:`Fixture ${i}`,displayTitle:`Fixture ${i}`,cwd:'/fixture',running:!!options.running}})
 runtime.releaseWorkspaceSource()
 await runtime.root.declare({'sidebar.settings':{kind:'single',scope:'root'},'shell.overlay':{kind:'list',scope:'root'}},Frame)
 await ctx.plugin({inject:[...menusInject],apply:menusApply}).await()
 const inject=options.legacy?workspaceInject.filter(x=>x!=='remote.session'&&x!=='remote.workspace'):[...workspaceInject]
 await ctx.plugin({inject,apply:workspaceApply}).await()
 await ctx.plugin({inject:[...settingsInject],apply:settingsApply}).await()
 runtime.renderRoot()
 const open=async()=>{await act(async()=>{ctx.emit('settings/open-section','data-management')})}
 const openDelete=async()=>{const menu=ctx.contextMenus.resolve({kind:'session',value:{sessionId:SID,displayTitle:'Fixture 0'}});await menu.ready;const row=menu.source.getSnapshot().find(x=>x.id.endsWith('/delete-task'));expect(row).toBeDefined();await act(async()=>{menu.select(row!.id)});menu.dispose()}
 return {runtime,ctx,model,remove,retry,calls,ids,open,openDelete,setAllowed(value:boolean){allowed=value},setUiAllowed(value:boolean){uiAllowed=value}}
}
describe('t170/t171 registered settings + task delete surfaces',()=>{
 it('reproduces the original DI error through the real menu/overlay closure with legacy inject',async()=>{
  const f=await fixture({legacy:true});try{await f.openDelete();fireEvent.click(screen.getByRole('button',{name:'停止并永久删除'}));expect((await screen.findByRole('alert')).textContent).toContain('cannot get property "remote.session" without inject');expect(f.remove).not.toHaveBeenCalled()}finally{await f.runtime.dispose()}
 })
 it('inactive task from menu deletes only after confirm; cancel has no remote action',async()=>{
  const f=await fixture();try{await f.openDelete();fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(f.remove).not.toHaveBeenCalled();await f.openDelete();fireEvent.click(screen.getByRole('button',{name:'停止并永久删除'}));await waitFor(()=>expect(f.calls).toEqual(['delete']));expect(screen.queryByText(/without inject/)).toBeNull()}finally{await f.runtime.dispose()}
 })
 it('archive section really renders actual class-model rows, then uses the same delete dialog and namespace',async()=>{
  const f=await fixture({archived:true,running:true});try{await f.open();expect(await screen.findByRole('heading',{name:'归档任务'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'任务“Fixture 0”的操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'删除任务'}));fireEvent.click(screen.getByRole('button',{name:'停止并永久删除'}));await waitFor(()=>expect(f.calls).toEqual(['stop','delete']))}finally{await f.runtime.dispose()}
 })
 it.each(['permission denied','stop failed'])('Host refusal %s leaves task and visible retryable dialog',async failure=>{
  const f=await fixture({archived:true,running:true,failure});try{await f.open();fireEvent.click(await screen.findByRole('button',{name:'任务“Fixture 0”的操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'删除任务'}));fireEvent.click(screen.getByRole('button',{name:'停止并永久删除'}));expect((await screen.findByRole('alert')).textContent).toContain(failure);expect(f.calls).not.toContain('delete');expect(screen.getByRole('dialog',{name:'永久删除此任务？'})).toBeTruthy()}finally{await f.runtime.dispose()}
 })
 it('real settings open-section path shows empty, failure+retry, loading, pages and filter reset without another Host rows',async()=>{
  const f=await fixture({archived:true,count:21});try{await f.open();expect(await screen.findByRole('heading',{name:'归档任务'})).toBeTruthy();expect(screen.getByText('21 个')).toBeTruthy();expect(screen.getAllByText(/^Fixture \d+$/)).toHaveLength(10);fireEvent.click(screen.getByRole('button',{name:'下一页'}));expect(screen.getAllByText(/^Fixture \d+$/)).toHaveLength(10);fireEvent.click(screen.getByRole('button',{name:'3'}));expect(screen.getAllByText(/^Fixture \d+$/)).toHaveLength(1);fireEvent.change(screen.getByRole('searchbox',{name:'搜索归档任务'}),{target:{value:'Fixture 0'}});expect(screen.queryByRole('button',{name:'下一页'})).toBeNull();expect(screen.getByText('1 个')).toBeTruthy();expect(screen.getAllByText(/^Fixture \d+$/)).toHaveLength(1);
 await act(async()=>{f.model.handleStreamFailure(new RemoteError('gateway/internal','fixture follow failed',{}))});expect((await screen.findByRole('alert')).textContent).toContain('fixture follow failed');expect(screen.queryAllByText(/^Fixture \d+$/)).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'重试'}));await waitFor(()=>expect(f.retry).toHaveBeenCalledOnce());await act(async()=>{f.model.replaceArchived([])});expect(await screen.findByText('暂无归档任务')).toBeTruthy();await act(async()=>{f.model.handleCarrierFailure()});expect(await screen.findByText('正在读取归档任务…')).toBeTruthy();expect(screen.queryByText('暂无归档任务')).toBeNull();
 }finally{await f.runtime.dispose()}
 })
})

describe('t170 revoke/metadata ownership regressions',()=>{
 it('permission revoked after dialog opened is rechecked before any remote delete',async()=>{
  const f=await fixture();try{await f.openDelete();f.setUiAllowed(false);fireEvent.click(screen.getByRole('button',{name:'停止并永久删除'}));expect((await screen.findByRole('alert')).textContent).toContain('当前无权');expect(f.remove).not.toHaveBeenCalled();expect(f.calls).toEqual([])}finally{await f.runtime.dispose()}
 })
 it('does not show a registry ID with no authorized current-Host session metadata; restore stays in native workspace scope',async()=>{
  const f=await fixture({archived:true});try{await act(async()=>{f.model.replaceArchived([SID,'other-host-private-id' as SessionId])});await f.open();expect(await screen.findByText('Fixture 0')).toBeTruthy();expect(screen.queryByText('other-host-private-id')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'恢复'}));expect(await screen.findByRole('dialog',{name:'恢复此任务？'})).toBeTruthy();expect(f.calls).toEqual([]);fireEvent.click(screen.getByRole('button',{name:'确认恢复'}));await waitFor(()=>expect(f.calls).toEqual(['restore']));const section=screen.getByRole('heading',{name:'归档任务'}).closest('section');expect(section?.textContent).not.toContain('任务已恢复');expect((await screen.findByRole('alert')).textContent).toContain('任务已恢复');expect(await screen.findByText('暂无归档任务')).toBeTruthy()}finally{await f.runtime.dispose()}
 })
})
