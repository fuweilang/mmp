/** Read-only skills inside one sent user message. Offsets place them in the sentence. */
import { Fragment, useState, type ReactNode } from 'react'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
import type {} from '@mammoth-ai/mmp-official-agent-gallery/types'
import css from './SentSkillChips.module.css'

/** One skill the bubble can paint. */
interface SentSkill {
  readonly name: string
  readonly key: string
  readonly icon?: string | null
  readonly offset?: number
}

function placedOffset(skill: SentSkill): number | undefined {
  return Number.isSafeInteger(skill.offset) && Number(skill.offset) >= 0 ? Number(skill.offset) : undefined
}

function projectedSkills(value: unknown, requestId: string | undefined): readonly SentSkill[] | undefined {
  if (requestId === undefined || value === null || typeof value !== 'object') return undefined
  const row = (value as Record<string, unknown>)[requestId]
  if (!Array.isArray(row)) return undefined
  for (const item of row) {
    if (typeof item !== 'object' || item === null) return undefined
    const record = item as { name?: unknown; key?: unknown }
    if (typeof record.name !== 'string' || record.name === '' || typeof record.key !== 'string' || record.key === '') return undefined
  }
  return row as readonly SentSkill[]
}

/** Portrait plus name. A missing or broken image leaves the name. */
function SentSkillChip({ name, icon }: { readonly name: string; readonly icon: string | null }): ReactNode {
  const [failed, setFailed] = useState(false)
  const showIcon = icon !== null && icon !== '' && !failed
  return (
    <span className={css.chip} {...(showIcon ? { 'data-has-icon': 'true' } : {})}>
      {showIcon && (
        <span className={css.icon} aria-hidden="true">
          <img src={icon} alt="" onError={() => { setFailed(true) }} />
        </span>
      )}
      <span className={css.name}>{name}</span>
    </span>
  )
}

interface Piece {
  readonly kind: 'text' | 'chip'
  readonly text?: string
  readonly skill?: SentSkill
}

/** Chips with an offset sit in the sentence. A list missing any offset leads the sentence. */
function pieces(text: string, skills: readonly SentSkill[]): Piece[] {
  const offsets = skills.map(placedOffset)
  if (offsets.some(offset => offset === undefined)) {
    return [
      ...skills.map(skill => ({ kind: 'chip' as const, skill })),
      ...(text === '' ? [] : [{ kind: 'text' as const, text }]),
    ]
  }
  const ordered = skills.map((skill, index) => ({ skill, index, offset: Math.min(text.length, offsets[index] ?? 0) }))
    .sort((left, right) => left.offset - right.offset || left.index - right.index)
  const out: Piece[] = []
  let cursor = 0
  for (const item of ordered) {
    if (item.offset > cursor) out.push({ kind: 'text', text: text.slice(cursor, item.offset) })
    out.push({ kind: 'chip', skill: item.skill })
    cursor = item.offset
  }
  if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor) })
  return out
}

/**
 * Paint this message's skills inside the user bubble.
 * The echo supplies `skills`. A durable message reads the attempt projection by request id.
 * @param props - session projection and the message's skill seat.
 * @returns the sentence with chips, or null when this seat has neither text nor skills.
 */
export function SentSkillChips({
  sessionId, useSessions, requestId, skills, text, renderText,
}: PropsRuntime<'conversation.chat.user.skills'>): ReactNode {
  const projected = useSessions((state) => {
    const value = state.byId[sessionId]?.projectionValues?.officialGallerySentSkills
    return projectedSkills(value, requestId)
  })
  const shown = skills !== undefined && skills.length > 0 ? skills : projected
  const body = text ?? ''
  if (shown === undefined || shown.length === 0) return renderText === undefined ? null : renderText(body)
  return (
    <span className={css.flow}>
      {pieces(body, shown).map((piece, index) => piece.kind === 'text'
        ? <Fragment key={`text:${index}`}>{renderText === undefined ? piece.text : renderText(piece.text ?? '')}</Fragment>
        : <SentSkillChip key={`${piece.skill?.key ?? 'skill'}:${index}`} name={piece.skill?.name ?? ''} icon={piece.skill?.icon ?? null} />)}
    </span>
  )
}
