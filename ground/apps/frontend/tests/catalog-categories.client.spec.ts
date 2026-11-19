import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus, { ElMessageBox } from 'element-plus';
import CatalogCategoryManager from '../src/components/admin/CatalogCategoryManager.vue';
import { useCatalogCategories } from '../src/composables/useCatalogCategories';
const api = vi.hoisted(() => ({get:vi.fn(),read:vi.fn(),save:vi.fn(),usage:vi.fn()}));
vi.mock('../src/api/admin/catalog-categories', () => ({catalogCategoryApi:api}));
vi.mock('../src/utils/confirm-delete',()=>({confirmDelete:vi.fn().mockResolvedValue(undefined)}));
let app:App|undefined, root:HTMLElement|undefined;
const initial={version:3,items:[{key:'a',name:'甲类',sortOrder:0},{key:'b',name:'乙类',sortOrder:1}]};
beforeEach(()=>{initial.version += 10;api.get.mockReset().mockResolvedValue(structuredClone(initial));api.read.mockReset();api.save.mockReset();api.usage.mockReset().mockResolvedValue({count:0});});
afterEach(()=>{vi.restoreAllMocks();ElMessageBox.close();app?.unmount();root?.remove();document.querySelectorAll('.el-overlay,.el-popper').forEach(n=>n.remove());});
async function mount(kind: 'expert' | 'skill' = 'expert'){root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(CatalogCategoryManager,{modelValue:true,kind})}).use(ElementPlus);app.mount(root);await vi.waitFor(()=>expect(document.querySelector('[aria-label="分类名称 1"]')).toBeTruthy());}
async function click(label:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(n=>n.textContent?.trim()===label);expect(b).toBeTruthy();b!.click();await nextTick();}
async function input(index:number,value:string){const f=document.querySelector<HTMLInputElement>(`[aria-label="分类名称 ${index}"]`)!;f.value=value;f.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();}
it('saves renamed, reordered and new categories then updates shared choices',async()=>{
 await mount();await input(1,' 重命名 ');
 const rows=document.querySelectorAll('.category-row');
 rows[1]!.dispatchEvent(new Event('dragstart',{bubbles:true,cancelable:true}));
 rows[0]!.dispatchEvent(new Event('dragover',{bubbles:true,cancelable:true}));
 rows[0]!.dispatchEvent(new Event('drop',{bubbles:true,cancelable:true}));await nextTick();
 await click('新增分类');await input(3,'新类别');
 api.save.mockResolvedValue({version:initial.version+1,items:[{key:'b',name:'乙类',sortOrder:0},{key:'a',name:'重命名',sortOrder:1},{key:'c',name:'新类别',sortOrder:2}]});
 await click('保存');await vi.waitFor(()=>expect(api.save).toHaveBeenCalledWith('expert',initial.version,[{key:'b',name:'乙类'},{key:'a',name:'重命名'},{name:'新类别'}]));
 await vi.waitFor(()=>expect(useCatalogCategories('expert').options.value.map(x=>x.label)).toEqual(['乙类','重命名','新类别']));
});
it('cancelling does not change the shared saved directory',async()=>{
 await mount();await input(1,'尚未保存');await click('取消');expect(api.save).not.toHaveBeenCalled();expect(useCatalogCategories('expert').labels.a).toBe('甲类');
});
it('keeps edited input after failed save and supports retry',async()=>{
 await mount();await input(1,'重试名称');api.save.mockRejectedValueOnce(new Error('分类被 2 个专家引用，请先调整归属')).mockResolvedValueOnce(initial);
 await click('删除');await vi.waitFor(()=>expect(document.querySelectorAll('.category-row')).toHaveLength(1));await click('保存');await vi.waitFor(()=>expect(document.body.textContent).toContain('分类被 2 个专家引用'));
 expect(document.querySelector<HTMLInputElement>('[aria-label="分类名称 1"]')?.value).toBe('乙类');
 await click('保存');await vi.waitFor(()=>expect(api.save).toHaveBeenCalledTimes(2));
});
it('retries loading failure before allowing edits',async()=>{
 api.get.mockRejectedValueOnce(new Error('网络失败'));root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(CatalogCategoryManager,{modelValue:true,kind:'skill'})}).use(ElementPlus);app.mount(root);
 await vi.waitFor(()=>expect(document.body.textContent).toContain('网络失败'));await click('重试');await vi.waitFor(()=>expect(document.querySelector('[aria-label="分类名称 1"]')).toBeTruthy());
});

it('does not overwrite a saved directory with a slow earlier GET',async()=>{
 const state=useCatalogCategories('expert');
 let resolve!: (value:typeof initial)=>void;
 api.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
 const loading=state.load();
 state.apply({version:initial.version+1,items:[{key:'new',name:'最新目录',sortOrder:0}]});
 resolve(initial);await loading;
 expect(state.directory.value.items[0]?.name).toBe('最新目录');
});

it('keeps edits on version conflict until the user explicitly reloads',async()=>{
 const {ApiError}=await import('../src/api/http');
 await mount();await input(1,'我的草稿');api.save.mockRejectedValueOnce(new ApiError(409,'分类已被其他管理员修改，请重新加载后保存'));
 await click('保存');await vi.waitFor(()=>expect(document.body.textContent).toContain('其他管理员'));
 expect(document.querySelector<HTMLInputElement>('[aria-label="分类名称 1"]')?.value).toBe('我的草稿');
 const save=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()==='保存');expect(save?.disabled).toBe(true);
 api.get.mockResolvedValueOnce({version:initial.version+1,items:[{key:'a',name:'其他人保存的名称',sortOrder:0}]});
 await click('重新加载');await vi.waitFor(()=>expect(document.querySelector<HTMLInputElement>('[aria-label="分类名称 1"]')?.value).toBe('其他人保存的名称'));
});

it('places the add action below the header without static instructions and keeps draggable rows',async()=>{
 await mount();
 expect(document.querySelector('.el-dialog__header')?.textContent).not.toContain('新增分类');
 expect(document.querySelector('.category-toolbar')?.textContent).toContain('新增分类');
 expect(document.querySelector('.category-hint')).toBeNull();
 expect(document.body.textContent).not.toContain('后台选项和前台分类会同步更新');
 expect([...document.querySelectorAll('button')].some(b=>['上移','下移'].includes(b.textContent?.trim()??''))).toBe(false);
 expect(document.querySelector('.category-row')?.getAttribute('draggable')).toBe('true');
 expect(document.querySelector('.category-index')).toBeNull();
});

it.each(['expert','skill'] as const)('checks bound %s before deletion and immediately shows the unbind instruction',async(kind)=>{
 await mount(kind);api.usage.mockResolvedValueOnce({count:3});const alert=vi.spyOn(ElMessageBox,'alert').mockResolvedValue('confirm');
 await click('删除');await vi.waitFor(()=>expect(alert).toHaveBeenCalled());
 expect(String(alert.mock.calls[0]?.[0])).toContain(kind === 'expert' ? '3 个专家' : '3 个技能');
 expect(String(alert.mock.calls[0]?.[0])).toContain('取消或修改');
 expect(document.querySelectorAll('.category-row')).toHaveLength(2);
 expect(api.usage).toHaveBeenCalledWith(kind,'a');expect(api.save).not.toHaveBeenCalled();
});
it('failed reference lookup keeps the category and does not permit deletion',async()=>{
 await mount();api.usage.mockRejectedValueOnce(new Error('引用检查失败'));
 await click('删除');await vi.waitFor(()=>expect(document.body.textContent).toContain('引用检查失败'));
 expect(document.querySelectorAll('.category-row')).toHaveLength(2);expect(api.save).not.toHaveBeenCalled();
});

it('restores staged deletion and shows a popup if a new reference appears before saving',async()=>{
 const {ApiError}=await import('../src/api/http');
 await mount();const alert=vi.spyOn(ElMessageBox,'alert').mockResolvedValue('confirm');
 await click('删除');await vi.waitFor(()=>expect(document.querySelectorAll('.category-row')).toHaveLength(1));
 api.save.mockRejectedValueOnce(new ApiError(409,'甲类仍被1个专家使用，请先调整分类','CATEGORY_IN_USE'));
 await click('保存');await vi.waitFor(()=>expect(alert).toHaveBeenCalled());
 expect(document.querySelectorAll('.category-row')).toHaveLength(2);
});
