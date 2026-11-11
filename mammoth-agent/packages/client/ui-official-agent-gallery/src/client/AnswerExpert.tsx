/** Expert who answered one turn, shown above that reply. */
import { useEffect, useState, type ReactNode } from 'react'
import { FishLogo } from '@mammoth-ai/mmp-client-ui-primitives'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
import { resolveCardAvatarSrc } from './official-avatars.ts'
import css from './AnswerExpert.module.css'

/** Wire id for a turn with no selected expert. The host projection uses the same id. */
const MAMMOTH_AI_AGENT_ID = 'mammoth-ai'

/** Portrait lookup for one answering expert. */
export interface AnswerExpertCard {
  readonly key: string
  readonly avatarUrl: string | null
}

interface AnswerExpert {
  readonly name: string
  readonly agentId: string
}

function expertAt(value: unknown, turn: number): AnswerExpert | undefined {
  if (!Number.isSafeInteger(turn) || value === null || typeof value !== 'object') return undefined
  const row = (value as Record<string, unknown>)[String(turn)]
  if (typeof row !== 'object' || row === null) return undefined
  const record = row as { name?: unknown; agentId?: unknown }
  if (typeof record.name !== 'string' || record.name === '' || typeof record.agentId !== 'string' || record.agentId === '') return undefined
  return row as AnswerExpert
}

/**
 * Paint who answered this turn above the reply.
 * A turn with no selected expert is signed 猛犸AI. A turn with no record yet paints nothing.
 * @param props - session projection and the turn number.
 * @returns the byline, or null before this turn's answer is recorded.
 */
export function AnswerExpert({
  sessionId, useSessions, turn, loadCard,
}: PropsRuntime<'conversation.chat.assistant.expert'> & {
  loadCard?: (agentId: string) => Promise<AnswerExpertCard | undefined>
}): ReactNode {
  const expert = useSessions((state) => {
    const value = state.byId[sessionId]?.projectionValues?.officialGalleryAnswerExpert
    return expertAt(value, turn)
  })
  const [icon, setIcon] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (expert === undefined || expert.agentId === MAMMOTH_AI_AGENT_ID || loadCard === undefined) {
      setIcon(null)
      return
    }
    let alive = true
    void loadCard(expert.agentId).then((card) => {
      if (!alive) return
      setFailed(false)
      setIcon(card === undefined ? null : resolveCardAvatarSrc(card.key, card.avatarUrl) ?? null)
    }).catch(() => { if (alive) setIcon(null) })
    return () => { alive = false }
  }, [expert, loadCard])
  if (expert === undefined) return null
  const showIcon = icon !== null && icon !== '' && !failed
  return (
    <div className={css.byline}>
      {expert.agentId === MAMMOTH_AI_AGENT_ID
        ? <FishLogo size={22} className={css.mark} />
        : showIcon && (
          <span className={css.portrait} aria-hidden="true">
            <img src={icon} alt="" onError={() => { setFailed(true) }} />
          </span>
        )}
      <span className={css.name}>{expert.name}</span>
    </div>
  )
}
