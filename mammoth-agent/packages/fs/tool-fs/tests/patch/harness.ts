/** Isolated real-provider fixtures for patch reports and observation state. */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@mammoth-ai/cordis'
import { provideWorkingDirectoryFixture } from '@mammoth-ai/mmp-agent-loop-testkit'
import { FsVersion } from '@mammoth-ai/mmp-fs'
import type { FsObservation } from '@mammoth-ai/mmp-fs'
import { LocalFileSystem } from '@mammoth-ai/mmp-fs-local'
import { SandboxedFileSystem } from '@mammoth-ai/mmp-fs-sandbox'
import * as FsPolicy from '@mammoth-ai/mmp-fs-observation-policy'
import { ToolCallId } from '@mammoth-ai/mmp-llm'
import SystemPrompt from '@mammoth-ai/mmp-system-prompt'
import ToolRuntime from '@mammoth-ai/mmp-tools'
import * as NativeToolExecutor from '@mammoth-ai/mmp-tool-executor-native'
import * as PtcToolExecutor from '@mammoth-ai/mmp-tool-executor-ptc'
import type { ToolExecution, ToolExecutionToken } from '@mammoth-ai/mmp-tools'
import SessionProjectionRegistry from '@mammoth-ai/mmp-session-projection'
import SandboxPolicyService from '@mammoth-ai/mmp-sandbox-policy'
import type { SandboxMode } from '@mammoth-ai/mmp-sandbox'
import { onTestFinished, vi } from 'vitest'
import * as ToolFs from '../../src/index.ts'
import { executePatch } from '../../src/patch/index.ts'
import type { PatchOperationRecord } from '../../src/patch/types.ts'
import { FsSandboxController } from '../../src/sandbox.ts'

export const patch = (...operations: string[]) => ['*** Begin Patch', ...operations, '*** End Patch'].join('\n')
export const add = (path: string, content = 'new') => `*** Add File: ${path}\n+${content}`
export const update = (path: string, before = 'old', after = 'new') => `*** Update File: ${path}\n@@\n-${before}\n+${after}`
export const remove = (path: string) => `*** Delete File: ${path}`
export const move = (source: string, destination: string, before = 'old', after = 'new') =>
  `*** Update File: ${source}\n*** Move to: ${destination}\n@@\n-${before}\n+${after}`

export async function setup(options: { policy?: boolean; mode?: SandboxMode; provider?: typeof LocalFileSystem; applyPatch?: boolean; toolMode?: 'native' | 'ptc' } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mmp-patch-executor-')))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const workspace = join(root, 'workspace')
  const providerRoot = join(root, 'provider')
  await mkdir(workspace)
  await mkdir(providerRoot)
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  onTestFinished(() => { vi.restoreAllMocks() })
  provideWorkingDirectoryFixture(ctx, workspace)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin((options.toolMode ?? 'native') === 'ptc' ? PtcToolExecutor : NativeToolExecutor)
  if (options.mode !== undefined) {
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: options.mode })
    await ctx.plugin(SandboxedFileSystem, { cwd: providerRoot })
  } else await ctx.plugin(options.provider ?? LocalFileSystem, { cwd: providerRoot })
  if (options.policy !== false) await ctx.plugin(FsPolicy)
  const toolFiber = await ctx.plugin(ToolFs, { applyPatch: options.applyPatch ?? true })
  const fs = ctx.fs as LocalFileSystem
  const controller = new AbortController()
  const exec: ToolExecution = {
    signal: controller.signal, callId: ToolCallId('patch-test'), rootCallId: ToolCallId('patch-test'),
    token: Symbol('patch-test') as ToolExecutionToken, name: 'apply_patch', arguments: {},
    // Only the session header and owner identity are consumed by these services.
    agent: { session: { header: { cwd: workspace } } } as never,
  }
  const sandbox = new FsSandboxController(ctx)
  const policy = options.mode === undefined ? undefined : { mode: options.mode, workspaceRoot: workspace }
  const observations: { path: string; observation: FsObservation }[] = []
  ctx.on('fs/observed', (target, observation) => { observations.push({ path: target.displayPath, observation }) })
  const target = (name: string) => fs.resolve(name, { cwd: workspace })
  const file = async (name: string, text: string, observed = true) => {
    await writeFile(resolve(workspace, name), text)
    const resolved = await target(name)
    if (observed) {
      const info = await fs.stat(resolved)
      if (!info) throw new Error('Fixture file missing')
      ctx.emit('fs/observed', resolved, { kind: 'present', version: info.version }, exec)
    }
    observations.length = 0
    return resolved
  }
  const absent = async (name: string) => {
    ctx.emit('fs/observed', await target(name), { kind: 'absent' }, exec)
    observations.length = 0
  }
  const record = (
    kind: PatchOperationRecord['kind'], name: string, index = 0, patchLine = 2, destination?: string,
  ): PatchOperationRecord => ({
    kind, path: resolve(workspace, name), index, patchLine,
    ...(destination === undefined ? {} : { destination: resolve(workspace, destination) }),
  })
  const run = (text: string) => executePatch(ctx, sandbox, exec, { patch: text, sandboxPolicy: policy })
  const bytes = (name: string) => readFile(resolve(workspace, name), 'utf8')
  const editIntent = async (name: string) => ctx.waterfall('fs/edit-intent', await target(name), exec, () => undefined)
  const version = async (name: string) => (await fs.stat(await target(name)))?.version ?? FsVersion('missing-fixture')
  return { ctx, fs, toolFiber, workspace, controller, exec, sandbox, policy, observations,
    target, file, absent, record, run, bytes, editIntent, version }
}
