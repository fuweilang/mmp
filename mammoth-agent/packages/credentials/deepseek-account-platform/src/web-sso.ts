/** Local, single-workspace Ground SSO. Ground owns registration, passwords and session verification. */
import { createHash } from 'node:crypto'
import type { BrowserIdentityPolicy, ConnectionIndexRequest, ConnectionTrustRequest } from '@mammoth-ai/mmp-client-connection'
import { loggedFetch } from './http-log.ts'

/** A Ground-verified identity; tenant changes require a separate local workspace. */
export type GroundWebIdentity = { userId: string; tenantId: string | null }

/** Cookie extraction rejects duplicate names instead of guessing which credential the browser meant. */
export function groundWebCookie(request: ConnectionTrustRequest, name: string): string | undefined {
  const headers = request.headers
  const header = headers instanceof Headers ? headers.get('cookie') : headers.cookie
  if (typeof header !== 'string') return undefined
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
  if (values.length !== 1) return undefined
  try {
    const token = decodeURIComponent(values[0]!.slice(name.length + 1))
    return token && token.length <= 8192 ? token : undefined
  } catch { return undefined }
}

/** Read identity only from a Host-stored grant or after Ground has validated its signature. */
export function groundWebTokenClaims(token: string): { userId: string; tenantId: string | null; expiresAt: number } {
  const raw: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Ground session claims')
  const row = raw as Record<string, unknown>
  if (typeof row.sub !== 'string' || !row.sub || typeof row.exp !== 'number' || !Number.isFinite(row.exp)
    || (row.tenantId != null && typeof row.tenantId !== 'string') || row.purpose === 'browser-sso') {
    throw new Error('Invalid Ground session claims')
  }
  return { userId: row.sub, tenantId: typeof row.tenantId === 'string' ? row.tenantId : null, expiresAt: row.exp * 1000 }
}

/** Refusals have an HTTP status without exposing Ground response bodies or credentials. */
export class GroundWebIdentityConflict extends Error {
  constructor() { super('此本机工作区已绑定其他账号或企业，请使用独立的 MMP_HOME 工作区登录。') }
}

/** Authoritative Ground verification failure, with a safe browser-facing message. */
export class GroundWebSessionError extends Error {
  /** @param status - HTTP refusal. @param message - Credential-free explanation. */
  constructor(readonly status: 401 | 403 | 502 | 503, message: string) { super(message) }
}

/**
 * Validate a browser credential with Ground before trusting its user or enterprise claims.
 * @param origin - Fixed Ground origin, never taken from the incoming browser request.
 * @param token - Ground browser session JWT.
 * @param signal - Request and Host lifetime.
 * @returns verified identity, expiry and display-safe Ground session.
 */
export async function verifyGroundWebSession(origin: string, token: string, signal: AbortSignal): Promise<{
  identity: GroundWebIdentity; expiresAt: number; session: Record<string, unknown>
}> {
  const response = await loggedFetch(new URL('/api/auth/me', origin).href, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, redirect: 'error', signal,
  })
  if (response.status === 401) { await response.body?.cancel(); throw new GroundWebSessionError(401, 'Ground 登录已过期') }
  if (!response.ok) { await response.body?.cancel(); throw new GroundWebSessionError(502, 'Ground 暂不可用，请稍后重试。') }
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null || !('user' in value)
    || typeof value.user !== 'object' || value.user === null || !('id' in value.user)
    || typeof value.user.id !== 'string') throw new GroundWebSessionError(502, 'Ground 返回的账号信息无效。')
  const claims = groundWebTokenClaims(token)
  if (claims.expiresAt <= Date.now() || claims.userId !== value.user.id) throw new GroundWebSessionError(401, 'Ground 登录已过期')
  const tenant = 'currentTenant' in value ? value.currentTenant : null
  const tenantId = tenant && typeof tenant === 'object' && 'id' in tenant && typeof tenant.id === 'string' ? tenant.id : null
  if (tenantId !== claims.tenantId) throw new GroundWebSessionError(403, 'Ground 企业身份不一致，请重新登录。')
  const platformAdmin = 'isPlatformAdmin' in value.user && value.user.isPlatformAdmin === true
  if (!platformAdmin && tenant && typeof tenant === 'object' && 'status' in tenant && tenant.status !== 'active') {
    throw new GroundWebSessionError(403, '该企业已停用，请联系管理员。')
  }
  return { identity: { userId: claims.userId, tenantId }, expiresAt: claims.expiresAt, session: value }
}

/**
 * Verify Ground on every index visit and admit RPC only with that same unexpired browser credential.
 * @param options - Fixed Ground origin, local Web origin, cookie name and serialized Host grant writer.
 * @returns browser identity policy and its session/lifetime cleanup operations.
 */
export function createGroundWebIdentity(options: {
  groundOrigin: string
  webOrigin: string
  cookieName: string
  requestTimeoutMs: number
  onExpired?: () => void
  acceptGrant: (token: string, identity: GroundWebIdentity, session: Record<string, unknown>) => Promise<void>
}): BrowserIdentityPolicy & { clear: () => void; dispose: () => void; loginUrl: string } {
  const ground = new URL(options.groundOrigin), web = new URL(options.webOrigin)
  if (!(ground.protocol === 'https:' && ground.origin === web.origin)
    && !(ground.protocol === 'http:' && web.protocol === 'http:' && ground.hostname === web.hostname
      && ['127.0.0.1', 'localhost', '[::1]'].includes(web.hostname))) {
    throw new Error('Ground Web SSO requires one HTTPS origin in production, or matching HTTP loopback hostnames in development.')
  }
  const mountRoot = new URL(web.pathname.endsWith('/') ? web.pathname : `${web.pathname}/`, web).href
  const login = new URL('/login', ground)
  login.searchParams.set('next', mountRoot)
  const verified = new Map<string, number>()
  const digest = (token: string): string => createHash('sha256').update(token).digest('hex')
  let lifetime = new AbortController()
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleExpiry = (): void => {
    clearTimeout(expiryTimer)
    if (verified.size === 0) return
    const next = Math.min(...verified.values())
    expiryTimer = setTimeout(() => {
      let removed = false
      for (const [key, expiresAt] of verified) {
        if (expiresAt <= Date.now()) { verified.delete(key); removed = true }
      }
      // Only drop browser peers when this Host has no remaining verified Ground cookie.
      if (removed && verified.size === 0) options.onExpired?.()
      scheduleExpiry()
    }, Math.min(2_147_483_647, Math.max(1, next - Date.now())))
    expiryTimer.unref()
  }
  let disposed = false
  let commit = Promise.resolve()
  const refusal = (message: string, status: number): Response => new Response(message, {
    status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
  const challenge = (): Response => new Response(null, {
    status: 303, headers: { location: login.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })
  return {
    loginUrl: login.href,
    clear() { lifetime.abort(); lifetime = new AbortController(); verified.clear(); clearTimeout(expiryTimer) },
    dispose() { disposed = true; lifetime.abort(); verified.clear(); clearTimeout(expiryTimer) },
    isAuthenticated(request) {
      if (disposed) return false
      const token = groundWebCookie(request, options.cookieName)
      if (token === undefined) return false
      const key = digest(token), expiresAt = verified.get(key)
      if (expiresAt === undefined) return false
      if (expiresAt <= Date.now()) { verified.delete(key); return false }
      return true
    },
    async authorizeIndex(request: ConnectionIndexRequest) {
      const generation = lifetime
      if (disposed) return refusal('Web 已停止，请刷新后重试。', 503)
      const token = groundWebCookie(request, options.cookieName)
      if (token === undefined) return challenge()
      const cachedExpiry = verified.get(digest(token))
      if (cachedExpiry !== undefined && cachedExpiry > Date.now()) return true
      try {
        const verifiedSession = await verifyGroundWebSession(ground.origin, token,
          AbortSignal.any([generation.signal, AbortSignal.timeout(options.requestTimeoutMs)]))
        const accepted = commit.catch(() => undefined).then(async () => {
          generation.signal.throwIfAborted()
          await options.acceptGrant(token, verifiedSession.identity, verifiedSession.session)
        })
        commit = accepted
        await accepted
        generation.signal.throwIfAborted()
        verified.set(digest(token), verifiedSession.expiresAt)
        scheduleExpiry()
        return true
      } catch (error) {
        if (error instanceof GroundWebSessionError) {
          verified.delete(digest(token))
          return error.status === 401 ? challenge() : refusal(error.message, error.status)
        }
        if (error instanceof GroundWebIdentityConflict) return refusal(error.message, 409)
        return refusal('Ground 登录校验未完成，请确认中台已启动后刷新重试。', 502)
      }
    },
  }
}
