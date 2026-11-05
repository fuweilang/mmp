/** Tool-owned path resolution supplied by the existing toolview registration. */
import type { Context } from '@mammoth-ai/cordis'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type {} from '@mammoth-ai/mmp-api-session-controller/client'
import { resolveWorkspacePath } from '@mammoth-ai/mmp-util-workspace-path'

/** File paths are resolved when a gesture begins, not when the Slot is mounted. */
export interface ToolFileInjected {
  /** Resolve an argument from the live Session directory. @param path - Recorded path. @returns Host path. */
  resolveFilePath: (path: string) => string
}

/**
 * Bind a toolview's path reader to its originating Session.
 * @param ctx - Tool plugin context.
 * @returns Existing Slot registration's inject callback.
 */
export function toolFileInject(ctx: Context): (sessionId: SessionId) => ToolFileInjected {
  return sessionId => ({
    resolveFilePath: (path) => {
      const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
      const current = ctx.sessions.binding(sessionId)?.session.projections.faceOf('workingDirectory').getSnapshot() as string | null | undefined
      return resolveWorkspacePath(current ?? cwd, path)
    },
  })
}
