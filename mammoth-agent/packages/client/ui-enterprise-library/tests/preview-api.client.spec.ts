import { expect, it, vi } from 'vitest'
import * as api from '../src/client/api.ts'

it.each(['doc', 'DOCX', 'ppt', 'pptx'])('reads complete converted %s bytes for the exact version', async (extension) => {
  const signal = new AbortController().signal
  const fetcher = vi.fn(async () => new Response('%PDF-1.7\ncomplete\n%%EOF', { headers: { 'content-type': 'application/pdf', 'x-mmp-missing-fonts': encodeURIComponent(JSON.stringify(['宋体'])) } }))
  const result = await api.fetchLibraryPreviewBytes('http://host/', 'node/1', 'ver 2', 'report.' + extension, fetcher, signal)
  expect(fetcher.mock.calls[0]).toEqual(['http://host/ground-library/nodes/node%2F1/render?versionId=ver+2&extension=' + extension.toLowerCase(), { credentials: 'include', signal }])
  expect(new TextDecoder().decode(result.bytes)).toBe('%PDF-1.7\ncomplete\n%%EOF')
  expect(result.mimeType).toBe('application/pdf')
  expect(result.missingFonts).toEqual(['宋体'])
})
it('reads original binary downloads without adding the media-only inline policy', async () => {
  const fetcher = vi.fn(async () => new Response(Uint8Array.from([0, 255, 1]), { headers: { 'content-type': 'application/octet-stream' } }))
  const result = await api.fetchLibraryPreviewBytes('', 'n', 'v', 'sheet.xlsx', fetcher)
  expect(fetcher.mock.calls[0]).toEqual(['/ground-library/nodes/n/download?versionId=v', { credentials: 'include' }])
  expect(result).toEqual({ bytes: Uint8Array.from([0, 255, 1]), mimeType: 'application/octet-stream', missingFonts: [] })
})
it('retains authorization refusal status and detail', async () => {
  await expect(api.fetchLibraryPreviewBytes('', 'n', 'v', 'a.pdf', async () => Response.json({ message: '该资料未授权' }, { status: 403 })))
    .rejects.toThrow('该资料未授权')
})
it.each([
  ['text/html', '%PDF-1.7 fake type', '[]'],
  ['application/pdf', 'not a PDF', '[]'],
  ['application/pdf', '%PDF-1.7', 'bad header'],
  ['application/pdf', '%PDF-1.7', encodeURIComponent('[1]')],
])('rejects malformed converted output %s %s %s', async (mime, content, fonts) => {
  await expect(api.fetchLibraryPreviewBytes('', 'n', 'v', 'a.docx', async () => new Response(content, { headers: { 'content-type': mime, 'x-mmp-missing-fonts': fonts } }))).rejects.toThrow()
})
it('rejects aborted buffered responses even when a transport ignores cancellation', async () => {
  const controller = new AbortController()
  const response = new Response('private old bytes')
  vi.spyOn(response, 'arrayBuffer').mockImplementation(async () => { controller.abort(); return new TextEncoder().encode('private old bytes').buffer })
  await expect(api.fetchLibraryPreviewBytes('', 'n', 'v', 'a.txt', async () => response, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
})
it('does not start a download with an already aborted signal or missing version', async () => {
  const controller = new AbortController(); controller.abort()
  const fetcher = vi.fn(async () => new Response('body'))
  await expect(api.fetchLibraryPreviewBytes('', 'n', 'v', 'a.txt', fetcher, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  await expect(api.fetchLibraryPreviewBytes('', 'n', '', 'a.txt', fetcher)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
it('downloads an extensionless file named docx without requesting Office conversion', async () => {
  const fetcher = vi.fn(async () => new Response('text'))
  const result = await api.fetchLibraryPreviewBytes('', 'n', 'v', 'docx', fetcher)
  expect(fetcher.mock.calls[0]).toEqual(['/ground-library/nodes/n/download?versionId=v', { credentials: 'include' }])
  expect(new TextDecoder().decode(result.bytes)).toBe('text')
})
