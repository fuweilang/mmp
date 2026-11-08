// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import modalCss from '../../ui-primitives/src/Modal.module.css'
import panelCss from '../src/client/LibraryPanel.module.css'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook } from '@mammoth-ai/mmp-client-test-runtime'
import type { GlobalStandardProps } from '@mammoth-ai/mmp-client-ui-slots'
import { LibraryTree } from '../src/client/LibraryTree.tsx'
import { LibraryIcon } from '../src/client/LibraryIcon.tsx'
import { LibraryPanel as RawLibraryPanel, type LibraryPanelProps } from '../src/client/LibraryPanel.tsx'
import type { LibraryChoice } from '../src/client/selection.ts'
import { zh, type LibraryKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = (key: LibraryKey) => zh[key]
const main = () => within(document.querySelector('main')!)
const unused = (): never => { throw new Error('unused framework seat') }
const standard: GlobalStandardProps = {
  usePanelInfo: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
  useResource: unused, useWorkspaces: unused, ...allowAllAccess, useContextMenu: contextMenuHook(),
}
const noSource: LibraryPanelProps['useSourceRequest'] = select => select(null)
type PanelFixtureProps = Omit<LibraryPanelProps, keyof GlobalStandardProps> & { useSourceRequest?: LibraryPanelProps['useSourceRequest'] }
function Panel({ useSourceRequest = noSource, ...props }: PanelFixtureProps) {
  return <RawLibraryPanel {...standard} useSourceRequest={useSourceRequest} {...props} />
}

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
    await main().findByText('制度.md')
    fireEvent.click(screen.getByRole('button', { name: zh.shared }))
    await screen.findByText(zh.loadError, { exact: false })
    expect(main().queryByText('制度.md')).toBeNull()
  })

  it('hides native file pickers and shows a centered, actionable empty state without persistent upload progress', async () => {
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onUse={vi.fn()} />)
    await screen.findByText(zh.emptyHint)
    expect(view.container.querySelectorAll('input[type="file"][hidden]')).toHaveLength(0)
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
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} onUseMany={onUseMany} />)
    await main().findByText('制度.md')
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
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await main().findByRole('button', { name: '单段.md' }))
    await screen.findByRole('dialog', { name: '单段.md' })
    expect(screen.getByText('授权摘录')).toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/n1/preview?versionId=v9', expect.objectContaining({ credentials: 'include' }))
    fireEvent.click(screen.getAllByRole('button', { name: zh.close }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opens New folder through the secondary menu and saves with the existing mmp modal', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? Response.json({ id: 'folder1' }) : Response.json({ items: [] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await main().findByText(zh.empty)
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
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await main().findByRole('button', { name: '失败.pdf' }))
    await screen.findByRole('dialog', { name: '失败.pdf' })
    expect(screen.getByText('无法提取文字，请重试解析')).toBeTruthy()
  })

  it('rechecks link preview authorization instead of displaying a cached private URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/preview?') ? Response.json({ message: '授权已撤销' }, { status: 403 }) : Response.json({ items: [
      { id: 'link1', name: '参考链接', kind: 'LINK', linkUrl: 'https://example.test/reference' },
    ] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    fireEvent.click(await main().findByRole('button', { name: '参考链接' }))
    await screen.findByText('授权已撤销')
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/link1/preview?versionId=', expect.objectContaining({ credentials: 'include' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('https://example.test/reference')).toBeNull()
  })

  it('drops the previous preview title and text when a manual preview fails', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
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
    fireEvent.click(await main().findByRole('button', { name: '甲.md' }))
    await screen.findByRole('dialog', { name: '甲.md' })
    expect(screen.getByText('第一个文件正文')).toBeTruthy()
    fireEvent.click(main().getByRole('button', { name: '乙.md' }))
    await screen.findByText('授权已撤销')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('第一个文件正文')).toBeNull()
    expect(main().queryByText('甲.md')).toBeTruthy()
  })

  it('shows the real truncation note from an opened excerpt without inventing full-document evidence', async () => {
    const request = { nodeId: 'n1', versionId: 'v9' }
    const selectSource = <T,>(select: (value: typeof request | null) => T): T => select(request)
    const fetchImpl = vi.fn(async (url: string) => url.includes('/open')
      ? Response.json({
        name: '制度.md', versionId: 'v9', locator: 'paragraph:1', quote: '部分摘录',
        truncated: true, truncationNote: '仅使用部分摘录，未读取全文。',
      })
      : Response.json({ items: [] }))
    render(<Panel useSourceRequest={selectSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await screen.findByRole('dialog', { name: '制度.md' })
    expect(screen.getByText('部分摘录')).toBeTruthy()
    expect(screen.getByText('仅使用部分摘录，未读取全文。')).toBeTruthy()
    expect(screen.queryByText(zh.truncatedExcerpt)).toBeNull()
  })

  it('shows an empty library and a search miss', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [] }))
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await waitFor(() => expect(main().getByText(zh.empty)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(zh.searchPlaceholder), { target: { value: '没有' } })
    await waitFor(() => expect(screen.getByText(zh.noResults)).toBeTruthy())
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
    await main().findByText('根文件.md');
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
    await within(view.container.querySelector('main')!).findByRole('button', { name: '子文件.md' });
    expect(within(view.container.querySelector('main')!).getByRole('navigation', { name: zh.root })).toBeTruthy();
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
    fireEvent.click(await main().findByRole('button', { name: '测试图片.png' }));
    const dialog = await screen.findByRole('dialog', { name: '测试图片.png' });
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe('blob:private-fixture');
    expect(within(dialog).getByRole('button', { name: zh.download })).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: `${zh.select} 测试图片.png` }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getAllByRole('button', { name: zh.close }).at(-1)!);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:private-fixture'));
    expect(fetchImpl).toHaveBeenCalledWith('/ground-library/nodes/pic/download?versionId=vp&inline=1', expect.objectContaining({ credentials: 'include' }));
  });
  it('reveals successful default-private uploads from shared in mine without silently sharing', async () => {
    let saved = false;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/config')) return Response.json({ maxFileBytes: 1000, allowedExtensions: ['.md'] });
      if (init?.method === 'POST') { saved = true; return Response.json({ items: [{ id: 'new' }], failed: [] }); }
      return Response.json({ items: saved && url.includes('view=mine') ? [{ id: 'new', name: '新增.md', kind: 'FILE', scope: 'PRIVATE', currentVersion: { id: 'vnew', versionNo: 1, parseStatus: 'READY' } }] : [] });
    });
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    await main().findByText(zh.empty); fireEvent.click(screen.getByRole('button', { name: zh.shared }));
    fireEvent.click(screen.getAllByRole('button', { name: zh.upload })[0]!);
    fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['fixture'], '新增.md')] } });
    fireEvent.click(screen.getByRole('button', { name: zh.uploadStart }));
    await screen.findByText(zh.uploadSuccess);
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: zh.close }).at(-1)!);
    await main().findByRole('button', { name: '新增.md' });
    expect(screen.getByRole('button', { name: zh.mine }).getAttribute('aria-current')).toBe('page');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/scope'))).toBe(false);
  });
  it('retains actual upload errors instead of reporting transfer success', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => url.endsWith('/config') ? Response.json({ maxFileBytes: 1000, allowedExtensions: ['.png'] }) : init?.method === 'POST' ? Response.json({ items: [], failed: [{ name: 'fake.png', message: '媒体内容无效' }] }) : Response.json({ items: [] }));
    render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    await main().findByText(zh.empty);
    fireEvent.click(screen.getAllByRole('button', { name: zh.upload })[0]!);
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
  await main().findByText('仍可见.md'); fireEvent.click(screen.getByRole('button', { name: zh.nextPage }));
  await waitFor(() => { expect(screen.queryByRole('button', { name: zh.nextPage })).toBeNull(); expect(main().getByRole('button', { name: '仍可见.md' })).toBeTruthy(); });
});

describe('t190 direct mine root navigation', () => {
  const rootItems = [{ id: 'apple', kind: 'FOLDER', name: 'Apple' }, { id: 'root', kind: 'FILE', name: '根资料.md', currentVersion: { id: 'vr', versionNo: 1, parseStatus: 'READY' } }];
  const children = [{ id: 'child', kind: 'FILE', name: 'Apple内.md', currentVersion: { id: 'vc', versionNo: 1, parseStatus: 'READY' } }];
  it('has only the mine title button, shows roots directly, and repeated title clicks never collapse or blank the list', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json({ items: url.includes('parentId=apple') ? children : rootItems, total: url.includes('parentId=apple') ? 1 : 2 }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    await nav.findByRole('button', { name: '根资料.md' });
    const mine = nav.getByRole('button', { name: zh.mine });
    expect(mine.parentElement?.querySelectorAll('button')).toHaveLength(1);
    expect(nav.queryByRole('button', { name: zh.toggleTree })).toBeNull();
    expect(mine.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(mine.getAttribute('aria-controls')!)).toBeTruthy();
    const arrow = nav.getByRole('button', { name: `${zh.toggleTree} · Apple` });
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('parentId=apple'))).toBe(false);
    fireEvent.click(mine); fireEvent.click(mine);
    expect(nav.getByRole('button', { name: '根资料.md' })).toBeTruthy();
    expect(main().getByRole('button', { name: '根资料.md' })).toBeTruthy();
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
  });
  it('separates folder-title selection from expansion, preserving the open branch across category navigation', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json({ items: url.includes('view=shared') ? [] : url.includes('parentId=apple') ? children : rootItems, total: url.includes('view=shared') ? 0 : url.includes('parentId=apple') ? 1 : 2 }));
    const view = render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    const nav = within(view.container.querySelector('aside')!);
    fireEvent.click(await nav.findByRole('button', { name: 'Apple' }));
    await main().findByRole('button', { name: 'Apple内.md' });
    expect(nav.getByRole('button', { name: 'Apple' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('button', { name: zh.mine }).hasAttribute('aria-current')).toBe(false);
    const arrow = nav.getByRole('button', { name: `${zh.toggleTree} · Apple` });
    expect(arrow.tagName).toBe('BUTTON'); expect(arrow.getAttribute('aria-expanded')).toBe('false');
    expect(nav.queryByRole('button', { name: 'Apple内.md' })).toBeNull();
    fireEvent.click(arrow); await nav.findByRole('button', { name: 'Apple内.md' });
    fireEvent.click(nav.getByRole('button', { name: zh.shared })); await main().findByText(zh.empty);
    fireEvent.click(nav.getByRole('button', { name: zh.mine })); await main().findByRole('button', { name: '根资料.md' });
    expect(nav.getByRole('button', { name: `${zh.toggleTree} · Apple` }).getAttribute('aria-expanded')).toBe('true');
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
    fireEvent.click(nav.getByRole('button', { name: zh.mine }));
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
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
    fireEvent.click(nav.getByRole('button', { name: zh.shared })); await main().findByText(zh.empty);
    release(Response.json({ items: children, total: 1 })); await nav.findByRole('button', { name: 'Apple内.md' });
    expect(main().queryByText('Apple内.md')).toBeNull();
    expect(nav.getByRole('button', { name: zh.shared }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(nav.getByRole('button', { name: zh.mine })); await main().findByRole('button', { name: '根资料.md' });
    expect(nav.getByRole('button', { name: 'Apple内.md' })).toBeTruthy();
  });
});


describe('t196 real primitive status menu', () => {
  const mount = () => render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onUse={vi.fn()} />);
  it('portals the real menu, selects a filter without native select, and dismisses/returns focus on Escape', async () => {
    const view = mount(); await main().findByText(zh.empty);
    const trigger = screen.getByRole('button', { name: zh.filterStatus });
    expect(view.container.querySelector('select')).toBeNull();
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(view.container.contains(menu)).toBe(false);
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(4);
    expect(within(menu).getByRole('menuitem', { name: zh.allStatus }).querySelector('[data-icon=dsw-icon-check-outline-regular]')).toBeTruthy();
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
  });
  it('supports keyboard option navigation/Enter and outside pointer dismissal', async () => {
    mount(); await main().findByText(zh.empty);
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
    fireEvent.pointerDown(screen.getByRole('searchbox', { name: zh.searchPlaceholder }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
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
    expect(row.querySelectorAll('button')).toHaveLength(1);
    expect(getComputedStyle(row.querySelector('span')!).width).toBe('20px');
    expect(getComputedStyle(title.querySelector('span')!).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(title.querySelector('span')!).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(view.container.querySelector('aside nav')!).overflow).toBe('auto');
  } finally { style.remove(); }
});


it('keeps real terminal preview on a body-portaled fixed centered layer with bounded scrolling content', async () => {
  const source = readFileSync('packages/client/ui-primitives/src/Modal.module.css','utf8');
  const own = readFileSync('packages/client/ui-enterprise-library/src/client/LibraryPanel.module.css','utf8');
  const sheet=document.createElement('style');
  const rootRule=source.match(/\.root\s*\{[^}]+\}/)![0].replace('.root','.'+modalCss.root);
  const ownRules=[...own.matchAll(/\.(?:sourceDialog|dialogContent)(?:[^{}]*)\{[^}]+\}/g)].map(([rule])=>rule.replace(/\.([A-Za-z][A-Za-z0-9]*)/g,(_,key: keyof typeof panelCss)=>'.'+panelCss[key])).join('\n');
  sheet.textContent=rootRule+'\n'+ownRules;document.head.append(sheet);
  try {
    const fetchImpl=vi.fn(async(url:string)=>url.includes('/preview?')?Response.json({text:'fixture line\n'.repeat(400)}):Response.json({items:[{id:'f',name:'预览.md',kind:'FILE',currentVersion:{id:'vf',versionNo:1,parseStatus:'READY'}}]}));
    const view=render(<Panel useSourceRequest={noSource} clearSourceRequest={() => {}} t={t as never} origin="" fetchImpl={fetchImpl} onUse={vi.fn()} />);
    fireEvent.click(await main().findByRole('button',{name:'预览.md'}));const dialog=await screen.findByRole('dialog',{name:'预览.md'});
    const layer=dialog.parentElement!;expect(layer.parentElement).toBe(document.body);expect(view.container.contains(dialog)).toBe(false);
    expect(getComputedStyle(layer).position).toBe('fixed');expect(getComputedStyle(layer).alignItems).toBe('center');expect(getComputedStyle(layer).justifyContent).toBe('center');
    expect(getComputedStyle(dialog).maxHeight).toBe('100%');
    const content=dialog.firstElementChild!;expect(content.classList.contains(panelCss.dialogContent!)).toBe(true);
    expect(getComputedStyle(content.lastElementChild!).overflow).toBe('auto');expect(getComputedStyle(content.firstElementChild!).flexShrink).toBe('0');
  } finally { sheet.remove(); }
});
