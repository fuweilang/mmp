/** Ground owns automatic routing; explicit model choices are never silently substituted. */
import { afterEach, expect, it, vi } from 'vitest'
import type { DeepSeekAccount } from '@mammoth-ai/mmp-deepseek-account'
import { GroundLlmAdapter } from '../src/adapter.ts'
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
