/** Account-bound durable cloud synchronization and same-origin read-only history proxy. */
import { createHash, randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { basename } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@mammoth-ai/cordis'
import type { DeepSeekAccount, PlatformSession } from '@mammoth-ai/mmp-deepseek-account'
import type { SessionId } from '@mammoth-ai/mmp-session'
import type {} from '@mammoth-ai/mmp-session-query'
import type {} from '@mammoth-ai/mmp-workspace'
import { defineDomain, domainTable } from '@mammoth-ai/mmp-storage-domain'
import { z } from 'zod'
import { groundWebTokenClaims } from './web-sso.ts'
import { exportHistory, historyTaskState, type HistoryMessage } from './ground-history-export.ts'

const stateSchema = z.object({ enabledAt: z.number(), deviceId: z.string(), ownerId: z.string().nullable(), tenantId: z.string().nullable() })
const entrySchema = z.object({ ownerId: z.string(), tenantId: z.string().nullable(), hash: z.string(), revision: z.number() })
const syncDomain = defineDomain({ name: 'ground_history_sync', version: 1,
  global: { schema: stateSchema, initial: { enabledAt: 0, deviceId: '', ownerId: null, tenantId: null } },
  tables: { sessions: domainTable<SessionId, z.infer<typeof entrySchema>>(entrySchema) },
})

export interface HistorySyncOptions {
  origin: string
  account: Pick<DeepSeekAccount, 'getPlatformSession'>
  intervalMs: number
  batchSize: number
  requestTimeoutMs: number
  clientKind: 'desktop' | 'web'
}

/** Check the verified profile and grant together; a token alone cannot assign a local transcript. */
export function historyIdentity(session: PlatformSession | null) {
  if (session?.userId == null) return null
  let claims: ReturnType<typeof groundWebTokenClaims>
  try { claims = groundWebTokenClaims(session.token) }
  catch { return null }
  if (claims.userId !== session.userId || claims.expiresAt <= Date.now()) return null
  return { accountId: claims.userId, tenantId: claims.tenantId }
}

/** Mount synchronization only while all required account and persistence services exist. */
export function installGroundHistory(ctx: Context, options: HistorySyncOptions): void {
  ctx.inject(['sessionQuery', 'storageDomain', 'workspaceRegistry', 'webServer', 'connection'], async host => {
    const domain = await host.storageDomain.open(syncDomain)
    const abort = new AbortController()
    const entries = domain.table('sessions')
    if (!domain.global.get().enabledAt) await domain.global.set({ ...domain.global.get(), enabledAt: Date.now(), deviceId: randomUUID() })
    let inflight: Promise<void> | undefined
    let lastError: string | null = null
    let lastSuccessAt: string | null = null
    let epoch = 0
    const current = () => options.account.getPlatformSession()
    const assertCurrent = async (captured: PlatformSession, runEpoch: number) => {
      const active = await current()
      if (abort.signal.aborted || epoch !== runEpoch || active?.token !== captured.token || active.userId !== captured.userId) {
        throw new Error('history account changed')
      }
    }
    const request = async (captured: PlatformSession, path: string, body?: unknown) => {
      const response = await fetch(new URL(path, options.origin), {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(options.requestTimeoutMs)]),
        headers: { authorization: `Bearer ${captured.token}`, accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`history HTTP ${response.status}`)
      }
      return response
    }
    const flush = (): Promise<void> => inflight ??= (async () => {
      const runEpoch = epoch
      const captured = await current()
      const identity = historyIdentity(captured)
      if (!captured || !identity) return
      let state = domain.global.get()
      if (state.ownerId !== null && (state.ownerId !== identity.accountId || state.tenantId !== identity.tenantId)) {
        lastError = 'account-mismatch'
        return
      }
      const sessions = await host.sessionQuery.listSessions(abort.signal)
      const workspaces = host.workspaceRegistry.list()
      let failed = false
      for (const record of sessions) {
        if (abort.signal.aborted) return
        try {
          await assertCurrent(captured, runEpoch)
          const raw = await host.sessionQuery.readSession(record.header.id)
          const firstPrompt = raw.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
          // An old empty startup session becomes new only when its first real prompt arrives.
          if (!firstPrompt || (record.header.createdAt < state.enabledAt && firstPrompt.time < state.enabledAt)) continue
          if (record.header.origin === 'subagent') continue
          const previous = entries.get(record.header.id)
          if (previous && (previous.ownerId !== identity.accountId || previous.tenantId !== identity.tenantId)) continue
          if (state.ownerId === null) {
            state = { ...state, ownerId: identity.accountId, tenantId: identity.tenantId }
            await domain.global.set(state)
          }
          const revision = raw.events.at(-1)?.seq ?? null
          if (revision === null) continue
          const transcript = exportHistory(raw.events)
          const workspace = workspaces.find(item => item.sessionIds.includes(record.header.id))
          const title = await host.sessionQuery.readTitle(record.header.id)
          const metadata = {
            ...identity, deviceId: state.deviceId, sessionId: record.header.id,
            deviceName: hostname().slice(0, 160), clientKind: options.clientKind,
            title: (title?.title || transcript.messages.find(message => message.role === 'user')?.text || 'Conversation').slice(0, 256),
            projectName: (workspace?.title ?? basename(record.header.cwd ?? '')).slice(0, 256),
            createdAt: new Date(record.header.createdAt).toISOString(),
            updatedAt: new Date(raw.events.filter(event => event.seq <= revision).at(-1)?.time ?? record.header.createdAt).toISOString(),
            revision, state: historyTaskState(raw.events.filter(event => event.seq <= revision)), files: transcript.files,
          }
          const hash = createHash('sha256').update(JSON.stringify({ metadata, messages: transcript.messages })).digest('hex')
          if (previous?.hash === hash) continue
          // Keep complete encoded requests below Ground's 50 MiB HTTP limit.
          const requestLimit = 32 * 1024 * 1024
          const visibleSeqs = transcript.messages.map(message => message.seq)
          const overhead = Buffer.byteLength(JSON.stringify({ ...metadata, final: true, visibleSeqs, messages: [] }))
          const batches: HistoryMessage[][] = []
          let batch: HistoryMessage[] = [], bytes = overhead
          for (const message of transcript.messages) {
            const size = Buffer.byteLength(JSON.stringify(message)) + 1
            if (overhead + size > requestLimit) throw new Error('history message exceeds request limit')
            if (batch.length && (batch.length >= options.batchSize || bytes + size > requestLimit)) {
              batches.push(batch); batch = []; bytes = overhead
            }
            batch.push(message); bytes += size
          }
          if (batch.length || !batches.length) batches.push(batch)
          for (let index = 0; index < batches.length; index++) {
            await assertCurrent(captured, runEpoch)
            const final = index === batches.length - 1
            const response = await request(captured, '/api/session-history/sync', { ...metadata, final,
              messages: batches[index], ...(final ? { visibleSeqs } : {}),
            })
            await response.body?.cancel()
          }
          await assertCurrent(captured, runEpoch)
          await entries.put(record.header.id, { ownerId: identity.accountId, tenantId: identity.tenantId, hash, revision })
        } catch (error) {
          if (abort.signal.aborted || epoch !== runEpoch) return
          failed = true
          lastError = error instanceof Error && error.message.startsWith('history HTTP') ? error.message : 'sync-failed'
          host.logger('history-sync').warn('A conversation is waiting for cloud synchronization')
        }
      }
      await assertCurrent(captured, runEpoch)
      const heartbeat = await request(captured, '/api/session-history/heartbeat', { deviceId: state.deviceId })
      await heartbeat.body?.cancel()
      if (!failed) { lastError = null; lastSuccessAt = new Date().toISOString() }
    })().catch(error => {
      if (!abort.signal.aborted) lastError = error instanceof Error && error.message.startsWith('history HTTP') ? error.message : 'sync-failed'
    }).finally(() => { inflight = undefined })

    host.on('deepseek-account/signed-out', () => { epoch++; lastSuccessAt = null; lastError = null })
    host.on('session/event', (_session, event) => { if (event.type === 'turn/end') void flush() })
    const timer = setInterval(() => { void flush() }, options.intervalMs)
    timer.unref()
    void flush()
    host.effect(() => host.webServer.register({ kind: 'prefix', path: '/ground-history', handler: async (req: IncomingMessage, res: ServerResponse) => {
      const rejection = host.connection.requestRejection(req)
      if (rejection !== undefined) { res.writeHead(rejection).end(); return }
      const url = new URL(req.url ?? '/', 'http://local')
      const op = url.pathname.slice('/ground-history'.length)
      const respond = (status: number, value: unknown) => res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(value))
      if (req.method !== 'GET' && !(req.method === 'POST' && op === '/retry')) { respond(405, { message: 'method not allowed' }); return }
      const proxyEpoch = epoch
      const captured = await current()
      if (!historyIdentity(captured) || !captured) { respond(401, { message: 'sign in required' }); return }
      if (op === '/status') {
        respond(200, { deviceId: domain.global.get().deviceId, syncing: !!inflight, lastError, lastSuccessAt })
        return
      }
      if (op === '/retry' && req.method === 'POST') { await inflight; await flush(); respond(200, { lastError, lastSuccessAt }); return }
      let path: string
      if (op === '/list') {
        const query = new URLSearchParams()
        for (const key of ['q', 'project', 'cursor']) { const value = url.searchParams.get(key); if (value) query.set(key, value) }
        path = `/api/session-history?${query}`
      } else if (op === '/detail') {
        const id = url.searchParams.get('id')
        if (!id || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) { respond(400, { message: 'invalid conversation' }); return }
        const after = url.searchParams.get('after') ?? '-1'
        if (!/^-?\d{1,10}$/.test(after)) { respond(400, { message: 'invalid page' }); return }
        path = `/api/session-history/${encodeURIComponent(id)}?after=${after}`
      } else { respond(404, { message: 'not found' }); return }
      try {
        const response = await fetch(new URL(path, options.origin), { redirect: 'error',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(options.requestTimeoutMs)]),
          headers: { authorization: `Bearer ${captured.token}`, accept: 'application/json' } })
        const text = await response.text()
        await assertCurrent(captured, proxyEpoch)
        res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(text)
      } catch { respond(502, { message: 'history unavailable' }) }
    } }), 'account: cloud history proxy')
    host.effect(() => async () => { clearInterval(timer); epoch++; abort.abort(); await inflight; await domain.close() }, 'account: cloud history lifetime')
  })
}
