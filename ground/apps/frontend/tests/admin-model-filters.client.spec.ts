import {afterEach, expect, it, vi} from 'vitest';
import {createApp, h, nextTick, type App} from 'vue';
import ElementPlus from 'element-plus';
const api=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('../src/api/admin',()=>({adminLlmProviderApi:api}));
import AdminModels from '../src/views/admin/AdminModels.vue';
let app:App|undefined;
afterEach(()=>{app?.unmount();app=undefined;document.body.innerHTML='';});
const model=(id:string)=>({id,modelId:id,displayName:id,enabled:true,sortOrder:0,supportsTools:true,supportsVision:true,thinkingEnabled:false});
async function flush(){for(let i=0;i<8;i++){await Promise.resolve();await nextTick();}}
async function mount(){
 api.list.mockResolvedValue([
  {id:'direct',name:'deepseek',displayName:'DeepSeek直连',models:[model('deepseek-flash')]},
  {id:'proxy',name:'geekai',displayName:'极客智坊',models:[model('deepseek-v4-pro'),model('claude-fable-5'),model('gemini-3.7-flash'),model('custom-unknown')]},
 ]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();return root;
}
async function choose(label:string,text:string){
 const input=document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
 expect(input,`${label} must be selectable`).not.toBeNull();
 input!.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 const option=[...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(n=>n.textContent?.trim()===text);
 expect(option).toBeDefined();option!.click();await flush();
}
function rowText(root:HTMLElement){return [...root.querySelectorAll('.el-table__body tr')].map(n=>n.textContent).join('\n');}
it('filters model families across vendors and combines with vendor and keyword',async()=>{
 const root=await mount();
 await choose('模型筛选','DeepSeek');
 expect(rowText(root)).toContain('deepseek-flash');expect(rowText(root)).toContain('deepseek-v4-pro');expect(rowText(root)).not.toContain('claude-fable');
 await choose('厂商筛选','极客智坊');
 expect(rowText(root)).toContain('deepseek-v4-pro');expect(rowText(root)).not.toContain('deepseek-flash');
 const search=root.querySelector<HTMLInputElement>('.page-search input')!;search.value='claude';search.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 expect(rowText(root)).not.toContain('deepseek');expect(root.textContent).toContain('无匹配结果');
 search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 await choose('模型筛选','全部模型');await choose('厂商筛选','全部厂商');
 expect(rowText(root)).toContain('claude-fable-5');expect(rowText(root)).toContain('deepseek-flash');
});
it('offers unknown models without incorrectly assigning the channel as model family',async()=>{
 const root=await mount();await choose('模型筛选','其他');
 expect(rowText(root)).toContain('custom-unknown');expect(rowText(root)).not.toContain('gemini');
});
it('resets pagination when a filter changes',async()=>{
 await mount();api.list.mockResolvedValue([{id:'proxy',name:'proxy',displayName:'代理',models:[...Array.from({length:25},(_,i)=>model(`gpt-4-${i}`)),model('claude-last')]}]);
 // A fresh mount loads a catalog large enough to paginate.
 app!.unmount();app=undefined;document.body.innerHTML='';const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 root.querySelector<HTMLButtonElement>('.btn-next')!.click();await flush();
 expect(root.querySelector('.el-pager .is-active')?.textContent?.trim()).toBe('2');
 await choose('模型筛选','Claude');
 expect(root.querySelector('.el-pager .is-active')?.textContent?.trim()).toBe('1');expect(rowText(root)).toContain('claude-last');
});
