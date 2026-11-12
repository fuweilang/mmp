/** Ground OIDC authorize/token/userinfo helpers for Harness desktop SSO. */
import type { AccountProfile, AccountUserId } from '@mammoth-ai/mmp-deepseek-account/types'
import { PlatformAuthError } from './protocol.ts'
import { loggedFetch } from './http-log.ts'

export interface GroundOidcEndpoints {
  readonly authorize: string
  readonly token: string
  readonly userinfo: string
}

/**
 * Resolve Ground OIDC endpoints from a public origin (gateway).
 * @param origin - validated Ground public origin, e.g. http://127.0.0.1:5201
 * @param apiPrefix - /console/api or /middle/api
 */
export function groundOidcEndpoints(origin: string, apiPrefix = '/console/api'): GroundOidcEndpoints {
  const base = `${origin}${apiPrefix}/oidc`
  return {
    authorize: `${base}/authorize`,
    token: `${base}/token`,
    userinfo: `${base}/userinfo`,
  }
}

/**
 * Browser-navigable Ground logout (clears mammothai_access_token via Set-Cookie).
 * Host-side fetch cannot clear the system browser cookie jar used for OIDC authorize.
 */
export function groundBrowserLogoutUrl(origin: string): string {
  return new URL('/api/auth/logout', origin).href
}

/**
 * Build the browser authorize URL (PKCE + nonce).
 */
export function buildAuthorizeUrl(params: {
  authorizeEndpoint: string
  clientId: string
  redirectUri: string
  state: string
  nonce: string
  codeChallenge: string
}): string {
  const url = new URL(params.authorizeEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.href
}

export interface GroundTokenResponse {
  readonly access_token: string
  readonly id_token?: string
  readonly token_type?: string
  readonly expires_in?: number
  readonly console_handoff_token?: string
}

/**
 * Exchange authorization code at Ground /oidc/token (public client + PKCE).
 */
export async function exchangeGroundCode(params: {
  tokenEndpoint: string
  clientId: string
  code: string
  redirectUri: string
  codeVerifier: string
  signal: AbortSignal
}): Promise<GroundTokenResponse> {
  let response: Response
  try {
    response = await loggedFetch(params.tokenEndpoint, {
      method: 'POST',
      redirect: 'error',
      signal: params.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: params.clientId,
        code: params.code,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      }),
    })
  } catch {
    throw new PlatformAuthError('no-response')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new PlatformAuthError(response.status === 401 ? 'expired' : 'network')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new PlatformAuthError('protocol')
  }
  if (typeof payload !== 'object' || payload === null || typeof (payload as { access_token?: unknown }).access_token !== 'string'
    || !(payload as { access_token: string }).access_token) {
    throw new PlatformAuthError('protocol')
  }
  const row = payload as GroundTokenResponse
  return {
    access_token: row.access_token,
    ...(typeof row.id_token === 'string' ? { id_token: row.id_token } : {}),
    ...(typeof row.token_type === 'string' ? { token_type: row.token_type } : {}),
    ...(typeof row.expires_in === 'number' ? { expires_in: row.expires_in } : {}),
    ...(typeof row.console_handoff_token === 'string' ? { console_handoff_token: row.console_handoff_token } : {}),
  }
}

/**
 * Read Ground /oidc/userinfo with Bearer access_token.
 */
export async function fetchGroundUserinfo(userinfoEndpoint: string, token: string, signal: AbortSignal): Promise<AccountProfile> {
  let response: Response
  try {
    response = await loggedFetch(userinfoEndpoint, {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    })
  } catch {
    throw new PlatformAuthError('no-response')
  }
  if (response.status === 401) {
    await response.body?.cancel()
    throw new PlatformAuthError('expired')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new PlatformAuthError('network')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new PlatformAuthError('protocol')
  }
  return groundProfile(payload, new URL(userinfoEndpoint).origin)
}

/** Turn a Ground avatar path into a URL an <img> can load from the terminal host. */
export function absoluteAccountAvatar(value: unknown, origin: string | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  if (/^https?:\/\//i.test(value)) return value
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (!origin) return value
  try { return new URL(value, origin).href } catch { return null }
}

/** Map Ground userinfo / id_token claims to the Host account profile projection. */
export function groundProfile(value: unknown, origin?: string): AccountProfile {
  if (typeof value !== 'object' || value === null) throw new PlatformAuthError('protocol')
  const row = value as Record<string, unknown>
  const sub = typeof row.sub === 'string' ? row.sub : null
  const name = typeof row.name === 'string' ? row.name : null
  const contact = typeof row.phone_number === 'string' ? row.phone_number
    : typeof row.preferred_username === 'string' ? row.preferred_username
      : typeof row.email === 'string' ? row.email : null
  return {
    id: sub as AccountUserId | null,
    name,
    contact,
    avatarUrl: absoluteAccountAvatar(row.picture, origin),
  }
}

/**
 * Read Ground /api/auth/me with the Nest session JWT (console_handoff_token).
 * Business APIs (chat/models) and JwtGuard expect this token — not the short-lived OIDC id_token.
 */
export async function fetchGroundSessionMe(origin: string, token: string, signal: AbortSignal): Promise<AccountProfile> {
  let response: Response
  try {
    response = await loggedFetch(new URL('/api/auth/me', origin).href, {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    })
  } catch {
    throw new PlatformAuthError('no-response')
  }
  if (response.status === 401) {
    await response.body?.cancel()
    throw new PlatformAuthError('expired')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new PlatformAuthError('network')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new PlatformAuthError('protocol')
  }
  return groundSessionProfile(payload, origin)
}

/** Map Ground /api/auth/me JSON to the Host account profile projection. */
export function groundSessionProfile(value: unknown, origin?: string): AccountProfile {
  if (typeof value !== 'object' || value === null) throw new PlatformAuthError('protocol')
  const row = value as { user?: unknown }
  if (typeof row.user !== 'object' || row.user === null) throw new PlatformAuthError('protocol')
  const user = row.user as Record<string, unknown>
  const id = typeof user.id === 'string' ? user.id : null
  const name = typeof user.name === 'string' ? user.name : null
  const contact = typeof user.phone === 'string' ? user.phone
    : typeof user.email === 'string' ? user.email : null
  return {
    id: id as AccountUserId | null,
    name,
    contact,
    avatarUrl: absoluteAccountAvatar(user.avatarUrl, origin),
    // Missing or any value other than false counts as already seen.
    welcomeSeen: (value as { welcomeSeen?: unknown }).welcomeSeen !== false,
  }
}

/**
 * Prefer the Nest console handoff JWT for the durable Host grant.
 * OIDC access_token/id_token expires in ~5 minutes and is rejected by JwtGuard on /api/v1/*.
 */
export function groundSessionToken(token: GroundTokenResponse): string {
  const handoff = token.console_handoff_token?.trim()
  if (handoff) return handoff
  throw new PlatformAuthError('protocol')
}

/**
 * HTML served on the Host loopback /oauth/callback after Ground OIDC succeeds.
 * Web: bounce back to the app origin so the original UI can show the new session.
 * Desktop: the native account watcher focuses Electron and the browser confirms completion.
 */
export function groundOidcDoneHtml(locale: 'en_US' | 'zh_CN', loginSource: 'web' | 'desktop'): string {
  const zh = locale === 'zh_CN'
  const title = zh ? '登录成功' : 'Signed in'
  if (loginSource === 'web') {
    const body = zh ? '正在返回应用…' : 'Returning to the app…'
    const fallback = zh
      ? '若未自动跳转，请<a href="/">点击这里返回应用</a>。'
      : 'If nothing happens, <a href="/">return to the app</a>.'
    return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><meta charset="utf-8">`
      + `<meta http-equiv="refresh" content="0;url=/"><title>${title}</title>`
      + `<body style="font-family:system-ui,sans-serif;padding:48px;text-align:center">`
      + `<h1>${title}</h1><p>${body}</p><p>${fallback}</p>`
      + `<script>try{window.close()}catch(e){}location.replace('/')</script></body></html>`
  }
  const body = zh ? '猛犸智能体客户端已登录。你可以关闭此页面。'
    : 'Mammoth Agent is signed in. You can close this tab.'
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><meta charset="utf-8"><title>${title}</title>`
    + '<body style="font-family:system-ui,sans-serif;padding:48px;text-align:center">'
    + `<h1>${title}</h1><p>${body}</p></body></html>`
}

/** @deprecated use groundOidcDoneHtml */
export function groundDesktopSuccessHtml(locale: 'en_US' | 'zh_CN'): string {
  return groundOidcDoneHtml(locale, 'desktop')
}
