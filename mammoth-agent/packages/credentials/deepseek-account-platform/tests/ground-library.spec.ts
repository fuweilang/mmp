import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { installGroundLibrary, libraryProxyTarget } from '../src/ground-library.ts'
afterEach(() => vi.unstubAllGlobals())
it('allows explicit library paths, never admin, traversal or arbitrary upstream paths', () => {
 expect(libraryProxyTarget('POST', '/ground-library/files')).toBe('/api/library/files')
 expect(libraryProxyTarget('GET', '/ground-library/nodes/abc/download?versionId=v')).toContain('/api/library/nodes/abc/download')
 for(const path of ['/ground-library/admin/stats', '/ground-library/../admin', '/ground-library/nodes/a%2fb/download', '/api/library/items', '//evil.test/items']) expect(libraryProxyTarget('GET', path)).toBeUndefined()
 expect(libraryProxyTarget('POST', '/ground-library/items')).toBeUndefined()
})
async function server(denied?: number, switchAccount = false) {
 let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> = async (_req, res) => { res.end() }
 const upstream = vi.fn(async () => new Response(Uint8Array.from([0, 255, 1]), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment' } }))
 const realFetch = fetch
 vi.stubGlobal('fetch', upstream)
 let tokenCalls = 0
 const ctx = { inject: (_keys: string[], install: (scope: unknown) => void) => install({
  connection: { requestRejection: () => denied }, effect: (run: () => unknown) => run(),
  webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } },
 }) }
 installGroundLibrary(ctx as never, 'https://ground.test', async () => { tokenCalls++; return switchAccount && tokenCalls > 1 ? 'account-b' : 'account-a' }, async () => {}, 1000)
 const http = createServer((req, res) => { void handler(req, res) }); await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
 const address = http.address(); if(!address || typeof address === 'string')throw new Error('listen failed')
 return { upstream, request: (path: string, init?: RequestInit) => realFetch(`http://127.0.0.1:${address.port}${path}`, init), close: () => new Promise<void>(resolve => { http.closeAllConnections(); http.close(() => resolve()) }) }
}
it('rejects unauthenticated connections before using Ground', async () => {
 const h = await server(403); try { expect((await h.request('/ground-library/items')).status).toBe(403); expect(h.upstream).not.toHaveBeenCalled() } finally { await h.close() }
})
it('preserves binary downloads and multipart bytes without exposing credentials', async () => {
 const h = await server(); try {
  const response = await h.request('/ground-library/nodes/n/download?versionId=v'); expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([0,255,1])); expect(response.headers.get('authorization')).toBeNull(); expect(response.headers.get('cache-control')).toBe('no-store')
  const form = new FormData(); form.append('files', new Blob(['正文']), '中文.md'); expect((await h.request('/ground-library/files', { method:'POST', body:form })).status).toBe(200)
  const init = h.upstream.mock.calls.at(-1)?.[1] as RequestInit; expect((init.headers as Record<string,string>)['content-type']).toContain('multipart/form-data'); expect(init.body).toBeInstanceOf(Uint8Array)
 } finally { await h.close() }
})
it('does not forward after an account/tenant switch', async () => {
 const h = await server(undefined, true); try { expect((await h.request('/ground-library/items')).status).toBe(409); expect(h.upstream).not.toHaveBeenCalled() } finally { await h.close() }
})
