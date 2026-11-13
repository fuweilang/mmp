/** Local Web identity router. Each Ground user+enterprise gets an independent Harness process and home. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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
  /** Stop an identity Host after this many milliseconds with no request traffic. Omit to keep it until process exit. */
  idleMs?: number
  /** When newcomers are waiting, give away a Host that has been idle this long. Omit to refuse immediately at the cap. */
  handoffMs?: number
  /** How long a newcomer waits for a Host before the capacity refusal. Omit to refuse immediately. */
  queueTimeoutMs?: number
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
  if (options.idleMs !== undefined && (!Number.isSafeInteger(options.idleMs) || options.idleMs < 1)) throw new Error('idleMs must be a positive integer')
  if (options.handoffMs !== undefined && (!Number.isSafeInteger(options.handoffMs) || options.handoffMs < 1)) throw new Error('handoffMs must be a positive integer')
  if (options.queueTimeoutMs !== undefined && (!Number.isSafeInteger(options.queueTimeoutMs) || options.queueTimeoutMs < 1)) throw new Error('queueTimeoutMs must be a positive integer')
  const lifetime = new AbortController()
  const capacityMessage = '网页版已达到同时运行的账号环境上限，请联系管理员。'
  interface IdentitySlot {
    readonly worker: Promise<IdentityWebWorker>
    busy: number
    lastActive: number
    evicting?: Promise<void>
    timer?: ReturnType<typeof setTimeout>
  }
  interface AdmissionWaiter { resolve: () => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> }
  const slots = new Map<string, IdentitySlot>()
  const waiters: AdmissionWaiter[] = []
  const sockets = new Set<Socket>()
  const proxy = httpProxy.createProxyServer({ ws: true, xfwd: false, changeOrigin: false })
  let origin = ''
  const loginUrl = (): string => { const url = new URL('/login', ground); url.searchParams.set('next', `${origin}/`); return url.href }
  // The dev gateway serves this listener under Ground's own origin (`/agent`).
  // A browser there sends Host and Origin for that origin, not for :3080.
  // Direct loopback access to this listener stays valid. Any other host or a
  // cross-site Origin is still refused.
  const trusted = (req: IncomingMessage): boolean => {
    if (origin === '') return false
    const host = req.headers.host
    if (host !== new URL(origin).host && host !== ground.host) return false
    const requestOrigin = req.headers.origin
    if (requestOrigin !== undefined && requestOrigin !== `http://${host}` && requestOrigin !== `https://${host}`) return false
    return req.headers['sec-fetch-site'] !== 'cross-site'
  }
  const identify = async (req: IncomingMessage): Promise<GroundWebIdentity | undefined> => {
    const token = groundWebCookie({ headers: req.headers }, options.cookieName)
    if (token === undefined) return undefined
    // Verify on each request so revocation and enterprise status are never inferred from browser claims.
    const verified = await verifyGroundWebSession(ground.origin, token,
      AbortSignal.any([lifetime.signal, AbortSignal.timeout(options.requestTimeoutMs)]))
    return verified.identity
  }
  const activeSlots = (): number => {
    let count = 0
    for (const slot of slots.values()) if (slot.evicting === undefined) count += 1
    return count
  }
  const retain = (slot: IdentitySlot): void => {
    slot.busy += 1
    slot.lastActive = Date.now()
    if (slot.timer !== undefined) { clearTimeout(slot.timer); slot.timer = undefined }
  }
  const wakeWaiter = (): void => {
    const next = waiters.shift()
    if (next === undefined) return
    if (next.timer !== undefined) clearTimeout(next.timer)
    next.resolve()
  }
  const scheduleIdle = (key: string, slot: IdentitySlot): void => {
    if (slot.busy > 0 || slot.evicting !== undefined || lifetime.signal.aborted) return
    if (slot.timer !== undefined) clearTimeout(slot.timer)
    const handingOff = waiters.length > 0 && options.handoffMs !== undefined
    const delay = handingOff ? options.handoffMs : options.idleMs
    if (delay === undefined) return
    slot.timer = setTimeout(() => {
      slot.timer = undefined
      if (waiters.length > 0) void retire(key, slot).then(() => wakeWaiter())
      else void retire(key, slot)
    }, delay)
    slot.timer.unref()
  }
  const release = (key: string, slot: IdentitySlot): void => {
    if (slots.get(key) !== slot) return
    slot.busy = Math.max(0, slot.busy - 1)
    slot.lastActive = Date.now()
    if (slot.busy === 0) scheduleIdle(key, slot)
  }
  const touch = (key: string, slot: IdentitySlot): void => {
    if (slots.get(key) !== slot || slot.evicting !== undefined) return
    slot.lastActive = Date.now()
    if (slot.busy === 0) scheduleIdle(key, slot)
  }
  const shutdownSlot = (slot: IdentitySlot): Promise<void> => {
    if (slot.evicting !== undefined) return slot.evicting
    if (slot.timer !== undefined) clearTimeout(slot.timer)
    let finish: () => void = () => {}
    slot.evicting = new Promise<void>(resolve => { finish = resolve })
    return (async () => {
      try { await (await slot.worker).close() }
      catch (error) { console.error('[web-sso] identity shutdown failed:', error instanceof Error ? error.message : String(error)) }
      finally { finish() }
    })()
  }
  const retire = async (key: string, slot: IdentitySlot): Promise<void> => {
    if (lifetime.signal.aborted || slots.get(key) !== slot || slot.busy > 0 || slot.evicting !== undefined) return
    await shutdownSlot(slot)
    if (slots.get(key) === slot) slots.delete(key)
  }
  const expediteOldestIdle = (): void => {
    if (options.handoffMs === undefined) return
    let chosen: { key: string; slot: IdentitySlot } | undefined
    for (const [key, slot] of slots) {
      if (slot.busy > 0 || slot.evicting !== undefined) continue
      if (chosen === undefined || slot.lastActive < chosen.slot.lastActive) chosen = { key, slot }
    }
    if (chosen === undefined) return
    const remaining = Math.max(1, options.handoffMs - (Date.now() - chosen.slot.lastActive))
    if (chosen.slot.timer !== undefined) clearTimeout(chosen.slot.timer)
    const target = chosen
    target.slot.timer = setTimeout(() => {
      target.slot.timer = undefined
      void retire(target.key, target.slot).then(() => wakeWaiter())
    }, remaining)
    target.slot.timer.unref()
  }
  const yieldIdleSlot = async (): Promise<boolean> => {
    if (options.handoffMs === undefined) return false
    const now = Date.now()
    let chosen: { key: string; slot: IdentitySlot } | undefined
    for (const [key, slot] of slots) {
      if (slot.evicting !== undefined || slot.busy > 0) continue
      if (now - slot.lastActive < options.handoffMs) continue
      if (chosen === undefined || slot.lastActive < chosen.slot.lastActive) chosen = { key, slot }
    }
    if (chosen === undefined) return false
    await retire(chosen.key, chosen.slot)
    return activeSlots() < options.maxWorkers
  }
  /** Reserve one running identity. Quiet Hosts are closed for newcomers after `handoffMs`; a full set of busy Hosts waits, then refuses. */
  const hold = async (identity: GroundWebIdentity): Promise<{ worker: Promise<IdentityWebWorker>; release: () => void; touch: () => void }> => {
    const key = groundWebPartition(ground.origin, identity)
    for (;;) {
      if (lifetime.signal.aborted) throw new GroundWebSessionError(503, capacityMessage)
      const current = slots.get(key)
      if (current !== undefined && current.evicting === undefined) {
        retain(current)
        return { worker: current.worker, release: () => release(key, current), touch: () => touch(key, current) }
      }
      if (current?.evicting !== undefined) { await current.evicting; continue }
      if (activeSlots() >= options.maxWorkers) {
        if (await yieldIdleSlot()) continue
        if (options.queueTimeoutMs === undefined) throw new GroundWebSessionError(503, capacityMessage)
        expediteOldestIdle()
        await new Promise<void>((resolve, reject) => {
          const waiter: AdmissionWaiter = { resolve, reject }
          waiter.timer = setTimeout(() => {
            const index = waiters.indexOf(waiter)
            if (index >= 0) waiters.splice(index, 1)
            reject(new GroundWebSessionError(503, capacityMessage))
          }, options.queueTimeoutMs)
          waiter.timer.unref()
          waiters.push(waiter)
        })
        continue
      }
      const created: IdentitySlot = { busy: 1, lastActive: Date.now(), worker: options.startWorker(identity, origin, lifetime.signal) }
      slots.set(key, created)
      void created.worker.then(value => {
        if (value.exited === undefined) return
        const remove = (): void => { if (slots.get(key) === created && created.evicting === undefined) slots.delete(key) }
        void value.exited.then(remove, remove)
      }, () => {
        if (slots.get(key) !== created) return
        if (created.timer !== undefined) clearTimeout(created.timer)
        slots.delete(key)
      })
      return { worker: created.worker, release: () => release(key, created), touch: () => touch(key, created) }
    }
  }
  const releaseOnce = (fn: () => void): (() => void) => {
    let done = false
    return () => { if (done) return; done = true; fn() }
  }
  const send = (res: ServerResponse, status: number, text: string): void => {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end(text)
  }
  const sendHtml = (res: ServerResponse, html: string): void => {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html)
  }
  /** PWA install metadata the browser fetches without session cookies; must stay anonymous. */
  const PUBLIC_PWA_ASSETS: Record<string, string> = {
    '/manifest.webmanifest': 'application/manifest+json; charset=utf-8',
    '/icon-192.png': 'image/png',
    '/icon-512.png': 'image/png',
    '/icon-maskable-512.png': 'image/png',
  }
  const webPublicRoot = join(import.meta.dirname, '../apps/web/public')
  const servePublicPwaAsset = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    let pathname = ''
    try { pathname = new URL(req.url ?? '/', origin || 'http://127.0.0.1').pathname } catch { return false }
    const contentType = PUBLIC_PWA_ASSETS[pathname]
    if (contentType === undefined) return false
    try {
      const body = await readFile(join(webPublicRoot, pathname.slice(1)))
      if (res.headersSent) { res.destroy(); return true }
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-cache' })
      if (req.method === 'HEAD') res.end()
      else res.end(body)
      return true
    } catch {
      send(res, 404, 'Not found')
      return true
    }
  }
  /** First navigation paints immediately while the isolated Host boots. */
  const warmupHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>猛犸AI</title>
<style>
:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6fb;color:#333946;font:14px/1.6 system-ui,-apple-system,"PingFang SC",sans-serif}
main{text-align:center;padding:32px}.spinner{width:40px;height:40px;margin:0 auto;border:3px solid #dfe5ef;border-top-color:#5b5bd6;border-radius:50%;animation:spin .8s linear infinite}
h1{font-size:18px;font-weight:600;margin:16px 0 6px}p{color:#667085;margin:0}
button{margin-top:20px;border:1px solid #dfe5ef;background:#fff;color:#333946;padding:8px 18px;cursor:pointer}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
<main><div class="spinner"></div><h1>正在启动你的智能体…</h1>
<p id="status">首次进入需要几秒，请稍候</p>
<button id="retry" hidden onclick="location.reload()">重新加载</button></main>
<script>
const status=document.getElementById('status'),retry=document.getElementById('retry');
const started=Date.now();
async function probe(){
  try{
    const response=await fetch('/.mmp/ready',{cache:'no-store'});
    if(response.ok){location.replace('/');return}
    if(response.status===401||response.status===403){location.replace('/');return}
    if(response.status>=500){status.textContent='启动失败，请稍后重试';retry.hidden=false;return}
    throw new Error('not ready');
  }catch{
    if(Date.now()-started>45000){status.textContent='启动超时，请刷新重试';retry.hidden=false;return}
    status.textContent='正在启动你的智能体…';
    setTimeout(probe,600);
  }
}
probe();
</script></html>`
  const isDocumentRequest = (req: IncomingMessage): boolean => req.method === 'GET'
    && (req.headers.accept ?? '').includes('text/html')
  const warmupProbe = (req: IncomingMessage): boolean => {
    try { return new URL(req.url ?? '/', origin).pathname === '/.mmp/ready' } catch { return false }
  }
  /** Wait briefly for an already-warm Host; a cold start gets the progress page instead of a blank tab. */
  const readyOrPending = (worker: Promise<IdentityWebWorker>): Promise<'ready' | 'pending'> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => { resolve('pending') }, 500)
      void worker.then(() => { clearTimeout(timer); resolve('ready') }, (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
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
      let releaseHold = (): void => {}
      try {
        if (await servePublicPwaAsset(req, res)) return
        const identity = await identify(req)
        if (identity === undefined) {
          if (rootRequest(req)) redirect(res)
          else send(res, 401, '请先从 Web 首页登录')
          return
        }
        const held = await hold(identity)
        releaseHold = releaseOnce(held.release)
        res.once('finish', releaseHold)
        res.once('close', releaseHold)
        if (res.destroyed) releaseHold()
        const pending = held.worker
        if (warmupProbe(req)) {
          await pending
          if (!res.destroyed) res.writeHead(204, { 'cache-control': 'no-store' }).end()
          return
        }
        if (rootRequest(req) && isDocumentRequest(req)) {
          if (await readyOrPending(pending) === 'pending') {
            sendHtml(res, warmupHtml)
            return
          }
        }
        const worker = await pending
        if (lifetime.signal.aborted || res.destroyed) { releaseHold(); return }
        proxy.web(req, res, { target: worker.origin }, () => { send(res, 502, '智能体运行环境暂不可用，请刷新重试。') })
      } catch (error) {
        releaseHold()
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
      let releaseHold = (): void => {}
      try {
        const identity = await identify(req)
        if (identity === undefined) { refuse(401); return }
        const held = await hold(identity)
        releaseHold = releaseOnce(held.release)
        const worker = await held.worker
        if (lifetime.signal.aborted || socket.destroyed) { releaseHold(); return }
        socket.on('data', () => held.touch())
        const write = socket.write
        socket.write = ((...args: Parameters<Socket['write']>) => {
          held.touch()
          return write.apply(socket, args)
        }) as Socket['write']
        proxy.ws(req, socket as Socket, head, { target: worker.origin }, () => { socket.destroy(); releaseHold() })
        releaseHold()
      } catch (error) {
        releaseHold()
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
    for (const waiter of waiters.splice(0)) {
      if (waiter.timer !== undefined) clearTimeout(waiter.timer)
      waiter.reject(new GroundWebSessionError(503, capacityMessage))
    }
    for (const slot of slots.values()) if (slot.timer !== undefined) clearTimeout(slot.timer)
    for (const socket of sockets) socket.destroy()
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await Promise.allSettled([...slots.values()].map(slot => shutdownSlot(slot)))
    slots.clear()
    await closed
  })() }
}
