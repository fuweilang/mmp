/** Account-bound same-origin transport for the Ground enterprise library. */
import type { Context } from '@mammoth-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@mammoth-ai/mmp-host-webserver'
import type {} from '@mammoth-ai/mmp-client-connection'

const PREFIX = '/ground-library'
const MAX_BYTES = 55 * 1024 * 1024
const ROUTES: readonly [string, RegExp][] = [
  ['GET', /^\/(?:config|items)$/], ['POST', /^\/(?:folders|links|files|open|batch|used)$/],
  ['POST', /^\/files\/[A-Za-z0-9_-]+\/versions$/],
  ['PATCH', /^\/nodes\/[A-Za-z0-9_-]+$/], ['DELETE', /^\/nodes\/[A-Za-z0-9_-]+$/],
  ['POST', /^\/nodes\/[A-Za-z0-9_-]+\/(?:move|scope|recycle|restore|retry-parse)$/],
  ['GET', /^\/nodes\/[A-Za-z0-9_-]+\/(?:preview|source|download|versions)$/],
]

/** Only explicit library operations, never admin, arbitrary origins or path traversal. */
export function libraryProxyTarget(method: string, raw: string): string | undefined {
  if (/%(?:2f|5c|2e)/i.test(raw) || raw.includes('\\') || raw.includes('..')) return undefined
  const url = new URL(raw, 'http://local.invalid')
  if (!url.pathname.startsWith(PREFIX + '/')) return undefined
  const path = url.pathname.slice(PREFIX.length)
  if (!ROUTES.some(([verb, pattern]) => verb === method && pattern.test(path))) return undefined
  return '/api/library' + path + url.search
}

function json(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ message }))
}
async function bodyOf(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = []
  let size = 0
  for await (const part of req) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(String(part))
    size += bytes.length
    if (size > MAX_BYTES) throw new Error('BODY_LIMIT')
    parts.push(bytes)
  }
  return Buffer.concat(parts)
}
async function responseBytes(response: Response): Promise<Buffer> {
  const parts: Uint8Array[] = []
  let size = 0
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > MAX_BYTES) throw new Error('RESPONSE_LIMIT')
      parts.push(part.value)
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  return Buffer.concat(parts)
}

/**
 * The Host checks its connection before using its account-owned credential.
 * @param ctx - account Host scope.
 * @param origin - fixed trusted Ground origin.
 * @param token - current account/tenant credential, never returned to the Client.
 * @param reject - existing account invalidation callback.
 * @param timeoutMs - account request timeout.
 */
export function installGroundLibrary(ctx: Context, origin: string, token: () => Promise<string | undefined>, reject: (value: string) => Promise<void>, timeoutMs: number): void {
  ctx.inject(['webServer', 'connection'], host => {
    host.effect(() => host.webServer.register({ kind: 'prefix', path: PREFIX, handler: async (req, res) => {
      const denied = host.connection.requestRejection(req)
      if (denied !== undefined) { json(res, denied, '连接未授权'); return }
      const target = libraryProxyTarget(req.method ?? 'GET', req.url ?? '/')
      if (!target) { json(res, 404, '不存在的资料操作'); return }
      const captured = await token().catch(() => undefined)
      if (!captured) { json(res, 401, '请先登录猛犸账号'); return }
      try {
        const method = req.method ?? 'GET'
        const bytes = method === 'GET' || method === 'DELETE' ? undefined : await bodyOf(req)
        if (await token() !== captured) { json(res, 409, '账号或企业已切换'); return }
        const headers: Record<string, string> = { authorization: `Bearer ${captured}`, accept: 'application/json' }
        if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
        const upstream = await fetch(new URL(target, origin), {
          method, headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
          ...(bytes === undefined ? {} : { body: new Uint8Array(bytes) }),
        })
        const data = await responseBytes(upstream)
        if (await token() !== captured) { json(res, 409, '账号或企业已切换，请重新打开资料'); return }
        if (upstream.status === 401) void reject(captured).catch(() => undefined)
        res.statusCode = upstream.status
        res.setHeader('cache-control', 'no-store')
        res.setHeader('x-content-type-options', 'nosniff')
        res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
        const disposition = upstream.headers.get('content-disposition')
        if (disposition) res.setHeader('content-disposition', disposition)
        res.end(data)
      } catch (error) {
        if (!res.headersSent) json(res, error instanceof Error && error.message === 'BODY_LIMIT' ? 413 : 502, '资料请求失败或过大，请重试')
        else res.destroy()
      }
    } }), 'account: Ground library transport')
  })
}
