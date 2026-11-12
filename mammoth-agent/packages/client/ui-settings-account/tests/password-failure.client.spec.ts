/** The localized key a rejected Desktop password sign-in maps to. */
import { expect, it } from 'vitest'
import { passwordFailureKey } from '../src/client/password-failure.ts'

it.each([
  [{ ok: false, reason: 'forbidden', code: 'CLIENT_TOO_OLD' } as const, 'clientTooOld'],
  [{ ok: false, reason: 'credentials', code: 'CLIENT_TOO_OLD' } as const, 'clientTooOld'],
  [{ ok: false, reason: 'credentials' } as const, 'credentialsFailed'],
  // A code this path does not own keeps the transport reason instead of changing the outcome.
  [{ ok: false, reason: 'credentials', code: 'SMS_RATE_LIMITED' } as const, 'credentialsFailed'],
  [{ ok: false, reason: 'forbidden' } as const, 'loginUnavailable'],
  [{ ok: false, reason: 'unavailable', code: 'SMS_UNAVAILABLE' } as const, 'loginUnavailable'],
])('maps %o to %s', (failure, expected) => {
  expect(passwordFailureKey(failure)).toBe(expected)
})
