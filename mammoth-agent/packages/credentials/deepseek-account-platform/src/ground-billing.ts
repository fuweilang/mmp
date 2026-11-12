/**
 * 猛犸 Ground recharge proxy: the Web/Desktop client calls same-origin
 * `/ground-billing/*` on the Host; the Host forwards to Ground `/api/billing/*`
 * with the stored SSO session JWT (console_handoff_token). The browser never sees
 * the JWT and no Ground CORS is needed.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@mammoth-ai/cordis'
import type {} from '@mammoth-ai/mmp-host-webserver'
import { loggedFetch } from './http-log.ts'

/** Host route prefix (browser-relative form: `ground-billing/...`). */
export const GROUND_BILLING_PATH = '/ground-billing'

/** Allowed proxy operations → Ground path + method. */
const ROUTES: Record<string, { method: 'GET' | 'POST'; path: string }> = {
  wallet: { method: 'GET', path: '/api/billing/wallet' },
  channels: { method: 'GET', path: '/api/billing/recharge/channels' },
  create: { method: 'POST', path: '/api/billing/recharge/create' },
  payQr: { method: 'POST', path: '/api/billing/recharge/payQr' },
  status: { method: 'POST', path: '/api/billing/recharge/status' },
  cancel: { method: 'POST', path: '/api/billing/recharge/cancel' },
  /** Read-only Ground session info (user.isPlatformAdmin, tenants). */
  me: { method: 'GET', path: '/api/auth/me' },
  knowledge: { method: 'POST', path: '/console/api/kb/retrieve' },
  /** One-time 60s browser-sso ticket → `{ url, admin }` pointing at Ground `/login?sso=…`. */
  consoleLink: { method: 'POST', path: '/api/auth/browser-sso-ticket' },
}

/**
 * Turn a Ground browser-sso ticket response into the enterprise console link.
 * @param origin - Ground public origin.
 * @param text - upstream JSON `{ ticket, next }`.
 * @returns JSON `{ url, admin }`; the ticket is single-use and expires in 60s.
 */
export function consoleLinkPayload(origin: string, text: string): {
  url: string
  admin: boolean
  hasConsoleAccess: boolean
  isPlatformAdmin: boolean
} {
  const parsed = JSON.parse(text) as { ticket?: unknown; next?: unknown }
  if (typeof parsed.ticket !== 'string' || !parsed.ticket) throw new Error('invalid ticket')
  const next = typeof parsed.next === 'string' && parsed.next.startsWith('/') ? parsed.next : '/console/'
  const url = new URL('/login', origin)
  url.searchParams.set('sso', parsed.ticket)
  url.searchParams.set('next', next)
  const admin = next.startsWith('/admin')
  // 能签出票据即具备入口：平台管 → Admin；企业用户签发前已校验 portal.console.access。勿把 JWT 塞进 URL。
  return {
    url: url.href,
    admin,
    hasConsoleAccess: !admin,
    isPlatformAdmin: admin,
  }
}

const MAX_BODY_BYTES = 16 * 1024

interface TrustConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

const AVATAR_MAX_BYTES = 6 * 1024 * 1024

/** Forward a picture upload or reset to Ground /api/auth/avatar with the stored session JWT. */
async function proxyAccountAvatar(
  req: IncomingMessage,
  res: ServerResponse,
  origin: string,
  token: () => Promise<string | undefined>,
  onUnauthorized: (token: string) => Promise<void>,
): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('allow', 'POST, DELETE')
    sendJson(res, 405, { message: 'method not allowed' })
    return
  }
  const jwt = await token().catch(() => undefined)
  if (jwt === undefined) { sendJson(res, 401, { message: '请先登录猛犸账号' }); return }
  let body: Buffer | undefined
  if (req.method === 'POST') {
    const contentType = req.headers['content-type']
    if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('multipart/form-data')) {
      sendJson(res, 400, { message: '请选择头像图片' })
      return
    }
    body = await readRaw(req, AVATAR_MAX_BYTES)
    if (body === undefined) { sendJson(res, 413, { message: '头像不能超过 5MB' }); return }
  }
  let upstream: Response
  try {
    upstream = await loggedFetch(new URL('/api/auth/avatar', origin).href, {
      method: req.method,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: 'application/json',
        ...(req.method === 'POST' ? { 'content-type': String(req.headers['content-type']) } : {}),
      },
      ...(body === undefined ? {} : { body: new Uint8Array(body) }),
    })
  } catch {
    sendJson(res, 502, { message: '无法连接猛犸云端，请稍后重试' })
    return
  }
  const text = await upstream.text().catch(() => '')
  if (upstream.status === 401) void onUnauthorized(jwt).catch(() => undefined)
  res.statusCode = upstream.status
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readRaw(req: IncomingMessage, max: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buf.length
    if (size > max) return undefined
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buf.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function knowledgeQuery(body: string | undefined): string {
  try {
    const parsed = JSON.parse(body ?? '{}') as { query?: unknown }
    return typeof parsed.query === 'string' ? parsed.query : ''
  } catch { return '' }
}

/** Enterprise chosen in the library. That credential cannot call the knowledge API. */
export function libraryMemberTenant(scoped: string | undefined, account: string | undefined): string | undefined {
  if (scoped === undefined || scoped === '' || scoped === account) return undefined
  const segment = scoped.split('.')[1]
  if (segment === undefined) return undefined
  try {
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { purpose?: unknown; tenantId?: unknown }
    if (payload.purpose !== 'library-member' || typeof payload.tenantId !== 'string') return undefined
    return /^[A-Za-z0-9_-]{1,64}$/.test(payload.tenantId) ? payload.tenantId : undefined
  } catch { return undefined }
}

/** Drop the question ending so a picture named 小悟空 still matches 「小悟空是什么」. */
function imageNeedle(query: string): string {
  return query.trim()
    .replace(/[？?！!。．.\s]+$/g, '')
    .replace(/(是什么东西|是什么|是多少|有哪些|怎么样|如何|吗|呢)+$/g, '')
    .trim()
}

async function libraryImages(origin: string, jwt: string, query: string): Promise<Array<{ mediaType: string; data: string; name?: string }>> {
  const needle = imageNeedle(query)
  if (needle.length < 2) return []
  try {
    const search = await loggedFetch(new URL(`/console/api/library/search?q=${encodeURIComponent(needle)}`, origin).href, {
      headers: { authorization: `Bearer ${jwt}`, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    if (!search.ok) return []
    const data = await search.json() as { hits?: Array<{ image?: boolean; nodeId?: string; versionId?: string; name?: string }> }
    const images = []
    for (const hit of (data.hits ?? []).filter(row => row.image === true && row.nodeId && row.versionId).slice(0, 3)) {
      const file = await loggedFetch(new URL(`/console/api/library/nodes/${encodeURIComponent(String(hit.nodeId))}/download?versionId=${encodeURIComponent(String(hit.versionId))}&inline=1`, origin).href, {
        headers: { authorization: `Bearer ${jwt}` },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
      if (!file.ok) continue
      const mediaType = file.headers.get('content-type')?.split(';')[0]?.trim()
      if (mediaType === undefined || !IMAGE_TYPES.has(mediaType)) continue
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.length === 0 || bytes.length > 4_000_000) continue
      images.push({ mediaType, data: bytes.toString('base64'), ...(typeof hit.name === 'string' && hit.name !== '' ? { name: hit.name } : {}) })
    }
    return images
  } catch { return [] }
}

/**
 * Register the proxy once `webServer` and `connection` are available.
 * @param ctx - Host context of the account service.
 * @param origin - Ground public origin.
 * @param token - resolves the stored Ground session JWT, undefined when signed out.
 * @param onUnauthorized - called with the rejected token on Ground 401.
 */
export function installGroundBilling(
  ctx: Context,
  origin: string,
  token: () => Promise<string | undefined>,
  onUnauthorized: (token: string) => Promise<void>,
  scopedToken: () => Promise<string | undefined> = token,
): void {
  ctx.inject(['webServer', 'connection'], (webCtx) => {
    const connection = Reflect.get(webCtx, 'connection') as TrustConnection
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: GROUND_BILLING_PATH,
      handler: async (req, res) => {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) { res.statusCode = rejection; res.end(); return }
        const pathname = new URL(req.url ?? '/', 'http://x').pathname
        const op = pathname.slice(GROUND_BILLING_PATH.length).replace(/^\/+/, '')
        if (op === 'avatar') {
          await proxyAccountAvatar(req, res, origin, token, onUnauthorized)
          return
        }
        const route = Object.hasOwn(ROUTES, op) ? ROUTES[op] : undefined
        if (route === undefined) { sendJson(res, 404, { message: 'not found' }); return }
        if (req.method !== route.method) {
          res.setHeader('allow', route.method)
          sendJson(res, 405, { message: 'method not allowed' })
          return
        }
        let body: string | undefined
        if (route.method === 'POST') {
          body = await readBody(req)
          if (body === undefined) { sendJson(res, 413, { message: 'body too large' }); return }
          if (body === '') body = '{}'
        }
        const jwt = await token().catch(() => undefined)
        if (jwt === undefined) { sendJson(res, 401, { message: '请先登录猛犸账号' }); return }
        const scoped = await scopedToken().catch(() => undefined)
        const memberTenant = libraryMemberTenant(scoped, jwt)
        let upstream: Response
        try {
          upstream = await loggedFetch(new URL(route.path, origin).href, {
            method: route.method,
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
            headers: {
              authorization: `Bearer ${jwt}`,
              accept: 'application/json',
              ...(body === undefined ? {} : { 'content-type': 'application/json' }),
              ...(op === 'knowledge' && memberTenant !== undefined ? { 'x-mmp-library-tenant': memberTenant } : {}),
            },
            ...(body === undefined ? {} : { body }),
          })
        } catch {
          sendJson(res, 502, { message: '无法连接猛犸云端，请稍后重试' })
          return
        }
        const text = await upstream.text().catch(() => '')
        if (upstream.status === 401) void onUnauthorized(jwt).catch(() => undefined)
        if (op === 'knowledge' && upstream.ok) {
          try {
            if (await token() !== jwt) { sendJson(res, 409, { message: '企业或账号已切换，请重新发送' }); return }
            const data = JSON.parse(text) as { hits: Array<{ documentId: string }> }
            const query = knowledgeQuery(body)
            sendJson(res, 200, { hits: data.hits.map(hit => ({ ...hit,
              source: new URL(`/console/api/kb/sources/${encodeURIComponent(hit.documentId)}`, origin).href,
            })), images: await libraryImages(origin, memberTenant !== undefined && scoped !== undefined ? scoped : jwt, query) })
          } catch { sendJson(res, 502, { message: '企业知识库返回异常' }) }
          return
        }
        if (op === 'consoleLink' && upstream.ok) {
          try { sendJson(res, 200, consoleLinkPayload(origin, text)) }
          catch { sendJson(res, 502, { message: '企业控制台登录票据无效，请稍后重试' }) }
          return
        }
        res.statusCode = upstream.status
        res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(text)
      },
    }), 'account: ground billing proxy')
  })
}
