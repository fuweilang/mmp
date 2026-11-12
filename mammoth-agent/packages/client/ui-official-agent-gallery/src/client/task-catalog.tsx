/** Next-send selectors on the existing + menu; selected metadata never edits input text. */
import type { Context } from '@mammoth-ai/cordis'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, IconAppsAddOutlineRegular, IconCloseOutlineRegular, IconUsersOutlineRegular, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type { CatalogDraftSelection } from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { OfficialAgentCard, OfficialSkillCard } from '@mammoth-ai/mmp-official-agent-gallery/types'
import type { CommandUiContract } from '@mammoth-ai/mmp-client-ui-commands/client'
import { CatalogIcon } from './CatalogIcon.tsx'
import { resolveCardAvatarSrc } from './official-avatars.ts'
import css from './task-catalog.module.css'

type Kind='expert'|'skill'
type Pick={id:string;key:string;name:string;summary:string;icon:string|null;versionId?:string|undefined;revision?:number|undefined;starter?:string|undefined;available?:boolean}
type Target={sessionId:SessionId;kind:Kind}
const MAX_SKILLS=5
function empty():CatalogDraftSelection{return {protocol:1,selectionVersion:0,expertRef:null,skillRefs:[]}}
function portrait(key:string,avatarUrl:string|null|undefined):string|null{return resolveCardAvatarSrc(key,avatarUrl)??null}
function fromCard(card:OfficialAgentCard|OfficialSkillCard):Pick {
 return {id:card.id,key:card.key,name:card.name,summary:card.summary,icon:portrait(card.key,card.avatarUrl),...'versionId'in card?{versionId:card.versionId,starter:card.openingQuestions[0],available:card.executionGranted}:{revision:card.packageRevision}}
}
export function installTaskCatalog(ctx:Context):void {
 const t=ctx.locale.bind('officialAgentGallery')
 const target=createSnapshotStore<Target|null>(null),canCompose=createSnapshotStore(false)
 ctx.inject(['remoteAccess'],scope=>{scope.effect(()=>scope.remoteAccess.whenAccess('officialAgentGallery/preferences',()=>{canCompose.set(true);return()=>{canCompose.set(false);target.set(null)}}))})
 const inputFor=(id:SessionId)=>{const binding=ctx.sessions.binding(id);return binding?ctx.conversation.input.for(binding.ctx):undefined}
 const initial=(id:SessionId):CatalogDraftSelection=>{
  const source=ctx.sessions.list.getSnapshot().byId[id]?.projectionValues?.officialGallerySource
  const value=empty()
  if(source?.type==='expert'&&source.versionId)return {...value,expertRef:{id:source.id,versionId:source.versionId,name:source.name}}
  if(source?.type==='skill'&&source.packageRevision)return {...value,skillRefs:[{id:source.id,revision:source.packageRevision,key:source.key,name:source.name,icon:portrait(source.key,source.avatarUrl)}]}
  return value
 }
 ctx.inject(['commandUi','conversation','sessions'],scope=>{
  // Command callbacks receive an id-only ClientSessionContext, not SessionFace.
  const registry:CommandUiContract=scope.commandUi
  for(const kind of ['expert','skill'] as const)scope.effect(()=>registry.register({name:`catalog-${kind}`,label:()=>t(kind==='expert'?'selectorExpert':'selectorSkill'),icon:kind==='expert'?IconUsersOutlineRegular:IconAppsAddOutlineRegular,available:session=>{const input=inputFor(session.sessionId),state=ctx.sessions.binding(session.sessionId)?.session.getSnapshot();return canCompose.getSnapshot()&&!!input&&state!==undefined&&!state.removed&&state.subagent===null&&input.state.getSnapshot().phase==='plain'},ui:{kind:'action',preserveDraftOnMenu:true,run:session=>{if(canCompose.getSnapshot())target.set({kind,sessionId:session.sessionId})}}}),`gallery: ${kind} next-send selector`)
 })
 function Tags({sessionId,useInput,inputActions,useSessions}:PropsRuntime<'conversation.input.left'>){
  const allowed=useSyncExternalStore(canCompose.subscribe,canCompose.getSnapshot)
  const input=useInput(value=>value)
  const value=input?.catalogSelection??initial(sessionId)
  const [portraitUrl,setPortraitUrl]=useState<string|null>(null)
  const source=useSessions(state=>state.byId[sessionId]?.projectionValues?.officialGallerySource)
  const origin=source&&typeof source==='object'&&(source.type==='expert'||source.type==='skill')&&typeof source.id==='string'&&typeof source.key==='string'?source:undefined
  useEffect(()=>{
    const id=value.expertRef?.id
    const stored=value.expertRef?.icon
    if(!id||(typeof stored==='string'&&stored.trim()!=='')){setPortraitUrl(null);return}
    let alive=true
    void ctx.remote.officialAgentGallery.expertCard(id).then(result=>{
      if(alive&&result.ok)setPortraitUrl(portrait(result.value.key,result.value.avatarUrl))
    }).catch(()=>{})
    return()=>{alive=false}
  },[value.expertRef?.id,value.expertRef?.icon])
  useEffect(()=>{if(allowed&&input?.catalogSelection===undefined&&(value.expertRef||value.skillRefs.length>0))inputActions?.setCatalogSelection?.(value,true)},[allowed,sessionId,input?.catalogSelection,value.expertRef?.id,value.skillRefs.map(skill=>skill.id).join()])
  const remove=()=>{const live=inputFor(sessionId),current=live?.state.getSnapshot().catalogSelection??initial(sessionId);live?.setCatalogSelection?.({...current,selectionVersion:current.selectionVersion+1,expertRef:null});live?.focus()}
  const ref=value.expertRef
  if(!allowed||!ref)return null
  const bundled=origin?.type==='expert'&&origin.id===ref.id?portrait(origin.key,null):null
  const stored=typeof ref.icon==='string'&&ref.icon.trim()!==''?ref.icon:null
  return <span className={css.tags}>
    <span className={css.tag}>
      <span className={css.smallIcon}><CatalogIcon catalogKey={ref.id} kind="people" src={stored??portraitUrl??bundled}/></span><span className={css.name}>{ref.name}</span>
      <button type="button" className={css.remove} disabled={input?.phase!=='plain'} aria-label={t('selectorRemoveExpert')} onMouseDown={event=>event.preventDefault()} onClick={remove}><IconCloseOutlineRegular size={14}/></button>
    </span>
  </span>
 }
 ctx.slots.inject('conversation.input.left',()=>ctx.slots.register({name:'conversation.input.left',id:'task-catalog-selection',order:-10},Tags))
 function Picker(){
  const current=useSyncExternalStore(target.subscribe,target.getSnapshot)
  if(!current)return null
  return <PickerBody key={`${current.sessionId}:${current.kind}`} current={current}/>
 }
 function PickerBody({current}:{current:Target}){
  const [input,setInput]=useState(''),[query,setQuery]=useState(''),[items,setItems]=useState<Pick[]>([]),[favourites,setFavourites]=useState<Set<string>>(new Set()),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('')
  const generation=useRef(0),loading=useRef(false),lastAppend=useRef(false),cursor=useRef<string|null>(null),composing=useRef(false),[composeTick,setComposeTick]=useState(0),favLocks=useRef(new Set<string>()),[favBusy,setFavBusy]=useState<Set<string>>(new Set())
  const load=async(append=false,epoch=generation.current,q=query)=>{
   if(loading.current)return
   lastAppend.current=append;loading.current=true;setBusy(true);setError('')
   try{
    const request={...(q?{q}:{}),...(append&&cursor.current?{cursor:cursor.current}:{})}
    const result=current.kind==='expert'?await ctx.remote.officialAgentGallery.pageExperts(request):await ctx.remote.officialAgentGallery.pageSkills(request)
    if(!result.ok)throw Error(result.error.message)
    if(generation.current!==epoch)return
    const next=result.value.items.map(fromCard)
    setItems(old=>append?[...new Map([...old,...next].map(item=>[item.id,item])).values()]:next)
    cursor.current=result.value.nextCursor;setMore(result.value.hasMore);setLoaded(true)
   }catch(reason){if(generation.current===epoch)setError(reason instanceof Error?reason.message:String(reason))}
   finally{if(generation.current===epoch){loading.current=false;setBusy(false)}}
  }
  useEffect(()=>{let alive=true;void ctx.remote.officialAgentGallery.preferences(current.kind,'favourites').then(prefs=>{if(alive&&prefs.ok)setFavourites(new Set(prefs.value.map(row=>row.resourceId)))}).catch(()=>{});return()=>{alive=false}},[current.kind,current.sessionId])
  useEffect(()=>{if(composing.current)return;const timer=setTimeout(()=>setQuery(input.trim()),input.trim()?300:0);return()=>clearTimeout(timer)},[input,composeTick])
  useEffect(()=>{const epoch=++generation.current;loading.current=false;const timer=setTimeout(()=>{void load(false,epoch,query)},0);return()=>{clearTimeout(timer);generation.current++}},[query,current.kind,current.sessionId])
  const choose=(item:Pick)=>{
   const input=inputFor(current.sessionId);if(!input)return
   const state=input.state.getSnapshot(),before=state.catalogSelection??initial(current.sessionId)
   const nextSkill=current.kind==='skill'?{id:item.id,revision:item.revision??0,key:item.key,name:item.name,icon:item.icon}:undefined
   if(nextSkill&&before.skillRefs.some(skill=>skill.id===nextSkill.id)){target.set(null);input.focus();return}
   if(nextSkill&&before.skillRefs.length>=MAX_SKILLS){setError(t('selectorSkillLimit'));return}
   const value:CatalogDraftSelection={...before,selectionVersion:before.selectionVersion+1,skillRefs:nextSkill?[...before.skillRefs,nextSkill]:before.skillRefs,...current.kind==='expert'?{expertRef:{id:item.id,versionId:item.versionId??'',name:item.name,icon:item.icon}}:{}}
   if(item.available===false){setError(t('notGrantedHint'));return}
   if((value.expertRef&&!value.expertRef.versionId)||value.skillRefs.some(skill=>!skill.revision)){setError(t('startFailed'));return}
   if(!input.setCatalogSelection?.(value)){setError(t('selectorBusy'));return}
   if(nextSkill&&before.skillRefs.length===0&&item.starter&&ctx.sessions.list.getSnapshot().byId[current.sessionId]?.blank&&state.draft.trim()===''&&state.attachmentIds.length===0){const binding=ctx.sessions.binding(current.sessionId);if(binding&&input.state.getSnapshot().catalogSelection?.selectionVersion===value.selectionVersion)ctx.conversation.input.requestDraftInitialization(binding,{prompt:item.starter,whenDraftExists:'keep'})}
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
   }catch(reason){if(generation.current===epoch)setError(reason instanceof Error?reason.message:String(reason))}finally{favLocks.current.delete(item.id);if(generation.current===epoch)setFavBusy(new Set(favLocks.current))}
  }
  return <Modal open className={css.dialog} contentClassName={css.sheet} title={t(current.kind==='expert'?'selectorExpert':'selectorSkill')} description={t('selectorNextSend')} closeLabel={t('selectorClose')} onClose={()=>target.set(null)}>
   <div className={css.picker}>
    <input className={css.search} aria-label={t('selectorSearch')} placeholder={t('selectorSearch')} value={input} onChange={event=>setInput(event.target.value)} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={event=>{composing.current=false;setInput(event.currentTarget.value);setComposeTick(tick=>tick+1)}}/>
    <div className={css.list} aria-busy={busy}>
     {error&&<p role="alert">{error}<Button variant="outline" onClick={()=>void load(lastAppend.current,generation.current,query)}>{t('selectorRetry')}</Button></p>}
     {loaded&&!busy&&!items.length&&!error&&<p>{t('selectorEmpty')}</p>}
     {items.map(item=><article key={item.id} className={css.item}><CatalogIcon catalogKey={item.key} kind={current.kind==='expert'?'people':'plan'} src={item.icon}/><div className={css.itemText}><strong title={item.name}>{item.name}</strong><p title={item.summary}>{item.summary}</p></div><button type="button" className={css.star} disabled={favBusy.has(item.id)} aria-pressed={favourites.has(item.id)} aria-label={t(favourites.has(item.id)?'selectorUnfavourite':'selectorFavourite')} onClick={()=>void favourite(item)}>{favourites.has(item.id)?'★':'☆'}</button><Button variant="outline" disabled={item.available===false} onClick={()=>choose(item)}>{t('selectorChoose')}</Button></article>)}
     {busy&&!items.length&&<p role="status">{t('selectorLoading')}</p>}{more&&<Button variant="outline" disabled={busy} onClick={()=>void load(true,generation.current,query)}>{t('selectorMore')}</Button>}
    </div>
   </div>
  </Modal>
 }
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'task-catalog-picker'},Picker))
}
