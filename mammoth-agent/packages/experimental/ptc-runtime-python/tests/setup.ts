import { Context } from '@mammoth-ai/cordis'
import Sandbox from '@mammoth-ai/mmp-sandbox-local'
import SandboxPolicy from '@mammoth-ai/mmp-sandbox-policy'
import SessionProjections from '@mammoth-ai/mmp-session-projection'
import { onTestFinished } from 'vitest'
import type { SandboxMode } from '@mammoth-ai/mmp-sandbox'

/** Mount the Python runtime's policy and confinement providers with owned teardown. */
export async function createRuntimeContext(policy: { mode?: SandboxMode; workspaceRoot?: string } = {}): Promise<Context> {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(Sandbox, {})
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', ...policy })
  return ctx
}
