import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElMessageBox } from 'element-plus';
import Library from '@library-fixture';
const fixture = vi.hoisted(() => ({ list: vi.fn(), purge: vi.fn(), batch: vi.fn() }));
vi.mock('../src/api/library', async original => ({
  ...(await original<typeof import('../src/api/library')>()),
  libraryConfig: async () => ({ maxFileBytes: 1000, allowedExtensions: ['.md'] }),
  listLibrary: fixture.list, purgeLibrary: fixture.purge, batchLibrary: fixture.batch,
}));
let app: App | undefined, root: HTMLElement | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No live requests in the purge DOM fixture'));
});
afterEach(async () => { ElMessageBox.close(); app?.unmount(); root?.remove(); app=undefined; root=undefined; vi.restoreAllMocks(); await nextTick(); });
async function mount(withReason: boolean) {
  fixture.list.mockResolvedValue({ items: [{ id: 'protected', name: 'protected.md', kind: 'FILE', state: 'RECYCLED', scope: 'PRIVATE', canManage: true,
    ...(withReason ? { purgeBlockedReason: '文件暂不支持彻底删除，可恢复' } : {}),
    currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY', sizeBytes: 8 } }], total: 1, breadcrumb: [] });
  root=document.createElement('div'); document.body.append(root);
  const router=createRouter({ history:createMemoryHistory(), routes:[{path:'/console/library/:view', component:Library}] });
  await router.push('/console/library/trash'); await router.isReady();
  app=createApp({render:()=>h(RouterView)}); app.use(ElementPlus); app.use(router); app.mount(root);
  await vi.waitFor(()=>expect(root!.textContent).toContain('protected.md'));
}
for (const withReason of [true, false]) it('blocks a protected file menu and mixed batch purge '+(withReason?'using the server reason':'with an older response'), async () => {
  await mount(withReason);
  const select = root!.querySelector<HTMLInputElement>('.el-table__body-wrapper input[type="checkbox"]')!;
  select.click(); await nextTick();
  await vi.waitFor(()=>expect(root!.querySelector('.library-batch')).toBeTruthy());
  const batch=[...root!.querySelectorAll<HTMLButtonElement>('.library-batch button')].find(button=>button.textContent?.includes('彻底删除'))!;
  expect(batch.disabled).toBe(true);
  batch.click();
  const more=[...root!.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('更多'))!;
  more.click(); await nextTick();
  await vi.waitFor(()=>expect([...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent?.includes('彻底删除'))).toBe(true));
  const purge=[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent?.includes('彻底删除'))!;
  expect(purge.getAttribute('aria-disabled')).toBe('true');
  purge.click(); await nextTick();
  expect(fixture.purge).not.toHaveBeenCalled(); expect(fixture.batch).not.toHaveBeenCalled();
  expect(root!.textContent).toContain('protected.md');
});
