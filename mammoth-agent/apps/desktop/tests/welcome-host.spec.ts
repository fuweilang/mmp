/** Native onboarding reuses authenticated Web RPC and never reads credential values. */
import { describe, expect, it, vi } from 'vitest'
import { connectDesktopWelcome } from '../src/welcome-backend.ts'

function transport(preference?: string) {
  const keys = new Map<string, string>()
  const namespaces = [
    { ns: 'llm-deepseek', value: { apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY' } },
    { ns: 'llm-pi-ai', value: { profiles: { example: { apiKeyEnv: 'EXAMPLE_API_KEY' } } } },
    { ns: 'locale', value: preference === undefined ? {} : { preference } },
  ]
  const send = vi.fn<Parameters<typeof connectDesktopWelcome>[1]>(async (_input, init) => {
    if (init?.method !== 'POST') return new Response('index')
    const { rpcId, method, payload } = JSON.parse(init.body as string) as {
      rpcId: string
      method: string
      payload: { args: { ref: string; value: string; refs: string[] } }
    }
    let value: unknown
    if (method === 'account/getState') value = { links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null }
    else if (method === 'settings/describe') value = { namespaces }
    else if (method === 'llm/listConfigurableProviders') value = [{ settingsNs: 'llm-pi-ai', settingsPath: ['profiles', 'example'] }]
    else if (method === 'productAnalytics/enabled') value = true
    else if (method === 'productAnalytics/report') value = undefined
    else if (method === 'credentials/set') keys.set(payload.args.ref, payload.args.value)
    else value = Object.fromEntries(payload.args.refs.map(ref => [ref, { configured: keys.has(ref), writable: true }]))
    return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } })
  })
  return { send, keys, namespaces }
}

const url = 'http://127.0.0.1:19387/?token=fixture'

describe('desktop welcome Web operations', () => {
  it('authenticates through Web and stores only through the configured credential reference', async () => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, host.send)
    expect(host.send).toHaveBeenCalledExactlyOnceWith(url, { credentials: 'include' })
    expect(await backend.analyticsEnabled()).toBe(true)
    expect(await backend.save('sk-example')).toEqual({ ok: true })
    expect(host.keys.get('CUSTOM_DEEPSEEK_KEY')).toBe('sk-example')
    expect(await backend.read()).toEqual({ loggedIn: false, hasApiKey: true, writable: true, localePreference: null })
    for (const [input, init] of host.send.mock.calls.slice(1)) {
      expect(input).toMatch(/^http:\/\/127\.0\.0\.1:19387\/api\//u)
      expect(init).toMatchObject({ credentials: 'include', redirect: 'error' })
    }
  })

  it('reads the explicit language preference and recognizes another provider key', async () => {
    const host = transport('zh')
    host.keys.set('EXAMPLE_API_KEY', 'sk-other')
    const backend = await connectDesktopWelcome(url, host.send)
    expect(await backend.read()).toMatchObject({ localePreference: 'zh', hasApiKey: true })
    host.keys.clear()
    expect(await backend.read()).toMatchObject({ hasApiKey: false })
    expect(host.send.mock.calls.every(([, init]) => !(init?.body as string | undefined)?.includes('credentials/set'))).toBe(true)
  })

  it('reads language without querying account or model providers', async () => {
    const host = transport('zh')
    const backend = await connectDesktopWelcome(url, host.send)
    host.send.mockClear()
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(host.send).toHaveBeenCalledOnce()
    expect(host.send.mock.calls[0]![0]).toContain('/api/settings/describe')
  })

  it('allows profiles without the official provider and retains custom key detection', async () => {
    const host = transport()
    host.namespaces.splice(0, 1)
    const backend = await connectDesktopWelcome(url, host.send)
    expect(await backend.read()).toMatchObject({ hasApiKey: false, writable: false })
    host.keys.set('EXAMPLE_API_KEY', 'custom-key')
    expect(await backend.read()).toMatchObject({ hasApiKey: true, writable: false })
    expect(await backend.save('official-key')).toEqual({ ok: false })
    expect(host.keys.has('undefined')).toBe(false)
  })

  it.each(['', 'bad key', 'key\n'])('rejects malformed keys without contacting a provider: %s', async (value) => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, host.send)
    host.send.mockClear()
    expect(await backend.save(value)).toEqual({ ok: false })
    expect(host.send).not.toHaveBeenCalled()
  })

  it('keeps provider diagnostics out of failures and rejects unmatched RPC envelopes', async () => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, host.send)
    host.send.mockRejectedValueOnce(new Error('private credential sk-must-not-leak'))
    expect(await backend.save('sk-example')).toEqual({ ok: false })
    host.send.mockResolvedValueOnce(Response.json({ type: 'server-response', rpcId: 'other', result: { ok: true } }))
    await expect(backend.read()).rejects.toThrow('Web RPC failed')
  })


  it('submits native analytics through authenticated RPC with a bounded request', async () => {
    const host = transport()
    const backend = await connectDesktopWelcome(url, host.send)
    const event = { eventName: 'desktop_app_launch' as const, timestamp: 100, attributes: {} }
    await backend.report(event)
    const [input, init] = host.send.mock.calls.at(-1)!
    expect(input).toBe('http://127.0.0.1:19387/api/productAnalytics/report')
    expect(init?.credentials).toBe('include')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init!.body as string)).toMatchObject({ payload: { args: { event } } })
  })

  it('refuses an unauthenticated Web launch', async () => {
    const send = vi.fn<Parameters<typeof connectDesktopWelcome>[1]>(async () => new Response(null, { status: 401 }))
    await expect(connectDesktopWelcome(url, send)).rejects.toThrow('Web authentication failed')
  })
})

  it('reuses the owned Host cookie without loading an index or relying on the Electron cookie jar', async () => {
    const host = transport('zh')
    const backend = await connectDesktopWelcome(url, host.send, async () => 'host_session=owned')
    expect(host.send).not.toHaveBeenCalled()
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(host.send).toHaveBeenCalledOnce()
    const [input, init] = host.send.mock.calls[0]!
    expect(input).toBe('http://127.0.0.1:19387/api/settings/describe')
    expect(new Headers(init?.headers).get('cookie')).toBe('host_session=owned')
    expect(init?.redirect).toBe('error')
  })

it('starts native welcome RPC after the launch exchange when the Host has no index document', async () => {
  const { createServer } = await import('node:http')
  const { authenticateWebHost } = await import('../src/web-document.ts')
  let indexRequests = 0
  const server = createServer(async (req, res) => {
    if (req.url === '/?token=owned') {
      res.writeHead(303, { location: './', 'set-cookie': 'host_session=owned; HttpOnly; SameSite=Strict' }).end()
      return
    }
    if (req.url === '/') { indexRequests++; res.writeHead(404).end(); return }
    if (req.headers.cookie !== 'host_session=owned') { res.writeHead(401).end(); return }
    let body = ''
    for await (const part of req) body += part
    const request = JSON.parse(body) as { rpcId: string; method: string }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'server-response', rpcId: request.rpcId,
      result: { ok: true, value: { namespaces: [{ ns: 'locale', value: { preference: 'zh' } }] } } }))
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('expected a local listener')
    const launch = `http://127.0.0.1:${address.port}/?token=owned`
    const cookie = await authenticateWebHost(launch)
    const backend = await connectDesktopWelcome(launch, fetch, async () => cookie)
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(indexRequests).toBe(0)
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  }
})
