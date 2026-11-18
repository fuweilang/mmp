import { useEffect, useMemo, useRef, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, SessionAreaProps, Translate } from '@mammoth-ai/mmp-client-ui-slots'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
import { IconUsersOutlineRegular, MarkdownText, TextShimmer } from '@mammoth-ai/mmp-client-ui-primitives'
import type { PreviewProfile } from './expert-preview-bridge.ts'
import { ExpertPreviewEntry, type PreviewTarget } from './ExpertPreviewEntry.tsx'
import { KnowledgeSources } from './KnowledgeSources.tsx'
import type { OfficialAgentGalleryLocaleKey } from './locales.ts'
import css from './CompactExpertPreview.module.css'

declare module '@mammoth-ai/mmp-client-ui-slots' {
  interface SlotMap {
    /** Session-bound read-only expert messages; submission belongs to the administration parent. */
    'official.expert.preview.session': { kind: 'single'; scope: 'session' }
  }
}

type RootProps = PropsRuntime<'rootframe'> & PropsRenderSlots<'official.expert.preview.session'> & {
  target: PreviewTarget
  launch: () => Promise<string | undefined>
  getSession: () => SessionAreaProps['session']
  reportUnavailable: () => void
  t: Translate<OfficialAgentGalleryLocaleKey>
}

/** Mount only the captured expert Session, without instantiating the product shell. */
export function CompactExpertPreview({ target, launch, getSession, reportUnavailable, t, SessionProvider, renderSlot }: RootProps) {
  const [sessionId, setSessionId] = useState<SessionAreaProps['session']>()
  return <section className={css.root} data-expert-preview-compact="">
    {sessionId === undefined
      ? <ExpertPreviewEntry embedded target={target} t={t} onUnavailable={reportUnavailable} launch={async () => {
          const failure = await launch()
          if (failure === undefined) setSessionId(getSession())
          return failure
        }} />
      : <SessionProvider session={sessionId}>{renderSlot('official.expert.preview.session', {})}</SessionProvider>}
  </section>
}

type MessagesProps = PropsRuntime<'official.expert.preview.session'> & PropsLocale<'officialAgentGallery'> & InjectFace<{ hooks:{ previewProfile:HostObservable<PreviewProfile> } }> & {
  chatText: import('@mammoth-ai/mmp-client-ui-chat/client').ChatViewSlotProps['t']
  openSource: (sessionId: SessionId, recordId: string, label: string) => Promise<{ text: string; locator: unknown }>
  download?: (sessionId: SessionId, artifactId: string) => Promise<{ name: string; data: string; sha256: string }>
  reportContent: (hasMessages: boolean, userCount: number) => void
  reportState: (running: boolean) => void
}

function failureText(message: string, code: string | undefined, t: MessagesProps['chatText']): string {
  if (code === 'ACCOUNT_SIGNED_OUT') return t('message.failure.accountSignedOut')
  if (code === 'INTERRUPTED') return t('message.failure.interrupted')
  if (code === 'ACCOUNT_SIGN_IN_REQUIRED') return t('message.failure.accountSignInRequired')
  if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA') return t('message.failure.quota')
  return code === 'AUTH' ? t('message.failure.auth') : message || t('message.turnError')
}

/** Reuse the ordinary incremental Chat projection and shared Markdown renderer. */
export function CompactExpertMessages({
  sessionId, useChat, useSession, useProjection, usePreviewProfile, chatText, openSource, download, reportContent, reportState, t,
}: MessagesProps) {
  const chat = useChat(value => value.legacy)
  const profile = usePreviewProfile(value => value)
  const running = useSession(value => value.running)
  const error = useSession(value => value.promptError)
  const sources = useProjection('officialExpertKnowledge')
  const runtime = useProjection('officialGalleryRuntime')
  const [artifactBusy, setArtifactBusy] = useState(false)
  const [artifactFailed, setArtifactFailed] = useState(false)
  const artifact = runtime?.lastArtifact ?? null
  const saveArtifact = async () => {
    if (!artifact || !download || artifactBusy) return
    setArtifactBusy(true)
    setArtifactFailed(false)
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
      setArtifactFailed(true)
    } finally {
      setArtifactBusy(false)
    }
  }
  // Reveal the frame only after its transcript has committed, replacing the parent's pending bubble.
  useEffect(() => {
    reportContent(chat.nodes.length > 0 || !!chat.partial || !!error,
      chat.nodes.filter(node => node.kind === 'user' || node.kind === 'steering').length)
  }, [chat.nodes, chat.partial, error, sources, reportContent])
  // Second running-state channel beside the launch-time session subscription:
  // this render-layer report keeps the administration parent in sync even when
  // the launch-bound subscription stops delivering (the bridge dedups).
  useEffect(() => {
    reportState(running)
  }, [running, reportState])
  const body = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const labels = useMemo(() => ({
    code: { copyLabel: chatText('copy'), copiedLabel: chatText('copied'), toolbarLabels: {
      codeLabel: chatText('codeBlock.title'), wrapLabel: chatText('codeBlock.wrap'), unwrapLabel: chatText('codeBlock.unwrap'),
    } },
    footnotes: chatText('markdown.footnotes'),
  }), [chatText])
  useEffect(() => {
    if (pinned.current && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [chat, sources])
  const blocks = (values: readonly import('@mammoth-ai/mmp-client-ui-conversation/client').AssistantBlock[], streaming = false) => values.map((block, index) =>
    block.kind === 'text' && block.text ? <MarkdownText key={index} text={block.text} streaming={streaming} labels={labels} /> : null)
  const citations = (turn: number) => {
    // Retrieval admission is broader than the evidence the answer actually cites.
    // Keep the durable projection intact for exact source authorization/replay.
    const answer = [
      ...chat.nodes.flatMap(node => node.kind === 'assistant' && node.turn === turn ? node.blocks : []),
      ...(chat.partial?.turn === turn ? chat.partial.blocks : []),
    ].flatMap(block => block.kind === 'text' ? [block.text] : [])
    const labels = new Set(answer.flatMap(text => Array.from(text.matchAll(/\[((?:T\d+L\d+S\d+)(?:[\s,，;；]+T\d+L\d+S\d+)*)\]/g)))
      .flatMap(match => match[1]!.match(/T\d+L\d+S\d+/g) ?? []))
    // A later answer may explicitly cite an authorized passage from an earlier turn.
    const cited = sources?.filter(source => labels.has(source.label)) ?? []
    return cited.length ? <KnowledgeSources embedded sources={cited} open={(recordId, label) => openSource(sessionId, recordId, label)} t={t} /> : null
  }
  const hasText = (values: readonly import('@mammoth-ai/mmp-client-ui-conversation/client').AssistantBlock[]) => values.some(block=>block.kind==='text' && !!block.text.trim())
  const latestUser = chat.nodes.findLastIndex(node=>node.kind==='user' || node.kind==='steering')
  const waiting = running && !error && latestUser>=0 && !chat.nodes.slice(latestUser+1).some(node=>node.kind==='assistant' && hasText(node.blocks)) && !(chat.partial && hasText(chat.partial.blocks))
  const byline = () => <PreviewByline name={profile.name || t('tabExperts')} avatarUrl={profile.avatarUrl} />
  return <div ref={body} className={css.messages} data-expert-preview-messages="" onScroll={() => {
    const current = body.current
    if (current) pinned.current = current.scrollHeight - current.scrollTop - current.clientHeight < 80
  }}>
    {chat.nodes.map((node, index) => {
      if (node.kind === 'user' || node.kind === 'steering') {
        const text = node.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
        return text ? <article key={node.seq} className={css.user} data-role="user">{text}</article> : null
      }
      if (node.kind === 'assistant') {
        if (!hasText(node.blocks)) return null
        const firstInTurn = !chat.nodes.slice(0,index).some(previous=>previous.kind==='assistant' && previous.turn===node.turn && hasText(previous.blocks))
        const lastInTurn = !chat.nodes.slice(index + 1).some(next => next.kind === 'assistant' && next.turn === node.turn && hasText(next.blocks))
          && !(chat.partial?.turn === node.turn && hasText(chat.partial.blocks))
        return <article key={node.seq} className={css.assistant} data-role="assistant">
          {firstInTurn ? byline() : null}
          <div data-expert-preview-answer="">{blocks(node.blocks)}</div>
          {lastInTurn ? citations(node.turn) : null}
        </article>
      }
      if (node.kind === 'turn-error') return <p key={node.seq} role="alert">{failureText(node.message, node.code, chatText)}{node.code ? <code> ({node.code})</code> : null}</p>
      return null
    })}
    {chat.partial && hasText(chat.partial.blocks) ? <article className={css.assistant} data-role="assistant">
      {!chat.nodes.some(node=>node.kind==='assistant' && node.turn===chat.partial?.turn && hasText(node.blocks)) ? byline() : null}
      <div data-expert-preview-answer="">{blocks(chat.partial.blocks, true)}</div>
      {citations(chat.partial.turn)}
    </article> : null}
    {waiting ? <article className={css.assistant} data-role="assistant-waiting" aria-busy="true">{byline()}<ThinkingLine startTime={latestUser >= 0 ? chat.nodes[latestUser]!.time : undefined} chatText={chatText} /></article> : null}
    {error ? <p role="alert">{failureText(error.error.message, error.error.code, chatText)} <code>({error.error.code})</code></p> : null}
    {artifact ? <p className={css.artifactBar} data-expert-preview-artifact="">
      <button type="button" className={css.artifactButton} onClick={() => void saveArtifact()} disabled={artifactBusy || !download}>{artifactBusy ? t('artifactBusy') : t('artifactDownload', { name: artifact.name })}</button>
      {artifactFailed ? <span role="alert" className={css.artifactError}>{t('artifactFailed')}</span> : null}
    </p> : null}
  </div>
}

function PreviewByline({ name,avatarUrl }: PreviewProfile) {
  const [failedUrl,setFailedUrl]=useState<string|null>(null)
  return <header className={css.byline} data-expert-preview-byline=""><span className={css.avatar} aria-hidden="true">{avatarUrl && failedUrl!==avatarUrl ? <img src={avatarUrl} alt="" onError={()=>{setFailedUrl(avatarUrl)}} /> : <IconUsersOutlineRegular size={18}/>}</span><strong>{name}</strong></header>
}

/** Local copies of the chat running-status pieces; cross-package src value imports are blocked by the client bundle purity gate. */
const LIVE_RUN_CLOCK_INTERVAL_MS = 1000

type RunDurationTranslate = (key: 'duration.secondUnit' | 'duration.minuteUnit' | 'duration.hourUnit') => string

function formatRunDuration(ms: number, t: RunDurationTranslate): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  let text = ''
  if (hours > 0) text += String(hours) + t('duration.hourUnit')
  if (total >= 60) text += String(minutes) + t('duration.minuteUnit')
  return text + String(seconds) + t('duration.secondUnit')
}

const REST_PATH = 'M8.844 13.742C8.967 12.328 8.45 10.4 8.45 9.65C8.45 8.94 8.88 8.43 9.6 8.43C11.285 8.43 12.106 8.281 12.685 8.104C13.71 7.791 14.585 6.768 15.055 5.945C15.137 5.803 14.99 5.641 14.829 5.671C13.829 5.86 12.828 5.376 11.827 4.978C10.659 4.514 9.491 4.707 8.935 4.876C8.805 4.915 8.658 4.819 8.636 4.686C8.468 3.643 7.405 2.615 5.498 2.238C4.54 2.048 3.748 1.574 3.347 1.202C3.252 1.113 3.088 1.125 3.03 1.242C2.628 2.059 2.168 3.82 5.248 6.115C5.82 6.494 6.31 6.785 6.574 7.637C6.72 8.104 6.157 9.168 6.061 9.368C5.157 11.27 5.089 12.19 4.926 13.742'

function RunningWhaleTail() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <span className={css.runningWhaleAnimated} />
      <svg className={css.runningWhaleStill} width="100%" height="100%" viewBox="0 0 16 16" fill="none">
        <path d={REST_PATH} stroke="currentColor" strokeWidth={1} />
      </svg>
    </span>
  )
}

/** Home-parity pre-first-token indicator: whale tail + live “深度思考中，用时 N 秒 ···” clock. */
function ThinkingLine({ startTime, chatText }: { startTime: number | undefined; chatText: MessagesProps['chatText'] }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime])
  const label = startTime === undefined ? chatText('chat.deepDiving') : chatText('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), chatText),
  })
  return <div className={css.thinking} role="status" aria-live="polite" aria-atomic="true">
    <RunningWhaleTail />
    <TextShimmer active className={css.thinkingText}>{label}</TextShimmer>
  </div>
}
