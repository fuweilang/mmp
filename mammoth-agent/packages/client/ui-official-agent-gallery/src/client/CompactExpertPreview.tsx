import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, SessionAreaProps, Translate } from '@mammoth-ai/mmp-client-ui-slots'
import type { ExpertKnowledgeSource } from '@mammoth-ai/mmp-official-agent-gallery/types'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
import { MarkdownText } from '@mammoth-ai/mmp-client-ui-primitives'
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
  launch(): Promise<string | undefined>
  getSession(): SessionAreaProps['session']
  t: Translate<OfficialAgentGalleryLocaleKey>
}

/** Mount only the captured expert Session, without instantiating the product shell. */
export function CompactExpertPreview({ target, launch, getSession, t, SessionProvider, renderSlot }: RootProps) {
  const [sessionId, setSessionId] = useState<SessionAreaProps['session']>()
  return <section className={css.root} data-expert-preview-compact="">
    {sessionId === undefined
      ? <ExpertPreviewEntry target={target} t={t} launch={async () => {
          const failure = await launch()
          if (failure === undefined) setSessionId(getSession())
          return failure
        }} />
      : <SessionProvider session={sessionId}>{renderSlot('official.expert.preview.session', {})}</SessionProvider>}
  </section>
}

type MessagesProps = PropsRuntime<'official.expert.preview.session'> & PropsLocale<'officialAgentGallery'> & {
  chatText: import('@mammoth-ai/mmp-client-ui-chat/client').ChatViewSlotProps['t']
  openSource(sessionId: SessionId, recordId: string, label: string): Promise<{ text: string; locator: unknown }>
}

function failureText(message: string, code: string | undefined, t: MessagesProps['chatText']): string {
  if (code === 'ACCOUNT_SIGNED_OUT') return t('message.failure.accountSignedOut')
  if (code === 'INTERRUPTED') return t('message.failure.interrupted')
  if (code === 'ACCOUNT_SIGN_IN_REQUIRED') return t('message.failure.accountSignInRequired')
  if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA') return t('message.failure.quota')
  return code === 'AUTH' ? t('message.failure.auth') : message || t('message.turnError')
}

/** Reuse the ordinary incremental Chat projection and shared Markdown renderer. */
export function CompactExpertMessages({ sessionId, useChat, useSession, useProjection, chatText, openSource, t }: MessagesProps) {
  const chat = useChat(value => value.legacy)
  const error = useSession(value => value.promptError)
  const sources = useProjection('officialExpertKnowledge')
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
  const sourceTurns = new Set(chat.nodes.flatMap(node => node.kind === 'assistant' ? [node.turn] : []))
  if (chat.partial) sourceTurns.add(chat.partial.turn)
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
        const lastInTurn = !chat.nodes.slice(index + 1).some(next => next.kind === 'assistant' && next.turn === node.turn)
          && chat.partial?.turn !== node.turn
        return <article key={node.seq} className={css.assistant} data-role="assistant">
          {blocks(node.blocks)}
          {lastInTurn ? citations(sources?.filter(source => source.turn === node.turn)) : null}
        </article>
      }
      if (node.kind === 'turn-error') return <p key={node.seq} role="alert">{failureText(node.message, node.code, chatText)}{node.code ? <code> ({node.code})</code> : null}</p>
      return null
    })}
    {chat.partial ? <article className={css.assistant} data-role="assistant">
      {blocks(chat.partial.blocks, true)}
      {citations(sources?.filter(source => source.turn === chat.partial?.turn))}
    </article> : null}
    {error ? <p role="alert">{failureText(error.error.message, error.error.code, chatText)} <code>({error.error.code})</code></p> : null}
    {citations(sources?.filter(source => !sourceTurns.has(source.turn)))}
  </div>
}
