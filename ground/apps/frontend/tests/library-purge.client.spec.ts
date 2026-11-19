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
for (const withReason of [true, false]) it('lets a recycled file be purged '+(withReason?'even when an older reason is present':'without a server reason'), async () => {
  await mount(withReason);
  fixture.purge.mockResolvedValue({ ok: true });
  fixture.batch.mockResolvedValue({ skipped: 0, ok: ['protected'], failed: [] });
  const select = root!.querySelector<HTMLInputElement>('.el-table__body-wrapper input[type="checkbox"]')!;
  select.click(); await nextTick();
  await vi.waitFor(()=>expect(root!.querySelector('.library-batch')).toBeTruthy());
  const batch=[...root!.querySelectorAll<HTMLButtonElement>('.library-batch button')].find(button=>button.textContent?.includes('彻底删除'))!;
  expect(batch.disabled).toBe(false);
  const more=[...root!.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('更多'))!;
  more.click(); await nextTick();
  const purge=await vi.waitFor(()=>[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent?.includes('彻底删除'))!);
  expect(purge.getAttribute('aria-disabled')).not.toBe('true');
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  purge.click();
  await vi.waitFor(()=>expect(fixture.purge).toHaveBeenCalledWith('protected'));
});
it('lets a download-only archive be purged from trash', async () => {
  fixture.list.mockResolvedValue({ items: [{ id: 'zip', name: '1111.zip', kind: 'FILE', state: 'RECYCLED', scope: 'PRIVATE', canManage: true, purgeBlockedReason: null,
    currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', sizeBytes: 8, parseReason: '压缩包里没有可引用的文字，仅保存原件' } }], total: 1, breadcrumb: [] });
  fixture.purge.mockResolvedValue({ ok: true });
  root=document.createElement('div'); document.body.append(root);
  const router=createRouter({ history:createMemoryHistory(), routes:[{path:'/console/library/:view', component:Library}] });
  await router.push('/console/library/trash'); await router.isReady();
  app=createApp({render:()=>h(RouterView)}); app.use(ElementPlus); app.use(router); app.mount(root);
  await vi.waitFor(()=>expect(root!.textContent).toContain('1111.zip'));
  expect(root!.textContent).not.toContain('文件暂不支持彻底删除');
  const more=[...root!.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('更多'))!;
  more.click(); await nextTick();
  const purge=await vi.waitFor(()=>[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent?.includes('彻底删除'))!);
  expect(purge.getAttribute('aria-disabled')).not.toBe('true');
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  purge.click();
  await vi.waitFor(()=>expect(fixture.purge).toHaveBeenCalledWith('zip'));
});
