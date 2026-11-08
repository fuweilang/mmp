import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@mammoth-ai/cordis'
import AgentRegistry, { type Agent, type AgentHandle, type CreateAgentOptions } from '@mammoth-ai/mmp-agent'
import { ToolCallId } from '@mammoth-ai/mmp-llm'
import SessionStore, { SessionId } from '@mammoth-ai/mmp-session'
import SessionProjectionRegistry from '@mammoth-ai/mmp-session-projection'
import { createScope } from '@mammoth-ai/mmp-scope'
import SystemPrompt from '@mammoth-ai/mmp-system-prompt'
import ToolRuntime from '@mammoth-ai/mmp-tools'
import * as NativeToolExecutor from '@mammoth-ai/mmp-tool-executor-native'
import { executeToolFixture } from '@mammoth-ai/mmp-tool-testkit'
import type { Workspace } from '@mammoth-ai/mmp-workspace'
import { WorkspaceId } from '@mammoth-ai/mmp-workspace'

const here = dirname(fileURLToPath(import.meta.url))
const roots: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Guards the Electron/desktop load path: Host requires bundled lib/, not only src/. */
describe('official-agent-gallery bundled lib tools', () => {
  it('lib/index.js contains advanced tool tokens', () => {
    const lib = readFileSync(join(here, '../lib/index.js'), 'utf8')
    expect(lib).toContain('tabular_analyze')
    expect(lib).toContain('web_fetch')
    expect(lib).toContain('delegate_official_agent')
    expect(lib).toMatch(/webFetchEnabled[\s\S]*tabularEnabled[\s\S]*delegateEnabled/)
  })

  it('runtime import of lib/index.js registers and executes advanced tools', async () => {
    const mod = createRequire(import.meta.url)('../lib/index.js') as typeof import('../src/index.ts')
    const OfficialAgentGallery = mod.default
    expect(typeof OfficialAgentGallery).toBe('function')

    const ctx = new Context()
    roots.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentRegistry)

    const attachSession = vi.fn<(sessionId: SessionId) => Promise<void>>().mockResolvedValue(undefined)
    const workspace = {
      id: WorkspaceId('workspace/bundle-smoke'),
      path: '/bundle-smoke',
      attachSession,
    } satisfies Pick<Workspace, 'id' | 'path' | 'attachSession'>
    ctx.provide('workspaceRegistry', { get: (id: string) => id === workspace.id ? workspace : undefined } as never)
    ctx.provide('deepseekAccount', { resolveToken: () => Promise.resolve('bundle-token') } as never)
    ctx.provide('groundRequestAttribution', { bind: vi.fn(), unbind: vi.fn() } as never)

    const card = {
      id: 'agent/bundle', key: 'bundle', kind: 'GENERAL', versionId: 'version/bundle', version: 1,
      name: 'Bundle Smoke', summary: 'runtime lib smoke', openingQuestions: ['hi'],
      category: 'common',
      capabilities: [],
      avatarUrl: null, executionGranted: true,
    }
    const toolScope = ['tabular_analyze', 'web_fetch', 'delegate_official_agent'] as const
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.endsWith('/api/official-agents')) return json([card])
      if (url.endsWith('/resolve')) {
        return json({
          agentId: card.id, key: card.key, kind: card.kind, versionId: card.versionId, version: card.version,
          systemPrompt: 'bundle smoke prompt', toolScope: [...toolScope],
        })
      }
      if (url.endsWith('/analyze-tabular')) {
        return json({
          format: 'csv', rowCount: 1, columnCount: 1,
          columns: [{ name: 'n', inferredType: 'number', nonNull: 1, nullish: 0, sampleValues: ['1'], min: 1, max: 1, sum: 1, mean: 1 }],
          warnings: [],
        })
      }
      if (url.endsWith('/fetch-url')) {
        return json({
          url: 'https://example.com/', finalUrl: 'https://example.com/', status: 200,
          contentType: 'text/html', accessedAt: '2026-11-06T05:00:00.000Z',
          title: 'Example', text: 'ok', truncated: false,
        })
      }
      if (url.endsWith('/delegate')) {
        return json({
          route: { key: 'data', name: '数据分析师', agentId: 'agent/data', versionId: 'version/data', version: 1 },
          answer: 'ok', modelRef: 'deepseek/chat', toolTrace: [], depth: 1,
          limits: { maxDepth: 1, allowlist: ['data'] },
        })
      }
      return json({}, 404)
    })
    vi.stubGlobal('fetch', fetcher)

    let agentScopeOwner!: Context
    await ctx.plugin(Object.assign((inner: Context) => { agentScopeOwner = inner }, {
      inject: ['systemPrompt', 'tools'],
    }))
    ctx.agents.setFactory({
      createAgent: async (_ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
        const session = ctx.sessions.prepare(options.sessionId, {
          ...options.seed === undefined ? {} : { seed: [...options.seed] },
          ...options.meta === undefined ? {} : { meta: options.meta },
        })
        const fixtureAgent: Partial<Agent> = { id: session.id, session, status: 'idle', followup: vi.fn() }
        const agent = fixtureAgent as Agent
        const scope = createScope(agentScopeOwner, agent)
        Object.assign(agent, { ctx: scope.ctx })
        const detach = ctx.effect(() => ctx.sessions.enter(session))
        ctx.sessions.announce(session)
        await options.setup?.(scope.ctx, agent)
        const unregister = ctx.agents.register(agent)
        await unregister
        return {
          agent,
          dispose: vi.fn(async () => { await unregister(); await detach(); await scope.dispose() }),
        }
      },
      resume: () => Promise.reject(new Error('bundle smoke creates only new Sessions')),
    })

    await ctx.plugin(OfficialAgentGallery, { groundOrigin: 'https://ground.bundle-smoke.test' })
    const sessionId = await ctx.officialAgentGallery.create({
      agentId: card.id, workspaceId: workspace.id, openingQuestion: 'smoke',
    })
    const agent = ctx.agents.get(sessionId)!
    const names = ctx.tools.schemas(agent).map(tool => tool.name).sort()
    expect(names).toEqual(['delegate_official_agent', 'tabular_analyze', 'web_fetch'])

    const tabular = await executeToolFixture(ctx, {
      agent, callId: ToolCallId('call-tabular'), name: 'tabular_analyze',
      arguments: { content: 'n\n1', format: 'csv' }, signal: new AbortController().signal,
    })
    expect(tabular.value).toMatchObject({ rowCount: 1 })

    const fetched = await executeToolFixture(ctx, {
      agent, callId: ToolCallId('call-fetch'), name: 'web_fetch',
      arguments: { url: 'https://example.com/' }, signal: new AbortController().signal,
    })
    expect(fetched.value).toMatchObject({ status: 200, text: 'ok' })

    const delegated = await executeToolFixture(ctx, {
      agent, callId: ToolCallId('call-delegate'), name: 'delegate_official_agent',
      arguments: { targetKey: 'data', task: 'sum' }, signal: new AbortController().signal,
    })
    expect(delegated.value).toMatchObject({ answer: 'ok' })
  })
})
