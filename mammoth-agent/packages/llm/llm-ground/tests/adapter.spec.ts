/** Ground owns automatic routing; explicit model choices are never silently substituted. */
import { afterEach, expect, it, vi } from 'vitest'
import type { DeepSeekAccount } from '@mammoth-ai/mmp-deepseek-account'
import type { GenerateOptions } from '@mammoth-ai/mmp-llm'
import type { SessionId } from '@mammoth-ai/mmp-session'
import { GroundLlmAdapter, type GroundAdapterOptions } from '../src/adapter.ts'
import { OpenAiSseTranslator } from '../src/openai-map.ts'
const account = { resolveToken: vi.fn(async () => 'test-session'), rejectToken: vi.fn(async () => {}) } as Pick<DeepSeekAccount, 'resolveToken' | 'rejectToken'>
function adapter() {
  // The fixture exposes only the account operations the transport consumes.
  return new GroundLlmAdapter({ providerId: 'ground', displayName: 'Cloud', origin: 'http://127.0.0.1:5201', account: () => account as DeepSeekAccount })
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
it('lists Automatic first and keeps its route stable across changing defaults', async () => {
  let id = 'deepseek/first'
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{id, display_name: id, is_preferred: true}] })))
  const target = adapter()
  expect((await target.listModels('ground')).map(m => m.id)).toEqual(['auto', 'deepseek/first'])
  expect((await target.resolveModel('ground', 'auto')).id).toBe('auto')
  id = 'kimi/second'
  expect(await target.observeCatalog(new AbortController().signal)).toBe(true)
  expect((await target.resolveModel('ground', 'auto')).id).toBe('auto')
})
it('manual choice becomes unavailable without silently selecting a backup', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ id:'kimi/backup' }] })))
  const target = adapter()
  await expect(target.resolveModel('ground','deepseek/missing')).rejects.toThrow('Choose Automatic')
  expect((await target.resolveModel('ground','kimi/backup')).id).toBe('kimi/backup')
})
it('classifies Ground concurrency limits as retryable rate limits', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ data: [{ id: 'deepseek/flash', display_name: 'Flash' }] }))
    .mockResolvedValueOnce(Response.json({ message: '当前企业请求过多' }, { status: 429, headers: { 'Retry-After': '1' } })))
  const target = adapter()
  await expect(target.stream({ provider: 'ground', model: 'auto', messages: [] })[Symbol.asyncIterator]().next()).rejects.toMatchObject({
    code: 'RATE_LIMIT',
    failure: { status: 429, providerRetryAfterMs: 1000 },
  })
})
it('reports mid-stream protocol errors rather than completing a partial response', () => {
  const translator = new OpenAiSseTranslator()
  expect(() => translator.pushData(JSON.stringify({ error: { code:'MODEL_STREAM_INTERRUPTED', message:'模型输出中断，请重试' } }))).toThrow('模型输出中断')
})

async function sentChatHeaders(
  options: GenerateOptions,
  officialFor?: GroundAdapterOptions['officialFor'],
): Promise<Record<string, string>> {
  const requests: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {})
    return requests.length === 1
      ? Response.json({ data: [{ id: 'deepseek/flash', display_name: 'Flash' }] })
      : new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }))
  const target = new GroundLlmAdapter({
    providerId: 'ground', displayName: 'Cloud', origin: 'http://127.0.0.1:5201',
    account: () => account as DeepSeekAccount,
    ...(officialFor === undefined ? {} : { officialFor }),
  })
  const iterator = target.stream(options)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) { /* consume the response */ }
  return requests[1]?.headers as Record<string, string>
}

it('attributes only ordinary Session requests to their bound official version', async () => {
  const sessionId = 'official-session' as SessionId
  const base = { provider: 'ground', model: 'auto', messages: [] }
  const ordinary = await sentChatHeaders({ ...base, sessionId })
  expect(ordinary['x-mmp-session-id']).toBe(sessionId)
  expect(ordinary['x-mmp-official-agent-id']).toBeUndefined()

  const official = await sentChatHeaders(
    { ...base, sessionId },
    () => ({ agentId: 'agent-1', versionId: 'version-2' }),
  )
  expect(official['x-mmp-session-id']).toBe(sessionId)
  expect(official['x-mmp-official-agent-id']).toBe('agent-1')
  expect(official['x-mmp-official-agent-version-id']).toBe('version-2')

  const compaction = await sentChatHeaders(
    { ...base, sessionId, purpose: 'compaction' },
    () => ({ agentId: 'agent-1', versionId: 'version-2' }),
  )
  expect(compaction['x-mmp-session-id']).toBe(sessionId)
  expect(compaction['x-mmp-helper-purpose']).toBe('compaction')
  expect(compaction['x-mmp-origin-agent-id']).toBe('agent-1')
  expect(compaction['x-mmp-origin-version-id']).toBe('version-2')
  expect(compaction['x-mmp-official-agent-id']).toBeUndefined()
  expect(compaction['x-mmp-official-agent-version-id']).toBeUndefined()
})
