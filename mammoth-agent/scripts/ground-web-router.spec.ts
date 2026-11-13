/** Local HTTP/WS integration: browser credentials choose independent user+enterprise Hosts. */
import { createServer, request as httpRequest, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, expect, it } from 'vitest'
import { startGroundWebRouter, groundWebPartition } from './ground-web-router.ts'
import type { GroundWebIdentity } from '../packages/credentials/deepseek-account-platform/src/web-sso.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
function token(identity: GroundWebIdentity, nonce = ''): string {
  return `header.${Buffer.from(JSON.stringify({ sub: identity.userId, tenantId: identity.tenantId, exp: Math.floor(Date.now() / 1000) + 300, nonce })).toString('base64url')}.signature`
}

it('isolates three browsers, preserves same-user sessions and proxies upgrades only to the matching Host', async () => {
  const identities: GroundWebIdentity[] = [
    { userId: 'super-admin', tenantId: null },
    { userId: 'xiaomi-admin', tenantId: 'xiaomi' },
    { userId: 'xiaomi-member', tenantId: 'xiaomi' },
    { userId: 'xiaomi-member', tenantId: 'other-enterprise' },
  ]
  const sessions = new Map(identities.map(identity => [token(identity), identity]))
  const rotated = token(identities[2]!, 'rotated')
  sessions.set(rotated, identities[2]!)
  const ground = createServer((req, res) => {
    const jwt = req.headers.authorization?.slice(7) ?? ''
    const identity = sessions.get(jwt)
    if (!identity) { res.writeHead(401).end(); return }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ user: { id: identity.userId, isPlatformAdmin: identity.userId === 'super-admin' },
      currentTenant: identity.tenantId ? { id: identity.tenantId, status: 'active' } : null }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  const started: GroundWebIdentity[] = []
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 4, requestTimeoutMs: 1000,
    async startWorker(identity) {
      started.push(identity)
      const server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(identity)) })
      const ws = new WebSocketServer({ noServer: true })
      server.on('upgrade', (req, socket, head) => { ws.handleUpgrade(req, socket, head, connection => { connection.send(JSON.stringify(identity)) }) })
      const origin = await listen(server)
      return { origin, close: async () => { for (const client of ws.clients) client.terminate(); ws.close(); await close(server) } }
    },
  })
  cleanup.push(router.close)
  const anonymous = await fetch(router.origin, { redirect: 'manual' })
  expect(anonymous.status).toBe(303)
  const login = new URL(anonymous.headers.get('location')!)
  expect(login.origin).toBe(groundOrigin)
  expect(login.pathname).toBe('/login')
  expect(login.searchParams.get('next')).toBe(`${router.origin}/`)
  expect(login.searchParams.has('token')).toBe(false)
  const headers = (jwt: string) => ({ cookie: `mammothai_access_token=${jwt}` })
  for (const [jwt, identity] of sessions) {
    const response = await fetch(`${router.origin}/api/identity`, { headers: headers(jwt) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(identity)
  }
  expect(started).toHaveLength(4)
  const ws = new WebSocket(`${router.origin.replace('http:', 'ws:')}/api`, { headers: headers([...sessions.keys()][2]!) })
  const message = await new Promise<string>((resolve, reject) => { ws.once('message', data => resolve(data.toString())); ws.once('error', reject) })
  expect(JSON.parse(message)).toEqual(identities[2])
  ws.terminate()
  expect((await fetch(router.origin, { redirect: 'manual', headers: headers('forged') })).status).toBe(303)
  expect((await fetch(`${router.origin}/api/identity`)).status).toBe(401)
  expect((await fetch(router.origin, { headers: { ...headers(rotated), origin: 'https://attacker.invalid' } })).status).toBe(403)
  sessions.delete(rotated)
  expect((await fetch(`${router.origin}/api/identity`, { headers: headers(rotated) })).status).toBe(401)
  const throughGround = await new Promise<{ status: number; body: string }>((done, fail) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: Number(new URL(router.origin).port),
      path: '/api/identity',
      headers: { ...headers([...sessions.keys()][1]!), host: new URL(groundOrigin).host },
    }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk }).on('end', () => done({ status: res.statusCode!, body }))
    })
    req.on('error', fail)
    req.end()
  })
  expect(throughGround.status).toBe(200)
  expect(JSON.parse(throughGround.body)).toEqual(identities[1])
  const foreignHost = await new Promise<number>((done, fail) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: Number(new URL(router.origin).port),
      path: '/',
      headers: { ...headers([...sessions.keys()][1]!), host: 'evil.example', origin: 'http://evil.example' },
    }, res => { res.resume(); done(res.statusCode!) })
    req.on('error', fail)
    req.end()
  })
  expect(foreignHost).toBe(403)
  const extra = { userId: 'fifth', tenantId: 'other' }
  sessions.set(token(extra), extra)
  const atCapacity = await fetch(router.origin, { headers: { ...headers(token(extra)), accept: 'text/html' } })
  expect(atCapacity.status).toBe(503)
  expect(await atCapacity.text()).toContain('已达到同时运行的账号环境上限')
})

it('paints a progress page while a cold identity Host starts, then proxies once ready', async () => {
  const identity = { userId: 'cold-user', tenantId: 'cold-enterprise' }
  const jwt = token(identity)
  const ground = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  const worker = createServer((_req, res) => res.end('warm-worker'))
  const workerOrigin = await listen(worker)
  cleanup.push(() => close(worker))
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000,
    async startWorker() {
      await new Promise(resolve => setTimeout(resolve, 800))
      return { origin: workerOrigin, close: async () => {} }
    } })
  cleanup.push(router.close)
  const headers = { cookie: `mammothai_access_token=${jwt}`, accept: 'text/html' }
  const started = Date.now()
  const splash = await fetch(router.origin, { headers })
  expect(Date.now() - started).toBeLessThan(700)
  expect(await splash.text()).toContain('正在启动你的智能体')
  expect((await fetch(`${router.origin}/.mmp/ready`, { headers })).status).toBe(204)
  expect(await (await fetch(router.origin, { headers })).text()).toBe('warm-worker')
})

it('keeps serving when a browser resets its connection mid-response', async () => {
  const ground = createServer((_req, res) => { res.writeHead(401).end() })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000,
    async startWorker() { throw new Error('an anonymous upgrade must not start a Host') } })
  cleanup.push(router.close)
  const port = Number(new URL(router.origin).port)
  await Promise.all([0, 1, 2, 3].map(() => new Promise<void>((resolve) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET /chat HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`)
      socket.resetAndDestroy()
      resolve()
    })
    socket.on('error', () => {})
  })))
  expect((await fetch(router.origin, { redirect: 'manual' })).status).toBe(303)
})

it('partitions by authoritative identity rather than browser token or computer', () => {
  expect(groundWebPartition('http://127.0.0.1:5201', { userId: 'one', tenantId: 'a' }))
    .not.toBe(groundWebPartition('http://127.0.0.1:5201', { userId: 'one', tenantId: 'b' }))
  expect(groundWebPartition('http://127.0.0.1:5201', { userId: 'one', tenantId: 'a' })).toMatch(/^[a-f0-9]{64}$/u)
})

it('accepts only the configured HTTPS public authority behind a loopback proxy', async () => {
  const { vi } = await import('vitest')
  const nativeFetch = globalThis.fetch
  const identity = { userId: 'production-user', tenantId: 'production-enterprise' }
  const jwt = token(identity)
  const verifier = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input) === 'https://www.mmai.vip/api/auth/me'
    ? Promise.resolve(Response.json({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
    : nativeFetch(input, init))
  cleanup.push(async () => { verifier.mockRestore() })
  const worker = createServer((_request, response) => response.end('isolated-worker'))
  const workerOrigin = await listen(worker)
  cleanup.push(() => close(worker))
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin: 'https://www.mmai.vip',
    publicOrigin: 'https://www.mmai.vip', cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000,
    startWorker: async verified => { expect(verified).toEqual(identity); return { origin: workerOrigin, close: async () => {} } } })
  cleanup.push(router.close)
  expect(router.origin).toBe('https://www.mmai.vip')
  const call = (headers: Record<string, string>) => new Promise<{ status: number; body: string; location: string | undefined }>((done, fail) => {
    const req = httpRequest(router.listenerOrigin, { headers }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk }).on('end', () => done({ status: res.statusCode!, body, location: res.headers.location }))
    })
    req.on('error', fail); req.end()
  })
  const headers = { host: 'www.mmai.vip', cookie: `mammothai_access_token=${jwt}`, origin: 'https://www.mmai.vip' }
  const response = await call(headers)
  expect(response.status).toBe(200)
  expect(response.body).toBe('isolated-worker')
  expect((await call({ ...headers, origin: 'https://attacker.invalid' })).status).toBe(403)
  const anonymous = await call({ host: 'www.mmai.vip' })
  expect(anonymous.status).toBe(303)
  expect(new URL(anonymous.location!).searchParams.get('next')).toBe('https://www.mmai.vip/')
  await expect(startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin: 'https://www.mmai.vip', publicOrigin: 'https://attacker.invalid',
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000, startWorker: async () => { throw new Error('must not start') } })).rejects.toThrow('canonical HTTPS origin')
})


it('stops an idle identity so the next account can use the same worker slot', async () => {
  const first = { userId: 'idle-user', tenantId: 'idle-enterprise' }
  const second = { userId: 'next-user', tenantId: 'next-enterprise' }
  const sessions = new Map([[token(first), first], [token(second), second]])
  const ground = createServer((req, res) => {
    const identity = sessions.get(req.headers.authorization?.slice(7) ?? '')
    if (!identity) { res.writeHead(401).end(); return }
    res.end(JSON.stringify({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  const started: string[] = []
  let closed = 0
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000, idleMs: 80,
    async startWorker(identity) {
      started.push(identity.userId)
      const server = createServer((_req, res) => res.end(identity.userId))
      const origin = await listen(server)
      return { origin, close: async () => { closed += 1; server.closeAllConnections(); await close(server) } }
    } })
  cleanup.push(router.close)
  const headers = (jwt: string) => ({ cookie: `mammothai_access_token=${jwt}` })
  expect(await (await fetch(`${router.origin}/api/identity`, { headers: headers(token(first)) })).text()).toBe('idle-user')
  expect((await fetch(`${router.origin}/api/identity`, { headers: headers(token(second)) })).status).toBe(503)
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(closed).toBe(1)
  expect(await (await fetch(`${router.origin}/api/identity`, { headers: headers(token(second)) })).text()).toBe('next-user')
  expect(started).toEqual(['idle-user', 'next-user'])
})

it('gives an idle identity to the next account without waiting out the full idle time', async () => {
  const first = { userId: 'quiet-user', tenantId: 'quiet-enterprise' }
  const second = { userId: 'arriving-user', tenantId: 'arriving-enterprise' }
  const sessions = new Map([[token(first), first], [token(second), second]])
  const ground = createServer((req, res) => {
    const identity = sessions.get(req.headers.authorization?.slice(7) ?? '')
    if (!identity) { res.writeHead(401).end(); return }
    res.end(JSON.stringify({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  let closed = 0
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000, idleMs: 60_000, handoffMs: 60, queueTimeoutMs: 2000,
    async startWorker(identity) {
      const server = createServer((_req, res) => res.end(identity.userId))
      const origin = await listen(server)
      return { origin, close: async () => { closed += 1; server.closeAllConnections(); await close(server) } }
    } })
  cleanup.push(router.close)
  const headers = (jwt: string) => ({ cookie: `mammothai_access_token=${jwt}` })
  expect(await (await fetch(`${router.origin}/api/identity`, { headers: headers(token(first)) })).text()).toBe('quiet-user')
  expect(await (await fetch(`${router.origin}/api/identity`, { headers: headers(token(second)) })).text()).toBe('arriving-user')
  expect(closed).toBe(1)
})

it('serves a crowd by handing idle identities forward', async () => {
  const count = 40
  const people = Array.from({ length: count }, (_, index) => ({ userId: `crowd-${index}`, tenantId: 'crowd-enterprise' }))
  const sessions = new Map(people.map(identity => [token(identity), identity]))
  const ground = createServer((req, res) => {
    const identity = sessions.get(req.headers.authorization?.slice(7) ?? '')
    if (!identity) { res.writeHead(401).end(); return }
    res.end(JSON.stringify({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 2, requestTimeoutMs: 1000, idleMs: 60_000, handoffMs: 20, queueTimeoutMs: 20_000,
    async startWorker(identity) {
      const server = createServer((_req, res) => res.end(identity.userId))
      const origin = await listen(server)
      return { origin, close: async () => { server.closeAllConnections(); await close(server) } }
    } })
  cleanup.push(router.close)
  const bodies = await Promise.all(people.map(async identity => {
    const response = await fetch(`${router.origin}/api/identity`, { headers: { cookie: `mammothai_access_token=${token(identity)}` } })
    return `${response.status}:${await response.text()}`
  }))
  expect(bodies).toEqual(people.map(identity => `200:${identity.userId}`))
}, 30_000)

it('drops a quiet websocket so the next account can start', async () => {
  const first = { userId: 'live-user', tenantId: 'live-enterprise' }
  const second = { userId: 'waiting-user', tenantId: 'waiting-enterprise' }
  const sessions = new Map([[token(first), first], [token(second), second]])
  const ground = createServer((req, res) => {
    const identity = sessions.get(req.headers.authorization?.slice(7) ?? '')
    if (!identity) { res.writeHead(401).end(); return }
    res.end(JSON.stringify({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  let closed = 0
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000, idleMs: 80,
    async startWorker(identity) {
      const server = createServer((_req, res) => res.end(identity.userId))
      const ws = new WebSocketServer({ noServer: true })
      server.on('upgrade', (req, socket, head) => { ws.handleUpgrade(req, socket, head, connection => { connection.send('open') }) })
      const origin = await listen(server)
      return { origin, close: async () => { closed += 1; for (const client of ws.clients) client.terminate(); ws.close(); server.closeAllConnections(); await close(server) } }
    } })
  cleanup.push(router.close)
  const headers = (jwt: string) => ({ cookie: `mammothai_access_token=${jwt}` })
  const ws = new WebSocket(`${router.origin.replace('http:', 'ws:')}/api`, { headers: headers(token(first)) })
  await new Promise<void>((resolve, reject) => { ws.once('message', () => resolve()); ws.once('error', reject) })
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(closed).toBe(1)
  expect(await (await fetch(`${router.origin}/api/identity`, { headers: headers(token(second)) })).text()).toBe('waiting-user')
})

it('keeps an identity while its websocket is still carrying traffic', async () => {
  const first = { userId: 'busy-user', tenantId: 'busy-enterprise' }
  const second = { userId: 'blocked-user', tenantId: 'blocked-enterprise' }
  const sessions = new Map([[token(first), first], [token(second), second]])
  const ground = createServer((req, res) => {
    const identity = sessions.get(req.headers.authorization?.slice(7) ?? '')
    if (!identity) { res.writeHead(401).end(); return }
    res.end(JSON.stringify({ user: { id: identity.userId }, currentTenant: { id: identity.tenantId, status: 'active' } }))
  })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  let closed = 0
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000, idleMs: 120,
    async startWorker(identity) {
      const server = createServer((_req, res) => res.end(identity.userId))
      const ws = new WebSocketServer({ noServer: true })
      server.on('upgrade', (req, socket, head) => { ws.handleUpgrade(req, socket, head, connection => { connection.send('open'); connection.on('message', () => connection.send('tick')) }) })
      const origin = await listen(server)
      return { origin, close: async () => { closed += 1; for (const client of ws.clients) client.terminate(); ws.close(); server.closeAllConnections(); await close(server) } }
    } })
  cleanup.push(router.close)
  const headers = (jwt: string) => ({ cookie: `mammothai_access_token=${jwt}` })
  const ws = new WebSocket(`${router.origin.replace('http:', 'ws:')}/api`, { headers: headers(token(first)) })
  await new Promise<void>((resolve, reject) => { ws.once('message', () => resolve()); ws.once('error', reject) })
  const pulse = setInterval(() => ws.send('still-here'), 40)
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(closed).toBe(0)
  expect((await fetch(`${router.origin}/api/identity`, { headers: headers(token(second)) })).status).toBe(503)
  clearInterval(pulse)
  ws.terminate()
})

it('serves PWA manifest without login while keeping API routes protected', async () => {
  const ground = createServer((_req, res) => { res.writeHead(401).end() })
  const groundOrigin = await listen(ground)
  cleanup.push(() => close(ground))
  const router = await startGroundWebRouter({ host: '127.0.0.1', port: 0, groundOrigin,
    cookieName: 'mammothai_access_token', maxWorkers: 1, requestTimeoutMs: 1000,
    async startWorker() { throw new Error('worker must not start for anonymous PWA assets') },
  })
  cleanup.push(router.close)
  const manifest = await fetch(`${router.origin}/manifest.webmanifest`)
  expect(manifest.status).toBe(200)
  expect(manifest.headers.get('content-type') ?? '').toContain('application/manifest+json')
  const body = await manifest.json() as { name?: string; icons?: unknown[] }
  expect(body.name).toBe('猛犸AI')
  expect(Array.isArray(body.icons)).toBe(true)
  expect((await fetch(`${router.origin}/icon-192.png`)).status).toBe(200)
  expect((await fetch(`${router.origin}/api/identity`)).status).toBe(401)
  expect((await fetch(router.origin, { redirect: 'manual' })).status).toBe(303)
})
