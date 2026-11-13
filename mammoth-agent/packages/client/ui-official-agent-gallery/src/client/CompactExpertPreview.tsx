import { useEffect, useMemo, useRef, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, SessionAreaProps, Translate } from '@mammoth-ai/mmp-client-ui-slots'
import type { ExpertKnowledgeSource } from '@mammoth-ai/mmp-official-agent-gallery/types'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
import { IconUsersOutlineRegular, MarkdownText } from '@mammoth-ai/mmp-client-ui-primitives'
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
  reportContent: (hasMessages: boolean, userCount: number) => void
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
  sessionId, useChat, useSession, useProjection, usePreviewProfile, chatText, openSource, reportContent, t,
}: MessagesProps) {
  const chat = useChat(value => value.legacy)
  const profile = usePreviewProfile(value => value)
  const running = useSession(value => value.running)
  const error = useSession(value => value.promptError)
  const sources = useProjection('officialExpertKnowledge')
  // Reveal the frame only after its transcript has committed, replacing the parent's pending bubble.
  useEffect(() => {
    reportContent(chat.nodes.length > 0 || !!chat.partial || !!error,
      chat.nodes.filter(node => node.kind === 'user' || node.kind === 'steering').length)
  }, [chat.nodes, chat.partial, error, sources, reportContent])
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
  const citations = (turnSources: readonly ExpertKnowledgeSource[] | undefined) => turnSources?.length
    ? <KnowledgeSources embedded sources={turnSources} open={(recordId, label) => openSource(sessionId, recordId, label)} t={t} /> : null
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
          {lastInTurn ? citations(sources?.filter(source => source.turn === node.turn)) : null}
        </article>
      }
      if (node.kind === 'turn-error') return <p key={node.seq} role="alert">{failureText(node.message, node.code, chatText)}{node.code ? <code> ({node.code})</code> : null}</p>
      return null
    })}
    {chat.partial && hasText(chat.partial.blocks) ? <article className={css.assistant} data-role="assistant">
      {!chat.nodes.some(node=>node.kind==='assistant' && node.turn===chat.partial?.turn && hasText(node.blocks)) ? byline() : null}
      <div data-expert-preview-answer="">{blocks(chat.partial.blocks, true)}</div>
      {citations(sources?.filter(source => source.turn === chat.partial?.turn))}
    </article> : null}
    {waiting ? <article className={css.assistant} data-role="assistant-waiting" aria-busy="true">{byline()}<span className={css.waiting} aria-hidden="true"><i/><i/><i/></span></article> : null}
    {error ? <p role="alert">{failureText(error.error.message, error.error.code, chatText)} <code>({error.error.code})</code></p> : null}
  </div>
}

function PreviewByline({ name,avatarUrl }: PreviewProfile) {
  const [failedUrl,setFailedUrl]=useState<string|null>(null)
  return <header className={css.byline} data-expert-preview-byline=""><span className={css.avatar} aria-hidden="true">{avatarUrl && failedUrl!==avatarUrl ? <img src={avatarUrl} alt="" onError={()=>{setFailedUrl(avatarUrl)}} /> : <IconUsersOutlineRegular size={18}/>}</span><strong>{name}</strong></header>
}
