// @vitest-environment jsdom
/** Draft selections become structured version references; only the Host opens document contents at submit. */
import { randomUUID } from 'node:crypto'
import { Context } from '@mammoth-ai/cordis'
import { TestSessions, makeTranslate } from '@mammoth-ai/mmp-client-test-runtime'
import { InputHub } from '@mammoth-ai/mmp-client-ui-conversation/src/client/input/hub.ts'
import type { LibraryPromptPart, SerializedDraftPrompt } from '@mammoth-ai/mmp-client-ui-conversation/src/client/contract/input.ts'
import { zh } from '@mammoth-ai/mmp-client-ui-conversation/src/client/locales.ts'
import { InputTriggerService } from '@mammoth-ai/mmp-client-ui-input-trigger/src/client/service.ts'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import { afterEach, expect, it, vi } from 'vitest'
import { LIBRARY_ALLOWED_EXTENSIONS } from '../../../../../ground/apps/backend/src/library/library.limits.ts'
import { LibraryService } from '../../../../../ground/apps/backend/src/library/library.service.ts'
import { MemoryLibraryStore } from '../../../../../ground/apps/backend/src/library/library.store.ts'
import type { Actor } from '../../../../../ground/apps/backend/src/library/library.types.ts'
import { apply } from '../src/client/index.ts'
import type { LibraryChoice } from '../src/client/selection.ts'

const sent: SerializedDraftPrompt[] = []
const attempted: SerializedDraftPrompt[] = []
type CommandUi = { ui: { run: (session: { sessionId: SessionId }) => void } }
type PanelUse = { onUse: (item: LibraryChoice) => Promise<void> }
type Picker = { onConfirm: (items: readonly LibraryChoice[]) => Promise<void>; onClose: () => void }
const referencesOf = (prompt: SerializedDraftPrompt): readonly LibraryPromptPart[] => typeof prompt === 'string'
  ? [] : prompt.filter((part): part is LibraryPromptPart => part.type === 'library')
const textOf = (prompt: SerializedDraftPrompt): string => typeof prompt === 'string'
  ? prompt : prompt.map(part => part.type === 'text' ? part.text : '').join('')

async function composer(versionId: string, authorize: (refs: readonly LibraryPromptPart[]) => Promise<void> = async () => {}) {
  const id = SessionId(`library-send-${randomUUID()}`)
  const ctx = new Context()
  const sessions = new TestSessions(async (operation) => { await operation() }, ctx)
  const conversation = {
    sendSession: async (_session: unknown, prompt: SerializedDraftPrompt) => {
      attempted.push(prompt)
      try { await authorize(referencesOf(prompt)) }
      catch (error) { return { kind: 'error' as const, text: error instanceof Error ? error.message : 'Source unavailable' } }
      sent.push(prompt)
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
  let picker: Picker | undefined
  const facade = {
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: {
      inject: (_name: string, install: () => unknown) => { install(); return () => {} },
      register: (options: { name: string; inject?: () => unknown }) => {
        if (options.name === 'main' && options.inject) panel = options.inject() as PanelUse
        if (options.name === 'shell.overlay' && options.inject) picker = options.inject() as Picker
        return options
      },
    },
    effect: (fn: () => unknown) => fn(),
    inject: (_names: string[], fn: (scope: unknown) => void) => { fn({
      get: () => ({ register: (value: CommandUi) => { command = value; return () => {} } }),
      effect: (run: () => unknown) => { run() },
    }) },
    sessions, conversation,
    uiSession: { adapter: { current: { getSnapshot: () => ({ props: { sessionId: id } }) } } },
    uiWorkspace: { openSession: () => {} },
    layout: { selectPanel: () => {} },
    get: (name: string) => name === 'inputTriggers' ? ctx.get('inputTriggers') : undefined,
  }
  apply(facade as never)
  if (!command || !panel || !picker) throw new Error('library command, panel or dialog did not register')
  return {
    shell, command, panel, picker, sessionId: id,
    item: (parseStatus = 'READY'): LibraryChoice => ({
      nodeId: 'node-1', versionId, versionNo: 2, name: '制度.md', kind: 'FILE', parseStatus, parseReason: null,
    }),
    async dispose() {
      reference.release()
      await sessions.disposeScopes()
      await ctx.fiber.dispose()
    },
  }
}

function browserTransport() {
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({}))
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

afterEach(() => {
  sent.length = 0
  attempted.length = 0
  vi.unstubAllGlobals()
})

it('adds a dialog choice only on confirmation and submits a reference beside the unchanged user question', async () => {
  const fetchImpl = browserTransport()
  const box = await composer('ver-1')
  box.shell.setDraft('条款是什么')
  box.command.ui.run({ sessionId: box.sessionId })
  expect(box.shell.draftSnapshot.references).toEqual([])
  box.picker.onClose()
  expect(box.shell.draftSnapshot.text).toBe('条款是什么')
  box.command.ui.run({ sessionId: box.sessionId })
  await box.picker.onConfirm([box.item()])
  expect(sent).toEqual([])
  expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual(['node-1@ver-1'])
  box.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(sent).toHaveLength(1) })
  expect(referencesOf(sent[0]!)).toEqual([{ type: 'library', nodeId: 'node-1', versionId: 'ver-1', name: '制度.md' }])
  expect(textOf(sent[0]!).trim()).toBe('条款是什么')
  expect(JSON.stringify(sent[0])).not.toContain('Library citation')
  expect(JSON.stringify(sent[0])).not.toContain('untrusted source data')
  expect(fetchImpl.mock.calls.every(call => !call[0].includes('/open'))).toBe(true)
  await box.dispose()
})

it('adds the panel choice to the current draft and sends the selected version only on submit', async () => {
  browserTransport()
  const box = await composer('ver-2')
  box.shell.setDraft('这一版说什么')
  await box.panel.onUse(box.item())
  expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual(['node-1@ver-2'])
  expect(sent).toEqual([])
  box.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(sent).toHaveLength(1) })
  expect(referencesOf(sent[0]!)).toEqual([{ type: 'library', nodeId: 'node-1', versionId: 'ver-2', name: '制度.md' }])
  expect(textOf(sent[0]!).trim()).toBe('这一版说什么')
  await box.dispose()
})

it('keeps the question and reference when Host authorization or excerpt preparation refuses the submit', async () => {
  browserTransport()
  for (const versionId of ['gone', 'denied', 'deleted', 'scan']) {
    sent.length = 0
    const authorize = vi.fn(async (refs: readonly LibraryPromptPart[]) => {
      expect(refs[0]?.versionId).toBe(versionId)
      throw new Error(versionId === 'scan' ? 'No stored excerpt' : 'Source unavailable')
    })
    const box = await composer(versionId, authorize)
    box.shell.setDraft('还在吗')
    await box.panel.onUse(box.item())
    box.shell.submit('queue', 'click')
    await vi.waitFor(() => { expect(authorize).toHaveBeenCalledOnce() })
    expect(sent).toEqual([])
    expect(box.shell.draftSnapshot.text).toContain('还在吗')
    expect(box.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual([`node-1@${versionId}`])
    await box.dispose()
  }
})

it('lets the Host open selected v1 after v2 replaces it and preserves the draft after that source is purged', async () => {
  const fetchImpl = browserTransport()
  const store = new MemoryLibraryStore()
  store.rememberTenant('ta', '甲企业')
  store.rememberUser('owner', '甲')
  const service = new LibraryService(store, {
    maxFileBytes: 1000, tenantQuotaBytes: 2500, recycleDays: 30, askMaxChars: 12_000,
    allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
  })
  const actor: Actor = { userId: 'owner', tenantId: 'ta', isPlatformAdmin: false, isOrgAdmin: false, activeMember: true }
  const uploaded = await service.upload(actor, {
    originalName: '单段.md', mimeType: 'text/markdown', bytes: Buffer.from('唯一段落正文，中间没有空行。'),
  })
  const versionId = uploaded.currentVersion!.id
  const opened: Awaited<ReturnType<LibraryService['openCitation']>>[] = []
  const authorize = vi.fn(async (refs: readonly LibraryPromptPart[]) => {
    for (const ref of refs) opened.push(await service.openCitation(actor, ref.nodeId, ref.versionId))
  })
  const choice: LibraryChoice = {
    nodeId: uploaded.id, versionId, versionNo: 1, name: '单段.md', kind: 'FILE', parseStatus: 'READY', parseReason: null,
  }
  const box = await composer(versionId, authorize)
  box.shell.setDraft('这一句是什么')
  box.command.ui.run({ sessionId: box.sessionId })
  await box.picker.onConfirm([choice])
  expect(sent).toEqual([])
  expect(opened).toEqual([])
  const replacement = await service.replaceVersion(actor, uploaded.id, '单段.md', 'text/markdown', Buffer.from('第二版正文，不该替换草稿绑定的旧版本。'))
  expect(replacement.currentVersion!.versionNo).toBe(2)
  expect(replacement.currentVersion!.id).not.toBe(versionId)
  box.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(sent).toHaveLength(1) })
  expect(referencesOf(sent[0]!)).toEqual([{ type: 'library', nodeId: uploaded.id, versionId, name: '单段.md' }])
  expect(textOf(sent[0]!).trim()).toBe('这一句是什么')
  expect(opened[0]?.versionId).toBe(versionId)
  expect(opened[0]?.locator).toBe('paragraph:1')
  expect(opened[0]?.quote).toBe('唯一段落正文，中间没有空行。')
  expect(JSON.stringify(sent[0])).not.toContain('唯一段落正文')
  expect(JSON.stringify(sent[0])).not.toContain('第二版正文')
  await box.dispose()

  sent.length = 0
  const revoked = await composer(versionId, authorize)
  revoked.shell.setDraft('撤权后还在吗')
  await revoked.panel.onUse(choice)
  await service.recycle(actor, uploaded.id)
  await service.purge(actor, uploaded.id)
  revoked.shell.submit('queue', 'click')
  await vi.waitFor(() => { expect(authorize).toHaveBeenCalledTimes(2) })
  expect(sent).toEqual([])
  expect(revoked.shell.draftSnapshot.text).toContain('撤权后还在吗')
  expect(revoked.shell.draftSnapshot.references.map(reference => reference.ref)).toEqual([`${uploaded.id}@${versionId}`])
  expect(fetchImpl.mock.calls.every(call => !call[0].includes('/open'))).toBe(true)
  await revoked.dispose()
})
