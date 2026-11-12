/** Explicit settings gestures never authorize the next update stage implicitly. */
import type { DesktopUpdateCoordinator } from './update-coordinator.ts'
import type { DesktopUpdateState } from './ipc.ts'

/**
 * Execute an allowlisted gesture against the main-owned target (never a renderer URL).
 * @param updates Main-owned updater and native task-protection boundary.
 * @param action Untrusted IPC action.
 * @returns Settled operation state.
 */
export async function runDesktopUpdateCommand(
  updates: Pick<DesktopUpdateCoordinator, 'check' | 'download' | 'install' | 'state' | 'info'>,
  action: unknown,
): Promise<DesktopUpdateState> {
  if (action !== 'check' && action !== 'download' && action !== 'install') throw new Error('desktop update: invalid action')
  if (!updates.info.supported) throw new Error('desktop update: this build has no update source')
  if (action === 'check') return updates.check(true)
  const state = updates.state
  if (state.version === undefined) throw new Error('desktop update: no checked target')
  if (action === 'download') {
    if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download')) {
      throw new Error('desktop update: target is not downloadable')
    }
    return updates.download(state.version)
  }
  if (state.phase !== 'ready' && !(state.phase === 'error' && state.failedOperation === 'install')) {
    throw new Error('desktop update: target is not installable')
  }
  return updates.install(state.version)
}
