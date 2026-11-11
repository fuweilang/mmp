// @vitest-environment jsdom
/** Real InputHub/SessionInputShell; authenticated retrieval HTTP and final Session prompt are explicit mocks. */
import {Context} from '@mammoth-ai/cordis'
import {SessionId} from '@mammoth-ai/mmp-session/types'
import {TestSessions,makeTranslate} from '@mammoth-ai/mmp-client-test-runtime'
import {afterEach,expect,it,onTestFinished,vi} from 'vitest'
import {InputHub} from '../src/client/input/hub.ts'
import {parseStoredDraft,resolveDraftInput} from '../src/client/draft.ts'
import {zh} from '../src/client/locales.ts'
import type {SubmitOutcome} from '../src/client/contract/input.ts'
const query='产品保修多久？'
afterEach(()=>{vi.unstubAllGlobals()})
async function fixture(){
 const ctx=new Context(),sessions=new TestSessions(async operation=>{await operation()},ctx)
 ctx.provide('sessions',sessions)
 const id=SessionId('company-materials-fixture');await sessions.add({id})
 const ref=sessions.retain(id);await ref.ready
 const send=vi.fn<(...args:unknown[])=>Promise<SubmitOutcome>>(async()=>({kind:'success'}))
 ctx.provide('conversation',{sendSession:send} as never)
 const hub=new InputHub(ctx,makeTranslate(zh,{})),shell=hub.shellFor(ref.binding)
 onTestFinished(async()=>{ref.release();await sessions.disposeScopes();await ctx.fiber.dispose()})
 const fetch=vi.fn(async()=>new Response(JSON.stringify({hits:[{documentName:'fixture.txt',ordinal:0,snippet:'保修十二个月',source:'https://fixture.invalid/source'}]}),{status:200}))
 vi.stubGlobal('fetch',fetch)
 return {ctx,sessions,id,hub,shell,fetch,send}
}
it('company materials defaults off and preserves hand-written old markers as ordinary text',async()=>{
 const f=await fixture(),text='【企业知识库】 '+query
 f.shell.setDraft(text);f.shell.submit()
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1))
 expect(f.fetch).not.toHaveBeenCalled();expect(f.send.mock.calls[0]?.[1]).toBe(text)
})
it('company materials explicit selection retrieves once before send, limits evidence to eight, then clears only on success',async()=>{
 const f=await fixture();f.fetch.mockResolvedValue(new Response(JSON.stringify({hits:Array.from({length:10},(_,i)=>({documentName:`file-${i}`,ordinal:i,snippet:'text',source:'https://fixture.invalid/source'}))}),{status:200}))
 f.shell.setDraft(query);f.shell.actions.setEnterpriseKnowledge?.(true)
 expect(f.shell.snapshot.draft).toBe(query);expect(f.shell.draftSnapshot.enterpriseKnowledge).toBe(true)
 f.shell.submit();f.shell.submit()
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1))
 await vi.waitFor(()=>expect(f.shell.snapshot.phase).toBe('plain'))
 expect(f.fetch).toHaveBeenCalledTimes(1)
 const request=f.fetch.mock.calls[0] as unknown as [string,RequestInit]
 expect(request[0]).toBe('ground-billing/knowledge');expect(JSON.parse(String(request[1].body))).toEqual({query})
 const modelText=String(f.send.mock.calls[0]?.[1]);expect(modelText.startsWith(query)).toBe(true);expect(modelText).toContain('file-7');expect(modelText).not.toContain('file-8')
 expect(f.shell.snapshot.enterpriseKnowledge).not.toBe(true);expect(f.shell.snapshot.draft).toBe('')
})
it('company materials cancelling selection never retrieves or changes the question',async()=>{
 const f=await fixture();f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.setEnterpriseKnowledge(false)
 expect(f.shell.snapshot.draft).toBe(query);f.shell.submit()
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1));expect(f.fetch).not.toHaveBeenCalled();expect(f.send.mock.calls[0]?.[1]).toBe(query)
})
it('company materials retrieval failure retains both question and selection and does not send',async()=>{
 const f=await fixture();f.fetch.mockResolvedValue(new Response('{}',{status:503}));f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.submit()
 await vi.waitFor(()=>expect(f.shell.notices.getSnapshot()?.level).toBe('error'))
 expect(f.send).not.toHaveBeenCalled();expect(f.shell.snapshot.draft).toBe(query);expect(f.shell.snapshot.enterpriseKnowledge).toBe(true)
})
it('company materials empty results retain the existing no-evidence message behavior',async()=>{
 const f=await fixture();f.fetch.mockResolvedValue(new Response('{"hits":[]}',{status:200}));f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.submit()
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1));expect(f.send.mock.calls[0]?.[1]).toContain('当前权限范围内没有检索到相关资料')
})
it('company materials selection stays with its Session draft, including text edits and persisted restoration',async()=>{
 const f=await fixture();f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.setDraft('修改后的问题')
 const snapshot=f.shell.draftSnapshot;expect(parseStoredDraft(snapshot)?.enterpriseKnowledge).toBe(true);expect(resolveDraftInput(snapshot).text).toBe('修改后的问题')
 const id=SessionId('company-materials-second');await f.sessions.add({id});const other=f.sessions.retain(id);await other.ready;onTestFinished(()=>{other.release()})
 const next=f.hub.shellFor(other.binding);expect(next.snapshot.enterpriseKnowledge).not.toBe(true);expect(f.hub.shell(f.id)).toBe(f.shell)
 next.setDraft(parseStoredDraft(snapshot)!);expect(next.snapshot.enterpriseKnowledge).toBe(true);expect(next.snapshot.draft).toBe('修改后的问题')
 next.setEnterpriseKnowledge(false);expect(f.shell.snapshot.enterpriseKnowledge).toBe(true)
 const old=parseStoredDraft('【企业知识库】 手写原文')!;expect(old.text).toBe('【企业知识库】 手写原文');expect(old.enterpriseKnowledge).toBeUndefined()
})
it('company materials late receipt cannot clear a new draft or its newly selected option',async()=>{
 const f=await fixture();let resolve!:(outcome:{kind:'success'})=>void
 f.send.mockImplementation((...args:unknown[])=>{(args[5] as ()=>void)();return new Promise(done=>{resolve=done})})
 f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.submit()
 await vi.waitFor(()=>expect(f.shell.snapshot.phase).toBe('plain'))
 f.shell.setDraft('下一条问题');f.shell.setEnterpriseKnowledge(true)
 resolve({kind:'success'});await Promise.resolve();await Promise.resolve()
 expect(f.shell.snapshot.draft).toBe('下一条问题');expect(f.shell.snapshot.enterpriseKnowledge).toBe(true)
})

it('company materials Host send refusal retains the current text and explicit selection',async()=>{
 const f=await fixture();f.send.mockResolvedValue({kind:'error',text:'fixture refusal'});f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.submit()
 await vi.waitFor(()=>expect(f.shell.snapshot.phase).toBe('plain'))
 expect(f.shell.snapshot.draft).toBe(query);expect(f.shell.snapshot.enterpriseKnowledge).toBe(true);expect(f.fetch).toHaveBeenCalledTimes(1)
})
it('company materials a second accepted message is unselected unless explicitly selected again',async()=>{
 const f=await fixture();f.shell.setDraft(query);f.shell.setEnterpriseKnowledge(true);f.shell.submit()
 await vi.waitFor(()=>expect(f.shell.snapshot.phase).toBe('plain'))
 f.shell.setDraft('第二条普通问题');f.shell.submit()
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(2));expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.send.mock.calls[1]?.[1]).toBe('第二条普通问题')
})

it('t166 draft selection is independent text, session-isolated and atomically captured before later selection changes',async()=>{
 const f=await fixture(),a={protocol:1 as const,selectionVersion:1,expertRef:{id:'expert-a',versionId:'v1',name:'专家A'},skillRefs:[]}
 f.shell.setDraft('用户原文');expect(f.shell.setCatalogSelection(a)).toBe(true);expect(f.shell.snapshot.draft).toBe('用户原文')
 expect(parseStoredDraft(f.shell.draftSnapshot)?.catalogSelection).toEqual(a)
 let finish!:(outcome:SubmitOutcome)=>void
 f.send.mockImplementation((...args:unknown[])=>{(args[5] as ()=>void)();return new Promise(done=>{finish=done})})
 f.shell.submit();await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1));await vi.waitFor(()=>expect(f.shell.snapshot.phase).toBe('plain'))
 const b={...a,selectionVersion:2,expertRef:null,skillRefs:[{id:'skill-b',revision:3,name:'技能B',key:'skill-b'}]}
 expect(f.shell.setCatalogSelection(b)).toBe(true);f.shell.setDraft('下一轮用户输入')
 expect(f.send.mock.calls[0]?.[6]).toEqual(a);finish({kind:'success'});await Promise.resolve();await Promise.resolve()
 const skill=b.skillRefs[0],placed=skill===undefined?b:{...b,skillRefs:[{...skill,offset:0}]}
 expect(f.shell.snapshot.catalogSelection).toEqual(placed);expect(f.shell.snapshot.draft).toBe('下一轮用户输入');expect(f.shell.setCatalogSelection(a)).toBe(false)
 const id=SessionId('t166-other-draft');await f.sessions.add({id});const other=f.sessions.retain(id);await other.ready;onTestFinished(()=>other.release());const input=f.hub.shellFor(other.binding)
 expect(input.snapshot.catalogSelection).toBeUndefined();expect(f.shell.snapshot.catalogSelection).toEqual(placed)
})
it('accepted send clears the expert and the skill chips', async () => {
  const f = await fixture()
  const selected = {
    protocol: 1 as const, selectionVersion: 3,
    expertRef: { id: 'expert-a', versionId: 'v1', name: '专家A' },
    skillRefs: [{ id: 'skill-b', revision: 3, name: '技能B', key: 'skill-b' }, { id: 'skill-c', revision: 1, name: '技能C', key: 'skill-c' }],
  }
  f.shell.setDraft('原问题')
  expect(f.shell.setCatalogSelection(selected)).toBe(true)
  f.shell.submit()
  await vi.waitFor(() => expect(f.shell.snapshot.phase).toBe('plain'))
  const sent = f.send.mock.calls[0]?.[6] as { expertRef: { id: string } | null; skillRefs: { id: string }[] }
  expect(sent.expertRef?.id).toBe('expert-a')
  expect(sent.skillRefs.map(skill => skill.id)).toEqual(['skill-b', 'skill-c'])
  expect(f.shell.snapshot.draft).toBe('')
  expect(f.shell.snapshot.catalogSelection?.expertRef).toBeNull()
  expect(f.shell.snapshot.catalogSelection?.skillRefs).toEqual([])
  expect(f.shell.snapshot.catalogSelection?.selectionVersion).toBe(3)
})

it('refused send keeps the skill chips', async () => {
  const f = await fixture()
  const selected = {
    protocol: 1 as const, selectionVersion: 3,
    expertRef: null,
    skillRefs: [{ id: 'skill-b', revision: 3, name: '技能B', key: 'skill-b' }],
  }
  f.send.mockResolvedValue({ kind: 'error', text: 'refused' })
  f.shell.setDraft('原问题')
  expect(f.shell.setCatalogSelection(selected)).toBe(true)
  f.shell.submit()
  await vi.waitFor(() => expect(f.shell.snapshot.phase).toBe('plain'))
  expect(f.shell.snapshot.draft).toBe('原问题')
  expect(f.shell.snapshot.catalogSelection?.skillRefs.map(skill => skill.id)).toEqual(['skill-b'])
})

it('t166 failed send retains exact chosen references; explicit null removal cannot be revived by late source initialization',async()=>{
 const f=await fixture(),a={protocol:1 as const,selectionVersion:1,expertRef:{id:'expert-a',versionId:'v1',name:'专家A'},skillRefs:[]}
 f.send.mockResolvedValue({kind:'error',text:'refused'});f.shell.setDraft('原问题');f.shell.setCatalogSelection(a);f.shell.submit();await vi.waitFor(()=>expect(f.shell.snapshot.phase).toBe('plain'));expect(f.shell.snapshot.draft).toBe('原问题');expect(f.shell.snapshot.catalogSelection).toEqual(a)
 const cleared={protocol:1 as const,selectionVersion:2,expertRef:null,skillRefs:[]};expect(f.shell.setCatalogSelection(cleared)).toBe(true);expect(f.shell.setCatalogSelection(a,true)).toBe(false);expect(f.shell.snapshot.catalogSelection).toEqual(cleared);expect(f.shell.snapshot.draft).toBe('原问题')
})
