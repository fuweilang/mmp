/** Profile files, Loader, HMR, AgentLoop, skills and the card service are real; only model output is scripted. */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { Context } from '@mammoth-ai/cordis'
import Timer from '@mammoth-ai/cordis-plugin-timer'
import { boot, initProfile, loadProfileDirectory, readProfilePatches, readProfileManifest, type ProfileContext } from '@mammoth-ai/mmp-app-boot'
import Hmr from '@mammoth-ai/mmp-hmr'
import PluginManager from '@mammoth-ai/mmp-plugin-manager'
import Sessions, { SessionId } from '@mammoth-ai/mmp-session'
import Projections from '@mammoth-ai/mmp-session-projection'
import Agents from '@mammoth-ai/mmp-agent'
import AgentLoop from '@mammoth-ai/mmp-agent-loop'
import Llm, { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@mammoth-ai/mmp-llm'
import SystemPrompt from '@mammoth-ai/mmp-system-prompt'
import Tools from '@mammoth-ai/mmp-tools'
import * as NativeToolExecutor from '@mammoth-ai/mmp-tool-executor-native'
import Skills from '@mammoth-ai/mmp-skill'
import Access from '@mammoth-ai/mmp-api-remote-access'
import * as ActionCards from '@mammoth-ai/mmp-action-cards'
import * as Recommendations from '../src/index.ts'
import { ACTION, logProposal } from './fixture.ts'

class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Continuing the requested search.' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Continuing the requested search.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

it.each(['normal', 'consumer-unload'] as const)('enables through the real Loader/HMR queue: %s', async (scenario) => {
  const home = await mkdtemp(join(tmpdir(), 'mmp-recommendations-'))
  let owner: Context | undefined
  onTestFinished(async () => { await owner?.fiber.dispose(); await rm(home, { recursive: true, force: true }) })
  const dir = join(home, 'profiles', 'test')
  const anchor = join(home, 'package.json')
  const name = '@mammoth-ai/mmp-experimental-session-search'
  await writeFile(anchor, JSON.stringify({ name: 'installation', dependencies: { [name]: '1.0.0' } }))
  initProfile(dir, ['fixture-base'])
  async function bundle(root: string, name: string, patch: string) {
    const path = join(root, 'node_modules', name)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({
      name, version: '1.0.0', description: 'Find previous conversations',
      mmp: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(path, 'cordis.patch.yml'), patch)
    return path
  }
  await bundle(dir, 'fixture-base', await readFile(new URL('./fixtures/cordis.yml', import.meta.url), 'utf8'))
  const plugin = await bundle(home, name, JSON.stringify([{ insert: [{ id: 'recommendation-probe', name: './plugin.mjs' }] }]))
  await writeFile(join(plugin, 'plugin.mjs'), 'export function apply(ctx) { ctx.provide("recommendationProbe", true) }\n')
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', dir, home, cwd: home, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: anchor,
    startedBundles: loadProfileDirectory('test', dir, anchor).layers.map(layer => layer.packageName),
    overlays: [], telemetryDisabledEnv: undefined,
  }
  const ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), (ctx) => {
    owner = ctx
    ctx.provide('profileContext', profile)
    ctx.provide('appReady', { onReady: (listener) => { listener(); return () => {} } })
    Object.assign(ctx.loader.builtins, {
      sessions: Sessions, projections: Projections, llm: Llm, prompt: SystemPrompt, tools: Tools,
      executor: NativeToolExecutor, skills: Skills, agents: Agents, loop: AgentLoop, access: Access, manager: PluginManager,
      actionCards: ActionCards, recommendations: Recommendations,
    })
  })
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 })
  await ctx.hmr.runExclusive(async () => {})
  expect([...ctx.loader.entries()].filter(entry => entry.options.id === 'action-cards')).toHaveLength(1)
  const model = new Model()
  ctx.llm.registerAdapter(['mock'], model)
  const agent = await ctx.agentLoop.create(SessionId('recommendation-live'), { provider: 'mock', model: 'test' })
  const callId = logProposal(ctx, agent, 'call-live', { title: 'Session search', brief: 'Search saved conversations', details: { name } })
  expect((await ctx.skills.list()).map(skill => skill.name)).toContain('official-plugins')
  expect(readProfileManifest('test', dir).mmp?.profile?.bundles).not.toContain(name)
  if (scenario === 'consumer-unload') {
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    onTestFinished(() => { release.resolve(undefined) })
    const reload = ctx.hmr.runExclusive(async () => {
      entered.resolve(undefined)
      await release.promise
      const fiber = [...ctx.loader.entries()].find(entry => entry.options.name === 'cordis:recommendations')?.fiber
      expect(fiber).toBeDefined()
      await fiber!.dispose()
    })
    await entered.promise
    const exclusive = vi.spyOn(ctx.hmr, 'runExclusive')
    const action = ctx.actionCards.act(agent, callId, 'enable')
    await vi.waitFor(() => { expect(exclusive).toHaveBeenCalledOnce() })
    release.resolve(undefined)
    await reload
    expect(await action).toEqual({ status: 'unconfirmed', reason: 'closing' })
    expect(ctx.actionCards.view(agent.session).decisions[callId]).toEqual({ callId, action: ACTION, phase: 'unconfirmed' })
    expect(ctx.get('pluginRecommendations')).toBeUndefined()
    expect(await ctx.skills.list()).toEqual([])
    await ctx.hmr.runExclusive(async () => {})
    expect(readProfileManifest('test', dir).mmp?.profile?.bundles).toContain(name)
    expect((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === name)?.enabled).toBe(true)
    expect(model.requests).toHaveLength(0)
    return
  }
  const enabled = { callId, action: ACTION, phase: 'enabled' }
  expect(await ctx.actionCards.act(agent, callId, 'enable')).toEqual({ status: 'settled', decision: enabled })
  expect(readProfileManifest('test', dir).mmp?.profile?.bundles).toContain(name)
  expect([...ctx.loader.entries()].find(entry => entry.options.id === 'recommendation-probe')?.fiber).toBeDefined()
  expect((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === name)?.enabled).toBe(true)
  // The outcome reaches the model with the next request; enabling starts no turn by itself.
  expect(agent.status).toBe('idle')
  expect(model.requests).toHaveLength(0)
  expect(ctx.actionCards.view(agent.session).decisions[callId]).toEqual(enabled)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Thanks.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(model.requests).toHaveLength(1)
  expect(JSON.stringify(model.requests[0]?.messages)).toContain('enabled means the plugin is on now')
})
