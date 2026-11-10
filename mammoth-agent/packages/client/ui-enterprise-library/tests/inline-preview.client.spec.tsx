// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook } from '@mammoth-ai/mmp-client-test-runtime'
import type { GlobalStandardProps } from '@mammoth-ai/mmp-client-ui-slots'
import { LibraryPanel, type LibraryPanelProps } from '../src/client/LibraryPanel.tsx'
import { zh, type LibraryKey } from '../src/client/locales.ts'

import { renderPreviewFactory } from './preview-factory.fixture.tsx'

afterEach(cleanup)
const unused = (): never => { throw new Error('unused framework seat') }
const standard: GlobalStandardProps = {
  usePanelInfo: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
  useResource: unused, useWorkspaces: unused, ...allowAllAccess, useContextMenu: contextMenuHook(),
}
const noSource: LibraryPanelProps['useSourceRequest'] = select => select(null)
const noNavigation: LibraryPanelProps['useNavigationWidth'] = select => select(null)
const t = (key: LibraryKey) => zh[key]
const file = (id: string, name: string) => ({ id, name, kind: 'FILE', scope: 'PRIVATE', currentVersion: { id: `v-${id}`, versionNo: 1, parseStatus: 'READY' } })
const fixture = (fetchImpl: LibraryPanelProps['fetchImpl']) => render(<LibraryPanel {...standard} renderFactorySlot={renderPreviewFactory} t={t as never}
  useSourceRequest={noSource} useNavigationWidth={noNavigation} setNavigationElement={() => {}} clearSourceRequest={() => {}} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)

it('opens recent files in the right pane and returns to that list after closing the shared preview', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/download?')
    ? new Response('# 最近原文', { headers: { 'content-type': 'text/markdown' } })
    : url.includes('/preview?') ? Response.json({ name: '最近.md', versionId: 'v-recent' })
      : Response.json({ items: url.includes('view=recent') ? [file('recent', '最近.md')] : [file('mine', '个人.md')], total: 1 }))
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  const right = within(view.container.querySelector('main')!)
  await left.findByRole('button', { name: '个人.md' })
  expect(left.queryByRole('checkbox')).toBeNull()
  fireEvent.click(left.getByRole('button', { name: zh.recent }))
  fireEvent.click(await right.findByRole('button', { name: '最近.md' }))
  expect(left.queryByRole('button', { name: '最近.md' })).toBeNull()
  await right.findByRole('heading', { name: '最近原文' })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(right.getByRole('button', { name: zh.close }))
  await right.findByRole('button', { name: '最近.md' })
})

it('creates inside the folder whose plus menu was used even when another category is active', async () => {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ id: 'created' })
    return Response.json({ items: url.includes('view=shared') ? [] : [{ id: 'folder', name: '目标目录', kind: 'FOLDER', scope: 'PRIVATE', canManage: true }], total: 1 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  await left.findByRole('button', { name: '目标目录' })
  expect(left.queryByRole('button', { name: zh.upload })).toBeNull()
  fireEvent.click(left.getByRole('button', { name: zh.shared }))
  fireEvent.click(left.getByRole('button', { name: `${zh.new} · 目标目录` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.folder }))
  const dialog = within(await screen.findByRole('dialog', { name: zh.folder }))
  fireEvent.change(dialog.getByRole('textbox', { name: zh.name }), { target: { value: '新子目录' } })
  fireEvent.click(dialog.getByRole('button', { name: zh.save }))
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/folders', expect.objectContaining({
    body: JSON.stringify({ name: '新子目录', parentId: 'folder', scope: 'PRIVATE', confirmShare: false }),
  })))
})

it('uploads from a nested shared folder menu with that exact parent and visibility', async () => {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/config')) return Response.json({ maxFileBytes: 1000, allowedExtensions: ['.md'] })
    if (init?.method === 'POST') return Response.json({ items: [{ id: 'saved' }], failed: [] })
    return Response.json({ items: url.includes('view=shared') && !url.includes('parentId=')
      ? [{ id: 'shared-folder', name: '共享目录', kind: 'FOLDER', scope: 'ENTERPRISE', canManage: true }] : [], total: 1 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  fireEvent.click(left.getByRole('button', { name: zh.shared }))
  fireEvent.click(await left.findByRole('button', { name: `${zh.new} · 共享目录` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.upload }))
  const dialog = within(await screen.findByRole('dialog'))
  fireEvent.change(dialog.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['# 内容'], '资料.md')] } })
  fireEvent.click(dialog.getByRole('button', { name: zh.uploadStart }))
  await dialog.findByText(zh.uploadSuccess)
  const body = fetchImpl.mock.calls.find(([url, init]) => url.endsWith('/files') && init?.method === 'POST')?.[1]?.body as FormData
  expect(body.get('parentId')).toBe('shared-folder')
  expect(body.get('scope')).toBe('ENTERPRISE')
  expect(body.get('confirmShare')).toBe('true')
})

it('can return to recent files after a preview authorization failure removes the file heading', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?')
    ? Response.json({ message: '无权预览' }, { status: 403 })
    : Response.json({ items: [file('denied', '不可访问.md')], total: 1 }))
  const view = fixture(fetchImpl)
  const right = within(view.container.querySelector('main')!)
  fireEvent.click(within(view.container.querySelector('aside')!).getByRole('button', { name: zh.recent }))
  fireEvent.click(await right.findByRole('button', { name: '不可访问.md' }))
  await right.findByRole('alert')
  expect(right.queryByRole('heading', { name: '不可访问.md' })).toBeNull()
  fireEvent.click(right.getByRole('button', { name: zh.close }))
  await right.findByRole('button', { name: '不可访问.md' })
  expect(right.queryByRole('alert')).toBeNull()
})

it('offers folder-local creation on search results while the normal tree is hidden', async () => {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ id: 'created' })
    return Response.json({ items: url.includes('q=') ? [{ id: 'search-folder', name: '搜索目录', kind: 'FOLDER', scope: 'ENTERPRISE', canManage: true }] : [], total: 1 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  fireEvent.change(left.getByRole('searchbox'), { target: { value: '搜索' } })
  fireEvent.click(await left.findByRole('button', { name: `${zh.new} · 搜索目录` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.link }))
  const dialog = within(await screen.findByRole('dialog', { name: zh.link }))
  fireEvent.change(dialog.getByRole('textbox', { name: zh.name }), { target: { value: '资料链接' } })
  fireEvent.change(dialog.getByRole('textbox', { name: zh.url }), { target: { value: 'https://example.com' } })
  fireEvent.click(dialog.getByRole('button', { name: zh.save }))
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/links', expect.objectContaining({
    body: JSON.stringify({ name: '资料链接', parentId: 'search-folder', scope: 'ENTERPRISE', confirmShare: true, url: 'https://example.com' }),
  })))
})

it('uses independently collapsible shared and personal trees and keeps directories out of the right pane', async () => {
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.includes('parentId=team-folder')) return Response.json({ items: [file('team-child', '企业内.md')], total: 1 })
    if (url.includes('view=shared')) return Response.json({ items: [{ id: 'team-folder', kind: 'FOLDER', name: '企业目录', scope: 'ENTERPRISE' }], total: 1 })
    return Response.json({ items: [file('personal', '个人.md')], total: 1 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  const right = within(view.container.querySelector('main')!)
  await left.findByRole('button', { name: '个人.md' })
  expect(right.queryByRole('table')).toBeNull()
  expect(right.queryByRole('button', { name: '个人.md' })).toBeNull()
  fireEvent.click(left.getByRole('button', { name: zh.shared }))
  fireEvent.click(await left.findByRole('button', { name: '企业目录' }))
  await left.findByRole('button', { name: '企业内.md' })
  expect(fetchImpl.mock.calls.some(([url]) => url.includes('view=shared') && url.includes('parentId=team-folder'))).toBe(true)
  expect(fetchImpl.mock.calls.some(([url]) => url.includes('view=mine') && url.includes('parentId=team-folder'))).toBe(false)
  fireEvent.click(left.getByRole('button', { name: zh.shared }))
  expect(left.getByRole('button', { name: zh.shared }).getAttribute('aria-expanded')).toBe('false')
  expect(left.queryByRole('button', { name: '企业内.md' })).toBeNull()
  expect(left.getByRole('button', { name: zh.mine }).getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(left.getByRole('button', { name: zh.shared }))
  expect(left.getByRole('button', { name: '企业内.md' })).toBeTruthy()
})

it('shows a selected file in the fixed right pane without opening a preview dialog', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/download?')
    ? new Response('# 格式标题\n\n正文', { headers: { 'content-type': 'text/markdown' } })
    : url.includes('/preview?') ? Response.json({ name: '文档.md', text: '提取文字', versionId: 'v-doc' })
      : Response.json({ items: [file('doc', '文档.md')], total: 1 }))
  const view = fixture(fetchImpl)
  fireEvent.click(await within(view.container.querySelector('aside')!).findByRole('button', { name: '文档.md' }))
  const right = within(view.container.querySelector('main')!)
  await right.findByRole('heading', { name: '文档.md' })
  await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url.includes('/download?versionId=v-doc'))).toBe(true))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(right.queryByRole('table')).toBeNull()
})

it('discards a late failure after selecting another file and aborts the abandoned request', async () => {
  let rejectOld: (reason: Error) => void = () => {}
  let oldSignal: AbortSignal | undefined
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/nodes/a/download?')) {
      oldSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => { rejectOld = reject })
    }
    if (url.includes('/download?')) return new Response('第二份正文', { headers: { 'content-type': 'text/plain' } })
    if (url.includes('/preview?')) return Response.json({ name: url.includes('/nodes/a/') ? '旧.txt' : '新.txt' })
    return Response.json({ items: [file('a', '旧.txt'), file('b', '新.txt')], total: 2 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  fireEvent.click(await left.findByRole('button', { name: '旧.txt' }))
  await waitFor(() => expect(oldSignal).toBeDefined())
  fireEvent.click(left.getByRole('button', { name: '新.txt' }))
  await within(view.container.querySelector('main')!).findByRole('heading', { name: '新.txt' })
  expect(oldSignal?.aborted).toBe(true)
  rejectOld(new Error('过期失败'))
  await waitFor(() => expect(screen.queryByText('过期失败')).toBeNull())
})

it('uses immutable version format after renaming the displayed file without an extension', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/download?')
    ? new Response('# 真实文档结构', { headers: { 'content-type': 'application/octet-stream' } })
    : url.includes('/preview?') ? Response.json({ name: '改名后的制度', originalName: 'original.md', mimeType: 'text/markdown', versionId: 'v-doc' })
      : Response.json({ items: [file('doc', '改名后的制度')], total: 1 }))
  const view = fixture(fetchImpl)
  fireEvent.click(await within(view.container.querySelector('aside')!).findByRole('button', { name: '改名后的制度' }))
  const right = within(view.container.querySelector('main')!)
  await right.findByRole('heading', { name: '真实文档结构' })
  expect(right.getByRole('heading', { name: '改名后的制度' })).toBeTruthy()
})

it('uses the selected historical version parsing state for AI actions', async () => {
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith('/versions')) return Response.json([{ id: 'v-old', versionNo: 1, parseStatus: 'FAILED' }])
    if (url.includes('/download?')) return new Response('历史原文', { headers: { 'content-type': 'text/plain' } })
    if (url.includes('/preview?')) return Response.json({ name: '文档.txt', originalName: 'history.txt', versionId: 'v-old', versionNo: 1, parseStatus: 'FAILED', parseReason: '历史解析失败' })
    return Response.json({ items: [file('doc', '文档.txt')], total: 1 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  fireEvent.click(await left.findByRole('button', { name: `${zh.more} · 文档.txt` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.versions }))
  fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: zh.preview }))
  const right = within(view.container.querySelector('main')!)
  await right.findByText('历史原文')
  fireEvent.click(right.getByRole('button', { name: `${zh.more} · 文档.txt` }))
  expect((await screen.findByRole('menuitem', { name: zh.useForChat }) as HTMLButtonElement).disabled).toBe(true)
})

it('uses the active tree category when opening a file from its menu while trash is selected', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/download?')
    ? new Response('原文', { headers: { 'content-type': 'text/plain' } })
    : url.includes('/preview?') ? Response.json({ name: '活动资料.txt', originalName: 'active.txt' })
      : Response.json({ items: url.includes('view=trash') ? [] : [{ ...file('doc', '活动资料.txt'), canManage: true }], total: url.includes('view=trash') ? 0 : 1 }))
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  await left.findByRole('button', { name: '活动资料.txt' })
  fireEvent.click(left.getByRole('button', { name: zh.trash }))
  fireEvent.click(left.getByRole('button', { name: `${zh.more} · 活动资料.txt` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.preview }))
  const right = within(view.container.querySelector('main')!)
  await right.findByText('原文')
  fireEvent.click(right.getByRole('button', { name: `${zh.more} · 活动资料.txt` }))
  await screen.findByRole('menuitem', { name: zh.rename })
  expect(screen.queryByRole('menuitem', { name: zh.purge })).toBeNull()
})

it('cancels a pending historical reference when a folder is selected', async () => {
  let pendingSignal: AbortSignal | undefined
  const request = { nodeId: 'ref', versionId: 'v-ref' }
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/open') || url.includes('/nodes/ref/preview?')) {
      pendingSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }
    return Response.json({ items: [{ id: 'folder', name: '新目录', kind: 'FOLDER' }], total: 1 })
  })
  const view = render(<LibraryPanel {...standard} renderFactorySlot={renderPreviewFactory} t={t as never} origin=""
    fetchImpl={fetchImpl} useNavigationWidth={noNavigation} setNavigationElement={() => {}} useSourceRequest={select => select(request)} clearSourceRequest={() => {}} onUse={vi.fn()} />)
  await waitFor(() => expect(pendingSignal).toBeDefined())
  fireEvent.click(await within(view.container.querySelector('aside')!).findByRole('button', { name: '新目录' }))
  expect(pendingSignal?.aborted).toBe(true)
  expect(within(view.container.querySelector('main')!).queryByRole('status')).toBeNull()
})

it('keeps historical actions bound to the authorized version when Office conversion fails', async () => {
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith('/versions')) return Response.json([{ id: 'v-old', versionNo: 1, parseStatus: 'FAILED' }])
    if (url.includes('/render?')) return Response.json({ message: '转换服务暂不可用' }, { status: 503 })
    if (url.includes('/preview?')) return Response.json({ name: '文档.docx', originalName: 'history.docx', versionId: 'v-old', versionNo: 1, parseStatus: 'FAILED' })
    return Response.json({ items: [file('doc', '文档.docx')], total: 1 })
  })
  const view = fixture(fetchImpl)
  fireEvent.click(await within(view.container.querySelector('aside')!).findByRole('button', { name: `${zh.more} · 文档.docx` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.versions }))
  fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: zh.preview }))
  const right = within(view.container.querySelector('main')!)
  await right.findByText(/转换服务暂不可用/)
  fireEvent.click(right.getByRole('button', { name: `${zh.more} · 文档.docx` }))
  expect((await screen.findByRole('menuitem', { name: zh.useForChat }) as HTMLButtonElement).disabled).toBe(true)
  const clicked: string[] = []
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.href) })
  fireEvent.click(screen.getByRole('menuitem', { name: zh.download }))
  expect(clicked[0]).toContain('versionId=v-old')
  click.mockRestore()
})

it('uses personal-file actions after opening a historical version through a visible tree while in trash', async () => {
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith('/versions')) return Response.json([{ id: 'v-old', versionNo: 1, parseStatus: 'READY' }])
    if (url.includes('/download?')) return new Response('历史版本原文', { headers: { 'content-type': 'text/plain' } })
    if (url.includes('/preview?')) return Response.json({ name: '文档.txt', originalName: 'history.txt', versionId: 'v-old', versionNo: 1, parseStatus: 'READY' })
    return Response.json({ items: url.includes('view=trash') ? [] : [{ ...file('doc', '文档.txt'), canManage: true }], total: 1 })
  })
  const view = fixture(fetchImpl)
  const left = within(view.container.querySelector('aside')!)
  await left.findByRole('button', { name: '文档.txt' })
  fireEvent.click(left.getByRole('button', { name: zh.trash }))
  fireEvent.click(left.getByRole('button', { name: `${zh.more} · 文档.txt` }))
  fireEvent.click(await screen.findByRole('menuitem', { name: zh.versions }))
  fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: zh.preview }))
  const right = within(view.container.querySelector('main')!)
  await right.findByText('历史版本原文')
  fireEvent.click(right.getByRole('button', { name: `${zh.more} · 文档.txt` }))
  await screen.findByRole('menuitem', { name: zh.rename })
  expect(screen.queryByRole('menuitem', { name: zh.purge })).toBeNull()
})
