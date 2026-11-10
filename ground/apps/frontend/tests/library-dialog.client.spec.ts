import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElMessageBox } from 'element-plus';
import Library from '@library-fixture';
const fixture = vi.hoisted(() => ({
 list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20, breadcrumb: [] })),
 preview: vi.fn(async () => ({ nodeId:'fixture', versionId:'fixture-v1', versionNo:1, name:'居中验证资料.md', previewKind:'text', text:'隔离测试内容', parseStatus:'READY', executable:false })),
}));
vi.mock('../src/api/library', async original => ({
 ...(await original<typeof import('../src/api/library')>()),
 libraryConfig: async () => ({ maxFileBytes:1000, allowedExtensions:['.md'] }),
 listLibrary: fixture.list, previewLibrary: fixture.preview,
}));
const require = createRequire(import.meta.url);
const nativeCss = ['el-overlay.css','el-dialog.css','el-message-box.css'].map(file => readFileSync(require.resolve('element-plus/theme-chalk/'+file),'utf8')).join('\n');
const libraryCss = readFileSync('src/styles/libraryDialogs.css','utf8');
let app: App | undefined, root: HTMLElement | undefined, sheet: HTMLStyleElement;
beforeEach(() => {
 sheet=document.createElement('style');sheet.textContent=nativeCss+'\n'+libraryCss;document.head.append(sheet);
 vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('This DOM fixture forbids live network requests'));
});
afterEach(async()=>{ ElMessageBox.close();app?.unmount();root?.remove();sheet.remove();app=undefined;root=undefined;document.querySelectorAll('.el-overlay').forEach(node=>node.remove());vi.restoreAllMocks();await nextTick(); });
async function mount(view='mine') {
 root=document.createElement('div');root.style.cssText='transform:translateX(80px);overflow:hidden;width:600px;height:400px';document.body.append(root);
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/console/library/:view',component:Library}]});
 await router.push('/console/library/'+view+'?preview=fixture&version=fixture-v1');await router.isReady();
 app=createApp({render:()=>h(RouterView)});app.use(createPinia());app.use(ElementPlus);app.use(router);app.mount(root);await nextTick();
 await vi.waitFor(()=>expect(document.querySelector('.el-dialog.library-modal.is-align-center')).toBeTruthy());
 return document.querySelector<HTMLElement>('.el-dialog.library-modal')!;
}
for(const view of ['recent','mine','shared','trash']) it('actual '+view+' route preview teleports to viewport with native auto margins and scroll-safe body',async()=>{
 const dialog=await mount(view),overlay=dialog.closest('.el-overlay')!,stage=dialog.closest('.el-overlay-dialog')!;
 expect(overlay.parentElement).toBe(document.body);expect(root!.contains(dialog)).toBe(false);
 expect(getComputedStyle(overlay).position).toBe('fixed');expect(getComputedStyle(stage).display).toBe('flex');
 expect(getComputedStyle(dialog).margin).toBe('auto');expect(getComputedStyle(dialog).display).toBe('flex');
 expect(getComputedStyle(dialog).maxHeight).toContain('100dvh');
 expect(getComputedStyle(dialog.querySelector('.el-dialog__body')!).overflowY).toBe('auto');
 expect(getComputedStyle(dialog.querySelector('.el-dialog__body')!).minHeight).toBe('0px');
 expect(getComputedStyle(dialog.querySelector('.el-dialog__header')!).flexShrink).toBe('0');
 expect(getComputedStyle(dialog.querySelector('.el-dialog__footer')!).flexShrink).toBe('0');
 expect(dialog.textContent).toContain('隔离测试内容');
});
it('reproduces the former centering override on the real Dialog, rather than merely checking class strings',async()=>{
 const dialog=await mount();const regression=document.createElement('style');regression.textContent='.el-dialog.library-modal{margin:0}';document.head.append(regression);
 expect(getComputedStyle(dialog).margin).toBe('0px');regression.remove();expect(getComputedStyle(dialog).margin).toBe('auto');
});
it('uses real native MessageBox viewport positioning and namespaced scrollable content for confirmations',async()=>{
 const pending=ElMessageBox.confirm('隔离确认，不操作任何资料','确认',{customClass:'library-message-box'}).catch(()=>undefined);
 await nextTick();await vi.waitFor(()=>expect(document.querySelector('.library-message-box')).toBeTruthy());
 const box=document.querySelector<HTMLElement>('.library-message-box')!;
 expect(getComputedStyle(box.closest('.el-overlay')!).position).toBe('fixed');
 expect(getComputedStyle(box.closest('.el-overlay-message-box')!).textAlign).toBe('center');
 expect(getComputedStyle(box).verticalAlign).toBe('middle');expect(getComputedStyle(box).display).toBe('inline-flex');
 expect(getComputedStyle(box).width).toBe('420px');
 expect(getComputedStyle(box.querySelector('.el-message-box__content')!).overflowY).toBe('auto');
 box.querySelector<HTMLButtonElement>('.el-message-box__btns button')!.click();await pending;
});
