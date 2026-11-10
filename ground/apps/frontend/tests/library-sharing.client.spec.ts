import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import ElementPlus, { ElMessageBox } from 'element-plus';
import Library from '@library-fixture';

const fixture = vi.hoisted(() => ({ list: vi.fn(), folder: vi.fn(), upload: vi.fn(), impact: vi.fn(), scope: vi.fn() }));
vi.mock('../src/api/library', async original => ({
  ...await original<typeof import('../src/api/library')>(),
  libraryConfig: async () => ({ maxFileBytes: 1000, allowedExtensions: ['.md'] }),
  libraryCustodies: async () => [],
  listLibrary: fixture.list, createLibraryFolder: fixture.folder, uploadLibraryFiles: fixture.upload,
  libraryScopeImpact: fixture.impact, shareLibrary: fixture.scope,
}));
let app: App | undefined, root: HTMLElement | undefined, router: Router;
const revision = 'b'.repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  fixture.list.mockResolvedValue({ items: [], total: 0, breadcrumb: [], parentScope: null });
  fixture.folder.mockResolvedValue({ id: 'created', scope: 'ENTERPRISE' });
  fixture.upload.mockResolvedValue({ items: [{ id: 'file', scope: 'ENTERPRISE' }], failed: [] });
  fixture.impact.mockResolvedValue({ total: 4, changed: 4, treeRevision: revision });
  fixture.scope.mockResolvedValue({ id: 'folder', scope: 'ENTERPRISE' });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Fixture forbids live requests'));
});
afterEach(async () => {
  ElMessageBox.close(); app?.unmount(); root?.remove(); app = undefined; root = undefined;
  document.querySelectorAll('.el-overlay,.el-popper').forEach(node => node.remove());
  vi.restoreAllMocks(); await nextTick();
});
async function mount(path = '/console/library/shared') {
  root = document.createElement('div'); document.body.append(root);
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/console/library/:view', component: Library }] });
  await router.push(path); await router.isReady();
  app = createApp({ render: () => h(RouterView) }); app.use(ElementPlus); app.use(router); app.mount(root);
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalled()); await nextTick();
}
function click(text: string, where: ParentNode = document) {
  const button = [...where.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text);
  expect(button, text).toBeTruthy(); button!.click();
}
async function folderDialog() {
  click('新建', root); await nextTick();
  await vi.waitFor(() => expect(document.querySelector('.el-dropdown-menu__item')).toBeTruthy());
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('新建文件夹'))!.click();
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
it('keeps personal root creation private', async () => {
  await mount('/console/library/mine'); const dialog = await folderDialog();
  expect(dialog.textContent).toContain('仅自己可见'); name(dialog, '个人目录'); await nextTick(); click('创建', dialog);
  await vi.waitFor(() => expect(fixture.folder).toHaveBeenCalledWith('个人目录', null, { scope: 'PRIVATE', confirmShare: false }));
});
it('confirms all descendants using the server count and revision', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'folder', name: '已有目录', kind: 'FOLDER', scope: 'PRIVATE', canManage: true, updatedAt: new Date().toISOString() }], total: 1, breadcrumb: [] });
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  await mount('/console/library/mine'); click('更多', root); await nextTick();
  await vi.waitFor(() => expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node => node.textContent?.includes('改为企业共享'))).toBe(true));
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('改为企业共享'))!.click();
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('4 项'), '确认共享', expect.any(Object)));
  await vi.waitFor(() => expect(fixture.scope).toHaveBeenCalledWith('folder', 'ENTERPRISE', true, { confirmUnshare: false, expectedTreeRevision: revision }));
});

it('freezes the shared upload destination even if the user changes views before starting', async () => {
  await mount(); click('上传文件', root); await nextTick();
  await vi.waitFor(() => expect(document.querySelector('.el-dialog')).toBeTruthy());
  const dialog = document.querySelector<HTMLElement>('.el-dialog')!;
  expect(dialog.textContent).toContain('本企业成员可见');
  const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'shared.md')] });
  input.dispatchEvent(new Event('change', { bubbles: true })); await nextTick();
  await router.replace('/console/library/mine'); await nextTick(); click('开始上传', dialog);
  await vi.waitFor(() => expect(fixture.upload).toHaveBeenCalledWith(expect.any(Array), null, expect.any(Function), { scope: 'ENTERPRISE', confirmShare: true }));
});

it('does not mutate visibility when recursive confirmation is cancelled', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'folder', name: '已有目录', kind: 'FOLDER', scope: 'PRIVATE', canManage: true, updatedAt: new Date().toISOString() }], total: 1, breadcrumb: [] });
  vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
  await mount('/console/library/mine'); click('更多', root); await nextTick();
  await vi.waitFor(() => expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node => node.textContent?.includes('改为企业共享'))).toBe(true));
  [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('改为企业共享'))!.click();
  await vi.waitFor(() => expect(fixture.impact).toHaveBeenCalled()); await nextTick();
  expect(fixture.scope).not.toHaveBeenCalled();
});
