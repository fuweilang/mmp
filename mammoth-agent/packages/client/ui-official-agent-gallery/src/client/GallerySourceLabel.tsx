import { KnowledgeSources } from './KnowledgeSources.tsx'
/**
 * Composer artifact download for a plaza session.
 * The header does not repeat the session's creation source.
 */
import type { PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import { useState } from 'react'
import css from './GallerySourceLabel.module.css'

/** Full props for the composer download and the retired header seat. */
export type GallerySourceLabelProps =
  (PropsRuntime<'conversation.session.header.actions'> | PropsRuntime<'conversation.input.left'>)
  & PropsLocale<'officialAgentGallery'> & {
<<<<<<< HEAD
    download?: (sessionId: string, id: string) => Promise<{ name: string; data: string; sha256: string }>
=======
    openKnowledgeSource?:(sessionId:string,recordId:string,label:string)=>Promise<{text:string;locator:unknown}>
    download?:(sessionId:string,id:string)=>Promise<{name:string;data:string;sha256:string}>
    skillAvailability?:(id:string)=>Promise<{deleted:boolean}>
>>>>>>> origin/4.0
  }

/**
 * Download the latest artifact from the composer row.
 * @returns the download control, or null when this seat has no artifact to save.
 */
export function GallerySourceLabel({
<<<<<<< HEAD
  sessionId, useSessions, t, download,
}: GallerySourceLabelProps) {
  const runtime = useSessions(state => state.byId[sessionId]?.projectionValues?.officialGalleryRuntime)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  if (!download) return null
  const save = async () => {
=======
  sessionId, useSessions, useProjection, t, download, skillAvailability, openKnowledgeSource,
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
  const knowledge=useProjection('officialExpertKnowledge')
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
  // Composer row keeps only an artifact download. The origin glyph and phase are header-only.
  if (download) {
>>>>>>> origin/4.0
    const artifact = runtime?.lastArtifact
    if (!artifact || busy) return
    setBusy(true)
    setFailure(false)
    try {
      const file = await download(sessionId, artifact.id)
      const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0))
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      if (Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') !== file.sha256) throw Error('Integrity mismatch')
      const url = URL.createObjectURL(new Blob([bytes]))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setFailure(true)
    } finally {
      setBusy(false)
    }
  }
<<<<<<< HEAD
  const artifact = runtime?.lastArtifact
  if (!artifact && !failure) return null
  return (
    <span className={css.group}>
      {artifact ? <button type="button" className={css.download} onClick={() => void save()} disabled={busy}>{busy ? t('artifactBusy') : t('artifactDownload', { name: artifact.name })}</button> : null}
      {failure ? <span role="alert" className={css.error}>{t('artifactFailed')}</span> : null}
=======
  if (source === undefined) return knowledge&&openKnowledgeSource?<KnowledgeSources key={sessionId} sources={knowledge} open={(recordId,label)=>openKnowledgeSource(sessionId,recordId,label)} t={t}/>:null

  const key: OfficialAgentGalleryLocaleKey = source.type === 'expert' ? 'sourceExpert' : 'sourceSkill'
  const text = t(key, { name: source.type === 'skill' && deleted ? t('skillDeletedMark', { name: source.name }) : source.name })
  return (
    <span className={css.group}>
      {knowledge&&openKnowledgeSource?<KnowledgeSources key={sessionId} sources={knowledge} open={(recordId,label)=>openKnowledgeSource(sessionId,recordId,label)} t={t}/>:null}
      <span className={css.label}><IconAppsAddOutlineRegular size={14}/> <span>{t('sourceCreation')} {text}</span></span>
>>>>>>> origin/4.0
    </span>
  )
}
