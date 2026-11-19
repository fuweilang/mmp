import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '../src/api/http';
import Library from '@library-fixture';

const fixture = vi.hoisted(() => ({ list: vi.fn(), folders: vi.fn(), folder: vi.fn(), upload: vi.fn(), impact: vi.fn(), scope: vi.fn(), recycle: vi.fn(), batch: vi.fn() }));
vi.mock('../src/api/library', async original => ({
  ...await original<typeof import('../src/api/library')>(),
  libraryConfig: async () => ({ maxFileBytes: 1000, allowedExtensions: ['.md'] }),
  libraryCustodies: async () => [],
  listLibrary: fixture.list, libraryFolders: fixture.folders, createLibraryFolder: fixture.folder, uploadLibraryFiles: fixture.upload,
  libraryScopeImpact: fixture.impact, shareLibrary: fixture.scope, recycleLibrary: fixture.recycle, batchLibrary: fixture.batch,
}));
let app: App | undefined, root: HTMLElement | undefined, router: Router;
const revision = 'b'.repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  fixture.list.mockResolvedValue({ items: [], total: 0, breadcrumb: [], parentScope: null });
  fixture.folders.mockResolvedValue([]);
  fixture.folder.mockResolvedValue({ id: 'created', scope: 'ENTERPRISE' });
  fixture.upload.mockResolvedValue({ items: [{ id: 'file', scope: 'ENTERPRISE' }], failed: [] });
  fixture.impact.mockResolvedValue({ total: 4, changed: 4, treeRevision: revision });
  fixture.scope.mockResolvedValue({ id: 'folder', scope: 'ENTERPRISE' });
  fixture.recycle.mockResolvedValue({ id: 'file' });
  fixture.batch.mockResolvedValue({ skipped: 0, failed: [] });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Fixture forbids live requests'));
});
afterEach(async () => {
  ElMessageBox.close(); ElMessage.closeAll(); app?.unmount(); root?.remove(); app = undefined; root = undefined;
  document.querySelectorAll('.el-overlay,.el-popper').forEach(node => node.remove());
  vi.restoreAllMocks(); await nextTick();
});
async function mount(path = '/console/library/shared') {
  root = document.createElement('div'); document.body.append(root);
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/console/library/:view', component: Library }] });
  await router.push(path); await router.isReady();
  app = createApp({ render: () => h(RouterView) }); app.use(createPinia()); app.use(ElementPlus); app.use(router); app.mount(root);
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalled()); await nextTick();
}
function click(text: string, where: ParentNode = document) {
  const button = [...where.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text);
  expect(button, text).toBeTruthy(); button!.click();
}
async function confirmBox() {
  return vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>('.library-message-box');
    expect(node?.textContent).toContain('移入回收站？');
    return node!;
  });
}
async function folderDialog() {
  click('新建文件夹', root);
  await vi.waitFor(() => expect(document.querySelector('.el-dialog')).toBeTruthy());
  return document.querySelector<HTMLElement>('.el-dialog')!;
}
function name(dialog: HTMLElement, value: string) {
  const input = dialog.querySelector<HTMLInputElement>('input')!; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
}
it('creates directly shared from the shared root and keeps the current route', async () => {
  await mount(); const dialog = await folderDialog();
  expect(dialog.textContent).toContain('本企业成员可见');
  name(dialog, '团队资料'); await nextTick(); click('创建', dialog);
  await vi.waitFor(() => expect(fixture.folder).toHaveBeenCalledWith('团队资料', null, { scope: 'ENTERPRISE', confirmShare: true }));
  expect(router.currentRoute.value.path).toBe('/console/library/shared');
});
it('uses the server parent scope for nested creation and retains the folder', async () => {
  fixture.list.mockResolvedValue({ items: [], total: 0, breadcrumb: [{ id: 'parent', name: '共享父目录' }], parentScope: 'ENTERPRISE' });
  await mount('/console/library/shared?folder=parent'); const dialog = await folderDialog();
  expect(dialog.textContent).toContain('共享父目录'); name(dialog, '子目录'); await nextTick(); click('创建', dialog);
  await vi.waitFor(() => expect(fixture.folder).toHaveBeenCalledWith('子目录', 'parent', { scope: 'ENTERPRISE', confirmShare: true }));
  expect(router.currentRoute.value.query.folder).toBe('parent');
});
it('keeps an owned shared folder under 我的资料 in the move dialog', async () => {
  const folder = { id: 'feng', name: '冯静健康事业基础知识库', kind: 'FOLDER', scope: 'ENTERPRISE', canManage: true, parentId: null, updatedAt: '2026-11-19T00:00:00Z' };
  const file = { id: 'file', name: '00_冯静.md', kind: 'FILE', scope: 'ENTERPRISE', canManage: true, parentId: 'feng', updatedAt: '2026-11-19T00:00:00Z', currentVersion: { id: 'v1', versionNo: 1, mimeType: 'text/markdown', sizeBytes: 4, parseStatus: 'READY', parseReason: null, extractTruncated: false, originalName: '00_冯静.md' } };
  fixture.list.mockResolvedValue({ items: [file], total: 1, breadcrumb: [{ id: 'feng', name: folder.name }], parentScope: 'ENTERPRISE' });
  fixture.folders.mockImplementation(async (view?: string) => view === 'mine' || view === 'shared' ? [folder] : []);
  await mount('/console/library/mine?folder=feng');
  click('更多', root);
  const moveItem = await vi.waitFor(() => {
    const menu = [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu')].find(node => node.textContent?.includes('替换新版本'));
    const node = [...(menu?.querySelectorAll<HTMLElement>('.el-dropdown-menu__item') ?? [])].find(item => item.textContent?.trim() === '移动');
    expect(node).toBeTruthy();
    return node!;
  });
  moveItem.click();
  const dialog = await vi.waitFor(() => {
    const node = [...document.querySelectorAll<HTMLElement>('.el-dialog')].find(item => item.textContent?.includes('移动资料'));
    expect(node).toBeTruthy();
    return node!;
  });
  const trees = dialog.querySelectorAll('.el-tree');
  expect(trees[0]?.textContent).toContain('冯静健康事业基础知识库');
  expect(trees[0]?.textContent).not.toContain('暂无数据');
  expect(trees[1]?.textContent).toContain('冯静健康事业基础知识库');
});

it('keeps personal root creation private', async () => {
  await mount('/console/library/mine'); const dialog = await folderDialog();
  expect(dialog.textContent).toContain('仅自己可见'); name(dialog, '个人目录'); await nextTick(); click('创建', dialog);
  await vi.waitFor(() => expect(fixture.folder).toHaveBeenCalledWith('个人目录', null, { scope: 'PRIVATE', confirmShare: false }));
});
it('confirms all descendants using the server count and revision', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'folder', name: '已有目录', kind: 'FOLDER', scope: 'PRIVATE', canManage: true, updatedAt: new Date().toISOString() }], total: 1, breadcrumb: [] });
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  await mount('/console/library/mine'); click('更多', root); await nextTick();
  await vi.waitFor(() => expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node => node.textContent?.includes('共享到企业'))).toBe(true));
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('共享到企业'))!.click();
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('4 项'), '确认共享', expect.any(Object)));
  await vi.waitFor(() => expect(fixture.scope).toHaveBeenCalledWith('folder', 'ENTERPRISE', true, { confirmUnshare: false, expectedTreeRevision: revision }));
  await vi.waitFor(() => expect(document.body.textContent).toContain('已共享到企业'));
});

it('freezes the shared upload destination even if the user changes views before starting', async () => {
  await mount(); click('上传文件', root); await nextTick();
  await vi.waitFor(() => expect(document.querySelector('.el-dialog')).toBeTruthy());
  const dialog = document.querySelector<HTMLElement>('.el-dialog')!;
  expect(dialog.textContent).toContain('每批最多 50 个');
  expect(dialog.textContent).not.toContain('本企业成员可见');
  const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'shared.md')] });
  input.dispatchEvent(new Event('change', { bubbles: true })); await nextTick();
  await router.replace('/console/library/mine'); await nextTick(); click('开始上传', dialog);
  await vi.waitFor(() => expect(fixture.upload).toHaveBeenCalledWith(expect.any(Array), null, expect.any(Function), { scope: 'ENTERPRISE', confirmShare: true }));
});

it('offers a parse-status filter on recent, mine, shared, and trash', async () => {
  const version = (parseStatus: string) => ({ id: 'v1', versionNo: 1, mimeType: 'text/plain', sizeBytes: 1, parseStatus, parseReason: null, extractTruncated: false, originalName: 'a.txt', createdAt: '2026-11-10T00:00:00Z' });
  fixture.list.mockResolvedValue({
    items: [
      { id: 'ready', name: '可引用.txt', kind: 'FILE', scope: 'PRIVATE', canManage: true, parentId: null, updatedAt: '2026-11-10T00:00:00Z', currentVersion: version('READY') },
      { id: 'saved', name: '仅保存.png', kind: 'FILE', scope: 'PRIVATE', canManage: true, parentId: null, updatedAt: '2026-11-10T00:00:00Z', currentVersion: version('DOWNLOAD_ONLY') },
      { id: 'pending', name: '排队.txt', kind: 'FILE', scope: 'PRIVATE', canManage: true, parentId: null, updatedAt: '2026-11-10T00:00:00Z', currentVersion: version('PENDING') },
      { id: 'failed', name: '失败.txt', kind: 'FILE', scope: 'PRIVATE', canManage: true, parentId: null, updatedAt: '2026-11-10T00:00:00Z', currentVersion: version('FAILED') },
    ],
    total: 4, breadcrumb: [], parentScope: null,
  });
  await mount('/console/library/mine');
  const select = document.querySelector<HTMLElement>('[aria-label="处理状态"]');
  expect(select).toBeTruthy();
  select!.click();
  const menu = await vi.waitFor(() => {
    const node = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown')].find(item => item.textContent?.includes('可供 AI 引用'));
    expect(node).toBeTruthy();
    return node!;
  });
  const options = [...menu.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].map(node => ({
    text: node.textContent?.trim(),
    color: node.querySelector('i')?.style.backgroundColor,
  }));
  expect(options.map(option => option.text)).toEqual(['可供 AI 引用', '仅保存', '处理中', '失败']);
  expect(options.every(option => option.color)).toBe(true);
  expect(new Set(options.map(option => option.color)).size).toBe(4);
  const cells = [...root!.querySelectorAll('td')].map(cell => cell.textContent?.replace(/\s+/g, '') ?? '');
  for (const label of ['可供AI引用', '仅保存', '处理中', '失败']) expect(cells.some(cell => cell.startsWith(label))).toBe(true);
  for (const path of ['/console/library/recent', '/console/library/shared', '/console/library/trash']) {
    await router.push(path);
    await vi.waitFor(() => expect(document.querySelector('[aria-label="处理状态"]')).toBeTruthy());
  }
});

it('pages recent use by 10, 20, 50, or 100 and starts at 10', async () => {
  fixture.list.mockResolvedValue({ items: [], total: 25, breadcrumb: [], parentScope: null });
  await mount('/console/library/recent');
  expect(fixture.list).toHaveBeenCalledWith('recent', null, '', 1, false, 10, undefined, undefined, undefined);
  const sizes = root!.querySelector<HTMLElement>('.el-pagination__sizes');
  expect(sizes).toBeTruthy();
  sizes!.click();
  const menu = await vi.waitFor(() => {
    const node = [...document.querySelectorAll<HTMLElement>('.el-select-dropdown')].find(item => item.textContent?.includes('100'));
    expect(node).toBeTruthy();
    return node!;
  });
  expect([...menu.querySelectorAll('.el-select-dropdown__item')].map(node => node.textContent?.replace(/\s+/g, ''))).toEqual(['10/page', '20/page', '50/page', '100/page']);
  [...menu.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node => node.textContent?.includes('50'))!.click();
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalledWith('recent', null, '', 1, false, 50, undefined, undefined, undefined));
  await router.push('/console/library/shared');
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalledWith('shared', null, '', 1, false, 20, 'content', undefined, undefined));
  expect(root!.querySelector('.el-pagination__sizes')).toBeNull();
});

it('asks before recycling and only sends the request after confirmation', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'file', name: '合同.pdf', kind: 'FILE', scope: 'PRIVATE', canManage: true, updatedAt: new Date().toISOString() }], total: 1, breadcrumb: [] });
  await mount('/console/library/mine');
  click('更多', root); await nextTick();
  await vi.waitFor(() => expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node => node.textContent?.trim() === '移入回收站')).toBe(true));
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.trim() === '移入回收站')!.click();
  const box = await confirmBox();
  expect(box.textContent).toContain('移入回收站后可以恢复');
  click('取消', box);
  await vi.waitFor(() => expect(document.querySelector('.library-message-box')).toBeNull());
  expect(fixture.recycle).not.toHaveBeenCalled();
  click('更多', root); await nextTick();
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.trim() === '移入回收站')!.click();
  click('移入回收站', await confirmBox());
  await vi.waitFor(() => expect(fixture.recycle).toHaveBeenCalledWith('file'));
  const notice = await vi.waitFor(() => {
    const node = [...document.querySelectorAll('.el-message')].find(item => item.textContent?.includes('已移入回收站'));
    expect(node).toBeTruthy();
    return node!;
  });
  notice.querySelector('button')!.click();
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/console/library/trash'));
  expect(root!.textContent).toContain('所有者');
});

it('asks before a batch recycle and skips the request when cancelled', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'file', name: '合同.pdf', kind: 'FILE', scope: 'PRIVATE', canManage: true, updatedAt: new Date().toISOString() }], total: 1, breadcrumb: [] });
  await mount('/console/library/mine');
  document.querySelector<HTMLElement>('.el-table__header .el-checkbox')!.click();
  await vi.waitFor(() => expect(root!.textContent).toContain('已选 1 项'));
  click('回收', root);
  click('取消', await confirmBox());
  await nextTick();
  expect(fixture.batch).not.toHaveBeenCalled();
});

function enterpriseItem(id: string, name: string, parentId: string | null) {
  return { id, name, kind: parentId ? 'LINK' : 'FOLDER', scope: 'ENTERPRISE', canManage: true, parentId, parentName: parentId ? 'apple' : null, updatedAt: new Date().toISOString() };
}
async function openUnshare() {
  click('更多', root); await nextTick();
  await vi.waitFor(() => expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node => node.textContent?.includes('撤销共享'))).toBe(true));
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('撤销共享'))!.click();
}
it('explains a private change inside a shared folder without requesting it', async () => {
  fixture.list.mockResolvedValue({
    items: [enterpriseItem('link', '百度', 'apple')],
    total: 1,
    breadcrumb: [{ id: 'apple', name: 'apple' }],
    parentScope: 'ENTERPRISE',
  });
  await mount('/console/library/shared?folder=apple');
  await openUnshare();
  const box = await vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>('.library-message-box');
    expect(node?.textContent).toContain('不能单独撤销共享');
    return node!;
  });
  expect(box.textContent).toContain('「百度」在共享文件夹「apple」里，不能单独撤销共享。请先用「移动」把它移出该文件夹，再撤销共享。若要整个文件夹取消共享，请对「apple」点「撤销共享」。');
  expect(fixture.impact).not.toHaveBeenCalled();
  expect(fixture.scope).not.toHaveBeenCalled();
  expect(root!.querySelector('.library-error')).toBeNull();
});
it('confirms unshare for the open shared folder instead of saying it is inside itself', async () => {
  const folder = { id: 'feng', name: '冯静健康事业基础知识库', kind: 'FOLDER', scope: 'ENTERPRISE', canManage: true, parentId: null, updatedAt: '2026-11-19T00:00:00Z' };
  fixture.folders.mockResolvedValue([folder]);
  fixture.list.mockResolvedValue({ items: [], total: 0, breadcrumb: [{ id: 'feng', name: folder.name }], parentScope: 'ENTERPRISE' });
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  await mount('/console/library/shared?folder=feng');
  const more = await vi.waitFor(() => {
    const button = root!.querySelector<HTMLButtonElement>('[aria-label="冯静健康事业基础知识库 更多"]');
    expect(button).toBeTruthy();
    return button!;
  });
  more.click();
  const item = await vi.waitFor(() => {
    const node = [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('撤销共享'));
    expect(node).toBeTruthy();
    return node!;
  });
  item.click();
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('私有'), '确认取消共享', expect.any(Object)));
  expect(document.body.textContent).not.toContain('不能单独撤销共享');
});
it('replaces a shared-parent refusal with the same explanation', async () => {
  fixture.list.mockResolvedValue({ items: [enterpriseItem('link', '百度', 'apple')], total: 1, breadcrumb: [], parentScope: null });
  fixture.scope.mockRejectedValue(new ApiError(409, '共享目录内的资料不能单独改为私有，请先移出目录', 'SHARED_PARENT'));
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  await mount('/console/library/shared');
  await openUnshare();
  await vi.waitFor(() => expect(fixture.scope).toHaveBeenCalledWith('link', 'PRIVATE', false, expect.objectContaining({ confirmUnshare: true })));
  const box = await vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>('.library-message-box');
    expect(node?.textContent).toContain('不能单独撤销共享');
    return node!;
  });
  expect(box.textContent).toContain('共享文件夹「apple」');
  expect(root!.textContent).not.toContain('共享目录内的资料不能单独改为私有');
});
it('still confirms unshare for a shared folder at the root', async () => {
  fixture.list.mockResolvedValue({ items: [enterpriseItem('folder', 'apple', null)], total: 1, breadcrumb: [], parentScope: null });
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  await mount('/console/library/shared');
  await openUnshare();
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('私有'), '确认取消共享', expect.any(Object)));
  await vi.waitFor(() => expect(fixture.scope).toHaveBeenCalledWith('folder', 'PRIVATE', false, { confirmUnshare: true, expectedTreeRevision: revision }));
  await vi.waitFor(() => expect(document.body.textContent).toContain('已撤销共享'));
});
it('does not mutate visibility when recursive confirmation is cancelled', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'folder', name: '已有目录', kind: 'FOLDER', scope: 'PRIVATE', canManage: true, updatedAt: new Date().toISOString() }], total: 1, breadcrumb: [] });
  vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
  await mount('/console/library/mine'); click('更多', root); await nextTick();
  await vi.waitFor(() => expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node => node.textContent?.includes('共享到企业'))).toBe(true));
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('共享到企业'))!.click();
  await vi.waitFor(() => expect(fixture.impact).toHaveBeenCalled()); await nextTick();
  expect(fixture.scope).not.toHaveBeenCalled();
});
it('puts folder actions on the tree and hides 范围 only on the shared list', async () => {
  const folder = { id: 'feng', name: '冯静健康事业基础知识库', kind: 'FOLDER', scope: 'ENTERPRISE', canManage: true, parentId: null, updatedAt: '2026-11-19T00:00:00Z' };
  fixture.folders.mockResolvedValue([folder]);
  fixture.list.mockResolvedValue({ items: [folder], total: 1, breadcrumb: [], parentScope: null });
  await mount('/console/library/mine');
  expect([...root!.querySelectorAll('th')].some(cell => cell.textContent?.includes('范围'))).toBe(true);
  const more = await vi.waitFor(() => {
    const button = root!.querySelector<HTMLButtonElement>('[aria-label="冯静健康事业基础知识库 更多"]');
    expect(button).toBeTruthy();
    return button!;
  });
  more.click();
  const mineLabels = await vi.waitFor(() => {
    const items = [...document.querySelectorAll('.el-dropdown-menu__item')].map(node => node.textContent?.trim());
    expect(items).toContain('改名');
    return items;
  });
  expect(mineLabels).toEqual(expect.arrayContaining(['改名', '移动', '移入回收站']));
  expect(mineLabels.some(text => text?.includes('撤销共享'))).toBe(false);
  document.querySelectorAll('.el-popper').forEach(node => node.remove());
  await router.push('/console/library/shared');
  await vi.waitFor(() => expect(root!.textContent).toContain('冯静健康事业基础知识库'));
  root!.querySelector<HTMLButtonElement>('[aria-label="冯静健康事业基础知识库 更多"]')!.click();
  const sharedLabels = await vi.waitFor(() => {
    const items = [...document.querySelectorAll('.el-dropdown-menu__item')].map(node => node.textContent?.trim());
    expect(items).toContain('撤销共享');
    return items;
  });
  expect(sharedLabels).toEqual(expect.arrayContaining(['改名', '移动', '撤销共享', '移入回收站']));
  document.querySelectorAll('.el-popper').forEach(node => node.remove());
  await router.push('/console/library/shared');
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalledWith('shared', null, '', 1, false, 20, 'content', undefined, undefined));
  expect([...root!.querySelectorAll('th')].some(cell => cell.textContent?.includes('范围'))).toBe(false);
  fixture.list.mockResolvedValue({ items: [{ ...folder, kind: 'FILE', name: '合同.pdf' }], total: 1, breadcrumb: [], parentScope: null });
  document.querySelectorAll('.el-popper').forEach(node => node.remove());
  await router.push('/console/library/trash');
  await vi.waitFor(() => expect(root!.textContent).toContain('合同.pdf'));
  click('更多', root); await nextTick();
  const trash = await vi.waitFor(() => {
    const items = [...document.querySelectorAll('.el-dropdown-menu__item')].map(node => node.textContent?.trim() ?? '');
    expect(items.some(text => text.includes('彻底删除'))).toBe(true);
    return items;
  });
  expect(trash.some(text => text.includes('撤销共享'))).toBe(false);
  expect(trash.some(text => text.includes('恢复'))).toBe(true);
});
