import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import type { LibraryChoice } from '../src/client/selection.ts'

afterEach(() => vi.unstubAllGlobals())
const item: LibraryChoice = {
  nodeId: 'n', versionId: 'v', versionNo: 1, name: '测试.md', kind: 'FILE', parseStatus: 'READY', parseReason: null,
}
type Overlay = {
  hooks: { pickerRequest: { getSnapshot: () => unknown } }
  onClose: () => void
  onConfirm: (items: readonly LibraryChoice[]) => Promise<void>
}
type LibraryCommand = { ui: { kind: string; preserveDraftOnMenu: boolean; run: (session: { sessionId: string }) => void } }

function harness(current?: string) {
  let use: (item: LibraryChoice) => Promise<void> = async () => { throw new Error('not registered') }
  let overlay: Overlay | undefined
  let command: LibraryCommand | undefined
  let active = current
  const append = vi.fn((_reference: unknown) => true), replace = vi.fn((_source: string, _references: readonly unknown[]) => true)
  const create = vi.fn(async () => 'created')
  const open = vi.fn(), release = vi.fn(), send = vi.fn()
  const bindings = new Map<string, { ctx: { id: string } }>()
  const attachedSessions: string[] = []
  const bindingFor = (id: string) => {
    let binding = bindings.get(id)
    if (!binding) { binding = { ctx: { id } }; bindings.set(id, binding) }
    return binding
  }
  const ctx = {
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: {
      inject: (_key: string, fn: () => unknown) => { fn(); return () => {} },
      register: (options: { name: string; inject?: () => unknown }) => {
        if (options.name === 'main' && options.inject) use = (options.inject() as { onUse: typeof use }).onUse
        if (options.name === 'shell.overlay' && options.inject) overlay = options.inject() as Overlay
        return () => {}
      },
    },
    effect: (fn: () => unknown) => fn(),
    inject: (_keys: string[], fn: (scope: unknown) => void) => { fn({
      get: () => ({ register: (value: LibraryCommand) => { command = value; return () => {} } }),
      effect: (run: () => unknown) => run(),
    }) },
    get: () => ({ registerSource: () => () => {} }),
    sessions: { binding: bindingFor, create, retain: (id: string) => ({ ready: Promise.resolve(bindingFor(id)), release }) },
    conversation: {
      input: { for: (scope: { id: string }) => ({
        appendReference: (reference: unknown) => { attachedSessions.push(scope.id); return append(reference) },
        replaceReferences: (source: string, references: readonly unknown[]) => {
          attachedSessions.push(scope.id); return replace(source, references)
        },
        state: { getSnapshot: () => ({ occurrences: [] }) },
        focus: () => {},
      }) },
      sendSession: send,
    },
    uiSession: { adapter: { current: { getSnapshot: () => ({ props: { sessionId: active } }) } } },
    uiWorkspace: { workspaceForNewSession: () => 'workspace', openSession: open },
    layout: { selectPanel: () => {} },
  }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})))
  apply(ctx as never)
  return {
    use: (choice = item) => use(choice), ctx, append, replace, create, open, release, send, attachedSessions,
    setActive: (next: string) => { active = next },
    command: () => { if (!command) throw new Error('command missing'); return command },
    overlay: () => { if (!overlay) throw new Error('overlay missing'); return overlay },
  }
}

it('uses the current retained real session and never sends automatically', async () => {
  const h = harness('existing')
  await h.use()
  expect(h.create).not.toHaveBeenCalled()
  expect(h.append).toHaveBeenCalledOnce()
  expect(h.open).toHaveBeenCalledWith('existing')
  expect(h.release).toHaveBeenCalledOnce()
  expect(h.send).not.toHaveBeenCalled()
})

it('creates only a workspace-backed real session when none is selected', async () => {
  const h = harness()
  await h.use()
  expect(h.create).toHaveBeenCalledWith({ workspaceId: 'workspace', agentPreset: 'standard' })
  expect(h.append).toHaveBeenCalledOnce()
  expect(h.open).toHaveBeenCalledWith('created')
  expect(h.send).not.toHaveBeenCalled()
})

it('refuses absent workspace or a frozen input instead of pretending to attach', async () => {
  const h = harness()
  h.ctx.uiWorkspace.workspaceForNewSession = () => ''
  await expect(h.use()).rejects.toThrow('workspaceRequired')
  expect(h.create).not.toHaveBeenCalled()
  const frozen = harness('existing')
  frozen.append.mockReturnValue(false)
  await expect(frozen.use()).rejects.toThrow('attachFailed')
  expect(frozen.send).not.toHaveBeenCalled()
})

it('opens an independent dialog without changing the draft and cancels without attachment', () => {
  const h = harness('existing')
  expect(h.command().ui.kind).toBe('action')
  expect(h.command().ui.preserveDraftOnMenu).toBe(true)
  h.command().ui.run({ sessionId: 'existing' })
  expect(h.overlay().hooks.pickerRequest.getSnapshot()).not.toBeNull()
  expect(h.append).not.toHaveBeenCalled()
  h.overlay().onClose()
  expect(h.overlay().hooks.pickerRequest.getSnapshot()).toBeNull()
  expect(h.append).not.toHaveBeenCalled()
  expect(h.send).not.toHaveBeenCalled()
})

it('confirms into the session captured when the dialog opened after the active session changes', async () => {
  const h = harness('original')
  h.command().ui.run({ sessionId: 'original' })
  h.setActive('different')
  await h.overlay().onConfirm([item])
  expect(h.attachedSessions).toEqual(['original'])
  expect(h.replace).toHaveBeenCalledWith('library', [expect.objectContaining({ ref: 'n@v', label: '测试.md' })])
  expect(h.open).toHaveBeenCalledWith('original')
  expect(h.send).not.toHaveBeenCalled()
})

it('keeps the dialog request and draft after an atomic replacement is refused', async () => {
  const h = harness('original')
  h.command().ui.run({ sessionId: 'original' })
  h.replace.mockReturnValue(false)
  await expect(h.overlay().onConfirm([item])).rejects.toThrow('attachFailed')
  expect(h.overlay().hooks.pickerRequest.getSnapshot()).not.toBeNull()
  expect(h.append).not.toHaveBeenCalled()
  expect(h.send).not.toHaveBeenCalled()
})
