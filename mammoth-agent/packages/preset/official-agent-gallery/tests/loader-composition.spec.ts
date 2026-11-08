import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@mammoth-ai/cordis'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import type { ModuleLoaderV2 } from '@mammoth-ai/cordis-plugin-loader/src/internal.ts'
import Include from '@mammoth-ai/cordis-plugin-include'
import AgentRegistry from '@mammoth-ai/mmp-agent'
import SessionStore, { KNOWN_SESSION_EVENT_TYPES, SessionId } from '@mammoth-ai/mmp-session'
import SessionProjectionRegistry from '@mammoth-ai/mmp-session-projection'
import SystemPrompt from '@mammoth-ai/mmp-system-prompt'
import ToolRuntime from '@mammoth-ai/mmp-tools'
import OfficialAgentGallery from '../src/index.ts'
import { officialAgentBindingProjection } from '../src/projection.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function moduleLoader(modules: ReadonlyMap<string, unknown>): ModuleLoaderV2 {
  const unavailable = (): never => { throw new Error('test Loader only imports vendored plugin modules') }
  return {
    version: 'v2',
    loadCache: new Map(),
    import: async (specifier: string) => {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
    register: () => {},
    getOrCreateModuleJob: unavailable,
    resolveSync: unavailable,
    load: unavailable,
  }
}

describe('official Agent real Loader composition', () => {
  it('loads the Host service and restores its private durable projection', async () => {
    root = await mkdtemp(join(tmpdir(), 'official-agent-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@mammoth-ai/mmp-session'",
      "- name: '@mammoth-ai/mmp-session-projection'",
      "- name: '@mammoth-ai/mmp-system-prompt'",
      "  config: { personaPrefix: '' }",
      "- name: '@mammoth-ai/mmp-tools'",
      "- name: '@mammoth-ai/mmp-agent'",
      "- name: './external-services.ts'",
      "- name: '@mammoth-ai/mmp-official-agent-gallery'",
      "  config: { groundOrigin: 'https://ground.test' }",
      '',
    ].join('\n'))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify([{
      id: 'agent/one', key: 'one', kind: 'GENERAL', versionId: 'version/one', version: 1,
      name: '文案润色', summary: '润色文案', openingQuestions: [], category: 'common', capabilities: [], avatarUrl: null, executionGranted: true,
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const externalServices = {
      apply(ctx: Context) {
        ctx.provide('workspaceRegistry', { get: () => undefined } as never)
        ctx.provide('deepseekAccount', { resolveToken: () => Promise.resolve('pilot-token') } as never)
        ctx.provide('groundRequestAttribution', { bind: () => {}, unbind: () => {} } as never)
      },
    }
    const modules = new Map<string, unknown>([
      ['@mammoth-ai/mmp-session', SessionStore],
      ['@mammoth-ai/mmp-session-projection', SessionProjectionRegistry],
      ['@mammoth-ai/mmp-system-prompt', SystemPrompt],
      ['@mammoth-ai/mmp-tools', ToolRuntime],
      ['@mammoth-ai/mmp-agent', AgentRegistry],
      ['./external-services.ts', externalServices],
      ['@mammoth-ai/mmp-official-agent-gallery', OfficialAgentGallery],
    ])
    const ctx = context = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = moduleLoader(modules)
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()

    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    expect(await ctx.officialAgentGallery.list()).toEqual([{
      id: 'agent/one', key: 'one', kind: 'GENERAL', versionId: 'version/one', version: 1,
      name: '文案润色', summary: '润色文案', openingQuestions: [], category: 'common', capabilities: [], avatarUrl: null, executionGranted: true,
    }])

    const binding = {
      agentId: 'agent/one', versionId: 'version/one', kind: 'GENERAL', name: '文案润色',
      systemPrompt: '只润色，不调用工具', toolScope: [],
    } as const
    const session = ctx.sessions.create(SessionId('loader-replay'))
    expect(KNOWN_SESSION_EVENT_TYPES.has('official-agent/bound')).toBe(true)
    session.append('official-agent/bound', binding)
    const projection = await ctx.sessionProjections.register(officialAgentBindingProjection)
    expect(projection.stateOf(session).binding).toEqual(binding)
    expect(ctx.sessionProjections.snapshot(session).values).not.toHaveProperty('officialAgentExecution')
  })
})
