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
    download?: (sessionId: string, id: string) => Promise<{ name: string; data: string; sha256: string }>
  }

/**
 * Download the latest artifact from the composer row.
 * @returns the download control, or null when this seat has no artifact to save.
 */
export function GallerySourceLabel({
  sessionId, useSessions, t, download,
}: GallerySourceLabelProps) {
  const runtime = useSessions(state => state.byId[sessionId]?.projectionValues?.officialGalleryRuntime)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  if (!download) return null
  const save = async () => {
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
  const artifact = runtime?.lastArtifact
  if (!artifact && !failure) return null
  return (
    <span className={css.group}>
      {artifact ? <button type="button" className={css.download} onClick={() => void save()} disabled={busy}>{busy ? t('artifactBusy') : t('artifactDownload', { name: artifact.name })}</button> : null}
      {failure ? <span role="alert" className={css.error}>{t('artifactFailed')}</span> : null}
    </span>
  )
}
