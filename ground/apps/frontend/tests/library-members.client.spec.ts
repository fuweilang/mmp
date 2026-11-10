import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import ElementPlus from 'element-plus';
import Library from '@library-fixture';

const fixture = vi.hoisted(() => ({ list: vi.fn(), members: vi.fn(), folders: vi.fn() }));
vi.mock('../src/api/library', async original => ({
  ...await original<typeof import('../src/api/library')>(),
  libraryConfig: async () => ({ maxFileBytes: 1000, allowedExtensions: ['.md'] }),
  listLibrary: fixture.list,
  listLibraryMembers: fixture.members,
  libraryFolders: fixture.folders,
}));

let app: App | undefined, root: HTMLElement | undefined, router: Router;
const roster = {
  members: [
    { userId: 'zhang', name: '张三', phone: '14322222111', itemCount: 2 },
    { userId: 'li', name: '李四', phone: null, itemCount: 0 },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  fixture.members.mockResolvedValue(roster);
  fixture.list.mockResolvedValue({ items: [], total: 0, breadcrumb: [], parentScope: null, ownerUserId: null });
  fixture.folders.mockResolvedValue([]);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Fixture forbids live requests'));
});
afterEach(async () => {
  app?.unmount(); root?.remove(); app = undefined; root = undefined;
  document.querySelectorAll('.el-overlay,.el-popper').forEach(node => node.remove());
  vi.restoreAllMocks(); await nextTick();
});

async function mount(path = '/console/library/members') {
  root = document.createElement('div'); document.body.append(root);
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/console/library/:view', component: Library }] });
  await router.push(path); await router.isReady();
  app = createApp({ render: () => h(RouterView) }); app.use(createPinia()); app.use(ElementPlus); app.use(router); app.mount(root);
  await nextTick();
}

function click(text: string, where: ParentNode = document) {
  const button = [...where.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text);
  expect(button, text).toBeTruthy(); button!.click();
}

it('lists people first and opens one member library without the owner column', async () => {
  await mount();
  await vi.waitFor(() => expect(document.body.textContent).toContain('张三'));
  expect(document.body.textContent).toContain('14322222111');
  expect(document.body.textContent).toContain('—');
  expect(document.querySelector('[aria-label="文件类型"]')).toBeNull();
  expect(fixture.list).not.toHaveBeenCalled();
  const input = document.querySelector<HTMLInputElement>('[aria-label="搜索成员"] input, input[aria-label="搜索成员"]')
    ?? document.querySelector<HTMLInputElement>('input[placeholder="搜索姓名或手机号"]');
  expect(input).toBeTruthy();
  input!.value = '143';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  expect(document.body.textContent).toContain('张三');
  expect(document.body.textContent).not.toContain('李四');
  input!.value = '';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  const row = [...document.querySelectorAll('tr')].find(node => node.textContent?.includes('张三'));
  expect(row).toBeTruthy();
  click('查看资料', row);
  await vi.waitFor(() => expect(router.currentRoute.value.query.member).toBe('zhang'));
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalledWith('members', null, '', 1, false, 20, 'content', undefined, 'zhang'));
  expect(fixture.folders).toHaveBeenCalledWith('members', 'zhang');
  expect(document.body.textContent).not.toContain('所有者');
  expect(document.body.textContent).toContain('正在查看 张三 的资料');
  const upload = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === '上传文件');
  expect(upload?.disabled).toBe(true);
  click('返回成员');
  await vi.waitFor(() => expect(router.currentRoute.value.query.member).toBeUndefined());
  await vi.waitFor(() => expect(document.body.textContent).toContain('选择一位成员'));
});

it('says when the member is not in this enterprise', async () => {
  await mount('/console/library/members?member=missing');
  await vi.waitFor(() => expect(document.body.textContent).toContain('这位成员不在本企业'));
  expect(fixture.list).not.toHaveBeenCalled();
  click('返回成员');
  await vi.waitFor(() => expect(router.currentRoute.value.query.member).toBeUndefined());
});

it('adds the folder owner when an old members link has only a folder', async () => {
  fixture.list.mockImplementation(async (_view: string, parentId: string | null) => {
    if (parentId === 'folder-1') return { items: [], total: 0, breadcrumb: [], parentScope: 'PRIVATE', ownerUserId: 'zhang' };
    return { items: [], total: 0, breadcrumb: [], parentScope: null, ownerUserId: null };
  });
  await mount('/console/library/members?folder=folder-1');
  await vi.waitFor(() => expect(router.currentRoute.value.query.member).toBe('zhang'));
  expect(router.currentRoute.value.query.folder).toBe('folder-1');
  await vi.waitFor(() => expect(fixture.list).toHaveBeenCalledWith('members', 'folder-1', '', 1, false, 20, 'content', undefined, 'zhang'));
});
