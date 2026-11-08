// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryIcon } from '../src/client/LibraryIcon.tsx'
import { LibraryPanel } from '../src/client/LibraryPanel.tsx'
import type { LibraryChoice } from '../src/client/selection.ts'
import { zh, type LibraryKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = (key: LibraryKey) => zh[key]

describe('library icon', () => {
  it('draws the sidebar glyph', () => {
    const view = render(<LibraryIcon size={16} active={false} />)
    expect(view.container.querySelector('svg')).toBeTruthy()
  })
})

describe('library panel', () => {
  it('clears the previous classification on a failed scope change and exposes no stale titles', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('view=shared') ? new Response('no', { status: 403 }) : Response.json({ items: [
      { id: 'n1', name: '制度.md', kind: 'FILE', currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY' } },
    ] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await screen.findByText('制度.md')
    fireEvent.click(screen.getByRole('button', { name: zh.shared }))
    await screen.findByText(zh.loadError, { exact: false })
    expect(screen.queryByText('制度.md')).toBeNull()
  })

  it('hides native file pickers and shows a centered, actionable empty state without persistent upload progress', async () => {
    const view = render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onUse={vi.fn()} />)
    await screen.findByText(zh.emptyHint)
    expect(view.container.querySelectorAll('input[type="file"][hidden]')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: zh.upload })).toHaveLength(2)
    expect(screen.queryByText(/0%/)).toBeNull()
    expect(screen.queryByRole('region', { name: zh.selected })).toBeNull()
    expect(screen.getByRole('button', { name: zh.mine }).getAttribute('aria-current')).toBe('page')
  })

  it('renders real size/date/status and attaches selected files only after an explicit draft action', async () => {
    const onUseMany = vi.fn(async (_items: readonly LibraryChoice[]) => {})
    const fetchImpl = vi.fn(async () => Response.json({ items: [
      { id: 'n1', name: '制度.md', kind: 'FILE', canManage: true, scope: 'PRIVATE', updatedAt: '2026-11-08T04:00:00.000Z', currentVersion: { id: 'v7', versionNo: 7, parseStatus: 'READY', sizeBytes: 2048 } },
      { id: 'zip', name: '归档.zip', kind: 'FILE', currentVersion: { id: 'vz', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: 'ZIP仅可下载' } },
    ] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} onUseMany={onUseMany} />)
    await screen.findByText('制度.md')
    expect(screen.getByText('2.0KB')).toBeTruthy()
    expect(screen.getByText(zh.statusReady, { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('ZIP仅可下载')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: `${zh.select} 归档.zip` }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: `${zh.select} 制度.md` }))
    expect(onUseMany).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `${zh.selected} (1)` }))
    await waitFor(() => expect(onUseMany).toHaveBeenCalledOnce())
    expect(onUseMany.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'n1', versionId: 'v7', versionNo: 7 })]))
    await waitFor(() => expect(screen.queryByRole('button', { name: `${zh.selected} (1)` })).toBeNull())
  })

  it('uses the existing mmp modal for previews and keeps a fixed version in the request', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?') ? Response.json({ text: '授权摘录', chunks: [], locator: 'paragraph:1' }) : Response.json({ items: [
      { id: 'n1', name: '单段.md', kind: 'FILE', currentVersion: { id: 'v9', versionNo: 9, parseStatus: 'READY' } },
    ] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '单段.md' }))
    await screen.findByRole('dialog', { name: '单段.md' })
    expect(screen.getByText('授权摘录')).toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/n1/preview?versionId=v9', expect.objectContaining({ credentials: 'include' }))
    fireEvent.click(screen.getAllByRole('button', { name: zh.close }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opens New folder through the secondary menu and saves with the existing mmp modal', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? Response.json({ id: 'folder1' }) : Response.json({ items: [] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await screen.findByText(zh.empty)
    fireEvent.click(screen.getByRole('button', { name: zh.new }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.folder }))
    await screen.findByRole('dialog', { name: zh.folder })
    fireEvent.change(screen.getByRole('textbox', { name: zh.name }), { target: { value: '验收目录' } })
    fireEvent.click(screen.getByRole('button', { name: zh.save }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/folders', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '验收目录', parentId: null }), credentials: 'include' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the real parsing-failure reason visible in the preview modal', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?') ? Response.json({ text: null, parseReason: '无法提取文字，请重试解析' }) : Response.json({ items: [
      { id: 'failed', name: '失败.pdf', kind: 'FILE', currentVersion: { id: 'vf', versionNo: 1, parseStatus: 'FAILED' } },
    ] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '失败.pdf' }))
    await screen.findByRole('dialog', { name: '失败.pdf' })
    expect(screen.getByText('无法提取文字，请重试解析')).toBeTruthy()
  })

  it('rechecks link preview authorization instead of displaying a cached private URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?') ? Response.json({ message: '授权已撤销' }, { status: 403 }) : Response.json({ items: [
      { id: 'link1', name: '参考链接', kind: 'LINK', linkUrl: 'https://example.test/reference' },
    ] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '参考链接' }))
    await screen.findByText('授权已撤销')
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/link1/preview?versionId=', expect.objectContaining({ credentials: 'include' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('https://example.test/reference')).toBeNull()
  })

  it('shows an empty library and a search miss', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [] }))
    render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(zh.empty)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(zh.searchPlaceholder), { target: { value: '没有' } })
    await waitFor(() => expect(screen.getByText(zh.noResults)).toBeTruthy())
  })

  it('ignores a response that arrives after the view is gone', async () => {
    let release: (value: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    const view = render(<LibraryPanel useSourceRequest={() => null} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    view.unmount()
    release(Response.json({ items: [] }))
    await Promise.resolve()
  })
})

