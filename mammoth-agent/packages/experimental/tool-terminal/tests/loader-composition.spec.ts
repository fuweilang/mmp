import { executeToolFixture } from '@mammoth-ai/mmp-tool-testkit'
import * as NativeToolExecutor from '@mammoth-ai/mmp-tool-executor-native'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { unsupportedModel, provideWorkingDirectoryFixture, unsupportedInbox } from '@mammoth-ai/mmp-agent-loop-testkit'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@mammoth-ai/cordis'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import Include from '@mammoth-ai/cordis-plugin-include'
import { ToolCallId } from '@mammoth-ai/mmp-llm'
import { Session, SessionId } from '@mammoth-ai/mmp-session'
import AgentRegistry from '@mammoth-ai/mmp-agent'
import type { Agent } from '@mammoth-ai/mmp-agent'
import SystemPrompt from '@mammoth-ai/mmp-system-prompt'
import ToolRuntime from '@mammoth-ai/mmp-tools'
import TerminalSessionService from '@mammoth-ai/mmp-terminal'
import SandboxProvider from '@mammoth-ai/mmp-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@mammoth-ai/mmp-sandbox'
import SandboxPolicyService from '@mammoth-ai/mmp-sandbox-policy'
import SessionProjectionRegistry from '@mammoth-ai/mmp-session-projection'
import LocalSubprocessRuntime from '@mammoth-ai/mmp-subprocess-local'
import * as TerminalLocal from '@mammoth-ai/mmp-terminal-bash'
import * as ToolPty from '@mammoth-ai/mmp-tool-terminal'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class PassthroughSandbox extends SandboxProvider {
  async confine(argv: readonly string[], _policy: SandboxPolicy): Promise<ConfinedArgv> {
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

async function agent(ctx: Context): Promise<Agent> {
  const scope = ctx.plugin(() => {})
  const id = SessionId('pty-loader-agent')
  const session = Session.create(id)
  const value: Agent = {
    id, options: {}, session, model: unsupportedModel(),
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(value)
  return value
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const suite = process.platform === 'linux' || process.platform === 'darwin' ? describe : describe.skip

suite('terminal real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and preserves shell state across real tool calls', async () => {
    root = await mkdtemp(join(tmpdir(), 'mmp-pty-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@mammoth-ai/mmp-agent'",
      "- name: '@mammoth-ai/mmp-system-prompt'",
      "- name: '@mammoth-ai/mmp-tools'",
      "- name: '@mammoth-ai/mmp-tool-executor-native'",
      "- name: '@mammoth-ai/mmp-terminal'",
      "- name: '@mammoth-ai/mmp-test-sandbox'",
      "- name: '@mammoth-ai/mmp-session-projection'",
      "- name: '@mammoth-ai/mmp-sandbox-policy'",
      '  config:',
      '    mode: danger-full-access',
      `    workspaceRoot: ${JSON.stringify(root)}`,
      "- name: '@mammoth-ai/mmp-subprocess-local'",
      "- name: '@mammoth-ai/mmp-terminal-bash'",
      '  config:',
      '    pollIntervalMs: 10',
      '    exactProbeAfterMs: 20',
      '    idleSilenceMs: 250',
      '    handoffGraceMs: 250',
      '    timeoutMs: 2000',
      '    disposeGraceMs: 500',
      "- name: '@mammoth-ai/mmp-tool-terminal'",
      '',
    ].join('\n'))

    context = new Context()

    provideWorkingDirectoryFixture(context)
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@mammoth-ai/mmp-agent', AgentRegistry],
      ['@mammoth-ai/mmp-system-prompt', SystemPrompt],
      ['@mammoth-ai/mmp-tools', ToolRuntime],
      ['@mammoth-ai/mmp-tool-executor-native', NativeToolExecutor],
      ['@mammoth-ai/mmp-terminal', TerminalSessionService],
      ['@mammoth-ai/mmp-test-sandbox', PassthroughSandbox],
      ['@mammoth-ai/mmp-session-projection', SessionProjectionRegistry],
      ['@mammoth-ai/mmp-sandbox-policy', SandboxPolicyService],
      ['@mammoth-ai/mmp-subprocess-local', LocalSubprocessRuntime],
      ['@mammoth-ai/mmp-terminal-bash', TerminalLocal],
      ['@mammoth-ai/mmp-tool-terminal', ToolPty],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = await agent(context)
    const signal = new AbortController().signal
    const spawn = await executeToolFixture(context, {
      signal, callId: ToolCallId('spawn'), name: 'terminal_open', arguments: { type: 'shell', name: 'main', cwd: root }, agent: owner,
    })
    expect(resultText(spawn)).toContain('started terminal session pty-1 (main)')

    await executeToolFixture(context, {
      signal, callId: ToolCallId('state'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'export KEEP=loader; cd /' }, agent: owner,
    })
    const read = await executeToolFixture(context, {
      signal, callId: ToolCallId('read'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'printf "cwd=%s keep=%s\\n" "$PWD" "$KEEP"' }, agent: owner,
    })
    expect(resultText(read)).toContain('cwd=/ keep=loader')
    expect(context.terminals.list(owner)).toHaveLength(1)
  }, 15_000)
})
