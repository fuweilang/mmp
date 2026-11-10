import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import type { OfficeToPdfRequest } from '@mammoth-ai/mmp-office-to-pdf/types'
import { installGroundLibrary, libraryProxyTarget } from '../src/ground-library.ts'

afterEach(() => vi.unstubAllGlobals())
const pdf = new TextEncoder().encode('%PDF-1.7\ncomplete PDF\n%%EOF')
type Convert = (request: OfficeToPdfRequest, signal?: AbortSignal) => Promise<{ pdf: Uint8Array; missingFonts: string[] }>
async function harness(options: {
  denied?: number
  convert?: Convert | null
  upstream?: (url: URL, init: RequestInit) => Promise<Response>
  timeoutMs?: number
  token?: () => Promise<string | undefined>
} = {}) {
  let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> = async (_req, res) => { res.end() }
  let account: string | undefined = 'private-account-token'
  const disposers: (() => unknown)[] = []
  const reads: string[] = []
  const rejected: string[] = []
  const realFetch = fetch
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    reads.push(url.pathname + url.search)
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer private-account-token')
    return options.upstream?.(url, init) ?? (url.pathname.endsWith('/preview')
      ? Response.json({ nodeId: 'n', versionId: 'v', name: 'document.docx', previewKind: 'download_only' })
      : new Response(Uint8Array.from([0, 255, 1])))
  })
  const convert: Convert = options.convert ?? (async (input, signal) => {
    expect(input.source.key).not.toContain('private-account-token')
    expect(input.source.version).toBe('v')
    expect(reads).toEqual(['/api/library/nodes/n/preview?versionId=v'])
    const source = await input.source.read(signal!, 16)
    expect(Array.from(source.bytes)).toEqual([0, 255, 1])
    expect(source.version).toBe('v')
    return { pdf, missingFonts: ['宋体', 'Calibri'] }
  })
  const effect = (run: () => unknown) => { const dispose = run(); if (typeof dispose === 'function') disposers.push(dispose as () => unknown) }
  const inject = (keys: string[], install: (scope: object) => void): void => {
    if (keys.includes('officeToPdf')) {
      if (options.convert !== null) install({ officeToPdf: { convert }, effect })
      return
    }
    install({ connection: { requestRejection: () => options.denied }, effect, inject,
      webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } } })
  }
  const ctx = { inject }
  installGroundLibrary(ctx as never, 'https://ground.test', options.token ?? (async () => account), async (value) => { rejected.push(value) }, options.timeoutMs ?? 1000)
  let settled!: () => void
  let closed!: () => void
  const completed = new Promise<void>((resolve) => { settled = resolve })
  const responseClosed = new Promise<void>((resolve) => { closed = resolve })
  const http = createServer((req, res) => { res.once('close', closed); void handler(req, res).finally(settled) })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const address = http.address(); if (!address || typeof address === 'string') throw new Error('listen failed')
  const origin = `http://127.0.0.1:${address.port}`
  return { reads, rejected, completed, responseClosed, switchAccount: () => { account = 'replacement-account' }, dispose: () => { for (const dispose of disposers) dispose() },
    request: (path = '/ground-library/nodes/n/render?versionId=v&extension=docx') => realFetch(origin + path),
    disconnect: () => { const req = httpRequest(origin + '/ground-library/nodes/n/render?versionId=v&extension=docx'); req.on('error', () => {}); req.end(); return req },
    close: () => new Promise<void>((resolve) => { http.closeAllConnections(); http.close(() => { resolve() }) }) }
}

it('renders an exact authorized version as a complete PDF without forwarding render to Ground', async () => {
  expect(libraryProxyTarget('GET', '/ground-library/nodes/n/render?versionId=v&extension=docx')).toBeUndefined()
  const h = await harness(); try {
    const response = await h.request()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.parse(decodeURIComponent(response.headers.get('x-mmp-missing-fonts')!))).toEqual(['宋体', 'Calibri'])
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf)
    expect(h.reads).toEqual(['/api/library/nodes/n/preview?versionId=v', '/api/library/nodes/n/download?versionId=v'])
  } finally { await h.close() }
})
it('refuses an unauthorized connection before reading or converting a source', async () => {
  const h = await harness({ denied: 403 })
  try { expect((await h.request()).status).toBe(403); expect(h.reads).toEqual([]) } finally { await h.close() }
})
it.each([401, 403, 404, 410])('retains Ground private/shared/version refusal %s', async (status) => {
  const h = await harness({ upstream: async () => Response.json({ message: '该版本不可访问' }, { status }) }); try {
    const response = await h.request(); expect(response.status).toBe(status); expect(await response.json()).toEqual({ message: '该版本不可访问' })
    expect(h.reads).toHaveLength(1)
    expect(h.rejected).toEqual(status === 401 ? ['private-account-token'] : [])
  } finally { await h.close() }
})
it.each(['extension=html&versionId=v', 'extension=xlsx&versionId=v', 'extension=docx'])(
  'rejects unsupported or unversioned requests: %s', async (query) => {
    const h = await harness(); try { expect((await h.request('/ground-library/nodes/n/render?' + query)).status).toBe(400); expect(h.reads).toEqual([]) } finally { await h.close() }
  })
it('refuses missing conversion service with an actionable response', async () => {
  const h = await harness({ convert: null }); try { const response = await h.request(); expect(response.status).toBe(503); const payload: unknown = await response.json(); expect(payload).toHaveProperty('message'); expect(JSON.stringify(payload)).toContain('Office') } finally { await h.close() }
})
it('rejects a metadata version mismatch without reading bytes', async () => {
  const h = await harness({ upstream: async () => Response.json({ nodeId: 'n', versionId: 'other', name: 'document.docx', previewKind: 'text' }) }); try {
    expect((await h.request()).status).toBe(409); expect(h.reads).toHaveLength(1)
  } finally { await h.close() }
})
it('discards source bytes after the account changes during their read', async () => {
  const h = await harness({ upstream: async (url) => {
    if (url.pathname.endsWith('/preview')) return Response.json({ nodeId: 'n', versionId: 'v', name: 'document.docx', previewKind: 'text' })
    return new Response(new ReadableStream({ pull(controller) { h.switchAccount(); controller.enqueue(new TextEncoder().encode('private data')); controller.close() } }, { highWaterMark: 0 }))
  } }); try { const response = await h.request(); expect(response.status).toBe(409); expect(await response.text()).not.toContain('private data') } finally { await h.close() }
})
it('discards a PDF after the account changes during conversion', async () => {
  const h = await harness({ convert: async () => { h.switchAccount(); return { pdf, missingFonts: [] } } }); try { const response = await h.request(); expect(response.status).toBe(409); expect(await response.text()).not.toContain('%PDF') } finally { await h.close() }
})
it('contains converter diagnostics without leaking credentials', async () => {
  const h = await harness({ convert: async () => { throw new Error('private-account-token engine path') } }); try { const response = await h.request(); expect(response.status).toBe(502); expect(await response.text()).not.toContain('private-account-token') } finally { await h.close() }
})
it.each(['disconnect', 'dispose', 'timeout'] as const)('aborts conversion on %s', async (action) => {
  let started!: () => void; const ready = new Promise<void>((resolve) => { started = resolve })
  let aborted!: () => void; const stopped = new Promise<void>((resolve) => { aborted = resolve })
  const h = await harness({ timeoutMs: action === 'timeout' ? 30 : 1000, convert: async (_input, signal) => {
    started(); return new Promise((_resolve, reject) => { signal!.addEventListener('abort', () => { aborted(); reject(new Error('cancelled')) }, { once: true }) })
  } }); try {
    const req = action === 'disconnect' ? h.disconnect() : h.request()
    await ready
    if (action === 'disconnect' && 'destroy' in req) req.destroy()
    if (action === 'dispose') h.dispose()
    await stopped
    if (req instanceof Promise) expect((await req).status).toBe(action === 'timeout' ? 504 : 503)
  } finally { await h.close() }
})
it('refuses a supplied extension that differs from the authorized file name', async () => {
  const h = await harness({ upstream: async () => Response.json({ nodeId: 'n', versionId: 'v', name: 'secret.zip', previewKind: 'download_only' }), convert: async () => ({ pdf, missingFonts: [] }) })
  try { const response = await h.request(); expect(response.status).toBe(400); expect(h.reads).toHaveLength(1) } finally { await h.close() }
})
it('retains a download authorization refusal after metadata authorization succeeded', async () => {
  const h = await harness({ upstream: async url => url.pathname.endsWith('/preview')
    ? Response.json({ nodeId: 'n', versionId: 'v', name: 'document.docx', previewKind: 'text' })
    : Response.json({ message: '共享授权已撤销' }, { status: 403 }) })
  try { const response = await h.request(); expect(response.status).toBe(403); expect(await response.json()).toEqual({ message: '共享授权已撤销' }) } finally { await h.close() }
})
it('bounds admitted source reads and cancels oversized download streams', async () => {
  let cancelled = false
  const h = await harness({ upstream: async url => url.pathname.endsWith('/preview')
    ? Response.json({ nodeId: 'n', versionId: 'v', name: 'document.docx', previewKind: 'text' })
    : new Response(new ReadableStream({
      start: (controller) => { controller.enqueue(new Uint8Array(17)) },
      cancel: () => { cancelled = true },
    })) })
  try {
    expect((await h.request()).status).toBe(413)
    expect(cancelled).toBe(true)
  } finally { await h.close() }
})
it('does not read a source when the connection closes during credential capture', async () => {
  let release!: (token: string) => void
  let capturing!: () => void
  const started = new Promise<void>((resolve) => { capturing = resolve })
  const waiting = new Promise<string>((resolve) => { release = resolve })
  const h = await harness({ token: async () => { capturing(); return waiting } })
  try {
    const request = h.disconnect()
    await started
    request.destroy()
    await h.responseClosed
    release('private-account-token')
    await h.completed
    expect(h.reads).toEqual([])
  } finally { await h.close() }
})
it('refuses signed-out renders without reading a source', async () => {
  const h = await harness({ token: async () => undefined })
  try { expect((await h.request()).status).toBe(401); expect(h.reads).toEqual([]) } finally { await h.close() }
})
it.each(['展示标题.pdf', '没有扩展名的展示标题'])('renders immutable Office metadata despite renamed node %s', async (name) => {
  const h = await harness({ upstream: async url => url.pathname.endsWith('/preview')
    ? Response.json({ nodeId: 'n', versionId: 'v', name, originalName: 'original.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', previewKind: 'download_only' })
    : new Response(Uint8Array.from([0, 255, 1])) })
  try {
    const response = await h.request()
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf)
  } finally { await h.close() }
})
it('rejects an incompatible immutable original name even when the mutable title claims Office', async () => {
  const h = await harness({ upstream: async () => Response.json({ nodeId: 'n', versionId: 'v', name: 'display.docx', originalName: 'original.pdf', mimeType: 'application/pdf', previewKind: 'text' }), convert: async () => ({ pdf, missingFonts: [] }) })
  try { expect((await h.request()).status).toBe(400); expect(h.reads).toHaveLength(1) } finally { await h.close() }
})
