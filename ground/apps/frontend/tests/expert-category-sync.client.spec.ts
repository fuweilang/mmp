import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp,h,nextTick,type App} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import ElementPlus,{ElMessage,ElMessageBox} from 'element-plus';
import Experts from '../src/views/admin/AdminOfficialAgents.vue';
import {useCatalogCategories} from '../src/composables/useCatalogCategories';
const api=vi.hoisted(()=>({list:vi.fn()}));
const directoryApi=vi.hoisted(()=>({read:vi.fn(),get:vi.fn(),save:vi.fn(),usage:vi.fn()}));
vi.mock('../src/api/admin',async original=>({...await original<typeof import('../src/api/admin')>(),adminOfficialAgentApi:api,adminKnowledgeCoreApi:{editorCatalog:async()=>[],profiles:async()=>[]},adminLlmProviderApi:{list:async()=>[]}}));
vi.mock('../src/api/admin/catalog-categories',()=>({catalogCategoryApi:directoryApi}));
vi.mock('../src/stores/auth',()=>({useAuthStore:()=>({session:{platformRoleKey:'super_admin'}})}));
vi.mock('../src/components/admin/official-agents/AgentEditorDrawer.vue',()=>({default:{render:()=>null}}));
vi.mock('../src/utils/confirm-delete',()=>({confirmDelete:vi.fn().mockResolvedValue(undefined)}));
let app:App|undefined,host:HTMLElement|undefined,version=7000,dir:any;
const state=useCatalogCategories('expert');
const row={id:'expert-one',key:'expert-one',kind:'GENERAL',category:'productivity',capabilities:[],status:'PUBLISHED',avatarUrl:null,draft:{name:'有归属专家',summary:'用途',openingQuestions:[],systemPrompt:'指令',toolScope:[]},onlineVersion:null,versions:[],grants:[],activeGrantCount:0,createdAt:null,updatedAt:null};
beforeEach(()=>{dir={version:version+=10,items:[{key:'productivity',name:'办公专家',sortOrder:0},{key:'cat-unused',name:'未使用专家分类',sortOrder:1}]};state.apply(dir);directoryApi.read.mockReset().mockImplementation(async()=>dir);directoryApi.get.mockReset().mockImplementation(async()=>dir);directoryApi.usage.mockReset().mockResolvedValue({count:0});directoryApi.save.mockReset().mockImplementation(async(_kind,v,items)=>dir={version:v+1,items:items.map((x:any,i:number)=>({...x,sortOrder:i}))});api.list.mockReset().mockImplementation(async({category})=>({items:!category||category==='productivity'?[row]:[],statusCounts:{all:1,DRAFT:0,PUBLISHED:1,OFFLINE:0}}))});
afterEach(()=>{app?.unmount();host?.remove();ElMessageBox.close();ElMessage.closeAll();document.querySelectorAll('.el-overlay,.el-popper').forEach(n=>n.remove())});
async function mount(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/admin/official-agents',name:'admin-official-agents',component:{render:()=>null}}]});await router.push('/admin/official-agents');host=document.createElement('div');document.body.append(host);app=createApp({render:()=>h(Experts)}).use(router).use(ElementPlus);app.mount(host);await vi.waitFor(()=>expect(host!.textContent).toContain('有归属专家'))}
async function options(){host!.querySelector<HTMLElement>('.category-filter .el-select__wrapper')!.click();await nextTick();const id=host!.querySelector('.category-filter [role=combobox]')!.getAttribute('aria-controls')!;return document.getElementById(id)!}
async function select(name:string){const box=await options();[...box.querySelectorAll<HTMLElement>('[role=option]')].find(x=>x.textContent?.trim()===name)!.click();await vi.waitFor(()=>expect(api.list.mock.calls.at(-1)?.[0].category).toBe(name==='办公专家'?'productivity':'cat-unused'));await nextTick()}
async function click(name:string,within:ParentNode=document){[...within.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===name)!.click();await nextTick()}
it('unused newly added expert categories appear immediately in the list dropdown',async()=>{await mount();state.apply({version:++version,items:[...dir.items,{key:'cat-new',name:'新专家分类',sortOrder:2}]});await nextTick();expect((await options()).textContent).toContain('新专家分类')});
it('expert filter sends a custom key to the server and shows an empty result correctly',async()=>{await mount();await select('未使用专家分类');await vi.waitFor(()=>expect(host!.textContent).not.toContain('有归属专家'));expect(api.list.mock.calls.at(-1)?.[0].category).toBe('cat-unused')});
it('expert category rename synchronizes selected labels without changing the key',async()=>{await mount();await select('办公专家');state.apply({version:++version,items:[{...dir.items[0],name:'专家新名称'},dir.items[1]]});await nextTick();expect(host!.querySelector('.category-filter')!.textContent).toContain('专家新名称');expect(api.list.mock.calls.at(-1)?.[0].category).toBe('productivity')});
it('expert category reorder updates an open dropdown',async()=>{await mount();const box=await options();state.apply({version:++version,items:[{...dir.items[1],sortOrder:0},{...dir.items[0],sortOrder:1}]});await nextTick();expect([...box.querySelectorAll('[role=option]')].map(x=>x.textContent?.trim())).toEqual(['未使用专家分类','办公专家'])});
it('deleting the selected expert category via the real manager clears the filter and reloads results',async()=>{
 await mount();await select('未使用专家分类');await vi.waitFor(()=>expect(host!.textContent).not.toContain('有归属专家'));
 await click('分类管理',host!);await vi.waitFor(()=>expect(document.querySelectorAll('.catalog-category-dialog .category-row')).toHaveLength(2));
 await click('删除',document.querySelectorAll('.catalog-category-dialog .category-row')[1]!);await vi.waitFor(()=>expect(document.querySelectorAll('.catalog-category-dialog .category-row')).toHaveLength(1));
 await click('保存',document.querySelector('.catalog-category-dialog')!);await vi.waitFor(()=>expect(directoryApi.save).toHaveBeenCalled());
 await vi.waitFor(()=>expect(host!.querySelector('.category-filter')!.textContent).not.toContain('cat-unused'));
 await vi.waitFor(()=>expect(host!.textContent).toContain('有归属专家'));
 expect(api.list.mock.calls.at(-1)?.[0].category).toBe('');
});
it('bound expert category deletion shows the popup and retains the row',async()=>{await mount();directoryApi.usage.mockResolvedValueOnce({count:1});await click('分类管理',host!);await vi.waitFor(()=>expect(document.querySelectorAll('.catalog-category-dialog .category-row')).toHaveLength(2));await click('删除',document.querySelectorAll('.catalog-category-dialog .category-row')[0]!);await vi.waitFor(()=>expect(document.body.textContent).toContain('已被 1 个专家绑定'));expect(document.querySelectorAll('.catalog-category-dialog .category-row')).toHaveLength(2);expect(directoryApi.save).not.toHaveBeenCalled()});

it('clearing a deleted expert category retains keyword and publication status',async()=>{
 await mount();
 const search=host!.querySelector<HTMLInputElement>('input[placeholder*="搜索专家"]')!;
 search.value='有归属';search.dispatchEvent(new Event('input',{bubbles:true}));search.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
 await vi.waitFor(()=>expect(api.list.mock.calls.at(-1)?.[0].keyword).toBe('有归属'));
 [...host!.querySelectorAll<HTMLElement>('.el-radio-button')].find(el=>el.textContent?.includes('已发布'))!.click();
 await vi.waitFor(()=>expect(api.list.mock.calls.at(-1)?.[0].status).toBe('PUBLISHED'));
 await select('未使用专家分类');
 state.apply({version:++version,items:[dir.items[0]]});
 await vi.waitFor(()=>expect(api.list.mock.calls.at(-1)?.[0]).toEqual({keyword:'有归属',status:'PUBLISHED',category:''}));
 await vi.waitFor(()=>expect(host!.textContent).toContain('有归属专家'));
});
it('a late response for a deleted category cannot overwrite the restored expert list',async()=>{
 await mount();let resolveOld!:(value:any)=>void;
 api.list.mockImplementationOnce(()=>new Promise(resolve=>resolveOld=resolve));
 await select('未使用专家分类');
 state.apply({version:++version,items:[dir.items[0]]});
 await vi.waitFor(()=>expect(api.list.mock.calls.at(-1)?.[0].category).toBe(''));
 await vi.waitFor(()=>expect(host!.textContent).toContain('有归属专家'));
 resolveOld({items:[],statusCounts:{all:1,DRAFT:0,PUBLISHED:1,OFFLINE:0}});await nextTick();await nextTick();
 expect(host!.textContent).toContain('有归属专家');
});
