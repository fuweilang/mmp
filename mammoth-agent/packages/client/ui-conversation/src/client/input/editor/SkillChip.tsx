/** Visual body of one skill chip. The node owns identity and removal. */
import { useState, type ReactNode } from 'react'
import { IconCloseOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import css from './SkillChip.module.css'

/** Display inputs of one skill chip. */
export interface SkillChipViewProps {
  readonly name: string
  readonly icon: string | null
  readonly label: string
  readonly onRemove: () => void
}

/**
 * Render the skill name, its portrait, and the hover removal control.
 * @param props - display fields and the removal command target.
 * @returns the chip body.
 */
export function SkillChipView({ name, icon, label, onRemove }: SkillChipViewProps): ReactNode {
  const portrait = icon?.trim() ?? ''
  const [failed, setFailed] = useState(false)
  const showIcon = portrait !== '' && !failed
  return (
    <span className={css.chip} {...(showIcon ? { 'data-has-icon': 'true' } : {})}>
      {showIcon && (
        <span className={css.icon} aria-hidden="true">
          <img src={portrait} alt="" onError={() => { setFailed(true) }} />
        </span>
      )}
      <span className={css.name}>{name}</span>
      <button
        type="button"
        className={css.remove}
        aria-label={label}
        onMouseDown={event => { event.preventDefault() }}
        onClick={onRemove}
      >
        <IconCloseOutlineRegular size={12} />
      </button>
    </span>
  )
}
