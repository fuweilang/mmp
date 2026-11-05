/** Local Web identity router. Each Ground user+enterprise gets an independent Harness process and home. */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import httpProxy from 'http-proxy'
export type { GroundWebIdentity } from '../packages/credentials/deepseek-account-platform/src/web-sso.ts'
import { groundWebCookie, GroundWebSessionError, verifyGroundWebSession, type GroundWebIdentity } from '../packages/credentials/deepseek-account-platform/src/web-sso.ts'

/** Isolated Host owned by one verified user and enterprise. */
export interface IdentityWebWorker {
  readonly origin: string
  readonly exited?: Promise<unknown>
  close(): Promise<void>
}

/**
 * Stable, filesystem-safe partition key; browser tokens rotate without changing ownership.
 * @param groundOrigin - Ground authority identifying the account namespace.
 * @param identity - Ground-verified user and enterprise.
 * @returns opaque local partition directory name.
 */
export function groundWebPartition(groundOrigin: string, identity: GroundWebIdentity): string {
  return createHash('sha256').update(JSON.stringify([groundOrigin, identity.userId, identity.tenantId])).digest('hex')
}

/**
 * Bind a loopback entry that verifies the browser's own Ground cookie before proxying HTTP or WebSocket traffic.
 * @param options - Loopback deployment and worker lifecycle factory; ports and limits are caller-owned.
 * @returns the actual public origin and an idempotent shutdown operation.
 */
export async function startGroundWebRouter(options: {
  host: string
  port: number
  groundOrigin: string
  publicOrigin?: string
  cookieName: string
  maxWorkers: number
  requestTimeoutMs: number
  startWorker: (identity: GroundWebIdentity, publicOrigin: string, signal: AbortSignal) => Promise<IdentityWebWorker>
}): Promise<{ origin: string; listenerOrigin: string; close: () => Promise<void> }> {
  if (!['127.0.0.1', 'localhost', '::1'].includes(options.host)) throw new Error('Web identity router only binds loopback addresses')
  const ground = new URL(options.groundOrigin)
  const external = options.publicOrigin === undefined ? undefined : new URL(options.publicOrigin)
  if (external && (external.protocol !== 'https:' || external.origin !== ground.origin
    || external.href !== `${external.origin}/` || external.username || external.password)) {
    throw new Error('Production Web and Ground must share one canonical HTTPS origin')
  }
  if (!external && (ground.protocol !== 'http:' || ground.hostname !== (options.host === '::1' ? '[::1]' : options.host))) {
    throw new Error('Local Web and Ground must use the same HTTP loopback hostname')
  }
  if (!Number.isSafeInteger(options.maxWorkers) || options.maxWorkers < 1) throw new Error('maxWorkers must be a positive integer')
  const lifetime = new AbortController()
  const workers = new Map<string, Promise<IdentityWebWorker>>()
  const sockets = new Set<Socket>()
  const proxy = httpProxy.createProxyServer({ ws: true, xfwd: false, changeOrigin: false })
  let origin = ''
  const loginUrl = (): string => { const url = new URL('/login', ground); url.searchParams.set('next', `${origin}/`); return url.href }
  const trusted = (req: IncomingMessage): boolean => origin !== '' && req.headers.host === new URL(origin).host
    && (req.headers.origin === undefined || req.headers.origin === origin)
    && req.headers['sec-fetch-site'] !== 'cross-site'
  const identify = async (req: IncomingMessage): Promise<GroundWebIdentity | undefined> => {
    const token = groundWebCookie({ headers: req.headers }, options.cookieName)
    if (token === undefined) return undefined
    // Verify on each request so revocation and enterprise status are never inferred from browser claims.
    const verified = await verifyGroundWebSession(ground.origin, token,
      AbortSignal.any([lifetime.signal, AbortSignal.timeout(options.requestTimeoutMs)]))
    return verified.identity
  }
  const workerFor = (identity: GroundWebIdentity): Promise<IdentityWebWorker> => {
    const key = groundWebPartition(ground.origin, identity)
    let worker = workers.get(key)
    if (worker !== undefined) return worker
    if (workers.size >= options.maxWorkers) return Promise.reject(new Error('本机同时在线账号已达到上限，请停止服务后调整 MMP_WEB_MAX_IDENTITIES。'))
    worker = options.startWorker(identity, origin, lifetime.signal)
    workers.set(key, worker)
    void worker.then(value => {
      if (value.exited !== undefined) {
        const remove = (): void => { if (workers.get(key) === worker) workers.delete(key) }
        void value.exited.then(remove, remove)
      }
    }, () => { if (workers.get(key) === worker) workers.delete(key) })
    return worker
  }
  const send = (res: ServerResponse, status: number, text: string): void => {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end(text)
  }
  const redirect = (res: ServerResponse): void => {
    res.writeHead(303, { location: loginUrl(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }).end()
  }
  const rootRequest = (req: IncomingMessage): boolean => {
    try { return ['/', '/index.html', '/auth/ground/logout'].includes(new URL(req.url ?? '/', origin).pathname) }
    catch { return false }
  }
  const server = createServer((req, res) => {
    void (async () => {
      if (!trusted(req)) { send(res, 403, '请求来源不受信任'); return }
      try {
        const identity = await identify(req)
        if (identity === undefined) {
          if (rootRequest(req)) redirect(res)
          else send(res, 401, '请先从 Web 首页登录')
          return
        }
        const worker = await workerFor(identity)
        if (lifetime.signal.aborted || res.destroyed) return
        proxy.web(req, res, { target: worker.origin }, () => { send(res, 502, '智能体运行环境暂不可用，请刷新重试。') })
      } catch (error) {
        if (!(error instanceof GroundWebSessionError)) console.error('[web-sso] isolated Host unavailable:', error instanceof Error ? error.message : String(error))
        if (error instanceof GroundWebSessionError && error.status === 401 && rootRequest(req)) redirect(res)
        else send(res, error instanceof GroundWebSessionError ? error.status : 503,
          error instanceof GroundWebSessionError ? error.message : 'Web 登录或运行环境准备失败，请查看终端后重试。')
      }
    })()
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    // A browser that reloads or closes mid-response resets its connection; an unhandled
    // 'error' on this socket would otherwise take the whole router down (ECONNRESET).
    socket.on('error', () => socket.destroy())
  })
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy())
    void (async () => {
      const refuse = (status: 401 | 403 | 503): void => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`) }
      if (!trusted(req)) { refuse(403); return }
      try {
        const identity = await identify(req)
        if (identity === undefined) { refuse(401); return }
        const worker = await workerFor(identity)
        if (lifetime.signal.aborted || socket.destroyed) return
        proxy.ws(req, socket as Socket, head, { target: worker.origin }, () => { socket.destroy() })
      } catch (error) {
        console.error('[web-sso] connection unavailable:', error instanceof Error ? error.message : String(error))
        refuse(503)
      }
    })()
  })
  // Callback errors above own HTTP/upgrade failures. This catches proxy-level late socket errors.
  proxy.on('error', (_error: Error, _req: IncomingMessage, res: ServerResponse | Duplex) => {
    if ('writeHead' in res) send(res, 502, '智能体连接中断，请刷新重试。')
    else res.destroy()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => { server.removeListener('error', reject); resolve() })
  })
  const address = server.address() as AddressInfo
  origin = external?.origin ?? `http://${options.host === '::1' ? '[::1]' : options.host}:${address.port}`
  let closing: Promise<void> | undefined
  return { origin, listenerOrigin: `http://${options.host === '::1' ? '[::1]' : options.host}:${address.port}`, close: () => closing ??= (async () => {
    lifetime.abort()
    for (const socket of sockets) socket.destroy()
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await Promise.allSettled([...workers.values()].map(async worker => (await worker).close()))
    await closed
  })() }
}
