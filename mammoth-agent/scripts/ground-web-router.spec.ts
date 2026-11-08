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
  expect((await fetch(router.origin, { headers: headers(token(extra)) })).status).toBe(503)
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
