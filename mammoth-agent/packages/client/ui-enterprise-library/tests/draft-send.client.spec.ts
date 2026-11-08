// @vitest-environment jsdom
/**
 * + command and the panel "use in chat" action attach a chip to the current
 * composer. The user's later submit is what asks Ground to reopen that version
 * and puts the returned excerpt in the chat request. No model key is involved.
 */
import { randomUUID } from 'node:crypto'
import { Context } from '@mammoth-ai/cordis'
import { TestSessions, makeTranslate } from '@mammoth-ai/mmp-client-test-runtime'
import { InputHub } from '@mammoth-ai/mmp-client-ui-conversation/src/client/input/hub.ts'
import { zh } from '@mammoth-ai/mmp-client-ui-conversation/src/client/locales.ts'
import { InputTriggerService } from '@mammoth-ai/mmp-client-ui-input-trigger/src/client/service.ts'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import { afterEach, expect, it, vi } from 'vitest'
import { LibraryError } from '../../../../../ground/apps/backend/src/library/library.errors.ts'
import { LIBRARY_ALLOWED_EXTENSIONS } from '../../../../../ground/apps/backend/src/library/library.limits.ts'
import { LibraryService } from '../../../../../ground/apps/backend/src/library/library.service.ts'
import { MemoryLibraryStore } from '../../../../../ground/apps/backend/src/library/library.store.ts'
import type { Actor } from '../../../../../ground/apps/backend/src/library/library.types.ts'
import { apply } from '../src/client/index.ts'
import type { LibraryChoice } from '../src/client/selection.ts'

const sent: string[] = []

type CommandUi = {
  ui: {
    options: (session: unknown, signal: AbortSignal) => Promise<{ id: string; label: string; badge?: string; detail?: string }[]>
    onSelect: (option: { id: string; label: string; badge?: string; detail?: string }, session: { sessionId: string }) => void
  }
}

type PanelUse = { onUse: (item: LibraryChoice) => void }

async function composer(versionId: string) {
  const id = SessionId(`library-send-${randomUUID()}`)
  const ctx = new Context()
  const sessions = new TestSessions(async (operation) => { await operation() }, ctx)
  const conversation = {
    sendSession: async (_session: unknown, text: string) => {
      sent.push(text)
      return { kind: 'success' as const }
    },
    blocks: { storeFor: () => ({ getSnapshot: () => undefined }) },
    serializeDraftAttachments: async () => ({ attachments: [] }),
    releaseDraftAttachment: () => {},
    input: { for: () => shell },
  }
  ctx.provide('sessions', sessions)
  ctx.provide('conversation', conversation)
  await sessions.add({ id })
  const reference = sessions.retain(id)
  await reference.ready
  const hub = new InputHub(ctx, makeTranslate(zh, {}))
  const shell = hub.shellFor(reference.binding)
  const triggers = ctx.plugin(InputTriggerService)
  await triggers.await()
  let command: CommandUi | undefined
  let panel: PanelUse | undefined
  const facade = {
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: {
      inject: (_name: string, install: () => { inject?: () => PanelUse }) => {
        const registered = install()
        const options = registered.inject?.()
        if (options) panel = options
        return () => {}
      },
      register: (options: { inject?: () => PanelUse }) => options,
    },
    effect: (fn: () => unknown) => fn(),
    inject: (_names: string[], fn: (scope: { get: () => { register: (value: CommandUi) => () => void }; effect: (run: () => unknown) => void }) => void) => {
      fn({
        get: () => ({ register: (value: CommandUi) => { command = value; return () => {} } }),
        effect: (run) => { run() },
      })
    },
    get: (name: string) => {
      if (name === 'inputTriggers') return ctx.get('inputTriggers')
      if (name === 'sessions') return sessions
      if (name === 'conversation') return conversation
      if (name === 'uiSession') return { adapter: { current: { value: { props: { sessionId: id } } } } }
      if (name === 'layout') return { selectPanel: () => {} }
      return undefined
    },
  }
  process.env.MMP_GROUND_ORIGIN = 'http://ground.test'
  apply(facade as never)
  if (!command || !panel) throw new Error('library command or panel did not register')
  return {
    shell,
    command,
    panel,
    sessionId: id,
    item: (parseStatus = 'READY'): LibraryChoice => ({
      nodeId: 'node-1',
      versionId,
      versionNo: 2,
      name: '制度.md',
      kind: 'FILE',
      parseStatus,
      parseReason: null,
    }),
    async dispose() {
      reference.release()
      await sessions.disposeScopes()
      await ctx.fiber.dispose()
    },
  }
}

function stubLibrary(open: (versionId: string) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/open')) {
      const body = JSON.parse(String(init?.body)) as { nodeId: string; versionId: string }
      return open(body.versionId)
    }
    if (String(url).includes('view=shared')) return Response.json({ items: [] })
    const view = new URL(String(url), 'http://ground.test').searchParams.get('view')
    if (view !== 'mine') return Response.json({ items: [] })
    return Response.json({ items: [{
      id: 'node-1', name: '制度.md', kind: 'FILE',
      currentVersion: { id: 'ver-1', versionNo: 2, parseStatus: 'READY', parseReason: null },
    }] })
  })
}

afterEach(() => {
  sent.length = 0
  vi.unstubAllGlobals()
  delete process.env.MMP_GROUND_ORIGIN
})

it('puts a + command choice on the current draft and sends that version excerpt only when the user submits', async () => {
  const fetchImpl = stubLibrary(() => Response.json({
    name: '制度.md', versionId: 'ver-1', locator: 'paragraph:1', quote: '第一段持久正文',
  }))
  vi.stubGlobal('fetch', fetchImpl)
  const box = await composer('ver-1')
  box.shell.setDraft('条款是什么')
  const options = await box.command.ui.options({}, new AbortController().signal)
  const chosen = options.find(option => option.id === 'node-1@ver-1')
  expect(chosen?.label).toBe('制度.md')
  box.command.ui.onSelect(chosen!, { sessionId: box.sessionId })
  expect(sent).toEqual([])
  expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual(['node-1@ver-1'])
  expect(box.shell.draftSnapshot.text.startsWith('条款是什么')).toBe(true)
  box.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(sent).toHaveLength(1) })
  const openCall = fetchImpl.mock.calls.find(call => String(call[0]).includes('/open'))
  expect(JSON.parse(String(openCall?.[1]?.body))).toEqual({ nodeId: 'node-1', versionId: 'ver-1' })
  expect(openCall?.[1]?.credentials).toBe('include')
  expect(sent[0]).toContain('条款是什么')
  expect(sent[0]).toContain('ver-1')
  expect(sent[0]).toContain('paragraph:1')
  expect(sent[0]).toContain('第一段持久正文')
  expect(sent[0]).toContain('<untrusted-library-data>')
  await box.dispose()
})

it('puts the panel use-in-chat choice on the current session and does not send until submit', async () => {
  const fetchImpl = stubLibrary(() => Response.json({
    name: '制度.md', versionId: 'ver-2', locator: 'paragraph:3', quote: '第三段替换正文',
  }))
  vi.stubGlobal('fetch', fetchImpl)
  const box = await composer('ver-2')
  box.shell.setDraft('这一版说什么')
  box.panel.onUse(box.item())
  await vi.waitFor(() => {
    expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual(['node-1@ver-2'])
  })
  expect(sent).toEqual([])
  box.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(sent).toHaveLength(1) })
  expect(sent[0]).toContain('这一版说什么')
  expect(sent[0]).toContain('ver-2')
  expect(sent[0]).toContain('第三段替换正文')
  expect(sent[0]).toContain('paragraph:3')
  await box.dispose()
})

it('keeps the draft and does not send when open refuses or returns no excerpt', async () => {
  const fetchImpl = stubLibrary((versionId) => {
    if (versionId === 'gone') return new Response('missing', { status: 404 })
    if (versionId === 'denied') return new Response('forbidden', { status: 403 })
    if (versionId === 'deleted') return new Response('gone', { status: 410 })
    return Response.json({ name: '扫描.pdf', versionId, locator: null, quote: null })
  })
  vi.stubGlobal('fetch', fetchImpl)
  for (const versionId of ['gone', 'denied', 'deleted', 'scan']) {
    sent.length = 0
    const box = await composer(versionId)
    box.shell.setDraft('还在吗')
    box.panel.onUse(box.item())
    await vi.waitFor(() => {
      expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual([`node-1@${versionId}`])
    })
    box.shell.submit('queue', 'click')
    await vi.waitFor(() => {
      expect(fetchImpl.mock.calls.some(call => String(call[0]).includes('/open') && String(call[1]?.body).includes(versionId))).toBe(true)
    })
    expect(sent).toEqual([])
    expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual([`node-1@${versionId}`])
    await box.dispose()
  }
})

it('sends a real single-chunk version opened without a locator, and keeps the draft after revoke', async () => {
  const store = new MemoryLibraryStore()
  store.rememberTenant('ta', '甲企业')
  store.rememberUser('owner', '甲')
  const service = new LibraryService(store, {
    maxFileBytes: 1000,
    tenantQuotaBytes: 2500,
    recycleDays: 30,
    askMaxChars: 12_000,
    allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
  })
  const actor: Actor = {
    userId: 'owner', tenantId: 'ta', isPlatformAdmin: false, isOrgAdmin: false, activeMember: true,
  }
  const uploaded = await service.upload(actor, {
    originalName: '单段.md',
    mimeType: 'text/markdown',
    bytes: Buffer.from('唯一段落正文，中间没有空行。'),
  })
  const versionId = uploaded.currentVersion!.id
  expect((await store.listChunks(versionId)).map(chunk => chunk.locator)).toEqual(['paragraph:1'])
  const openBodies: { nodeId?: string; versionId?: string; locator?: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/open')) {
      const body = JSON.parse(String(init?.body)) as { nodeId: string; versionId: string; locator?: string }
      openBodies.push(body)
      try {
        return Response.json(await service.openCitation(actor, body.nodeId, body.versionId, body.locator))
      } catch (error) {
        const status = error instanceof LibraryError ? error.status : 500
        return new Response('no', { status })
      }
    }
    if (String(url).includes('view=shared')) return Response.json({ items: [] })
    return Response.json(await service.list(actor, 'mine'))
  }))
  const box = await composer(versionId)
  box.shell.setDraft('这一句是什么')
  const options = await box.command.ui.options({}, new AbortController().signal)
  const chosen = options.find(option => option.id === `${uploaded.id}@${versionId}`)
  expect(chosen?.label).toBe('单段.md')
  box.command.ui.onSelect(chosen!, { sessionId: box.sessionId })
  expect(sent).toEqual([])
  expect(openBodies).toEqual([])
  box.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(sent).toHaveLength(1) })
  expect(openBodies).toEqual([{ nodeId: uploaded.id, versionId }])
  expect(sent[0]).toContain('这一句是什么')
  expect(sent[0]).toContain(versionId)
  expect(sent[0]).toContain('paragraph:1')
  expect(sent[0]).toContain('唯一段落正文，中间没有空行。')
  expect(sent[0]).not.toContain('客户端自编摘录')
  await box.dispose()

  sent.length = 0
  const revoked = await composer(versionId)
  revoked.shell.setDraft('撤权后还在吗')
  revoked.panel.onUse({
    nodeId: uploaded.id, versionId, versionNo: 1, name: '单段.md', kind: 'FILE', parseStatus: 'READY', parseReason: null,
  })
  await vi.waitFor(() => {
    expect(revoked.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual([`${uploaded.id}@${versionId}`])
  })
  await service.purge(actor, uploaded.id)
  revoked.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(openBodies.some(body => body.versionId === versionId && openBodies.length > 1)).toBe(true) })
  expect(sent).toEqual([])
  expect(revoked.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual([`${uploaded.id}@${versionId}`])
  await revoked.dispose()
})
