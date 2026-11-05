/** Local two-account flow through the real Host sync, HTTP API and Postgres. */
import { afterEach, expect, it } from 'vitest'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { Context } from '@mammoth-ai/cordis'
import SessionStore, { SessionId, SessionSeq, type UserMessage } from '@mammoth-ai/mmp-session'
import SessionQueryEngine from '@mammoth-ai/mmp-session-query'
import Storage from '@mammoth-ai/mmp-storage'
import { JsonStorageBackend } from '@mammoth-ai/mmp-storage-json'
import { DomainFacility } from '@mammoth-ai/mmp-storage-domain'
import WebServer from '@mammoth-ai/mmp-host-webserver'
import type { PlatformSession } from '@mammoth-ai/mmp-deepseek-account'
import { installGroundHistory } from '../src/ground-history.ts'

class Query extends SessionQueryEngine {
  override async searchSessions() { return { items: [] } }
  override async searchEvents(request: Parameters<SessionQueryEngine['searchEvents']>[0]) {
    return { session: (await this.readSession(request.sessionId)).session, items: [] }
  }
}
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })
const fixture = resolve(process.cwd(), '../ground/apps/backend/test/session-history.fixture.cjs')
interface Fixture { origin: string; tenantId: string; accounts: { id: string; token: string }[] }
it.skipIf(!existsSync(fixture))('syncs a new desktop conversation to Web, retries offline after restart and isolates account switching', async () => {
  const child = fork(fixture, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  cleanups.push(async () => {
    if (child.exitCode !== null) return
    await new Promise<void>(done => { child.once('exit', () => done()); child.send('stop') })
  })
  const ground = await new Promise<Fixture>((done, reject) => {
    child.once('message', message => done(message as Fixture))
    child.once('exit', code => reject(new Error(`Ground fixture exited ${code}`)))
    child.stderr?.on('data', data => { process.stderr.write(data) })
  })
  const home = await mkdtemp(join(tmpdir(), 'mmp-history-flow-'))
  cleanups.unshift(() => rm(home, { recursive: true, force: true }))
  const account = (index: number): PlatformSession => ({ origin: ground.origin, token: ground.accounts[index]!.token,
    userId: ground.accounts[index]!.id as PlatformSession['userId'] })
  let active: PlatformSession | null = account(0)
  let offline = false
  // Interrupt only the source Host's network while keeping the real Ground server running.
  const nativeFetch = globalThis.fetch
  const { vi } = await import('vitest')
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (offline && String(input).startsWith(ground.origin) && init?.method === 'POST') return Promise.reject(new TypeError('offline'))
    return nativeFetch(input, init)
  })
  cleanups.push(async () => { network.mockRestore() })
  const boot = async (root: string, kind: 'desktop' | 'web') => {
    const ctx = new Context()
    const services = [await ctx.plugin(SessionStore), await ctx.plugin(Query), await ctx.plugin(Storage),
      await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })]
    const removeWorkspace = ctx.provide('workspaceRegistry', { list: () => [] })
    const removeConnection = ctx.provide('connection', { requestRejection: () => undefined })
    const owner = ctx.plugin({ inject: ['storage'], apply(host: Context) {
      const backend = new JsonStorageBackend(root)
      host.storage.backend.register('json', backend)
      const domain = new DomainFacility(host, { backend: 'json', routes: {} })
      host.provide('storageDomain', domain)
      // This scenario has no project files; workspace and browser admission are separate concerns.
      host.effect(() => async () => { await domain.closeAll(); await backend.close() })
      installGroundHistory(host, { origin: ground.origin, account: { getPlatformSession: async () => active },
        intervalMs: 300000, batchSize: 1, requestTimeoutMs: 1000, clientKind: kind })
    } })
    await owner
    const url = `http://127.0.0.1:${ctx.webServer.port}/ground-history/`
    await expect.poll(async () => (await nativeFetch(`${url}status`)).status).toBe(200)
    const call = async (path: string, method = 'GET') => {
      const response = await nativeFetch(`${url}${path}`, { method })
      return { status: response.status, body: await response.json() }
    }
    let disposed = false
    return { ctx, call, dispose: async () => {
      if (disposed) return
      disposed = true
      await owner.dispose()
      removeConnection(); removeWorkspace()
      for (const service of services.reverse()) await service.dispose()
    } }
  }
  const desktop = await boot(join(home, 'desktop'), 'desktop')
  cleanups.push(desktop.dispose)
  const prompt = (text: string): UserMessage => ({ id: text as UserMessage['id'], role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
  desktop.ctx.sessions.create(SessionId('old-history'), { meta: { createdAt: 1 }, seed: [
    { type: 'user/message', seq: SessionSeq(0), time: 1, data: prompt('Old history stays local'), surfaceOp: 'append' },
  ] })
  const session = desktop.ctx.sessions.create(SessionId('new-session'))
  session.append('user/message', prompt('Account A new conversation'), { surfaceOp: 'append' })
  await desktop.call('retry', 'POST')
  const web = await boot(join(home, 'web'), 'web')
  cleanups.push(web.dispose)
  let list = await web.call('list')
  expect(list.body.items).toHaveLength(1)
  const id: string = list.body.items[0].id
  const detail = () => web.call(`detail?id=${id}`)
  expect((await detail()).body.messages.map((row: { text: string }) => row.text)).toEqual(['Account A new conversation'])
  expect((await detail()).body.conversation.clientKind).toBe('desktop')
  await desktop.call('retry', 'POST')
  expect((await detail()).body.messages).toHaveLength(1)
  offline = true
  session.append('user/message', prompt('Created offline'), { surfaceOp: 'append' })
  await desktop.call('retry', 'POST')
  expect((await desktop.call('status')).body.lastError).toBeTruthy()
  expect((await detail()).body.messages).toHaveLength(1)
  const raw = await desktop.ctx.sessionQuery.readSession(session.id)
  await desktop.dispose()
  const restarted = await boot(join(home, 'desktop'), 'desktop')
  cleanups.push(restarted.dispose)
  restarted.ctx.sessions.create(session.id, { seed: raw.events, meta: { createdAt: raw.session.createdAt } })
  offline = false
  await restarted.call('retry', 'POST')
  expect((await detail()).body.messages.map((row: { text: string }) => row.text)).toEqual(['Account A new conversation', 'Created offline'])
  active = account(1)
  restarted.ctx.emit('deepseek-account/signed-out')
  await restarted.call('retry', 'POST')
  expect((await restarted.call('status')).body.lastError).toBe('account-mismatch')
  expect((await web.call('list')).body.items).toHaveLength(0)
  expect((await detail()).status).toBe(404)
  const desktopB = await boot(join(home, 'desktop-b'), 'desktop')
  cleanups.push(desktopB.dispose)
  desktopB.ctx.sessions.create(SessionId('new-session')).append('user/message', prompt('Account B private conversation'), { surfaceOp: 'append' })
  await desktopB.call('retry', 'POST')
  list = await web.call('list')
  expect(list.body.items).toHaveLength(1)
  expect(list.body.items[0].title).toBe('Account B private conversation')
  active = account(0)
  list = await web.call('list')
  expect(list.body.items).toHaveLength(1)
  expect(list.body.items[0].id).toBe(id)
  expect((await detail()).body.messages).toHaveLength(2)
}, 30000)
