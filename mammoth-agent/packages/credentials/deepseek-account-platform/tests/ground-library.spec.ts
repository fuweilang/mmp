import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { installGroundLibrary, libraryProxyTarget } from '../src/ground-library.ts'
afterEach(() => vi.unstubAllGlobals())
it('allows explicit library paths, never admin, traversal or arbitrary upstream paths', () => {
 expect(libraryProxyTarget('GET', '/ground-library/search?q=%E6%B3%A1%E6%B3%A1')).toBe('/api/library/search?q=%E6%B3%A1%E6%B3%A1')
 expect(libraryProxyTarget('POST', '/ground-library/search')).toBeUndefined()
 expect(libraryProxyTarget('POST', '/ground-library/files')).toBe('/api/library/files')
 expect(libraryProxyTarget('POST', '/ground-library/used')).toBe('/api/library/used')
 expect(libraryProxyTarget('GET', '/ground-library/used')).toBeUndefined()
 expect(libraryProxyTarget('GET', '/ground-library/nodes/abc/scope-impact?scope=ENTERPRISE')).toBe('/api/library/nodes/abc/scope-impact?scope=ENTERPRISE')
 expect(libraryProxyTarget('POST', '/ground-library/nodes/abc/scope-impact')).toBeUndefined()
 expect(libraryProxyTarget('GET', '/ground-library/nodes/abc/download?versionId=v&inline=1')).toBe('/api/library/nodes/abc/download?versionId=v&inline=1')
 expect(libraryProxyTarget('GET', '/ground-library/nodes/abc/download?versionId=v')).toContain('/api/library/nodes/abc/download')
 for(const path of ['/ground-library/admin/stats', '/ground-library/../admin', '/ground-library/nodes/a%2fb/download', '/api/library/items', '//evil.test/items']) expect(libraryProxyTarget('GET', path)).toBeUndefined()
 expect(libraryProxyTarget('POST', '/ground-library/items')).toBeUndefined()
})
async function server(denied?: number, switchAccount = false, switchAfter = 1, upstreamResponse?: () => Response, acceptContext?: (captured: string, selected: string) => Promise<boolean>) {
 let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> = async (_req, res) => { res.end() }
 const upstream = vi.fn(async (_url: string, _init: RequestInit) => upstreamResponse?.() ?? new Response(Uint8Array.from([0, 255, 1]), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment' } }))
 const realFetch = fetch
 vi.stubGlobal('fetch', upstream)
 let tokenCalls = 0
 const rejected: string[] = []
 const ctx = { inject: (_keys: string[], install: (scope: unknown) => void) => install({
  connection: { requestRejection: () => denied }, effect: (run: () => unknown) => run(),
  webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } },
 }) }
 installGroundLibrary(ctx as never, 'https://ground.test', async () => { tokenCalls++; return switchAccount && tokenCalls > switchAfter ? 'account-b' : 'account-a' }, async value => { rejected.push(value) }, 1000, acceptContext)
 const http = createServer((req, res) => { void handler(req, res) }); await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
 const address = http.address(); if(!address || typeof address === 'string')throw new Error('listen failed')
 return { upstream, rejected, request: (path: string, init?: RequestInit) => realFetch(`http://127.0.0.1:${address.port}${path}`, init), close: () => new Promise<void>(resolve => { http.closeAllConnections(); http.close(() => resolve()) }) }
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

it('discards an upstream response if the account switches while the read is in flight', async () => {
 const h = await server(undefined, true, 2); try { const response = await h.request('/ground-library/items'); expect(response.status).toBe(409); expect(h.upstream).toHaveBeenCalledOnce(); expect(await response.text()).not.toContain('account-a') } finally { await h.close() }
})

it('forwards a Ground refusal message and invalidates the account on 401', async () => {
 const h = await server(undefined, false, 1, () => Response.json({ message: '登录已过期，请重新登录' }, { status: 401 }))
 try {
  const response = await h.request('/ground-library/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodeId: 'n', versionId: 'v' }) })
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ message: '登录已过期，请重新登录' })
  expect(h.rejected).toEqual(['account-a'])
 } finally { await h.close() }
})

it('forwards a 403 refusal message without treating a library denial as an expired account', async () => {
 const h = await server(undefined, false, 1, () => Response.json({ message: '该资料未授权查看' }, { status: 403 }))
 try {
  const response = await h.request('/ground-library/nodes/n/preview?versionId=v')
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({ message: '该资料未授权查看' })
  expect(h.rejected).toEqual([])
 } finally { await h.close() }
})

it('commits member selection only on the Host and redacts credentials even with a query string', async () => {
 const commit = vi.fn(async () => true)
 const h = await server(undefined, false, 1, () => Response.json({token:'synthetic-library-credential',tenants:[{id:'a',name:'A'}],selectedTenantId:'a'}), commit)
 try {
  const response = await h.request('/ground-library/context?ignored=1', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:'a'})})
  expect(response.status).toBe(200);expect(await response.json()).toEqual({tenants:[{id:'a',name:'A'}],selectedTenantId:'a'})
  expect(commit).toHaveBeenCalledWith('account-a','synthetic-library-credential')
 } finally { await h.close() }
})
it('discards a stale member selection without returning its credential', async () => {
 const h = await server(undefined, false, 1, () => Response.json({token:'synthetic-library-credential'}), async () => false)
 try {
  const response = await h.request('/ground-library/context', {method:'POST',body:'{}'})
  expect(response.status).toBe(409);expect(await response.text()).not.toContain('synthetic-library-credential')
 } finally { await h.close() }
})
