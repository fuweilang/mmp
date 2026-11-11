import { expect, it, vi } from 'vitest'
import type { IWorkspaces, WorkspaceSnapshot } from '@mammoth-ai/mmp-api-workspace-controller/client'
import type { WorkspaceId } from '@mammoth-ai/mmp-workspace/types'
import { resolvePreviewWorkspace } from '../src/client/expert-preview-workspace.ts'

function fixture(phase: WorkspaceSnapshot['phase'] = 'ready') {
  let snapshot: WorkspaceSnapshot = { phase, state: phase === 'ready' ? 'idle' : 'loading', items: [], archivedSessionIds: [], pinnedSessionIds: [], error: null }
  const listeners = new Set<() => void>()
  const initializeDefault = vi.fn<IWorkspaces['initializeDefault']>().mockResolvedValue(undefined)
  const workspaces: Pick<IWorkspaces, 'list' | 'initializeDefault'> = {
    list: { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }, initializeDefault,
  }
  const workspaceId = 'preview-workspace' as WorkspaceId
  const ready = () => { snapshot = { ...snapshot, phase: 'ready', state: 'idle', items: [{ workspaceId, path: '/tmp', title: 'Preview', sessionIds: [], createdAt: '', updatedAt: '' }] }; for (const notify of listeners) notify() }
  return { workspaces, initializeDefault, workspaceId, ready, listeners }
}

it('uses an available workspace even when ordinary session navigation is not ready', async () => {
  const f = fixture(); f.ready()
  expect(await resolvePreviewWorkspace(undefined, f.workspaces, new AbortController().signal)).toBe(f.workspaceId)
  expect(f.initializeDefault).not.toHaveBeenCalled()
})
it('waits for the workspace baseline instead of timing out on the session list', async () => {
  const f = fixture('pending')
  const result = resolvePreviewWorkspace(undefined, f.workspaces, new AbortController().signal)
  await Promise.resolve(); expect(f.initializeDefault).not.toHaveBeenCalled()
  f.ready(); expect(await result).toBe(f.workspaceId); expect(f.listeners.size).toBe(0)
})
it('uses the existing default initializer only for a genuinely empty ready registry', async () => {
  const f = fixture()
  expect(await resolvePreviewWorkspace(undefined, f.workspaces, new AbortController().signal)).toBeUndefined()
  expect(f.initializeDefault).toHaveBeenCalledTimes(1)
})
it('cancels a pending wait and removes its subscription without creating a workspace', async () => {
  const f = fixture('pending'), controller = new AbortController()
  const result = resolvePreviewWorkspace(undefined, f.workspaces, controller.signal)
  controller.abort(); await expect(result).rejects.toThrow(); expect(f.listeners.size).toBe(0); expect(f.initializeDefault).not.toHaveBeenCalled()
})
