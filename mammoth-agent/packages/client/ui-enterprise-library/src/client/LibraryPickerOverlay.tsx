/** Root overlay binding for a picker whose target session is fixed at open time. */
import type { HostObservable, InjectFace, PropsLocale } from '@mammoth-ai/mmp-client-ui-slots'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { LibraryChoice } from './selection.ts'
import type { LibraryFetch } from './api.ts'
import { LibraryPicker } from './LibraryPicker.tsx'

/** Draft selection captured when the library action opens. */
export interface LibraryPickerRequest {
  readonly sessionId: SessionId
  readonly initialSelected: readonly LibraryChoice[]
}

/** Plain actions and reactive request supplied by the library plugin. */
export interface LibraryPickerOverlayInjected {
  hooks: { pickerRequest: HostObservable<LibraryPickerRequest | null> }
  origin: string
  fetchImpl: LibraryFetch
  onClose: () => void
  onConfirm: (items: readonly LibraryChoice[]) => Promise<void>
}

/**
 * Show a dedicated picker without binding it to the currently visible conversation.
 * @param props - root request hook, localized labels and captured-target callbacks.
 * @returns the active picker or nothing.
 */
export function LibraryPickerOverlay({ usePickerRequest, ...props }: PropsLocale<'enterpriseLibrary'> & InjectFace<LibraryPickerOverlayInjected>) {
  const request = usePickerRequest(value => value)
  return request === null ? null : <LibraryPicker key={request.sessionId} {...props} open initialSelected={request.initialSelected} />
}
