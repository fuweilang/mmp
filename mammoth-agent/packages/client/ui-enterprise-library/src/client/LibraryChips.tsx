import { useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { ChipStore } from './store.ts'

export type LibraryChipsInjected = {
  readonly chips: ChipStore
}

export type LibraryChipsProps =
  PropsRuntime<'conversation.input.dock'> & PropsLocale<'enterpriseLibrary'> & InjectFace<LibraryChipsInjected>

/**
 * Composer chips for library versions. They stay until the user removes them
 * or sends their own question; this row has no send button.
 * @param props - the session input zone, copy, and chip store.
 * @returns the waiting chip row, or nothing when no file is selected.
 */
export function LibraryChips({ session, t, chips }: LibraryChipsProps) {
  const selected = useSyncExternalStore(chips.subscribe, () => chips.get(session.sessionId))
  if (selected.length === 0) return null
  return <div>
    <p>{t('chipsWaiting')}</p>
    {selected.map(chip => <button
      key={chip.versionId}
      type="button"
      onClick={() => { chips.remove(session.sessionId, chip.versionId) }}
    >{t('remove').replace('{name}', chip.name)}</button>)}
  </div>
}
