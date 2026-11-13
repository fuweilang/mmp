/** Same-origin admin preview handoff; the standard composer owns all submission policy. */
import type { PreviewTarget } from './ExpertPreviewEntry.tsx'

type Failure = 'previewQuestionTooLong' | 'previewQuestionEmpty' | 'previewInputNotReady' | 'previewDraftExists' | 'previewSubmitFailed' | 'previewRequestLimit'
interface PreviewInput {
  initialize(text: string): 'applied' | 'preserved' | 'blocked'
  submit(): void | Promise<void>
  cancel?(): Promise<void>
}
interface Reply extends PreviewTarget {
  type: 'mmp.expert-preview.accepted' | 'mmp.expert-preview.error'
  requestId: string
  message?: string
}
/** Display identity supplied by the authorized preview parent after profile validation. */
export interface PreviewProfile { name: string; avatarUrl: string | null }

function previewProfile(value: unknown, origin: string): PreviewProfile | undefined {
  if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length>200 || !('avatarUrl' in value)) return
  if (value.avatarUrl===null) return { name:value.name,avatarUrl:null }
  if (typeof value.avatarUrl!=='string' || value.avatarUrl.length>4096) return
  try {
    const url=new URL(value.avatarUrl,origin)
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return
    return { name:value.name,avatarUrl:url.href }
  } catch { return }
}

/**
 * Bind one captured preview identity to its parent frame and retained session input.
 * @param options - browser window, immutable launch identity, current input resolver, and localized errors.
 * @returns readiness starter and disposer; disposing releases the listener and bounded polling timer.
 */
export function installExpertPreviewBridge(options: {
  frame: Window
  target: PreviewTarget
  input: () => PreviewInput | undefined
  message: (key: Failure) => string
  onProfile?: (profile: PreviewProfile) => void
}): {
  start(): void
  state(running: boolean): void
  content(hasMessages: boolean, userCount: number): void
  unavailable(): void
  dispose(): void
} {
  const { frame, target, input, message } = options
  const parent = frame.parent
  const origin = frame.location.origin
  const replies = new Map<string, Reply | undefined>()
  let disposed = false
  let started = false
  let lastRunning: boolean | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let submitting: Promise<void> | undefined
  const post = (reply: object) => { if (!disposed) parent.postMessage(reply, origin) }
  const onMessage = (event: MessageEvent) => {
    if (disposed || event.source !== parent || event.origin !== origin) return
    const data: unknown = event.data
    if (data === null || typeof data !== 'object'
      || !('type' in data) || (data.type !== 'mmp.expert-preview.submit' && data.type !== 'mmp.expert-preview.cancel')
      || !('agentId' in data) || data.agentId !== target.agentId
      || !('previewId' in data) || data.previewId !== target.previewId
      || !('requestId' in data) || typeof data.requestId !== 'string' || !data.requestId.trim() || data.requestId.length > 128) return
    if (data.type === 'mmp.expert-preview.submit' && (!('text' in data) || typeof data.text !== 'string')) return
    const { requestId } = data
    if (replies.has(requestId)) {
      const reply = replies.get(requestId)
      if (reply) post(reply)
      return
    }
    const fail = (key: Failure): Reply => ({ type: 'mmp.expert-preview.error', ...target, requestId, message: message(key) })
    if (replies.size >= 128) { post(fail('previewRequestLimit')); return }
    replies.set(requestId, undefined)
    if (data.type === 'mmp.expert-preview.cancel') {
      const settle = (reply: Reply) => { replies.set(requestId, reply); post(reply) }
      try {
        const current = started ? input() : undefined
        if (!current?.cancel) { settle(fail('previewInputNotReady')); return }
        const cancel = current.cancel.bind(current)
        const admission=submitting
        const interrupt=async()=>{
          let failed=false
          try {await cancel()} catch {failed=true}
          // Admission may enqueue after an early cancel. Interrupt once more once that handoff settles.
          if(admission) {await admission.catch(()=>{});await cancel()}
          else if(failed) throw new Error('preview cancellation failed')
        }
        void interrupt().then(
          () => settle({ type: 'mmp.expert-preview.accepted', ...target, requestId }),
          () => settle(fail('previewSubmitFailed')),
        )
      } catch (_error) { settle(fail('previewSubmitFailed')) }
      return
    }
    const text = 'text' in data && typeof data.text === 'string' ? data.text : ''
    let reply: Reply
    try {
      if (text.length > 16_000) reply = fail('previewQuestionTooLong')
      else if (!text.trim()) reply = fail('previewQuestionEmpty')
      else {
        const current = started ? input() : undefined
        if (!current) reply = fail('previewInputNotReady')
        else {
          const profile = 'profile' in data ? previewProfile(data.profile, origin) : undefined
          if (profile) options.onProfile?.(profile)
          const initialized = current.initialize(text)
          if (initialized === 'preserved') reply = fail('previewDraftExists')
          else if (initialized === 'blocked') reply = fail('previewInputNotReady')
          else {
            const pending = current.submit()
            if (pending instanceof Promise) {
              submitting=pending
              void pending.then(()=>{if(submitting===pending) submitting=undefined},()=>{if(submitting===pending) submitting=undefined})
              const settle = (result: Reply) => { if (!disposed) { replies.set(requestId, result); post(result) } }
              void pending.then(
                () => settle({ type: 'mmp.expert-preview.accepted', ...target, requestId }),
                () => settle(fail('previewSubmitFailed')),
              )
              return
            }
            reply = { type: 'mmp.expert-preview.accepted', ...target, requestId }
          }
        }
      }
    } catch (_error) {
      // Input failures leave their draft with the composer; upstream details stay local.
      reply = fail('previewSubmitFailed')
    }
    replies.set(requestId, reply)
    post(reply)
  }
  if (parent !== frame) frame.addEventListener('message', onMessage)
  return {
    unavailable() {
      if (!disposed && parent !== frame) post({ type: 'mmp.expert-preview.unavailable', ...target })
    },
    content(hasMessages, userCount) {
      if (!disposed && parent !== frame) post({ type: 'mmp.expert-preview.content', ...target, hasMessages, userCount })
    },
    state(running) {
      if (!disposed && started && parent !== frame && running !== lastRunning) {
        lastRunning = running
        post({ type: 'mmp.expert-preview.state', ...target, running })
      }
    },
    start() {
      if (started || disposed || parent === frame) return
      started = true
      let attempts = 0
      const check = () => {
        if (disposed) return
        let ready = false
        try { ready = input() !== undefined } catch (_error) { /* Session binding may still be hydrating. */ }
        if (ready) { post({ type: 'mmp.expert-preview.ready', ...target }); return }
        if (++attempts < 100) timer = setTimeout(check, 100)
      }
      check()
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      frame.removeEventListener('message', onMessage)
      replies.clear()
    },
  }
}
