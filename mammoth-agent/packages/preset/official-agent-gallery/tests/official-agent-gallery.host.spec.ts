import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@mammoth-ai/cordis'
import AgentRegistry, { agentEvents } from '@mammoth-ai/mmp-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@mammoth-ai/mmp-agent'
import { ToolCallId } from '@mammoth-ai/mmp-llm'
import SessionStore, { SessionId } from '@mammoth-ai/mmp-session'
import SessionProjectionRegistry from '@mammoth-ai/mmp-session-projection'
import { createScope } from '@mammoth-ai/mmp-scope'
import SystemPrompt, { renderPrompt } from '@mammoth-ai/mmp-system-prompt'
import ToolRuntime from '@mammoth-ai/mmp-tools'
import type { ToolDefinition } from '@mammoth-ai/mmp-tools'
import * as NativeToolExecutor from '@mammoth-ai/mmp-tool-executor-native'
import { executeToolFixture } from '@mammoth-ai/mmp-tool-testkit'
import type { Workspace } from '@mammoth-ai/mmp-workspace'
import { WorkspaceId } from '@mammoth-ai/mmp-workspace'
import TypertRegistry, { type TypertContribution } from '@mammoth-ai/mmp-typert-registry'
import TypertGatewayService from '@mammoth-ai/mmp-api-gateway'
import RemoteAccessService from '@mammoth-ai/mmp-api-remote-access'
import type { Principal } from '@mammoth-ai/mmp-typert-protocol'
import { Peer } from '@mammoth-ai/mmp-client-connection'
import OfficialAgentGallery from '../src/index.ts'
import { officialAgentBindingProjection } from '../src/projection.ts'
import { TYPERT } from '../lib/typert.host.js'
import type { OfficialAgentBinding } from '../src/types.ts'

const card = {
  id: 'agent/one', key: 'one', kind: 'KNOWLEDGE', versionId: 'version/one', version: 1,
  name: '企业问答', summary: '回答企业资料问题', openingQuestions: ['内部发布日期'],
  category: 'expertise',
  capabilities: ['企业资料'],
  avatarUrl: null, executionGranted: true,
} as const

const execution = {
  agentId: card.id, key: card.key, kind: card.kind, versionId: card.versionId, version: card.version,
  systemPrompt: '只根据企业资料回答', toolScope: ['enterprise_knowledge'],
} as const

const hit = {
  documentId: 'document/one', documentName: '发布说明.pdf', ordinal: 0,
  folderName: '产品资料', snippet: '内部发布日期为 11 月 5 日', score: 0.9,
}

declare module '@mammoth-ai/mmp-typert-protocol' {
  interface PrincipalMap {
    /** Non-owner pilot member used to verify Remote attribution and Workspace access. */
    'test-member': { readonly kind: 'test-member'; readonly member: string }
  }
}

const roots: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface Fixture {
  readonly ctx: Context
  readonly fetcher: ReturnType<typeof vi.fn<typeof fetch>>
  readonly attachSession: ReturnType<typeof vi.fn<(sessionId: SessionId) => Promise<void>>>
  readonly bind: ReturnType<typeof vi.fn>
  readonly unbind: ReturnType<typeof vi.fn>
  readonly disposals: AgentHandle['dispose'][]
  create(): Promise<SessionId>
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fixture(options: { kind?: 'GENERAL' | 'KNOWLEDGE'; toolScope?: readonly string[] } = {}): Promise<Fixture> {
  const ctx = new Context()
  roots.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  const attachSession = vi.fn<(sessionId: SessionId) => Promise<void>>().mockResolvedValue(undefined)
  const workspace = { id: WorkspaceId('workspace/one'), path: '/pilot', attachSession } satisfies Pick<Workspace, 'id' | 'path' | 'attachSession'>
  ctx.provide('workspaceRegistry', { get: (id: string) => id === workspace.id ? workspace : undefined } as never)
  ctx.provide('deepseekAccount', { resolveToken: () => Promise.resolve('pilot-token') } as never)
  const bind = vi.fn()
  const unbind = vi.fn()
  ctx.provide('groundRequestAttribution', { bind, unbind } as never)
  const resolved = {
    ...execution,
    kind: options.kind ?? execution.kind,
    toolScope: options.toolScope ?? execution.toolScope,
  }
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = String(input)
    if (url.endsWith('/api/official-agents')) return json([{ ...card, kind: resolved.kind }])
    if (url.endsWith('/resolve')) return json(resolved)
    if (url.endsWith('/retrieve')) return json({ tenantId: 'tenant-server-owned', hits: [hit] })
    if (url.endsWith('/search')) return json({
      provider: 'deepseek-tools-search',
      hits: [{
        title: '人民币中间价',
        url: 'https://example.com/fx',
        snippet: '中间价报 6.7168',
        siteName: 'example',
      }],
    })
    if (url.endsWith('/analyze-tabular')) return json({
      format: 'csv', rowCount: 2, columnCount: 2,
      columns: [{
        name: 'revenue', inferredType: 'number', nonNull: 2, nullish: 0,
        sampleValues: ['10', '20'], min: 10, max: 20, sum: 30, mean: 15,
      }],
      warnings: [],
    })
    if (url.endsWith('/fetch-url')) return json({
      url: 'https://example.com/page',
      finalUrl: 'https://example.com/page',
      status: 200,
      contentType: 'text/html',
      accessedAt: '2026-11-06T04:00:00.000Z',
      title: 'Example',
      text: 'hello public page',
      truncated: false,
    })
    if (url.endsWith('/delegate')) return json({
      route: {
        key: 'spy', name: '竞品情报官', agentId: 'agent/spy',
        versionId: 'version/spy', version: 1,
      },
      answer: '对比摘要',
      modelRef: 'deepseek/chat',
      toolTrace: [{ tool: 'web_search', ok: true, detail: '2 hits' }],
      depth: 1,
      limits: { maxDepth: 1, allowlist: ['mammoth', 'copy', 'data', 'spy', 'growth', 'xhs'] },
    })
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetcher)
  let agentScopeOwner!: Context
  await ctx.plugin(Object.assign((inner: Context) => { agentScopeOwner = inner }, {
    inject: ['systemPrompt', 'tools'],
  }))
  const disposals: AgentHandle['dispose'][] = []
  ctx.agents.setFactory({
    createAgent: async (_ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.prepare(options.sessionId, {
        ...options.seed === undefined ? {} : { seed: [...options.seed] },
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const followup = vi.fn()
      const fixtureAgent: Partial<Agent> = { id: session.id, session, status: 'idle', followup }
      const agent = fixtureAgent as Agent
      const scope = createScope(agentScopeOwner, agent)
      Object.assign(agent, { ctx: scope.ctx })
      const detach = ctx.effect(() => ctx.sessions.enter(session))
      ctx.sessions.announce(session)
      await options.setup?.(scope.ctx, agent)
      const unregister = ctx.agents.register(agent)
      await unregister
      const dispose = vi.fn(async () => { await unregister(); await detach(); await scope.dispose() })
      disposals.push(dispose)
      return { agent, dispose }
    },
    resume: () => Promise.reject(new Error('test creates only new Sessions')),
  })
  await ctx.plugin(OfficialAgentGallery, { groundOrigin: 'https://ground.test' })
  return {
    ctx, fetcher, attachSession, bind, unbind, disposals,
    create: () => ctx.officialAgentGallery.create({
      agentId: card.id, workspaceId: workspace.id, openingQuestion: '内部发布日期',
    }),
  }
}

function forbiddenTool(name: string): ToolDefinition {
  return {
    name,
    description: `Forbidden ${name}`,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: () => Promise.resolve('must not execute'),
  }
}

async function runTool(ctx: Context, agent: Agent, name: string, args: object = {}) {
  return executeToolFixture(ctx, {
    agent, callId: ToolCallId(`call-${name}`), name, arguments: args, signal: new AbortController().signal,
  })
}

describe('official Agent Host execution', () => {
  it('freezes replayed execution privately and installs its prompt, Workspace, attribution, and caller', async () => {
    const f = await fixture()
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    const events = agent.session.snapshotEvents()
    const bound = events.find(event => event.type === 'official-agent/bound')
    expect(bound?.data).toEqual({
      agentId: card.id, versionId: card.versionId, kind: 'KNOWLEDGE', name: card.name,
      systemPrompt: execution.systemPrompt, toolScope: ['enterprise_knowledge'],
    } satisfies OfficialAgentBinding)
    expect(renderPrompt(await f.ctx.systemPrompt.assemble({ scope: agent }))).toBe(execution.systemPrompt)
    const replayed = f.ctx.sessions.create(SessionId('replayed'), { seed: events, meta: { cwd: '/pilot' } })
    const replayProjection = await f.ctx.sessionProjections.register(officialAgentBindingProjection)
    expect(replayProjection.stateOf(replayed).binding).toEqual(bound?.data)
    expect(f.ctx.sessionProjections.snapshot(replayed).values).not.toHaveProperty('officialAgentExecution')
    expect(f.attachSession).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect(f.bind).toHaveBeenCalledWith(sessionId, { agentId: card.id, versionId: card.versionId })
    expect(agent.followup).toHaveBeenCalledWith(expect.objectContaining({
      content: [{ type: 'text', text: '内部发布日期' }], source: { kind: 'user' },
    }))
    f.unbind.mockClear()
    await f.disposals[0]?.()
    expect(f.unbind).toHaveBeenCalledExactlyOnceWith(sessionId)
  })

  it('disposes creation when Workspace attachment fails', async () => {
    const f = await fixture()
    f.attachSession.mockRejectedValue(new Error('Workspace unavailable'))
    await expect(f.create()).rejects.toThrow('Workspace unavailable')
    expect(f.disposals).toHaveLength(1)
    expect(f.disposals[0]).toHaveBeenCalledOnce()
  })

  it('denies every inherited and directly dispatched tool for a GENERAL Agent', async () => {
    const f = await fixture({ kind: 'GENERAL' })
    f.ctx.tools.register(forbiddenTool('bash'))
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent)).toEqual([])
    expect((await runTool(f.ctx, agent, 'bash')).content).toEqual([{
      type: 'text', text: 'Error: This official Agent does not allow that tool.',
    }])
  })

  it('exposes only authorized knowledge retrieval and rechecks before each execution', async () => {
    const f = await fixture()
    f.ctx.tools.register(forbiddenTool('bash'))
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent).map(tool => tool.name)).toEqual(['enterprise_knowledge'])
    expect((await runTool(f.ctx, agent, 'bash')).isError).toBe(true)

    const result = await runTool(f.ctx, agent, 'enterprise_knowledge', { query: '内部发布日期' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ hits: [{
      ...hit,
      sourceUrl: `https://ground.test/api/official-agents/agent%2Fone/sources/document%2Fone?versionId=${encodeURIComponent(card.versionId)}`,
    }] })
    const retrieval = f.fetcher.mock.calls.find(([input]) => String(input).endsWith('/retrieve'))
    expect(JSON.parse(String(retrieval?.[1]?.body))).toEqual({ versionId: card.versionId, query: '内部发布日期' })
    const resolveCalls = f.fetcher.mock.calls.filter(([input]) => String(input).endsWith('/resolve'))
    expect(resolveCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('withholds the knowledge tool when the frozen scope omits it', async () => {
    const f = await fixture({ toolScope: [] })
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent)).toEqual([])
    expect((await runTool(f.ctx, agent, 'enterprise_knowledge', { query: 'secret' })).isError).toBe(true)
    expect(f.fetcher.mock.calls.some(([input]) => String(input).endsWith('/retrieve'))).toBe(false)
  })

  it('rejects revoked official steps but delegates ordinary Sessions', async () => {
    const f = await fixture()
    const officialId = await f.create()
    const official = f.ctx.agents.get(officialId)!
    const ordinarySession = f.ctx.sessions.create(SessionId('ordinary'))
    const ordinary = { id: ordinarySession.id, session: ordinarySession, ctx: f.ctx } as Agent
    f.fetcher.mockImplementation(async () => json({}, 403))
    const next = vi.fn(() => Promise.resolve({ kind: 'enter' as const, messages: [] }))
    const payload = {
      modelSelection: { provider: 'mammoth-ground', model: 'auto' }, messages: [], turn: 1, step: 1,
      signal: new AbortController().signal,
    }
    await expect(agentEvents(f.ctx, official).waterfall('agent/pre-step', payload, next)).resolves.toEqual({ kind: 'reject' })
    await expect(agentEvents(f.ctx, ordinary).waterfall('agent/pre-step', payload, next)).resolves.toEqual({ kind: 'enter', messages: [] })
    expect(next).toHaveBeenCalledOnce()
  })

  it('exposes web_search only when toolScope allows it and executes through Ground', async () => {
    const f = await fixture({ kind: 'GENERAL', toolScope: ['web_search'] })
    f.ctx.tools.register(forbiddenTool('bash'))
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent).map(tool => tool.name)).toEqual(['web_search'])
    expect((await runTool(f.ctx, agent, 'bash')).isError).toBe(true)
    expect((await runTool(f.ctx, agent, 'enterprise_knowledge', { query: 'secret' })).isError).toBe(true)

    const result = await runTool(f.ctx, agent, 'web_search', { query: '人民币中间价' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      provider: 'deepseek-tools-search',
      hits: [{
        title: '人民币中间价',
        url: 'https://example.com/fx',
        snippet: '中间价报 6.7168',
        siteName: 'example',
      }],
    })
    const searchCall = f.fetcher.mock.calls.find(([input]) => String(input).endsWith('/search'))
    expect(searchCall?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer pilot-token' }),
    })
  })

  it('exposes tabular_analyze only when toolScope allows it', async () => {
    const f = await fixture({ kind: 'GENERAL', toolScope: ['tabular_analyze'] })
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent).map(tool => tool.name)).toEqual(['tabular_analyze'])
    expect((await runTool(f.ctx, agent, 'web_search', { query: 'x' })).isError).toBe(true)
    const result = await runTool(f.ctx, agent, 'tabular_analyze', {
      content: 'city,revenue\n上海,10\n北京,20', format: 'csv',
    })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ format: 'csv', rowCount: 2, columnCount: 2 })
  })

  it('exposes web_fetch only when toolScope allows it', async () => {
    const f = await fixture({ kind: 'GENERAL', toolScope: ['web_fetch'] })
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent).map(tool => tool.name)).toEqual(['web_fetch'])
    const result = await runTool(f.ctx, agent, 'web_fetch', { url: 'https://example.com/page' })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ status: 200, text: 'hello public page' })
  })

  it('exposes delegate_official_agent for boss orchestration', async () => {
    const f = await fixture({ kind: 'GENERAL', toolScope: ['delegate_official_agent'] })
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent).map(tool => tool.name)).toEqual(['delegate_official_agent'])
    const result = await runTool(f.ctx, agent, 'delegate_official_agent', {
      targetKey: 'spy', task: '对比 Notion 与飞书',
    })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ depth: 1, route: { key: 'spy' }, answer: '对比摘要' })
  })

  it('denies web_search when the frozen version did not declare it', async () => {
    const f = await fixture({ kind: 'GENERAL', toolScope: [] })
    const sessionId = await f.create()
    const agent = f.ctx.agents.get(sessionId)!
    expect(f.ctx.tools.schemas(agent)).toEqual([])
    expect((await runTool(f.ctx, agent, 'web_search', { query: 'today' })).isError).toBe(true)
  })

})

describe('official Agent Remote access', () => {
  it('resolves request.workspaceId and refuses non-owner creation without that Workspace grant', async () => {
    const f = await fixture()
    await f.ctx.plugin(TypertRegistry)
    await f.ctx.plugin(RemoteAccessService)
    await f.ctx.plugin(TypertGatewayService)
    f.ctx.typert.register(TYPERT as TypertContribution)
    f.ctx.typert.resources.register('workspace', { field: 'workspaceId' })
    const decide = vi.spyOn(RemoteAccessService.prototype, 'decide')
    const member: Principal = { kind: 'test-member', member: 'pilot' }
    const peer = new Peer(f.ctx.root, { principal: member })
    const request = { agentId: card.id, workspaceId: WorkspaceId('workspace/one'), openingQuestion: '内部发布日期' }
    await expect(f.ctx.typertGateway.invoke({
      peer, namespace: 'officialAgentGallery', method: 'create', args: { request },
    })).rejects.toMatchObject({ code: 'remote-access/denied' })
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({
      principal: member, action: 'officialAgentGallery/create',
      resources: [{ kind: 'workspace', id: WorkspaceId('workspace/one') }],
    }))
    expect(f.ctx.agents.list()).toEqual([])

    f.ctx.remoteAccess.registerPolicy('test-member', {
      bindings: () => [{
        resource: { kind: 'workspace', id: WorkspaceId('workspace/one') },
        role: { name: 'pilot', resource: 'workspace', actions: ['officialAgentGallery/create'] },
      }],
    })
    const created = await f.ctx.typertGateway.invoke({
      peer, namespace: 'officialAgentGallery', method: 'create', args: { request },
    }) as SessionId
    const agent = f.ctx.agents.get(created)
    expect(agent?.followup).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'user', principal: member },
    }))
  })
})
