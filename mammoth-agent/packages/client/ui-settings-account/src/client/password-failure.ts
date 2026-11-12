/** Localized outcome of a rejected desktop password sign-in. */
import type { PasswordSignInResult } from '@mammoth-ai/mmp-deepseek-account/types'
import type { AccountKey } from './locales.ts'

/** Copy key the login dialog shows for a rejected password sign-in. */
export type PasswordFailureKey = Extract<AccountKey, 'clientTooOld' | 'credentialsFailed' | 'loginUnavailable'>

/**
 * Maps a server rejection to the dictionary key the login dialog renders. A known failure code decides
 * first; any other or absent code keeps the transport reason, so no server text reaches the dialog.
 * @param failure - rejected password sign-in from the account remote.
 * @returns the account dictionary key for the dialog.
 */
export function passwordFailureKey(failure: Extract<PasswordSignInResult, { ok: false }>): PasswordFailureKey {
  if (failure.code === 'CLIENT_TOO_OLD') return 'clientTooOld'
  return failure.reason === 'credentials' ? 'credentialsFailed' : 'loginUnavailable'
}
