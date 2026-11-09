/** Next-send selectors on the existing + menu; selected metadata never edits input text. */
import type { Context } from '@mammoth-ai/cordis'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type { CatalogDraftSelection } from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { OfficialAgentCard, OfficialSkillCard, CatalogDetail } from '@mammoth-ai/mmp-official-agent-gallery/types'
import type { CommandUiContract } from '@mammoth-ai/mmp-client-ui-commands/client'
import { CatalogIcon } from './CatalogIcon.tsx'
import css from './task-catalog.module.css'

type Kind='expert'|'skill'
type Pick={id:string;key:string;name:string;summary:string;icon:string|null;versionId?:string|undefined;revision?:number|undefined;starter?:string|undefined;available?:boolean}
type Target={sessionId:SessionId;kind:Kind}
function empty():CatalogDraftSelection{return {protocol:1,selectionVersion:0,expertRef:null,skillRef:null}}
function fromCard(card:OfficialAgentCard|OfficialSkillCard):Pick {
 return {id:card.id,key:card.key,name:card.name,summary:card.summary,icon:card.avatarUrl??null,...'versionId'in card?{versionId:card.versionId,starter:card.openingQuestions[0],available:card.executionGranted}:{revision:card.packageRevision}}
}
function fromDetail(detail:CatalogDetail):Pick{return {id:detail.id,key:detail.key,name:detail.name,summary:detail.summary,icon:detail.avatarUrl??null,...detail.packageRevision?{revision:detail.packageRevision}:{},...(detail.detail.starters[0]?{starter:detail.detail.starters[0].text}:{})}}
export function installTaskCatalog(ctx:Context):void {
 const t=ctx.locale.bind('officialAgentGallery')
 const target=createSnapshotStore<Target|null>(null),canCompose=createSnapshotStore(false)
 ctx.inject(['remoteAccess'],scope=>{scope.effect(()=>scope.remoteAccess.whenAccess('officialAgentGallery/preferences',()=>{canCompose.set(true);return()=>{canCompose.set(false);target.set(null)}}))})
 const inputFor=(id:SessionId)=>{const binding=ctx.sessions.binding(id);return binding?ctx.conversation.input.for(binding.ctx):undefined}
 const initial=(id:SessionId):CatalogDraftSelection=>{
  const source=ctx.sessions.list.getSnapshot().byId[id]?.projectionValues?.officialGallerySource
  const value=empty()
  if(source?.type==='expert'&&source.versionId)return {...value,expertRef:{id:source.id,versionId:source.versionId,name:source.name}}
  if(source?.type==='skill'&&source.packageRevision)return {...value,skillRef:{id:source.id,revision:source.packageRevision,key:source.key,name:source.name,icon:source.avatarUrl??null}}
  return value
 }
 ctx.inject(['commandUi','conversation','sessions'],scope=>{
  // Command callbacks receive an id-only ClientSessionContext, not SessionFace.
  const registry:CommandUiContract=scope.commandUi
  for(const kind of ['expert','skill'] as const)scope.effect(()=>registry.register({name:`catalog-${kind}`,label:()=>t(kind==='expert'?'selectorExpert':'selectorSkill'),available:session=>{const input=inputFor(session.sessionId),state=ctx.sessions.binding(session.sessionId)?.session.getSnapshot();return canCompose.getSnapshot()&&!!input&&state!==undefined&&!state.removed&&state.subagent===null&&input.state.getSnapshot().phase==='plain'},ui:{kind:'action',preserveDraftOnMenu:true,run:session=>{if(canCompose.getSnapshot())target.set({kind,sessionId:session.sessionId})}}}),`gallery: ${kind} next-send selector`)
 })
 function Tags({sessionId,useInput,inputActions,useSession}:PropsRuntime<'conversation.input.left'>){
  const allowed=useSyncExternalStore(canCompose.subscribe,canCompose.getSnapshot)
  const input=useInput(value=>value),running=useSession(value=>value.running)??false
  const value=input?.catalogSelection??initial(sessionId)
  useEffect(()=>{if(allowed&&input?.catalogSelection===undefined&&(value.expertRef||value.skillRef))inputActions?.setCatalogSelection?.(value,true)},[allowed,sessionId,input?.catalogSelection,value.expertRef?.id,value.skillRef?.id])
  const remove=(kind:Kind)=>{const live=inputFor(sessionId),current=live?.state.getSnapshot().catalogSelection??initial(sessionId);live?.setCatalogSelection?.({...current,selectionVersion:current.selectionVersion+1,...kind==='expert'?{expertRef:null}:{skillRef:null}});live?.focus()}
  if(!allowed)return null
  return <span className={css.tags} title={t('selectorNextSend')}>
    {(['expert','skill'] as const).map(kind=>{const ref=kind==='expert'?value.expertRef:value.skillRef;return ref?<span className={css.tag} key={kind}>
      <span className={css.smallIcon}><CatalogIcon catalogKey={ref.id} kind={kind==='expert'?'people':'plan'} src={ref.icon}/></span><span className={css.name}>{ref.name}</span>
      <button type="button" className={css.remove} disabled={input?.phase!=='plain'} aria-label={t(kind==='expert'?'selectorRemoveExpert':'selectorRemoveSkill')} onMouseDown={event=>event.preventDefault()} onClick={()=>remove(kind)}>×</button>
    </span>:null})}{running&&(value.expertRef||value.skillRef)?<small className={css.next}>{t('selectorNextSend')}</small>:null}
  </span>
 }
 ctx.slots.inject('conversation.input.left',()=>ctx.slots.register({name:'conversation.input.left',id:'task-catalog-selection',order:-10},Tags))
 function Picker(){
  const current=useSyncExternalStore(target.subscribe,target.getSnapshot)
  if(!current)return null
  return <PickerBody key={`${current.sessionId}:${current.kind}`} current={current}/>
 }
 function PickerBody({current}:{current:Target}){
  const [view,setView]=useState<'all'|'recent'|'favourites'>('recent'),[query,setQuery]=useState(''),[items,setItems]=useState<Pick[]>([]),[favourites,setFavourites]=useState<Set<string>>(new Set()),[cursor,setCursor]=useState<string|null>(null),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const generation=useRef(0),loading=useRef(false),lastAppend=useRef(false),favLocks=useRef(new Set<string>()),[favBusy,setFavBusy]=useState<Set<string>>(new Set()),preferenceRows=useRef<string[]>([])
  const load=async(append=false,epoch=generation.current)=>{
   if(loading.current)return
   lastAppend.current=append;loading.current=true;setBusy(true);setError('')
   try{
    const prefs=await ctx.remote.officialAgentGallery.preferences(current.kind,'favourites');if(!prefs.ok)throw Error(prefs.error.message)
    if(generation.current!==epoch)return
    setFavourites(new Set(prefs.value.map(row=>row.resourceId)))
    let next:Pick[]=[],nextCursor:string|null=null,hasMore=false
    if(view==='all'){
     const request={...(query.trim()?{q:query.trim()}:{}),...(append&&cursor?{cursor}:{})}
     if(current.kind==='expert'){const result=await ctx.remote.officialAgentGallery.pageExperts(request);if(!result.ok)throw Error(result.error.message);next=result.value.items.map(fromCard);nextCursor=result.value.nextCursor;hasMore=result.value.hasMore}
     else{const result=await ctx.remote.officialAgentGallery.pageSkills(request);if(!result.ok)throw Error(result.error.message);next=result.value.items.map(fromCard);nextCursor=result.value.nextCursor;hasMore=result.value.hasMore}
    }else{
     if(!append){const result=await ctx.remote.officialAgentGallery.preferences(current.kind,view);if(!result.ok)throw Error(result.error.message);preferenceRows.current=result.value.map(row=>row.resourceId)}
     const offset=append?Number(cursor??0):0,ids=preferenceRows.current.slice(offset,offset+20)
     for(const id of ids){
      if(generation.current!==epoch)return
      if(current.kind==='expert'){const card=await ctx.remote.officialAgentGallery.expertCard(id);if(card.ok)next.push(fromCard(card.value))}
      else{const detail=await ctx.remote.officialAgentGallery.catalogDetail('skill',id);if(detail.ok)next.push(fromDetail(detail.value))}
     }
     const needle=query.trim().toLocaleLowerCase();next=next.filter(item=>!needle||`${item.name} ${item.summary}`.toLocaleLowerCase().includes(needle));hasMore=offset+20<preferenceRows.current.length;nextCursor=hasMore?String(offset+20):null
    }
    if(generation.current!==epoch)return
    setItems(old=>append?[...new Map([...old,...next].map(item=>[item.id,item])).values()]:next);setCursor(nextCursor);setMore(hasMore)
   }catch(reason){if(generation.current===epoch)setError(reason instanceof Error?reason.message:String(reason))}
   finally{if(generation.current===epoch){loading.current=false;setBusy(false)}}
  }
  useEffect(()=>{const epoch=++generation.current;loading.current=false;setItems([]);setCursor(null);setMore(false);const timer=setTimeout(()=>{void load(false,epoch)},200);return()=>{clearTimeout(timer);generation.current++}},[view,query,current.kind,current.sessionId])
  const choose=(item:Pick)=>{
   const input=inputFor(current.sessionId);if(!input)return
   const state=input.state.getSnapshot(),before=state.catalogSelection??initial(current.sessionId)
   const value:CatalogDraftSelection={...before,selectionVersion:before.selectionVersion+1,...current.kind==='expert'?{expertRef:{id:item.id,versionId:item.versionId??'',name:item.name,icon:item.icon}}:{skillRef:{id:item.id,revision:item.revision??0,key:item.key,name:item.name,icon:item.icon}}}
   if(item.available===false){setError(t('notGrantedHint'));return}
   if((value.expertRef&&!value.expertRef.versionId)||(value.skillRef&&!value.skillRef.revision)){setError(t('startFailed'));return}
   if(!input.setCatalogSelection?.(value)){setError(t('selectorBusy'));return}
   if(item.starter&&ctx.sessions.list.getSnapshot().byId[current.sessionId]?.blank&&state.draft.trim()===''&&state.attachmentIds.length===0){const binding=ctx.sessions.binding(current.sessionId);if(binding&&input.state.getSnapshot().catalogSelection?.selectionVersion===value.selectionVersion)ctx.conversation.input.requestDraftInitialization(binding,{prompt:item.starter,whenDraftExists:'keep'})}
   target.set(null);input.focus()
  }
  const favourite=async(item:Pick)=>{
   if(favLocks.current.has(item.id))return
   favLocks.current.add(item.id);setFavBusy(new Set(favLocks.current))
   const value=!favourites.has(item.id),epoch=generation.current
   try{const result=await ctx.remote.officialAgentGallery.favourite(current.kind,item.id,value)
   if(generation.current!==epoch)return
   if(!result.ok){setError(result.error.message);return}
   setFavourites(old=>{const next=new Set(old);if(value)next.add(item.id);else next.delete(item.id);return next})
   if(view==='favourites'&&!value)setItems(old=>old.filter(row=>row.id!==item.id))
   }catch(reason){if(generation.current===epoch)setError(reason instanceof Error?reason.message:String(reason))}finally{favLocks.current.delete(item.id);if(generation.current===epoch)setFavBusy(new Set(favLocks.current))}
  }
  return <Modal open title={t(current.kind==='expert'?'selectorExpert':'selectorSkill')} description={t('selectorNextSend')} closeLabel={t('selectorClose')} onClose={()=>target.set(null)}>
   <div className={css.picker}>
    <input className={css.search} aria-label={t('selectorSearch')} placeholder={t('selectorSearch')} value={query} onChange={event=>{setView('all');setQuery(event.target.value)}}/>
    <div className={css.tabs} role="tablist">{(['recent','favourites','all'] as const).map(key=><button type="button" role="tab" aria-selected={view===key} key={key} onClick={()=>setView(key)}>{t(key==='all'?'selectorAll':key==='recent'?'selectorRecent':'selectorFavourites')}</button>)}</div>
    {error&&<p role="alert">{error}<Button variant="outline" onClick={()=>void load(lastAppend.current)}>{t('selectorRetry')}</Button></p>}
    {!busy&&!items.length&&!error&&<p>{t('selectorEmpty')} <button type="button" onClick={()=>setView('all')}>{t('selectorAll')}</button></p>}
    {items.map(item=><article key={item.id} className={css.item}><CatalogIcon catalogKey={item.key} kind={current.kind==='expert'?'people':'plan'} src={item.icon}/><div className={css.itemText}><strong>{item.name}</strong><p>{item.summary}</p></div><button type="button" className={css.star} disabled={favBusy.has(item.id)} aria-pressed={favourites.has(item.id)} aria-label={t(favourites.has(item.id)?'selectorUnfavourite':'selectorFavourite')} onClick={()=>void favourite(item)}>{favourites.has(item.id)?'★':'☆'}</button><Button variant="outline" disabled={item.available===false} onClick={()=>choose(item)}>{t('selectorChoose')}</Button></article>)}
    {busy&&<p role="status">{t('selectorLoading')}</p>}{more&&<Button variant="outline" disabled={busy} onClick={()=>void load(true)}>{t('selectorMore')}</Button>}
   </div>
  </Modal>
 }
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'task-catalog-picker'},Picker))
}
