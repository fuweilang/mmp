import { Context } from '@mammoth-ai/cordis'
import { onTestFinished } from 'vitest'
import SessionStore from '@mammoth-ai/mmp-session'
import FileSystem from '@mammoth-ai/mmp-fs-local'
import Subprocess from '@mammoth-ai/mmp-subprocess-local'
import Sandbox from '@mammoth-ai/mmp-sandbox-local'
import SandboxPolicy from '@mammoth-ai/mmp-sandbox-policy'
import SessionProjections from '@mammoth-ai/mmp-session-projection'
import type { SandboxMode } from '@mammoth-ai/mmp-sandbox'
import NodeRuntime from '../src/index.ts'
import type { Config } from '../src/index.ts'

export async function mountRuntime(ctx: Context, config: Config = {}, policy: { mode?: SandboxMode; workspaceRoot?: string } = {}) {
  onTestFinished(async () => { await ctx.fiber.dispose() })
  if (!ctx.get('sessions')) await ctx.plugin(SessionStore)
  if (!ctx.get('fs')) await ctx.plugin(FileSystem)
  if (!ctx.get('subprocess')) await ctx.plugin(Subprocess)
  if (!ctx.get('sandbox')) await ctx.plugin(Sandbox, {})
  if (!ctx.get('sessionProjections')) await ctx.plugin(SessionProjections)
  if (!ctx.get('sandboxPolicy')) await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', ...policy })
  const fiber = await ctx.plugin(NodeRuntime, config)
  return { runtime: ctx.ptcRuntime as NodeRuntime, fiber }
}
