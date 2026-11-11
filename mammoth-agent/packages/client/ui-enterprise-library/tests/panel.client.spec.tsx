// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { useSyncExternalStore } from 'react'
import { createLibraryNavigationMeasurement } from '../src/client/useLibrarySidebarResize.ts'
import { renderPreviewFactory } from './preview-factory.fixture.tsx'
import panelCss from '../src/client/LibraryPanel.module.css'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook } from '@mammoth-ai/mmp-client-test-runtime'
import type { GlobalStandardProps } from '@mammoth-ai/mmp-client-ui-slots'
import { LibraryTree } from '../src/client/LibraryTree.tsx'
import { LibraryIcon } from '../src/client/LibraryIcon.tsx'
import { LibraryPanel as RawLibraryPanel, type LibraryPanelProps } from '../src/client/LibraryPanel.tsx'
import type { LibraryChoice } from '../src/client/selection.ts'
import { zh, type LibraryKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = (key: LibraryKey) => zh[key]
const listing = () => within(document.querySelector('aside [data-group="recent"][data-active="true"]') ? document.querySelector('main')! : document.querySelector('aside [data-active="true"]')!)
const preview = () => within(document.querySelector('main')!)
const unused = (): never => { throw new Error('unused framework seat') }
const standard: GlobalStandardProps = {
  usePanelInfo: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
  useResource: unused, useWorkspaces: unused, ...allowAllAccess, useContextMenu: contextMenuHook(),
}
const noSource: LibraryPanelProps['useSourceRequest'] = select => select(null)
const noNavigation: LibraryPanelProps['useNavigationWidth'] = select => select(null)
const setNoNavigation = () => {}
type PanelFixtureProps = Omit<LibraryPanelProps, keyof GlobalStandardProps | 'useSourceRequest' | 'useNavigationWidth' | 'setNavigationElement' | 'renderFactorySlot'> & Partial<Pick<LibraryPanelProps, 'useSourceRequest' | 'useNavigationWidth' | 'setNavigationElement'>>
function Panel({ useSourceRequest = noSource, useNavigationWidth = noNavigation, setNavigationElement = setNoNavigation, ...props }: PanelFixtureProps) {
  return <RawLibraryPanel {...standard} renderFactorySlot={renderPreviewFactory} useSourceRequest={useSourceRequest} useNavigationWidth={useNavigationWidth} setNavigationElement={setNavigationElement} {...props} />
}

describe('library directory resize', () => {
  const storageKey = 'mmp.library.navigation.width'
  const openPanel = (geometry?: ReturnType<typeof createLibraryNavigationMeasurement>) => render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onUse={vi.fn()}
    {...geometry ? { setNavigationElement: geometry.attach, useNavigationWidth: select => useSyncExternalStore(geometry.source.subscribe, () => select(geometry.source.getSnapshot())) } : {}} />)
  beforeEach(() => { localStorage.removeItem(storageKey) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem(storageKey) })

  it('uses the visible directory width for keyboard changes and accessibility in a constrained layout', async () => {
    localStorage.setItem(storageKey, '480')
    let visible = 340
    let resize = () => {}
    class Observer implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) { resize = () => { callback([], this) } }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', Observer)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return DOMRect.fromRect({ width: this.tagName === 'ASIDE' ? visible : 660, height: 900 })
    })
    openPanel(createLibraryNavigationMeasurement())
    await screen.findByText(zh.selectPreviewHint)
    const separator = screen.getByRole('separator')
    expect(separator.getAttribute('aria-valuenow')).toBe('340')
    expect(localStorage.getItem(storageKey)).toBe('480')
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator.closest('section')?.style.getPropertyValue('--library-navigation-width')).toBe('324px')
    visible = 324
    act(resize)
    expect(separator.getAttribute('aria-valuenow')).toBe('324')
  })

  it('adjusts the real directory with the keyboard and restores its width after remount', async () => {
    const first = openPanel()
    await screen.findByText(zh.selectPreviewHint)
    const separator = screen.getByRole('separator')
    expect(separator.getAttribute('aria-valuenow')).toBe('280')
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator.getAttribute('aria-valuenow')).toBe('296')
    expect(separator.closest('section')?.style.getPropertyValue('--library-navigation-width')).toBe('296px')
    fireEvent.keyDown(separator, { key: 'End' })
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator.getAttribute('aria-valuenow')).toBe('480')
    fireEvent.keyDown(separator, { key: 'Home' })
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator.getAttribute('aria-valuenow')).toBe('200')
    first.unmount()
    openPanel()
    await screen.findByText(zh.selectPreviewHint)
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('200')
  })

  it('captures dragging, clamps both ends without collapse and restores document styles', async () => {
    const view = openPanel()
    await screen.findByText(zh.selectPreviewHint)
    const separator = screen.getByRole('separator')
    const captured = new Set<number>()
    Object.assign(separator, {
      setPointerCapture: (id: number) => { captured.add(id) },
      hasPointerCapture: (id: number) => captured.has(id),
      releasePointerCapture: (id: number) => { captured.delete(id) },
    })
    const pointer = (type: string, clientX: number, pointerId = 1, button = 0) => fireEvent(separator, new PointerEvent(type, { bubbles: true, pointerId, button, clientX }))
    document.body.style.userSelect = 'text'
    document.body.style.cursor = 'auto'
    pointer('pointerdown', 280, 1, 2)
    expect(captured.size).toBe(0)
    pointer('pointerdown', 280)
    expect(captured.has(1)).toBe(true)
    expect(document.body.style.userSelect).toBe('none')
    pointer('pointermove', 800, 2)
    expect(separator.getAttribute('aria-valuenow')).toBe('280')
    pointer('pointermove', 800)
    expect(separator.getAttribute('aria-valuenow')).toBe('480')
    pointer('pointermove', 0)
    expect(separator.getAttribute('aria-valuenow')).toBe('200')
    pointer('pointerup', 350)
    expect(separator.getAttribute('aria-valuenow')).toBe('350')
    expect(localStorage.getItem(storageKey)).toBe('350')
    expect(captured.size).toBe(0)
    expect(document.body.style.userSelect).toBe('text')
    expect(document.body.style.cursor).toBe('auto')
    pointer('pointerdown', 350)
    pointer('pointermove', 400)
    pointer('pointercancel', 400)
    expect(captured.size).toBe(0)
    expect(document.body.style.userSelect).toBe('text')
    pointer('pointerdown', 400)
    fireEvent(separator, new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
    expect(document.body.style.userSelect).toBe('text')
    pointer('pointerdown', 400)
    view.unmount()
    expect(captured.size).toBe(0)
    expect(document.body.style.userSelect).toBe('text')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  })

  it.each(['not-a-number', 'Infinity', '', '  '])('ignores invalid stored width %j', async value => {
    localStorage.setItem(storageKey, value)
    openPanel()
    await screen.findByText(zh.selectPreviewHint)
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('280')
  })

  it('keeps resizing usable when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    openPanel()
    await screen.findByText(zh.selectPreviewHint)
    const separator = screen.getByRole('separator')
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator.getAttribute('aria-valuenow')).toBe('264')
  })
})

describe('library icon', () => {
  it('draws the sidebar glyph', () => {
    const view = render(<LibraryIcon size={16} active={false} {...standard} />)
    expect(view.container.querySelector('svg')).toBeTruthy()
  })
})

describe('library panel', () => {
  it('clears the previous classification on a failed scope change and exposes no stale titles', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('view=shared') ? new Response('no', { status: 403 }) : Response.json({ items: [
      { id: 'n1', name: '制度.md', kind: 'FILE', currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY' } },
    ] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await listing().findByText('制度.md')
    fireEvent.click(screen.getByRole('button', { name: zh.shared }))
    await screen.findByText(zh.loadError, { exact: false })
    expect(listing().queryByText('制度.md')).toBeNull()
  })

  it('hides native file pickers and shows a centered, actionable empty state without persistent upload progress', async () => {
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onUse={vi.fn()} />)
    await screen.findByText(zh.selectPreviewHint)
    expect(view.container.querySelectorAll('input[type="file"][hidden]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: zh.upload })).toBeNull()
    expect(screen.getByRole('button', { name: `${zh.new} · ${zh.mine}` })).toBeTruthy()
    expect(screen.queryByText(/0%/)).toBeNull()
    expect(screen.queryByRole('region', { name: zh.selected })).toBeNull()
    expect(screen.getByRole('button', { name: zh.mine }).getAttribute('aria-current')).toBe('page')
  })

  it('uses file menu actions to attach ready files without browsing checkboxes', async () => {
    const onUseMany = vi.fn(async (_items: readonly LibraryChoice[]) => {})
    const fetchImpl = vi.fn(async () => Response.json({ items: [
      { id: 'n1', name: '制度.md', kind: 'FILE', canManage: true, scope: 'PRIVATE', updatedAt: '2026-11-08T04:00:00.000Z', currentVersion: { id: 'v7', versionNo: 7, parseStatus: 'READY', sizeBytes: 2048 } },
      { id: 'zip', name: '归档.zip', kind: 'FILE', currentVersion: { id: 'vz', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: 'ZIP仅可下载' } },
    ] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} onUseMany={onUseMany} />)
    await listing().findByText('制度.md')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(onUseMany).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `${zh.more} · 归档.zip` }))
    expect((await screen.findByRole('menuitem', { name: zh.useForChat }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: `${zh.more} · 制度.md` }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.useForChat }))
    await waitFor(() => expect(onUseMany).toHaveBeenCalledOnce())
    expect(onUseMany.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'n1', versionId: 'v7', versionNo: 7 })]))
  })

  it('uses the fixed preview pane and keeps a fixed version in the original-file request', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/download?') ? new Response('授权原文', { headers: { 'content-type': 'text/markdown' } }) : url.includes('/preview?') ? Response.json({ text: '授权摘录', chunks: [], locator: 'paragraph:1' }) : Response.json({ items: [
      { id: 'n1', name: '单段.md', kind: 'FILE', currentVersion: { id: 'v9', versionNo: 9, parseStatus: 'READY' } },
    ] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await listing().findByRole('button', { name: '单段.md' }))
    await preview().findByRole('heading', { name: '单段.md' })
    expect(await preview().findByText('授权原文')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/n1/preview?versionId=v9', expect.objectContaining({ credentials: 'include' }))
    fireEvent.click(screen.getAllByRole('button', { name: zh.close }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('saves the prominent New action in the open folder, and in My files from Recent', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ id: 'made' })
      if (url.includes('parentId=folder-1') || url.includes('view=recent')) return Response.json({ items: [], total: 0 })
      return Response.json({ items: [{ id: 'folder-1', name: '合同', kind: 'FOLDER', scope: 'PRIVATE', canManage: true }], total: 1 })
    })
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await listing().findByRole('button', { name: '合同' }))
    fireEvent.click(screen.getByRole('button', { name: zh.new }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.folder }))
    fireEvent.change(screen.getByRole('textbox', { name: zh.name }), { target: { value: '补充' } })
    fireEvent.click(screen.getByRole('button', { name: zh.save }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/folders', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '补充', parentId: 'folder-1', scope: 'PRIVATE', confirmShare: false }) })))
    fireEvent.click(screen.getByRole('button', { name: zh.recent }))
    fireEvent.click(screen.getByRole('button', { name: zh.new }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.folder }))
    const dialog = await screen.findByRole('dialog', { name: zh.folder })
    expect(within(dialog).getByText(zh.privateSaveHint)).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: zh.name }), { target: { value: '最近新建' } })
    fireEvent.click(within(dialog).getByRole('button', { name: zh.save }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/folders', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '最近新建', parentId: null, scope: 'PRIVATE', confirmShare: false }) })))
  })

  it('opens New folder through the secondary menu and saves with the existing mmp modal', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? Response.json({ id: 'folder1' }) : Response.json({ items: [] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await listing().findByText(zh.empty)
    fireEvent.click(screen.getByRole('button', { name: `${zh.new} · ${zh.mine}` }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.folder }))
    await screen.findByRole('dialog', { name: zh.folder })
    fireEvent.change(screen.getByRole('textbox', { name: zh.name }), { target: { value: '验收目录' } })
    fireEvent.click(screen.getByRole('button', { name: zh.save }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/folders', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '验收目录', parentId: null, scope: 'PRIVATE', confirmShare: false }), credentials: 'include' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('creates a folder directly in shared and displays its visibility before saving', async () => {
    let saved = false
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { saved = true; return Response.json({ id: 'shared-folder', scope: 'ENTERPRISE' }) }
      return Response.json({ items: saved && url.includes('view=shared') ? [{ id: 'shared-folder', name: '共享新目录', kind: 'FOLDER', scope: 'ENTERPRISE' }] : [] })
    })
    render(<Panel useSourceRequest={noSource} t={t as never} clearSourceRequest={() => {}} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await listing().findByText(zh.empty)
    fireEvent.click(screen.getByRole('button', { name: zh.shared }))
    await listing().findByText(zh.empty)
    fireEvent.click(screen.getByRole('button', { name: `${zh.new} · ${zh.shared}` }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.folder }))
    const dialog = await screen.findByRole('dialog', { name: zh.folder })
    expect(within(dialog).getByText(zh.sharedSaveHint)).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: zh.name }), { target: { value: '共享新目录' } })
    fireEvent.click(within(dialog).getByRole('button', { name: zh.save }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/folders', expect.objectContaining({ body: JSON.stringify({ name: '共享新目录', parentId: null, scope: 'ENTERPRISE', confirmShare: true }) })))
    await listing().findByRole('button', { name: '共享新目录' })
    expect(screen.getByRole('button', { name: zh.shared }).getAttribute('aria-current')).toBe('page')
  })

  it('confirms the server subtree count and sends its revision when sharing a folder', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const treeRevision = 'a'.repeat(64)
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/scope-impact')) return Response.json({ total: 4, changed: 4, treeRevision })
      if (init?.method === 'POST') return Response.json({ id: 'folder', scope: 'ENTERPRISE' })
      return Response.json({ items: [{ id: 'folder', name: '已有目录', kind: 'FOLDER', scope: 'PRIVATE', canManage: true }] })
    })
    render(<Panel useSourceRequest={noSource} t={t as never} clearSourceRequest={() => {}} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await listing().findByRole('button', { name: '已有目录' })
    fireEvent.click(listing().getByRole('button', { name: `${zh.more} · 已有目录` }))
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.share }))
    const dialog = await screen.findByRole('dialog', { name: zh.share })
    expect(within(dialog).getByText(zh.confirmShareTree.replace('{count}', '4'))).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: zh.share }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/folder/scope', expect.objectContaining({ body: JSON.stringify({ scope: 'ENTERPRISE', confirmShare: true, confirmUnshare: false, expectedTreeRevision: treeRevision }) })))
    confirm.mockRestore()
  })

  it('leaves a failed file out of the library list', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [
      { id: 'failed', name: '失败.txt', kind: 'FILE', currentVersion: { id: 'vf', versionNo: 1, parseStatus: 'FAILED' } },
      { id: 'ok', name: '可用.md', kind: 'FILE', currentVersion: { id: 'vo', versionNo: 1, parseStatus: 'READY' } },
    ] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await listing().findByRole('button', { name: '可用.md' })
    expect(listing().queryByRole('button', { name: '失败.txt' })).toBeNull()
    expect(screen.queryByText(zh.statusFailed)).toBeNull()
  })

  it('keeps the parse reason in the preview and off the recent list', async () => {
    const reason = '仅保存：支持预览或下载'
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?')
      ? Response.json({ text: null, parseReason: reason, previewKind: 'image' })
      : Response.json({ items: [{ id: 'pic', name: '333.jpg', kind: 'FILE', currentVersion: { id: 'vp', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: reason } }] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: zh.recent }))
    await listing().findByRole('button', { name: '333.jpg' })
    expect(screen.queryByText(reason)).toBeNull()
    fireEvent.click(listing().getByRole('button', { name: '333.jpg' }))
    expect(await preview().findByText(reason)).toBeTruthy()
  })

  it('rechecks link preview authorization instead of displaying a cached private URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?') ? Response.json({ message: '授权已撤销' }, { status: 403 }) : Response.json({ items: [
      { id: 'link1', name: '参考链接', kind: 'LINK', linkUrl: 'https://example.test/reference' },
    ] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await listing().findByRole('button', { name: '参考链接' }))
    await screen.findByText('授权已撤销')
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/link1/preview?versionId=', expect.objectContaining({ credentials: 'include' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('https://example.test/reference')).toBeNull()
  })

  it('drops the previous preview title and text when a manual preview fails', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/download?')) return new Response('第一个文件正文', { headers: { 'content-type': 'text/markdown' } })
      if (url.includes('/preview?')) {
        if (url.includes('nodes/b/')) return Response.json({ message: '授权已撤销' }, { status: 403 })
        return Response.json({ text: '第一个文件正文', locator: 'paragraph:1' })
      }
      return Response.json({ items: [
        { id: 'a', name: '甲.md', kind: 'FILE', currentVersion: { id: 'va', versionNo: 1, parseStatus: 'READY' } },
        { id: 'b', name: '乙.md', kind: 'FILE', currentVersion: { id: 'vb', versionNo: 1, parseStatus: 'READY' } },
      ] })
    })
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await listing().findByRole('button', { name: '甲.md' }))
    await preview().findByText('第一个文件正文')
    expect(screen.getByText('第一个文件正文')).toBeTruthy()
    fireEvent.click(listing().getByRole('button', { name: '乙.md' }))
    await screen.findByText('授权已撤销')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('第一个文件正文')).toBeNull()
    expect(listing().queryByText('甲.md')).toBeTruthy()
  })

  it('opens the exact original version from a historical reference instead of displaying its truncated AI excerpt', async () => {
    const request = { nodeId: 'n1', versionId: 'v9' }
    const selectSource = <T,>(select: (value: typeof request | null) => T): T => select(request)
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?')
      ? Response.json({
        name: '制度.md', versionId: 'v9', locator: 'paragraph:1', quote: '部分摘录',
        truncated: true, truncationNote: '仅使用部分摘录，未读取全文。',
      })
      : url.includes('/download?') ? new Response('# 原始完整版本', { headers: { 'content-type': 'text/markdown' } }) : Response.json({ items: [] }))
    render(<Panel useSourceRequest={selectSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await preview().findByRole('heading', { name: '原始完整版本' })
    expect(screen.queryByText('部分摘录')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/n1/download?versionId=v9', expect.objectContaining({ credentials: 'include' }))
    expect(screen.queryByText(zh.truncatedExcerpt)).toBeNull()
  })

  it('shows an empty library and a search miss', async () => {
    const fetchImpl = vi.fn(async (_url: string) => Response.json({ items: [] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await waitFor(() => expect(listing().getByText(zh.empty)).toBeTruthy())
    expect(screen.queryByRole('heading', { name: zh.panel })).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.searchPlaceholder }))
    const dialog = await screen.findByRole('dialog', { name: zh.finderTitle })
    fireEvent.change(within(dialog).getByRole('searchbox', { name: zh.finderPlaceholder }), { target: { value: '没有' } })
    await waitFor(() => expect(within(dialog).getByText(zh.noResults)).toBeTruthy())
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('catalog=1') && String(url).includes('pageSize=10') && String(url).includes('q='))).toBe(true)
  })

  it('sends one catalog request for the finished phrase after typing pauses', async () => {
    const fetchImpl = vi.fn(async (_url: string) => Response.json({ items: [], total: 0 }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: zh.searchPlaceholder }))
    const dialog = await screen.findByRole('dialog', { name: zh.finderTitle })
    const box = within(dialog).getByRole('searchbox', { name: zh.finderPlaceholder })
    fireEvent.change(box, { target: { value: '泡' } })
    fireEvent.change(box, { target: { value: '泡泡' } })
    fireEvent.change(box, { target: { value: '泡泡玛特' } })
    await waitFor(() => {
      const queries = fetchImpl.mock.calls.map(([url]) => new URL(String(url), 'http://ground.test').searchParams.get('q')).filter((q): q is string => q !== null)
      expect(queries).toEqual(['泡泡玛特'])
    })
  })

  it('locates a nested file in my tree and a shared file in the enterprise tree', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('catalog=1') && url.includes('q=')) return Response.json({ items: [], total: 0 })
      if (url.includes('catalog=1')) return Response.json({ items: [
        { id: 'doc', name: '文档1.docx', kind: 'FILE', location: 'mine', parentPath: [{ id: 'apple', name: '苹果' }], currentVersion: { id: 'v', versionNo: 1, parseStatus: 'READY' } },
        { id: 'fold', name: '只是目录', kind: 'FOLDER' },
        { id: 'shared-file', name: '同事资料.md', kind: 'FILE', location: 'shared', parentPath: [], currentVersion: { id: 'vs', versionNo: 1, parseStatus: 'READY' } },
      ], total: 2 })
      if (url.includes('parentId=apple')) return Response.json({ items: [{ id: 'doc', name: '文档1.docx', kind: 'FILE', currentVersion: { id: 'v', versionNo: 1, parseStatus: 'READY' } }], total: 1 })
      if (url.includes('view=mine')) return Response.json({ items: [{ id: 'apple', name: '苹果', kind: 'FOLDER' }], total: 1 })
      if (url.includes('view=shared')) return Response.json({ items: [{ id: 'shared-file', name: '同事资料.md', kind: 'FILE', currentVersion: { id: 'vs', versionNo: 1, parseStatus: 'READY' } }], total: 1 })
      return Response.json({ items: [], total: 0 })
    })
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await within(document.querySelector('aside')!).findByRole('button', { name: '苹果' })
    fireEvent.click(screen.getByRole('button', { name: zh.searchPlaceholder }))
    const dialog = await screen.findByRole('dialog', { name: zh.finderTitle })
    expect(within(dialog).queryByRole('button', { name: /只是目录/ })).toBeNull()
    expect(within(dialog).getByText('我的资料 / 苹果')).toBeTruthy()
    expect(within(dialog).queryByText(zh.finderEnd)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: /文档1/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const mine = document.querySelector('[data-group="mine"]')!
    expect(mine.getAttribute('data-active')).toBe('true')
    expect(within(mine as HTMLElement).getByRole('button', { name: '文档1.docx' }).getAttribute('aria-current')).toBe('page')
    expect(preview().queryByRole('heading', { name: '文档1.docx' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.searchPlaceholder }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh.finderTitle })).getByRole('button', { name: /同事资料/ }))
    await waitFor(() => {
      const shared = document.querySelector('[data-group="shared"]')!
      expect(shared.getAttribute('data-active')).toBe('true')
      expect(within(shared as HTMLElement).getByRole('button', { name: '同事资料.md' }).getAttribute('aria-current')).toBe('page')
    })
  })

  it('loads the next page of documents when the finder reaches the bottom', async () => {
    const page = (start: number) => Array.from({ length: start === 0 ? 10 : 1 }, (_, index) => {
      const n = start + index
      return { id: `n${n}`, name: `笔记${n}.md`, kind: 'FILE', location: 'mine', parentPath: [], currentVersion: { id: `v${n}`, versionNo: 1, parseStatus: 'READY' } }
    })
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('catalog=1') && url.includes('page=2')) return Response.json({ items: page(10), total: 11 })
      if (url.includes('catalog=1')) return Response.json({ items: page(0), total: 11 })
      return Response.json({ items: [], total: 0 })
    })
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: zh.searchPlaceholder }))
    const dialog = await screen.findByRole('dialog', { name: zh.finderTitle })
    const first = await within(dialog).findByRole('button', { name: /笔记0/ })
    expect(within(dialog).queryByRole('button', { name: /笔记10/ })).toBeNull()
    fireEvent.scroll(first.parentElement!)
    await within(dialog).findByRole('button', { name: /笔记10/ })
    expect(within(dialog).getByText(zh.finderEnd)).toBeTruthy()
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes('catalog=1') && String(url).includes('page=2'))).toHaveLength(1)
  })

  it('ignores a response that arrives after the view is gone', async () => {
    let release: (value: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    view.unmount()
    release(Response.json({ items: [] }))
    await Promise.resolve()
  })
})


describe('t188 lazy tree, media and upload feedback', () => {
  it('loads branches only on expansion, keeps root files and paginates without dropping them', async () => {
    const file = { id: 'root-file', name: '根文件.md', kind: 'FILE', currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY' } };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/config')) return Response.json({ maxFileBytes: 20 * 1024 * 1024, allowedExtensions: ['.md'] });
      if (url.includes('parentId=f1')) return Response.json({ items: [{ ...file, id: 'child', name: '子文件.md' }], total: 1 });
      if (url.includes('page=2')) return Response.json({ items: [{ ...file, id: 'later', name: '后页文件.md' }], total: 3 });
      return Response.json({ items: [{ id: 'f1', name: '项目文件夹', kind: 'FOLDER' }, file], total: 3 });
    });
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    await listing().findByText('根文件.md');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('parentId=f1'))).toBe(false);
    expect(screen.queryByRole('button', { name: zh.toggleTree })).toBeNull();
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: `${zh.toggleTree} · 项目文件夹` }));
    await nav.findByRole('button', { name: '子文件.md' });
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('parentId=f1'))).toBe(true);
    fireEvent.click(nav.getByRole('button', { name: zh.loadMore }));
    await nav.findByRole('button', { name: '后页文件.md' });
    expect(nav.getByRole('button', { name: '根文件.md' })).toBeTruthy();
    fireEvent.click(nav.getByRole('button', { name: '项目文件夹' }));
    await listing().findByRole('button', { name: '子文件.md' });
    expect(view.container.textContent).not.toContain('本地文件在明确保存之前不会进入资料库');
    expect(view.container.textContent).not.toContain(zh.saveTo);
  });
  it('stops repeated ancestor ids rather than recursively fetching a corrupt cycle', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [{ id: 'loop', kind: 'FOLDER', name: '循环目录' }], total: 1 }));
    render(<LibraryTree origin="" fetchImpl={fetchImpl} t={t as never} path={[{ id: 'loop', name: '父目录' }]} onFolder={vi.fn()} onFile={vi.fn()} />);
    const name = await screen.findByRole('button', { name: '循环目录' });
    expect((name as HTMLButtonElement).disabled).toBe(true); expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('renders protected media with no AI-ready claim and releases its non-public blob on close', async () => {
    const create = vi.fn(() => 'blob:private-fixture'), revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const fetchImpl = vi.fn(async (url: string) => url.includes('/download?') ? new Response('fixture bytes', { headers: { 'content-type': 'image/png' } }) : url.includes('/preview?') ? Response.json({ name: '测试图片.png', previewKind: 'image', parseStatus: 'DOWNLOAD_ONLY', parseReason: '仅保存', versionId: 'vp' }) : Response.json({ items: [{ id: 'pic', name: '测试图片.png', kind: 'FILE', currentVersion: { id: 'vp', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY' } }] }));
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    fireEvent.click(await listing().findByRole('button', { name: '测试图片.png' }));
    const dialog = document.querySelector('main')!; await within(dialog).findByRole('img');
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe('blob:private-fixture');
    expect(within(dialog).getByRole('button', { name: zh.download })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(dialog).getAllByRole('button', { name: zh.close }).at(-1)!);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:private-fixture'));
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/pic/download?versionId=vp', expect.objectContaining({ credentials: 'include' }));
  });
  it('lists zip names and sizes without downloading the archive', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/download') || url.includes('/render')) throw new Error('zip bytes must stay closed');
      if (url.includes('/preview?')) return Response.json({
        name: '材料.zip', originalName: '材料.zip', previewKind: 'text', parseStatus: 'READY',
        text: '压缩包里的机密', entries: [{ name: 'readme.md', size: 12 }, { name: '图.png', size: 4 }], versionId: 'vz',
      });
      return Response.json({ items: [{ id: 'zip1', name: '材料.zip', kind: 'FILE', currentVersion: { id: 'vz', versionNo: 1, parseStatus: 'READY' } }] });
    });
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    fireEvent.click(await listing().findByRole('button', { name: '材料.zip' }));
    const pane = document.querySelector('main')!;
    await within(pane).findByText('readme.md');
    expect(within(pane).getByText(zh.archiveEntries)).toBeTruthy();
    expect(within(pane).getByText('图.png')).toBeTruthy();
    expect(within(pane).getByText('压缩包里的机密')).toBeTruthy();
    expect(within(pane).getByText('12 B')).toBeTruthy();
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/download') || String(url).includes('/render'))).toBe(false);
  });
  it('creates shared uploads directly and keeps the shared view selected', async () => {
    let saved = false;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/config')) return Response.json({ maxFileBytes: 1000, allowedExtensions: ['.md'] });
      if (init?.method === 'POST') {
        expect((init.body as FormData).get('scope')).toBe('ENTERPRISE');
        expect((init.body as FormData).get('confirmShare')).toBe('true');
        saved = true; return Response.json({ items: [{ id: 'new', scope: 'ENTERPRISE' }], failed: [] });
      }
      return Response.json({ items: saved && url.includes('view=shared') ? [{ id: 'new', name: '新增.md', kind: 'FILE', scope: 'ENTERPRISE', currentVersion: { id: 'vnew', versionNo: 1, parseStatus: 'READY' } }] : [] });
    });
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    await listing().findByText(zh.empty); fireEvent.click(screen.getByRole('button', { name: zh.shared }));
    fireEvent.click(screen.getByRole('button', { name: `${zh.new} · ${zh.shared}` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.upload }));
    fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['fixture'], '新增.md')] } });
    fireEvent.click(screen.getByRole('button', { name: zh.uploadStart }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh.upload })).toBeNull());
    await listing().findByRole('button', { name: '新增.md' });
    expect(screen.getByRole('button', { name: zh.shared }).getAttribute('aria-current')).toBe('page');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/scope'))).toBe(false);
  });
  it('retains actual upload errors instead of reporting transfer success', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => url.endsWith('/config') ? Response.json({ maxFileBytes: 1000, allowedExtensions: ['.png'] }) : init?.method === 'POST' ? Response.json({ items: [], failed: [{ name: 'fake.png', message: '媒体内容无效' }] }) : Response.json({ items: [] }));
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    await listing().findByText(zh.empty);
    fireEvent.click(screen.getByRole('button', { name: `${zh.new} · ${zh.mine}` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.upload }));
    fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['not image'], 'fake.png')] } });
    fireEvent.click(screen.getByRole('button', { name: zh.uploadStart }));
    await screen.findByText('媒体内容无效', { exact: false }); expect(screen.queryByText(zh.transferred)).toBeNull();
  });
});

it('clamps a now-empty later page back to the current last page without stranding visible files', async () => {
  let shortened = false;
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith('/config')) return Response.json({ maxFileBytes: 1000, allowedExtensions: ['.md'] });
    if (url.includes('page=2')) { shortened = true; return Response.json({ items: [], total: 1 }); }
    return Response.json({ items: [{ id: 'keep', name: '仍可见.md', kind: 'FILE', currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY' } }], total: shortened ? 1 : 21 });
  });
  render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: zh.recent })); await listing().findByText('仍可见.md'); fireEvent.click(screen.getByRole('button', { name: zh.nextPage }));
  await waitFor(() => { expect(screen.queryByRole('button', { name: zh.nextPage })).toBeNull(); expect(listing().getByRole('button', { name: '仍可见.md' })).toBeTruthy(); });
});

describe('t190 direct mine root navigation', () => {
  const rootItems = [{ id: 'apple', kind: 'FOLDER', name: 'Apple' }, { id: 'root', kind: 'FILE', name: '根资料.md', currentVersion: { id: 'vr', versionNo: 1, parseStatus: 'READY' } }];
  const children = [{ id: 'child', kind: 'FILE', name: 'Apple内.md', currentVersion: { id: 'vc', versionNo: 1, parseStatus: 'READY' } }];
  it('toggles the mine tree on each title click without blanking the main list', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json({ items: url.includes('parentId=apple') ? children : rootItems, total: url.includes('parentId=apple') ? 1 : 2 }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    await nav.findByRole('button', { name: '根资料.md' });
    const mine = nav.getByRole('button', { name: zh.mine });
    expect(within(mine.parentElement!).getByRole('button', { name: `${zh.new} · ${zh.mine}` })).toBeTruthy();
    expect(nav.queryByRole('button', { name: zh.toggleTree })).toBeNull();
    expect(mine.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(mine.getAttribute('aria-controls')!)).toBeTruthy();
    const arrow = nav.getByRole('button', { name: `${zh.toggleTree} · Apple` });
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('parentId=apple'))).toBe(false);
    fireEvent.click(mine)
    expect(mine.getAttribute('aria-expanded')).toBe('false')
    expect(nav.queryByRole('button', { name: '根资料.md' })).toBeNull()
    expect(preview().getByRole('heading', { name: zh.selectPreview })).toBeTruthy()
    fireEvent.click(mine)
    expect(mine.getAttribute('aria-expanded')).toBe('true')
    expect(nav.getByRole('button', { name: '根资料.md' })).toBeTruthy();
    expect(preview().getByRole('heading', { name: zh.selectPreview })).toBeTruthy()
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
  });
  it('separates folder-title selection from expansion, preserving the open branch across category navigation', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json({ items: url.includes('view=shared') ? [] : url.includes('parentId=apple') ? children : rootItems, total: url.includes('view=shared') ? 0 : url.includes('parentId=apple') ? 1 : 2 }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: 'Apple' }));
    await listing().findByRole('button', { name: 'Apple内.md' });
    expect(nav.getByRole('button', { name: 'Apple' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('button', { name: zh.mine }).hasAttribute('aria-current')).toBe(false);
    const arrow = nav.getByRole('button', { name: `${zh.toggleTree} · Apple` });
    expect(arrow.tagName).toBe('BUTTON'); expect(arrow.getAttribute('aria-expanded')).toBe('true');
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy()
    fireEvent.click(nav.getByRole('button', { name: zh.shared })); await listing().findByText(zh.empty);
    fireEvent.click(nav.getByRole('button', { name: zh.mine })); await listing().findByRole('button', { name: '根资料.md' });
    expect(nav.getByRole('button', { name: `${zh.toggleTree} · Apple` }).getAttribute('aria-expanded')).toBe('true');
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
    fireEvent.click(nav.getByRole('button', { name: zh.mine }));
    expect(nav.queryByRole('button', { name: 'Apple内.md' })).toBeNull()
    fireEvent.click(nav.getByRole('button', { name: zh.mine }))
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
  });
  it('keeps open folders open after a library refresh', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json({ items: url.includes('parentId=apple') ? children : rootItems, total: url.includes('parentId=apple') ? 1 : 2 }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: 'Apple' }));
    await nav.findByRole('button', { name: 'Apple内.md' });
    fireEvent.click(nav.getByRole('button', { name: zh.refresh }));
    await waitFor(() => expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes('parentId=apple')).length).toBeGreaterThan(1));
    expect(nav.getByRole('button', { name: `${zh.toggleTree} · Apple` }).getAttribute('aria-expanded')).toBe('true');
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
  });
  it('indents recycled files under the trash heading and keeps the reason with the name', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json({ items: url.includes('view=trash') ? [{ id: 'sheet', name: '指标.xlsx', kind: 'FILE', currentVersion: { id: 'vs', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: '表格本期仅下载' } }] : [], total: url.includes('view=trash') ? 1 : 0 }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: zh.trash }));
    const file = await nav.findByRole('button', { name: '指标.xlsx' });
    expect(file.closest(`.${panelCss.treeRoot}`)).toBeTruthy();
    expect(file.querySelector('small')).toBeNull();
  });
  it('leaves a recycled folder instead of reporting that its list is missing', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/recycle')) return Response.json({ ok: true });
      if (url.includes('parentId=aaa')) return Response.json({ message: '资料不存在' }, { status: 404 });
      if (url.includes('parentId=apple')) return Response.json({ items: [{ id: 'aaa', kind: 'FOLDER', name: 'aaa', canManage: true }], total: 1 });
      return Response.json({ items: [{ id: 'apple', kind: 'FOLDER', name: 'apple', canManage: true }], total: 1 });
    });
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: 'apple' }));
    fireEvent.click(await nav.findByRole('button', { name: 'aaa' }));
    fireEvent.click(nav.getByRole('button', { name: `${zh.more} · aaa` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.recycle }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url, init]) => String(url).includes('/recycle') && (init as RequestInit | undefined)?.method === 'POST')).toBe(true));
    await waitFor(() => expect(view.container.querySelector('[role="alert"]')).toBeNull());
    expect(view.container.textContent).toContain('apple');
    expect(view.container.textContent).not.toContain('资料不存在');
  });
  it('shows a refused library action in a toast instead of the library footer', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).includes('/recycle')) return Response.json({ message: '目录不为空' }, { status: 400 });
      return Response.json({ items: [{ id: 'bbb', kind: 'FOLDER', name: 'bbb', canManage: true }], total: 1 });
    });
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: `${zh.more} · bbb` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.recycle }));
    expect((await screen.findByRole('alert')).textContent).toContain('目录不为空');
    expect(view.container.textContent).not.toContain('目录不为空');
  });
  it('confirms permanent delete in a dialog and then sends the delete', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Response.json({ ok: true });
      return Response.json({ items: url.includes('view=trash') ? [{ id: 'aaa', kind: 'FOLDER', name: 'aaa', canManage: true }] : [], total: url.includes('view=trash') ? 1 : 0 });
    });
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: zh.trash }));
    fireEvent.click(await nav.findByRole('button', { name: `${zh.more} · aaa` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: zh.purge }));
    const dialog = await screen.findByRole('dialog', { name: zh.purge });
    expect(within(dialog).getByText(zh.confirmPurge)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: zh.purge }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url, init]) => (init as RequestInit | undefined)?.method === 'DELETE' && String(url).includes('/nodes/aaa'))).toBe(true));
  });
  it('does not send a late subtree response into another category main list', async () => {
    let release: (value: Response) => void = () => {};
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('parentId=apple')) return new Promise<Response>(resolve => { release = resolve; });
      return Response.json({ items: url.includes('view=shared') ? [] : rootItems, total: url.includes('view=shared') ? 0 : 2 });
    });
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: `${zh.toggleTree} · Apple` }));
    fireEvent.click(nav.getByRole('button', { name: zh.shared })); await listing().findByText(zh.empty);
    release(Response.json({ items: children, total: 1 })); await nav.findByRole('button', { name: 'Apple内.md' });
    expect(preview().queryByText('Apple内.md')).toBeNull();
    expect(nav.getByRole('button', { name: zh.shared }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(nav.getByRole('button', { name: zh.mine })); await listing().findByRole('button', { name: '根资料.md' });
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
  });
});


describe('t196 real primitive status menu', () => {
  const mount = () => render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onUse={vi.fn()} />);
  it('portals the real menu, selects a filter without native select, and dismisses/returns focus on Escape', async () => {
    const view = mount(); await listing().findByText(zh.empty);
    const trigger = screen.getByRole('button', { name: zh.filterStatus });
    expect(view.container.querySelector('select')).toBeNull();
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(view.container.contains(menu)).toBe(false);
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).queryByRole('menuitem', { name: '处理中' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: zh.statusFailed })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: zh.allStatus })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: zh.statusDownloadOnly })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: zh.statusReady }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger.textContent).toContain(zh.statusReady);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const reopened = await screen.findByRole('menu');
    expect(within(reopened).getByRole('menuitem', { name: zh.statusReady }).querySelector('[data-icon=dsw-icon-check-outline-regular]')).toBeTruthy();
    await waitFor(() => expect(reopened.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: zh.statusReady }));
    await waitFor(() => expect(trigger.textContent).toContain(zh.allStatus));
  });
  it('supports keyboard option navigation/Enter and outside pointer dismissal', async () => {
    mount(); await listing().findByText(zh.empty);
    const trigger = screen.getByRole('button', { name: zh.filterStatus });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    // jsdom does not synthesize the native button activation click from Enter.
    fireEvent.click(document.activeElement!);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger.textContent).not.toContain(zh.allStatus);
    fireEvent.click(trigger); await screen.findByRole('menu');
    fireEvent.pointerDown(screen.getByRole('button', { name: zh.searchPlaceholder }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
  it('puts unfinished and stored-only files in the not-for-AI filter', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [
      { id: 'wait', name: '等待.pdf', kind: 'FILE', currentVersion: { id: 'vw', versionNo: 1, parseStatus: 'PENDING' } },
      { id: 'work', name: '解析.docx', kind: 'FILE', currentVersion: { id: 'vx', versionNo: 1, parseStatus: 'PROCESSING' } },
      { id: 'pic', name: '图片.png', kind: 'FILE', currentVersion: { id: 'vp', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY' } },
      { id: 'ready', name: '制度.md', kind: 'FILE', currentVersion: { id: 'vr', versionNo: 1, parseStatus: 'READY' } },
      { id: 'failed', name: '失败.txt', kind: 'FILE', currentVersion: { id: 'vf', versionNo: 1, parseStatus: 'FAILED' } },
    ] }));
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    await listing().findByRole('button', { name: '等待.pdf' });
    expect(listing().queryByRole('button', { name: '失败.txt' })).toBeNull();
    const trigger = screen.getByRole('button', { name: zh.filterStatus });
    fireEvent.click(trigger);
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: zh.statusDownloadOnly }));
    await waitFor(() => {
      expect(listing().getByRole('button', { name: '图片.png' })).toBeTruthy();
      expect(listing().getByRole('button', { name: '等待.pdf' })).toBeTruthy();
      expect(listing().getByRole('button', { name: '解析.docx' })).toBeTruthy();
      expect(listing().queryByRole('button', { name: '制度.md' })).toBeNull();
      expect(listing().queryByRole('button', { name: '失败.txt' })).toBeNull();
    });
    expect(screen.getByRole('button', { name: zh.refresh }).textContent).toBe('');
  });
});


it('applies real hierarchy CSS to mounted tree disclosure/name columns and keeps long titles accessible', async () => {
  const source = readFileSync('packages/client/ui-enterprise-library/src/client/LibraryPanel.module.css', 'utf8');
  const style = document.createElement('style');
  // Load only the actual flat rules exercised here: jsdom has no container-query layout engine.
  style.textContent = [...source.matchAll(/\.tree\s*\{[^}]+\}|\.page button\s*\{[^}]+\}|\.page \.treeName\s*\{[^}]+\}|\.treeRow\s*\{[^}]+\}|\.treeName span\s*\{[^}]+\}|\.treeToggleSpace\s*\{[^}]+\}|\.navScroll\s*\{[^}]+\}/g)].map(([rule]) => rule.replace(/\.([A-Za-z][A-Za-z0-9]*)/g, (_, key: keyof typeof panelCss) => '.' + panelCss[key])).join('\n');
  document.head.append(style);
  try {
    const name = '很长的根目录资料名称'.repeat(12) + '.md';
    const fetchImpl = vi.fn(async () => Response.json({ items: [{ id: 'long', kind: 'FILE', name }] }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const title = await within(view.container.querySelector('aside')!).findByRole('button', { name });
    expect(title.getAttribute('title')).toBe(name);
    const row = title.parentElement!;
    expect(getComputedStyle(row).display).toBe('grid');
    expect(getComputedStyle(row).gridTemplateColumns).toBe('20px minmax(0,1fr)');
    expect(getComputedStyle(row).minHeight).toBe('30px');
    expect(getComputedStyle(title).fontSize).toBe('12px');
    expect(row.querySelectorAll('button')).toHaveLength(2);
    expect(getComputedStyle(row.querySelector('span')!).width).toBe('20px');
    expect(getComputedStyle(title.querySelector('span')!).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(title.querySelector('span')!).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(view.container.querySelector('aside nav')!).overflow).toBe('auto');
  } finally { style.remove(); }
});


it('keeps the preview inside the right pane with original Markdown structure and no modal', async () => {
  const fetchImpl = vi.fn(async (url: string) => url.includes('/download?')
    ? new Response('# 原始标题\n\n**加粗正文**', { headers: { 'content-type': 'text/markdown' } })
    : url.includes('/preview?') ? Response.json({ text: '提取文本' })
      : Response.json({ items: [{ id: 'f', name: '预览.md', kind: 'FILE', currentVersion: { id: 'vf', versionNo: 1, parseStatus: 'READY' } }] }))
  const view = render(<Panel clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
  fireEvent.click(await listing().findByRole('button', { name: '预览.md' }))
  const title = await preview().findByRole('heading', { name: '原始标题' })
  expect(view.container.contains(title)).toBe(true)
  expect(document.querySelector('main strong')?.textContent).toBe('加粗正文')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(preview().queryByText('提取文本')).toBeNull()
})

it('opens the only membership through the protected Host without Admin auth switching', async () => {
 let selected = false
 const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.endsWith('/context')) {
   if (init?.method === 'POST') { expect(JSON.parse(String(init.body))).toEqual({tenantId:'member-enterprise'}); selected = true }
   return Response.json({tenants:[{id:'member-enterprise',name:'本人加入的企业'}],selectedTenantId:selected?'member-enterprise':null})
  }
  if (url.endsWith('/config')) return Response.json(selected ? {enabled:true,maxFileBytes:1000,allowedExtensions:['.md']} : {enabled:false,message:zh.memberContextHint})
  return Response.json({items:[],total:0})
 })
 render(<Panel t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} clearSourceRequest={() => {}} />)
 await waitFor(()=>expect(fetchImpl.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
 expect(screen.queryByRole('button',{name:'本人加入的企业'})).toBeNull()
 expect(fetchImpl.mock.calls.every(([url])=>url.startsWith('/ground-library/'))).toBe(true)
 await waitFor(()=>expect(screen.queryByText(zh.memberContextHint)).toBeNull())
})
it('shows the enterprise switch when more than one membership is available', async () => {
 const fetchImpl = vi.fn(async (url: string) => Response.json(url.endsWith('/context')
  ? {tenants:[{id:'a',name:'甲企业'},{id:'b',name:'乙企业'}],selectedTenantId:'a'}
  : url.endsWith('/config') ? {enabled:true,maxFileBytes:1000,allowedExtensions:['.md']} : {items:[],total:0}))
 render(<Panel t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} clearSourceRequest={() => {}} />)
 expect(await screen.findByRole('button',{name:'甲企业'})).toBeTruthy()
 expect(screen.getByRole('button',{name:'乙企业'}).getAttribute('aria-pressed')).toBe('false')
 expect(screen.getByRole('button',{name:'甲企业'}).getAttribute('aria-pressed')).toBe('true')
})
it('keeps an unbound account empty without auto-selecting or opening Console', async () => {
 const fetchImpl = vi.fn(async (url: string) => Response.json(url.endsWith('/context') ? {tenants:[],selectedTenantId:null} : url.endsWith('/config') ? {enabled:false,message:zh.memberContextHint} : {items:[],total:0}))
 render(<Panel t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} clearSourceRequest={() => {}} />)
 await screen.findByText(zh.memberContextHint)
 expect(document.body.textContent).not.toContain('控制台')
 expect(fetchImpl.mock.calls.every(([url])=>!url.includes('/api/auth/'))).toBe(true)
})
