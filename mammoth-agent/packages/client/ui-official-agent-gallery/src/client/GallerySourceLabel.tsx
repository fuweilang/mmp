/**
 * Session-header origin chip for plaza-created expert/skill Sessions.
 * Read-only: shows 「专家 · {name}」 / 「技能 · {name}」 from the frozen projection.
 */
import type { PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { OfficialAgentGalleryLocaleKey } from './locales.ts'
import {useEffect, useState} from 'react'
import css from './GallerySourceLabel.module.css'
import {IconAppsAddOutlineRegular} from '@mammoth-ai/mmp-client-ui-primitives'

/** Full props for the header actions list entry. */
export type GallerySourceLabelProps =
  (PropsRuntime<'conversation.session.header.actions'> | PropsRuntime<'conversation.input.left'>)
  & PropsLocale<'officialAgentGallery'> & {
    download?:(sessionId:string,id:string)=>Promise<{name:string;data:string;sha256:string}>
    skillAvailability?:(id:string)=>Promise<{deleted:boolean}>
  }

/**
 * Render the plaza origin chip beside the session title.
 * @returns the label, or null when this session has no plaza source.
 */
export function GallerySourceLabel({
  sessionId, useSessions, t, download, skillAvailability,
}: GallerySourceLabelProps) {
  const source = useSessions((state) => {
    const value = state.byId[sessionId]?.projectionValues?.officialGallerySource
    if (value === null || value === undefined || typeof value !== 'object') return undefined
    const record = value as { type?: unknown; name?: unknown; id?: unknown }
    if ((record.type !== 'expert' && record.type !== 'skill') || typeof record.name !== 'string') {
      return undefined
    }
    return {
      type: record.type as 'expert' | 'skill',
      name: record.name,
      id: typeof record.id === 'string' ? record.id : '',
    }
  })
  const [deleted, setDeleted] = useState(false)
  useEffect(() => {
    if (!source || source.type !== 'skill' || !source.id || !skillAvailability) {
      setDeleted(false)
      return
    }
    let alive = true
    void skillAvailability(source.id).then(result => { if (alive) setDeleted(result.deleted) })
    return () => { alive = false }
  }, [source?.type, source?.id, skillAvailability])

  const runtime=useSessions(state=>state.byId[sessionId]?.projectionValues?.officialGalleryRuntime)
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState(false)
  const phases:Record<string,OfficialAgentGalleryLocaleKey>={preparing:'sourcePreparing',fetching:'sourcePreparing',prepared:'sourceFetched',context_loaded:'sourceLoaded',running:'sourceRunning',completed:'sourceCompleted',cancelled:'sourceCancelled',failed:'sourceFailed'}
  const phaseKey=runtime?phases[runtime.phase]:undefined
  const save=async()=>{
    const artifact=runtime?.lastArtifact;if(!artifact||!download||busy)return
    setBusy(true);setFailure(false)
    try{
      const file=await download(sessionId,artifact.id)
      const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0))
      const hash=await crypto.subtle.digest('SHA-256',bytes)
      if(Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')!==file.sha256)throw Error('Integrity mismatch')
      const url=URL.createObjectURL(new Blob([bytes]));const anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch{setFailure(true)}finally{setBusy(false)}
  }
  if (source === undefined && runtime === undefined) return null

  const key: OfficialAgentGalleryLocaleKey = source?.type === 'expert' ? 'sourceExpert' : 'sourceSkill'
  const text = source ? t(key, { name: source.type === 'skill' && deleted ? t('skillDeletedMark', { name: source.name }) : source.name }) : ''
  return (
    <span className={css.group}>
      <span className={css.label}><IconAppsAddOutlineRegular size={14}/> {download ? <span role="status">{phaseKey?t(phaseKey):''}</span> : <span>{t('sourceCreation')} {text}</span>}</span>
      {download&&runtime?.lastArtifact&&<button type="button" className={css.download} onClick={()=>void save()} disabled={busy}>{busy?t('artifactBusy'):t('artifactDownload',{name:runtime.lastArtifact.name})}</button>}
      {failure&&<span role="alert" className={css.error}>{t('artifactFailed')}</span>}
    </span>
  )
}
