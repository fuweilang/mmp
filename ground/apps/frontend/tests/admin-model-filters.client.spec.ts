import {afterEach, expect, it, vi} from 'vitest';
import {createApp, h, nextTick, type App} from 'vue';
import ElementPlus from 'element-plus';
const api=vi.hoisted(()=>({list:vi.fn(),removeModel:vi.fn(),updateModel:vi.fn(),probe:vi.fn()}));
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
it('lists models automatic routing can use first, by default and priority',async()=>{
 const healthy=(id:string,sortOrder:number,extra:Record<string,unknown>={})=>({...model(id),sortOrder,health:{status:'healthy',reason:null,checkedAt:null,retryAt:null,latencyMs:1},...extra});
 api.list.mockResolvedValue([
  {id:'late',name:'late',displayName:'后厂商',enabled:true,hasApiKey:true,sortOrder:2,models:[healthy('late-zero',0),{...healthy('late-off',0),enabled:false},{...model('late-image'),purpose:'image',sortOrder:0}]},
  {id:'early',name:'early',displayName:'先厂商',enabled:true,hasApiKey:true,sortOrder:1,models:[healthy('early-nine',9),healthy('early-default',4,{isPreferred:true}),healthy('early-zero',0)]},
 ]);
 app?.unmount();document.body.innerHTML='';const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 const ids=[...root.querySelectorAll('.el-table__body-wrapper tbody tr')].map(row=>row.textContent||'').filter((text,index,all)=>all.indexOf(text)===index);
 const order=['early-default','early-zero','late-zero','early-nine','late-image','late-off'].map(id=>ids.findIndex(text=>text.includes(id)));
 expect(order).toEqual([0,1,2,3,4,5]);
});
it.each(['模型筛选','厂商筛选'])('%s only allows choosing options, including while open',async(label)=>{
 const root=await mount();
 const input=root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
 expect(input.readOnly).toBe(true);
 input.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 expect(input.readOnly).toBe(true);
 expect([...document.querySelectorAll('.el-select-dropdown__item')].some(option=>option.textContent?.trim()===(label==='模型筛选'?'DeepSeek':'极客智坊'))).toBe(true);
 expect(root.querySelector<HTMLInputElement>('.page-search input')!.readOnly).toBe(false);
});
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
it('filters enabled models separately from 手动禁用',async()=>{
 await mount();app!.unmount();document.body.innerHTML='';
 api.list.mockResolvedValue([{id:'direct',name:'deepseek',displayName:'DeepSeek直连',models:[{...model('deepseek-flash'),enabled:false},model('claude-fable-5')]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 await choose('启用筛选','已启用');
 expect(rowText(root)).toContain('claude-fable-5');expect(rowText(root)).not.toContain('deepseek-flash');
 await choose('启用筛选','已禁用');
 expect(rowText(root)).toContain('deepseek-flash');expect(rowText(root)).not.toContain('claude-fable-5');
});
it('disables a model when the enabled-model test cannot connect',async()=>{
 api.probe.mockImplementation(async(body:{modelRowId:string})=>body.modelRowId==='bad'?{ok:false,message:'检查失败'}:{ok:true,message:'检查通过'});
 api.updateModel.mockResolvedValue({});
 api.list.mockResolvedValue([{id:'p',name:'p',displayName:'厂商',models:[model('ok-model'),model('bad')]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='测试已启用')!.click();await flush();
 [...document.querySelectorAll<HTMLButtonElement>('.el-message-box button')].find(node=>node.textContent?.trim()==='开始')!.click();
 await vi.waitFor(()=>expect(api.updateModel).toHaveBeenCalledWith('bad',{enabled:false}));
 expect(api.updateModel).not.toHaveBeenCalledWith('ok-model',{enabled:false});
});
it('colors vendor text the same as that model family dot',async()=>{
 const root=await mount();
 document.querySelector('input[aria-label="模型筛选"]')!.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 const deepseek=[...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node=>node.textContent?.trim()==='DeepSeek')!;
 const claude=[...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node=>node.textContent?.trim()==='Claude')!;
 const row=[...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes('deepseek-flash'))!;
 const vendor=row.querySelector<HTMLElement>('button[aria-label^="设置供应商"]')!;
 expect(vendor.style.color).toBe(deepseek.querySelector<HTMLElement>('.mark-dot')!.style.backgroundColor);
 expect(claude.querySelector<HTMLElement>('.mark-dot')!.style.backgroundColor).not.toBe(deepseek.querySelector<HTMLElement>('.mark-dot')!.style.backgroundColor);
});
it('uses the same color for a status dot and its column text',async()=>{
 const root=await mount();
 document.querySelector('input[aria-label="运行状态"]')!.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 const option=[...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node=>node.textContent?.includes('待检查'))!;
 const dot=option.querySelector<HTMLElement>('.mark-dot')!;
 const cell=[...root.querySelectorAll<HTMLElement>('.el-table__body .mark')].find(node=>node.textContent?.includes('待检查'))!;
 expect(dot.style.backgroundColor).toBe(cell.querySelector<HTMLElement>('.mark-dot')!.style.backgroundColor);
 expect(cell.querySelector('span')!.style.color).toBe(dot.style.backgroundColor);
});
it('shows the enabled-model test button in primary blue',async()=>{
 const root=await mount();
 const button=[...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='测试已启用');
 expect(button?.classList.contains('el-button--primary')).toBe(true);
 const purpose=document.querySelector('input[aria-label="用途筛选"]')!.closest<HTMLElement>('.el-select')!;
 expect(purpose.style.display).toBe('none');
});
it('clears each filter dropdown back to the full list',async()=>{
 const root=await mount();
 const cases:[string,string][]=[['模型筛选','DeepSeek'],['厂商筛选','极客智坊'],['用途筛选','对话'],['运行状态','待检查'],['启用筛选','已启用']];
 for (const [label,text] of cases) {
  await choose(label,text);
  const select=document.querySelector(`input[aria-label="${label}"]`)!.closest('.el-select')!;
  select.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));await flush();
  const clear=select.querySelector<HTMLElement>('.el-select__clear');
  expect(clear,`${label} clear button`).toBeTruthy();
  clear!.click();await flush();
 }
 expect(rowText(root)).toContain('deepseek-flash');
 expect(rowText(root)).toContain('claude-fable-5');
 expect(rowText(root)).toContain('custom-unknown');
});
it('resets the search box and every filter together',async()=>{
 const root=await mount();
 await choose('模型筛选','DeepSeek');
 await choose('厂商筛选','极客智坊');
 await choose('用途筛选','对话');
 await choose('运行状态','待检查');
 await choose('启用筛选','已启用');
 const search=root.querySelector<HTMLInputElement>('.page-search input')!;
 search.value='claude';search.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 expect(root.textContent).toContain('无匹配结果');
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='重置')!.click();await flush();
 expect(search.value).toBe('');
 expect(rowText(root)).toContain('deepseek-flash');
 expect(rowText(root)).toContain('claude-fable-5');
 expect(rowText(root)).toContain('custom-unknown');
 for (const label of ['模型筛选','厂商筛选','用途筛选','运行状态','启用筛选']) {
  const select=document.querySelector(`input[aria-label="${label}"]`)!.closest('.el-select')!;
  expect(select.textContent).toMatch(label==='启用筛选'?/启用与禁用/:/全部/);
 }
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
it('deletes every checked model from the toolbar',async()=>{
 const root=await mount();api.removeModel.mockResolvedValue(undefined);
 for (const id of ['deepseek-flash','deepseek-v4-pro']) {
  [...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes(id))!.querySelector<HTMLElement>('.el-checkbox')!.click();
 }
 await flush();
 const button=[...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.includes('删除所选'))!;
 expect(button.textContent).toContain('2');
 button.click();await flush();
 expect(document.querySelector('.delete-confirm__objects')?.textContent).toContain('deepseek-flash');
 [...document.querySelectorAll<HTMLButtonElement>('.delete-confirm button')].find(node=>node.textContent?.trim()==='删除所选')!.click();await flush();
 await vi.waitFor(()=>expect(api.removeModel).toHaveBeenCalledTimes(2));
 expect(api.removeModel).toHaveBeenCalledWith('deepseek-flash');
 expect(api.removeModel).toHaveBeenCalledWith('deepseek-v4-pro');
});
it('uses the shared model deletion dialog and sends no request on cancel',async()=>{
 const root=await mount();api.removeModel.mockClear();
 const row=[...root.querySelectorAll('.el-table__body tr')].find(node=>node.textContent?.includes('claude-fable-5'))!;
 const remove=[...row.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='删除')!;
 remove.click();await flush();
 const box=document.querySelector('.el-message-box.delete-confirm')!;
 expect(box.querySelector('.delete-confirm__objects')?.textContent).toBe('claude-fable-5');
 [...box.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='取消')!.click();await flush();
 expect(api.removeModel).not.toHaveBeenCalled();
 await vi.waitFor(()=>expect(document.querySelector('.el-message-box.delete-confirm')).toBeNull());
 remove.click();await flush();
 [...document.querySelectorAll<HTMLButtonElement>('.delete-confirm button')].find(node=>node.textContent?.trim()==='删除模型')!.click();await flush();
 await vi.waitFor(()=>expect(api.removeModel).toHaveBeenCalledExactlyOnceWith('claude-fable-5'));
});
it('shows image purpose and hides chat-only controls for image rows',async()=>{
 await mount();app!.unmount();document.body.innerHTML='';
 api.list.mockResolvedValue([{id:'sf',name:'siliconflow',displayName:'SiliconFlow 知识库',models:[{...model('Kwai-Kolors/Kolors'),purpose:'image'},model('deepseek-flash')]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 const image=[...root.querySelectorAll('.el-table__body tr')].find(n=>n.textContent?.includes('Kwai-Kolors/Kolors'))!;
 api.updateModel.mockResolvedValue({});
 image.querySelector<HTMLElement>('.el-switch__core')!.click();await flush();
 expect(api.updateModel).toHaveBeenCalledWith('Kwai-Kolors/Kolors',{enabled:false});
 expect(image.textContent).toContain('生成图片');expect(image.textContent).not.toContain('设为默认');expect(image.querySelectorAll('.el-switch')).toHaveLength(1);expect(image.textContent).toContain('预览生成');
 await choose('用途筛选','生成图片');expect(rowText(root)).toContain('Kolors');expect(rowText(root)).not.toContain('deepseek-flash');
 const vendor=document.querySelector<HTMLButtonElement>('button[aria-label="设置供应商 SiliconFlow 知识库"]');expect(vendor).toBeTruthy();vendor!.click();await flush();expect(document.querySelector('.models-dialog')?.textContent).toContain('API Key');
});
