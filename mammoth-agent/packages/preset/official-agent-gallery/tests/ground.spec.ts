import { describe, expect, it, vi } from 'vitest'
import { GroundOfficialAgentClient } from '../src/ground.ts'

const card = {
  id: 'agent/one',
  key: 'one',
  kind: 'KNOWLEDGE',
  versionId: 'version/one',
  version: 1,
  name: '企业问答',
  summary: '回答企业资料问题',
  openingQuestions: ['内部发布日期'],
  category: 'expertise',
  capabilities: ['企业资料'],
  avatarUrl: null, executionGranted: true,
} as const

const execution = {
  agentId: card.id,
  key: card.key,
  kind: card.kind,
  versionId: card.versionId,
  version: card.version,
  systemPrompt: '只根据企业资料回答',
  toolScope: ['enterprise_knowledge'],
} as const

const retrieval = {
  tenantId: 'tenant-server-owned',
  hits: [{
    documentId: 'document/one',
    documentName: '发布说明.pdf',
    ordinal: 0,
    folderName: '产品资料',
    snippet: '内部发布日期为 11 月 5 日',
    score: 0.9,
  }],
} as const

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GroundOfficialAgentClient', () => {
  it('uses the exact list, resolve, and retrieve requests with bearer authorization and cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json([card]))
      .mockResolvedValueOnce(json(execution))
      .mockResolvedValueOnce(json(retrieval))
    const token = vi.fn(async () => 'secret-token')
    const client = new GroundOfficialAgentClient('https://ground.test/root', token, fetcher)
    const listSignal = new AbortController().signal
    const resolveSignal = new AbortController().signal
    const retrieveSignal = new AbortController().signal

    await expect(client.list(listSignal)).resolves.toEqual([card])
    await expect(client.resolve(card.id, card.versionId, resolveSignal)).resolves.toEqual(execution)
    await expect(client.retrieve(card.id, card.versionId, '内部发布日期', retrieveSignal)).resolves.toEqual(retrieval)

    expect(token).toHaveBeenCalledTimes(3)
    const requests = fetcher.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body,
      signal: init?.signal,
      headers: new Headers(init?.headers),
    }))
    expect(requests).toEqual([
      {
        url: 'https://ground.test/api/official-agents', method: 'GET', body: undefined, signal: listSignal,
        headers: expect.any(Headers) as Headers,
      },
      {
        url: 'https://ground.test/api/official-agents/agent%2Fone/resolve', method: 'POST',
        body: JSON.stringify({ versionId: card.versionId, executionProtocol: 2 }), signal: resolveSignal,
        headers: expect.any(Headers) as Headers,
      },
      {
        url: 'https://ground.test/api/official-agents/agent%2Fone/retrieve', method: 'POST',
        body: JSON.stringify({ versionId: card.versionId, query: '内部发布日期' }), signal: retrieveSignal,
        headers: expect.any(Headers) as Headers,
      },
    ])
    for (const request of requests) {
      expect(request.headers.get('Authorization')).toBe('Bearer secret-token')
      expect(request.headers.get('Accept')).toBe('application/json')
    }
    expect(requests[0]?.headers.has('Content-Type')).toBe(false)
    expect(requests[1]?.headers.get('Content-Type')).toBe('application/json')
    expect(requests[2]?.headers.get('Content-Type')).toBe('application/json')
  })

  it('cancels an error response body without leaking its contents', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('private enterprise failure'))
        controller.close()
      },
    })
    const cancel = vi.spyOn(body, 'cancel')
    const client = new GroundOfficialAgentClient(
      'https://ground.test', async () => 'token', vi.fn(async () => new Response(body, { status: 403 })),
    )

    const failure = await client.list().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('Ground official Expert request failed with HTTP 403')
    expect((failure as Error).message).not.toContain('private enterprise failure')
    expect(cancel).toHaveBeenCalledExactlyOnceWith()
  })

  it('maps 401 to a re-login message without leaking the body', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('private enterprise failure'))
        controller.close()
      },
    })
    const client = new GroundOfficialAgentClient(
      'https://ground.test', async () => 'token', vi.fn(async () => new Response(body, { status: 401 })),
    )
    const failure = await client.list().catch((error: unknown) => error)
    expect((failure as Error).message).toBe('猛犸登录已失效，请重新登录。')
    expect((failure as Error).message).not.toContain('private enterprise failure')
  })

  it('rejects malformed or unexpectedly privileged payloads', async () => {
    const client = new GroundOfficialAgentClient(
      'https://ground.test', async () => 'token', vi.fn(async () => json([{
        ...card,
        systemPrompt: 'must not be accepted as card data',
      }])),
    )

    await expect(client.list()).rejects.toThrow()
  })

  it('accepts only the declared public card fields', async () => {
    const client = new GroundOfficialAgentClient(
      'https://ground.test', async () => 'token', vi.fn(async () => json([card])),
    )

    const [publicCard] = await client.list()
    expect(publicCard).toEqual(card)
    expect(publicCard).not.toHaveProperty('systemPrompt')
    expect(publicCard).not.toHaveProperty('toolScope')
    expect(publicCard).not.toHaveProperty('kbFolderIds')
    expect(publicCard).not.toHaveProperty('token')
  })
})

it('negotiates protocol 2 for normal resolve without breaking exact legacy decoding', async () => {
  let sent: Record<string,unknown> = {}
  const client = new GroundOfficialAgentClient('https://ground.test', async () => 'synthetic', async (_url,init) => {
    sent=JSON.parse(String(init?.body))
    return json({agentId:'a',key:'a',kind:'GENERAL',versionId:'v',version:1,systemPrompt:'',toolScope:[]})
  })
  await client.resolve('a','v')
  expect(sent).toEqual({versionId:'v',executionProtocol:2})
})
