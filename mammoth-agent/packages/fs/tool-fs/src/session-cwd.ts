/**
 * Resolution options for filesystem calls in the Session's current directory.
 * Non-agent calls leave directory defaults to the filesystem provider.
 * @module @mammoth-ai/mmp-tool-fs/session-cwd
 */

import type { Context } from '@mammoth-ai/cordis'
import type { ToolExecution } from '@mammoth-ai/mmp-tools'
import type {} from '@mammoth-ai/mmp-working-directory'

/**
 * Resolve the current directory and cancellation for a filesystem call.
 * @param ctx - context containing the working-directory service.
 * @param exec - tool execution supplying the agent and cancellation.
 * @returns filesystem resolution options for this call.
 */
export async function sessionResolveOptions(
  ctx: Context,
  exec: ToolExecution,
): Promise<{ cwd?: string; signal?: AbortSignal }> {
  const cwd = exec.agent === undefined
    ? undefined
    : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal }
}
