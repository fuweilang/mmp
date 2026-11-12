/** Native account commands and Gateway state stream; no renderer receives credentials. */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { parseRemoteStreamServerMessage, REMOTE_STREAM_MUX_PATH } from '@mammoth-ai/mmp-api-gateway/stream-protocol'
import type { AccountClientMetadata, AccountFailureCode, AccountView, EnterpriseRegisterInput, PasswordSignInResult, SignInAttemptId, SmsSendResult } from '@mammoth-ai/mmp-deepseek-account/types'

/** Authenticated unary caller shared with native onboarding. */
export type AccountInvoke = (request: { namespace: string; method: string; args: Record<string, unknown> }) => Promise<unknown>

/** Decode the UI-safe state received across HTTP or WebSocket. @param value - wire value. @returns account projection. */
export function accountView(value: unknown): AccountView {
  if (typeof value !== 'object' || value === null || !('status' in value)
    || !['signed-out', 'credential-stored'].includes(String(value.status)) || !('attempt' in value)) {
    throw new Error('desktop account: invalid state')
  }
  if (!('links' in value) || typeof value.links !== 'object' || value.links === null
    || !('usageUrl' in value.links) || typeof value.links.usageUrl !== 'string'
    || !('topUpUrl' in value.links) || typeof value.links.topUpUrl !== 'string') {
    throw new Error('desktop account: invalid platform links')
  }
  validateBrowserDestination(value.links.usageUrl)
  validateBrowserDestination(value.links.topUpUrl)
  const attempt = value.attempt
  if (attempt !== null && (typeof attempt !== 'object' || !('id' in attempt) || typeof attempt.id !== 'string'
    || !('phase' in attempt) || !['initializing', 'waiting-browser', 'exchanging', 'committing', 'succeeded', 'cancelled', 'expired', 'failed'].includes(String(attempt.phase))
    || ('authorizeUrl' in attempt && typeof attempt.authorizeUrl !== 'string')
    || ('expiresAt' in attempt && (typeof attempt.expiresAt !== 'number' || !Number.isFinite(attempt.expiresAt)))
    || ('errorCode' in attempt && !['no-response', 'network', 'protocol', 'expired', 'storage'].includes(String(attempt.errorCode))))) {
    throw new Error('desktop account: invalid attempt')
  }
  if (attempt !== null && 'authorizeUrl' in attempt) {
    validateBrowserDestination(String(attempt.authorizeUrl))
  }
  const parsed = value as AccountView
  return {
    status: parsed.status,
    links: { usageUrl: parsed.links.usageUrl, topUpUrl: parsed.links.topUpUrl },
    attempt: parsed.attempt === null ? null : {
      id: parsed.attempt.id, phase: parsed.attempt.phase,
      ...parsed.attempt.authorizeUrl === undefined ? {} : { authorizeUrl: parsed.attempt.authorizeUrl },
      ...parsed.attempt.expiresAt === undefined ? {} : { expiresAt: parsed.attempt.expiresAt },
      ...parsed.attempt.errorCode === undefined ? {} : { errorCode: parsed.attempt.errorCode },
    },
  }
}

/** Only HTTP loopback or HTTPS destinations can leave the native app. */
function validateBrowserDestination(value: string): void {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || !(url.protocol === 'https:' || (loopback && url.protocol === 'http:'))) {
    throw new Error('desktop account: invalid browser destination')
  }
}

/** Native account operations and explicitly owned stream lifetime. */
export interface DesktopAccountBackend {
  /** @returns current account snapshot. */
  state(): Promise<AccountView>
  /** @param client - this window's identity and current language. @returns new or already-running login attempt. */
  start(client: AccountClientMetadata): Promise<AccountView>
  /** @param id - attempt to cancel. @returns cancellation or completed commit state. */
  cancel(id: SignInAttemptId): Promise<AccountView>
  /** @param client - this window's identity. @returns state after local sign-out. */
  signOut(client: AccountClientMetadata): Promise<AccountView>
  /**
   * @param client - this window's identity.
   * @param phone - enterprise phone number.
   * @param password - account password.
   * @returns whether the local session was stored.
   */
  signInWithPassword(client: AccountClientMetadata, phone: string, password: string): Promise<PasswordSignInResult>
  /**
   * @param phone - enterprise phone number.
   * @param scene - login or register.
   * @returns the cooldown. A local mock may include the code.
   */
  sendSmsCode(phone: string, scene: 'login' | 'register'): Promise<SmsSendResult>
  /**
   * @param client - this window's identity.
   * @param phone - enterprise phone number.
   * @param smsCode - six-digit code.
   * @returns whether the local session was stored.
   */
  signInWithSms(client: AccountClientMetadata, phone: string, smsCode: string): Promise<PasswordSignInResult>
  /**
   * @param client - this window's identity.
   * @param input - enterprise registration fields.
   * @returns whether the local session was stored. The browser cookie is not set.
   */
  registerWithPassword(
    client: AccountClientMetadata,
    input: EnterpriseRegisterInput,
  ): Promise<PasswordSignInResult>
  /**
   * @param listener - state recipient.
   * @param failed - stream failure recipient.
   * @param expired - live credential-expiry recipient.
   * @param onAnalyticsEnabledChanged - optional Desktop collection-policy recipient; disconnected streams publish false.
   * @returns stream disposer.
   */
  watch(
    listener: (state: AccountView) => void, failed: () => void, expired: () => void,
    onAnalyticsEnabledChanged?: (enabled: boolean) => void,
  ): () => void
}

/**
 * Connect native account operations to the standard authenticated Web backend.
 * @param origin - Host Web origin.
 * @param invoke - validated unary RPC caller.
 * @param cookies - Electron session cookie reader.
 * @returns account operations; watch callers own their subscriptions.
 */
/**
 * @param value - wire password result.
 * @returns the validated result, carrying only a recognized failure code.
 */
function passwordResult(value: unknown): PasswordSignInResult {
  if (typeof value !== 'object' || value === null || !('ok' in value) || typeof value.ok !== 'boolean') {
    throw new Error('desktop account: invalid password result')
  }
  if (value.ok === true) return { ok: true }
  const reason = 'reason' in value ? value.reason : undefined
  if (reason !== 'credentials' && reason !== 'forbidden' && reason !== 'unavailable') {
    throw new Error('desktop account: invalid password result')
  }
  const code = accountFailureCode(value)
  return { ok: false, reason, ...(code === undefined ? {} : { code }) }
}

const ACCOUNT_FAILURE_CODES: readonly string[] = ['SMS_RATE_LIMITED', 'SMS_INVALID', 'SMS_CODE_EXPIRED', 'SMS_UNAVAILABLE', 'CLIENT_TOO_OLD']

/**
 * Keep only a stable failure code so no server-authored message reaches the renderer.
 * @param value - wire result object.
 * @returns the recognized code, if any.
 */
function accountFailureCode(value: object): AccountFailureCode | undefined {
  const code = 'code' in value ? value.code : undefined
  return typeof code === 'string' && ACCOUNT_FAILURE_CODES.includes(code) ? code as AccountFailureCode : undefined
}

export function desktopAccountBackend(origin: string, invoke: AccountInvoke, cookies: () => Promise<string>): DesktopAccountBackend {
  const call = async (method: string, args: Record<string, unknown> = {}): Promise<AccountView> =>
    accountView(await invoke({ namespace: 'account', method, args }))
  return {
    state: () => call('getState'),
    start: client => call('startSignIn', { client, callbackOrigin: new URL(origin).origin, loginSource: 'desktop' }),
    cancel: attemptId => call('cancelSignIn', { attemptId }), signOut: client => call('signOut', { client }),
    signInWithPassword: async (client, phone, password) => passwordResult(await invoke({
      namespace: 'account', method: 'signInWithPassword', args: { client, phone, password },
    })),
    sendSmsCode: async (phone, scene) => {
      const value = await invoke({ namespace: 'account', method: 'sendSmsCode', args: { phone, scene } })
      if (typeof value !== 'object' || value === null || !('ok' in value) || typeof value.ok !== 'boolean') {
        throw new Error('desktop account: invalid sms result')
      }
      if (value.ok === true) {
        const retryAfterSeconds = 'retryAfterSeconds' in value && typeof value.retryAfterSeconds === 'number' ? value.retryAfterSeconds : 60
        const mockCode = 'mockCode' in value && typeof value.mockCode === 'string' ? value.mockCode : undefined
        return { ok: true, retryAfterSeconds, ...(mockCode ? { mockCode } : {}) }
      }
      const reason = 'reason' in value ? value.reason : undefined
      if (reason !== 'invalid' && reason !== 'unavailable' && reason !== 'rejected') {
        throw new Error('desktop account: invalid sms failure reason')
      }
      const code = accountFailureCode(value)
      return { ok: false, reason, ...(code === undefined ? {} : { code }) }
    },
    signInWithSms: async (client, phone, smsCode) => passwordResult(await invoke({
      namespace: 'account', method: 'signInWithSms', args: { client, phone, smsCode },
    })),
    registerWithPassword: async (client, input) => passwordResult(await invoke({
      namespace: 'account', method: 'registerWithPassword', args: { client, input },
    })),
    watch(listener, failed, expired, onAnalyticsEnabledChanged) {
      let closed = false
      let socket: WebSocket | undefined
      let retry: ReturnType<typeof setTimeout> | undefined
      const connect = (): void => {
        const streamId = randomUUID()
        const expiryStreamId = randomUUID()
        const analyticsPolicyStreamId = randomUUID()
        void cookies().then((cookie) => {
          if (closed) return
          const url = new URL(REMOTE_STREAM_MUX_PATH, origin)
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
          socket = new WebSocket(url, { headers: { cookie, origin }, maxPayload: 65_536 })
          socket.on('open', () => {
            if (onAnalyticsEnabledChanged !== undefined) socket?.send(JSON.stringify({ type: 'open', streamId: analyticsPolicyStreamId, endpoint: 'productAnalytics/watchPolicy', payload: { args: {} } }))
            socket?.send(JSON.stringify({ type: 'open', streamId: expiryStreamId, endpoint: 'account/watchExpiry', payload: { args: {} } }))
            socket?.send(JSON.stringify({ type: 'open', streamId, endpoint: 'account/watch', payload: { args: {} } }))
          })
          socket.on('message', (data) => {
            try {
              const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
              const frame = parseRemoteStreamServerMessage(bytes.toString('utf8'))
              if (frame.streamId === analyticsPolicyStreamId) {
                if (frame.type === 'item' && typeof frame.value === 'boolean') onAnalyticsEnabledChanged?.(frame.value)
                else onAnalyticsEnabledChanged?.(false)
                return
              }
              if (frame.streamId === expiryStreamId && frame.type === 'item' && frame.value === 'session-expired') { expired(); return }
              if (frame.streamId !== streamId) throw new Error('desktop account: unexpected stream')
              if (frame.type === 'item') listener(accountView(frame.value))
              else socket?.close()
            } catch { socket?.close() }
          })
          socket.on('error', () => { socket?.close() })
          socket.on('close', () => { if (!closed) { onAnalyticsEnabledChanged?.(false); failed(); retry = setTimeout(connect, 1000) } })
        }).catch(() => { if (!closed) { onAnalyticsEnabledChanged?.(false); failed(); retry = setTimeout(connect, 1000) } })
      }
      connect()
      return () => { closed = true; onAnalyticsEnabledChanged?.(false); clearTimeout(retry); socket?.close() }
    },
  }
}
