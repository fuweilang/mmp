import type { SessionInput } from '@mammoth-ai/mmp-client-ui-conversation/client'

/** Await the ordinary input machine's admission and return only its unchanged failed draft to the parent. */
export function submitExpertPreviewInput(input: SessionInput, signal: AbortSignal): Promise<void> {
  const initial = input.state.getSnapshot()
  return new Promise((resolve, reject) => {
    let settled = false
    let unsubscribe = () => {}
    const finish = (accepted: boolean) => {
      if (settled) return
      settled = true
      unsubscribe()
      signal.removeEventListener('abort', abort)
      if (accepted) { resolve(); return }
      const current = input.state.getSnapshot()
      if (!signal.aborted && current.phase === 'plain' && current.draft === initial.draft
        && current.draftRev === initial.draftRev && current.attachmentIds.length === 0 && current.occurrences.length === 0) {
        input.setDraft('')
      }
      reject(new Error('Preview admission did not complete'))
    }
    const abort = () => finish(false)
    const check = () => {
      const current = input.state.getSnapshot()
      if (current.phase === 'sending' || current.phase === 'adjudicating' || current.phase === 'submitting') return
      finish(current.draft === '' && current.attachmentIds.length === 0)
    }
    if (signal.aborted) { finish(false); return }
    signal.addEventListener('abort', abort, { once: true })
    unsubscribe = input.state.subscribe(check)
    try { input.submit('queue', 'click'); check() }
    catch (_error) { finish(false) }
  })
}
