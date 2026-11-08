import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import type { LibraryChoice } from '../src/client/selection.ts'
afterEach(() => vi.unstubAllGlobals())
const item: LibraryChoice = { nodeId: 'n', versionId: 'v', versionNo: 1, name: '测试.md', kind: 'FILE', parseStatus: 'READY', parseReason: null }
function harness(current?: string) {
 let use: (item: LibraryChoice) => Promise<void> = async () => { throw new Error('not registered') }
 const append = vi.fn(() => true), create = vi.fn(async () => 'created'), open = vi.fn(), release = vi.fn(), send = vi.fn()
 const binding = { ctx: {} }
 const ctx = {
  locale: { register: () => () => {}, bind: () => (key: string) => key },
  slots: { inject: (_key: string, fn: () => unknown) => { fn(); return () => {} }, register: (o: { inject?: () => { onUse: typeof use } }) => { if(o.inject)use = o.inject().onUse; return () => {} } },
  effect: (fn: () => unknown) => fn(), inject: () => {}, get: () => ({ registerSource: () => () => {} }),
  sessions: { binding: () => binding, create, retain: () => ({ ready: Promise.resolve(binding), release }) },
  conversation: { input: { for: () => ({ appendReference: append }) }, sendSession: send },
  uiSession: { adapter: { current: { getSnapshot: () => ({ props: { sessionId: current } }) } } },
  uiWorkspace: { workspaceForNewSession: () => 'workspace', openSession: open }, layout: { selectPanel: () => {} },
 }
 apply(ctx as never)
 return { use: (choice = item) => use(choice), ctx, append, create, open, release, send }
}
it('uses the current retained real session and never sends automatically', async () => {
 const h = harness('existing'); await h.use(); expect(h.create).not.toHaveBeenCalled(); expect(h.append).toHaveBeenCalledOnce(); expect(h.open).toHaveBeenCalledWith('existing'); expect(h.release).toHaveBeenCalledOnce(); expect(h.send).not.toHaveBeenCalled()
})
it('creates only a workspace-backed real session when none is selected', async () => {
 const h = harness(); await h.use(); expect(h.create).toHaveBeenCalledWith({ workspaceId: 'workspace', agentPreset: 'standard' }); expect(h.append).toHaveBeenCalledOnce(); expect(h.open).toHaveBeenCalledWith('created'); expect(h.send).not.toHaveBeenCalled()
})
it('refuses absent workspace or a frozen input rather than pretending to attach', async () => {
 const h = harness(); h.ctx.uiWorkspace.workspaceForNewSession = () => ''; await expect(h.use()).rejects.toThrow('workspaceRequired'); expect(h.create).not.toHaveBeenCalled()
 const frozen = harness('existing'); frozen.append.mockReturnValue(false); await expect(frozen.use()).rejects.toThrow('attachFailed'); expect(frozen.send).not.toHaveBeenCalled()
})
