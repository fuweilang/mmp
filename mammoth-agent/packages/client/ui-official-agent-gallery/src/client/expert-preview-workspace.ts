import type { IWorkspaces } from '@mammoth-ai/mmp-api-workspace-controller/client'
import type { WorkspaceId } from '@mammoth-ai/mmp-workspace/types'

/**
 * Resolve preview storage independently of ordinary Session-list startup.
 * @param selected - Current navigation's preferred Workspace, when ready.
 * @param workspaces - Host-authoritative Workspace state and first-use initializer.
 * @param signal - Preview lifetime; cancellation releases the pending subscription.
 * @returns An existing or first-use default Workspace, or undefined if initialization is ineligible.
 */
export async function resolvePreviewWorkspace(selected: WorkspaceId | undefined, workspaces: Pick<IWorkspaces, 'list' | 'initializeDefault'>, signal: AbortSignal): Promise<WorkspaceId | undefined> {
  signal.throwIfAborted()
  if (selected !== undefined) return selected
  await new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {}, settled = false
    const cleanup = () => { unsubscribe(); signal.removeEventListener('abort', check) }
    const check = () => {
      if (settled) return
      const snapshot = workspaces.list.getSnapshot()
      if (signal.aborted || snapshot.state === 'error') {
        settled = true; cleanup(); reject(signal.aborted ? signal.reason : new Error('Preview Workspace state is unavailable'))
      } else if (snapshot.phase === 'ready') { settled = true; cleanup(); resolve() }
    }
    signal.addEventListener('abort', check, { once: true })
    unsubscribe = workspaces.list.subscribe(check)
    if (settled) cleanup()
    else check()
  })
  signal.throwIfAborted()
  const existing = workspaces.list.getSnapshot().items[0]
  return existing?.workspaceId ?? (await workspaces.initializeDefault(signal))?.workspaceId
}
