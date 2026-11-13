import { useEffect, useState } from 'react'
import { Button } from '@mammoth-ai/mmp-client-ui-primitives'
import type { Translate } from '@mammoth-ai/mmp-client-ui-slots'
import type { OfficialAgentGalleryLocaleKey } from './locales.ts'
export interface PreviewTarget {
  agentId: string
  previewId: string
}
export function parseExpertPreview(search: string): PreviewTarget | null { const query = new URLSearchParams(search), previewId = query.get('expertPreview'), agentId = query.get('expertId'); return previewId && agentId ? { agentId, previewId } : null }
/** Capture the explicit dedicated presentation before launch parameters are cleaned up. */
export function isEmbeddedExpertPreview(search: string): boolean {
  return parseExpertPreview(search) !== null && new URLSearchParams(search).get('expertEmbed') === '1'
}
/** Consume the server launch identity through the standard Host preview capability. */
export function ExpertPreviewEntry({ target, launch, t, embedded = false, onUnavailable }: {
  target: PreviewTarget
  launch: (target: PreviewTarget) => Promise<string | undefined>
  t: Translate<OfficialAgentGalleryLocaleKey>
  embedded?: boolean
  onUnavailable?: () => void
}) {
  const [failure, setFailure] = useState<string>(), [busy, setBusy] = useState(false)
  const start = async (signal?: AbortSignal) => {
    setBusy(true)
    setFailure(undefined)
    try {
      const result = await launch(target)
      if (!signal?.aborted) setFailure(result)
      if (!signal?.aborted && result !== undefined && result !== 'workspaceRequired') onUnavailable?.()
      return result
    } catch {
      if (!signal?.aborted) { setFailure('previewUnavailable'); onUnavailable?.() }
      return 'previewUnavailable'
    } finally {
      if (!signal?.aborted) setBusy(false)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let retries = 0
    const attempt = async () => {
      const result = await start(controller.signal)
      if (controller.signal.aborted || result !== 'workspaceRequired') return
      if (retries >= 40) { onUnavailable?.(); return }
      retries++
      timer = setTimeout(() => { void attempt() }, 250)
    }
    void attempt()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [target.agentId, target.previewId])
  return <section>{embedded ? null : <><h2>{t('previewTitle')}</h2><p>{t('previewDescription')}</p></>}{failure ? <p role="alert">{t(failure === 'workspaceRequired' ? 'workspaceRequired' : 'previewUnavailable')}</p> : null}{!embedded || failure ? <Button disabled={busy} onClick={() => void start()}>{t(busy ? 'previewStarting' : 'retry')}</Button> : null}</section>
}
