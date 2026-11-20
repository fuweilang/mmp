import {afterEach, expect, it, vi} from 'vitest';
import {createApp, h, nextTick, type App} from 'vue';
import ElementPlus from 'element-plus';
const api=vi.hoisted(()=>({list:vi.fn(),removeModel:vi.fn(),updateModel:vi.fn(),probe:vi.fn(),listRemoteModels:vi.fn(),create:vi.fn()}));
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
it('selects visible remote models and keeps a typed id outside that list',async()=>{
 api.listRemoteModels.mockResolvedValue({ok:true,models:[{id:'alpha',type:'chat'},{id:'beta',type:'chat'},{id:'pic',type:'image'}]});
 const root=await mount();
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='新建模型')!.click();await flush();
 const dialog=document.querySelector('.models-dialog')!;
 const base=[...dialog.querySelectorAll('.el-form-item')].find(node=>node.textContent?.includes('Base URL'))!.querySelector('input')!;
 base.value='https://geekai.co/api/v1';base.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='获取最新模型')!.click();await flush();
 expect(dialog.textContent).toContain('alpha');expect(dialog.textContent).toContain('beta');expect(dialog.textContent).not.toContain('pic');
 const box=(label:string)=>[...dialog.querySelectorAll<HTMLElement>('.el-checkbox')].find(node=>node.textContent?.includes(label))!;
 box('全选').click();await flush();
 expect(box('alpha').classList.contains('is-checked')).toBe(true);
 expect(box('beta').classList.contains('is-checked')).toBe(true);
 const manual=[...dialog.querySelectorAll('.el-form-item')].find(node=>node.textContent?.includes('手填 Model ID'))!.querySelector('input')!;
 manual.value='custom-id';manual.dispatchEvent(new Event('input',{bubbles:true}));
 manual.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();
 expect(box('custom-id').classList.contains('is-checked')).toBe(true);
 box('全选').click();await flush();
 expect(box('alpha').classList.contains('is-checked')).toBe(false);
 expect(box('custom-id').classList.contains('is-checked')).toBe(true);
 box('alpha').click();await flush();
 expect(box('全选').querySelector('.el-checkbox__input')!.classList.contains('is-indeterminate')).toBe(true);
});
it('creates a provider from the display name without asking for a short name',async()=>{
 api.create.mockResolvedValue({});
 const root=await mount();
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='新建模型')!.click();await flush();
 const dialog=document.querySelector('.models-dialog')!;
 expect(dialog.textContent).not.toContain('短名');
 const field=(label:string)=>[...dialog.querySelectorAll('.el-form-item')].find(node=>node.textContent?.includes(label))!.querySelector('input')!;
 field('厂商名').value='DeepSeek 直连';field('厂商名').dispatchEvent(new Event('input',{bubbles:true}));
 field('Base URL').value='https://api.deepseek.com';field('Base URL').dispatchEvent(new Event('input',{bubbles:true}));
 field('API Key').value='sk-test';field('API Key').dispatchEvent(new Event('input',{bubbles:true}));
 const manual=field('手填 Model ID');
 manual.value='deepseek-flash';manual.dispatchEvent(new Event('input',{bubbles:true}));
 manual.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush();
 [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='保存')!.click();await flush();
 await vi.waitFor(()=>expect(api.create).toHaveBeenCalled());
 expect(api.create.mock.calls[0][0]).toMatchObject({name:'deepseek-2',displayName:'DeepSeek 直连'});
});
it('rejects a duplicate vendor name and edits only the current model',async()=>{
 api.create.mockReset();
 const root=await mount();
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='新建模型')!.click();await flush();
 const createDialog=document.querySelector('.models-dialog')!;
 const name=createDialog.querySelector('input')!;
 name.value='deepseek直连';name.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 expect(createDialog.textContent).toContain('已存在');
 [...createDialog.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='保存')!.click();await flush();
 expect(api.create).not.toHaveBeenCalled();
 document.querySelector<HTMLElement>('.el-dialog__headerbtn')?.click();await flush();
 const row=[...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes('deepseek-v4-pro'))!;
 [...row.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='编辑')!.click();await flush();
 const editDialog=document.querySelector('.models-dialog')!;
 expect(editDialog.textContent).toContain('deepseek-v4-pro');
 expect(editDialog.textContent).not.toContain('claude-fable-5');
 expect(editDialog.textContent).not.toContain('手填 Model ID');
 expect(editDialog.textContent).not.toContain('获取最新模型');
});
it('hides retrieval-only vendors and the retrieval shortcut',async()=>{
 api.list.mockResolvedValue([
  {id:'sf',name:'siliconflow_knowledge',displayName:'SiliconFlow 知识库',models:[]},
  {id:'direct',name:'deepseek',displayName:'DeepSeek直连',models:[model('deepseek-flash')]},
 ]);
 app?.unmount();document.body.innerHTML='';const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 expect([...root.querySelectorAll('button')].some(node=>node.textContent?.trim()==='检索服务')).toBe(false);
 document.querySelector('input[aria-label="厂商筛选"]')!.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 const labels=[...document.querySelectorAll('.el-select-dropdown__item')].map(node=>node.textContent?.trim());
 expect(labels).toContain('DeepSeek直连');
 expect(labels).not.toContain('SiliconFlow 知识库');
});
it('vendor filter only allows choosing options, including while open',async()=>{
 const root=await mount();
 expect(root.querySelector('input[aria-label="模型筛选"]')).toBeNull();
 const input=root.querySelector<HTMLInputElement>('input[aria-label="厂商筛选"]')!;
 expect(input.readOnly).toBe(true);
 input.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 expect(input.readOnly).toBe(true);
 expect([...document.querySelectorAll('.el-select-dropdown__item')].some(option=>option.textContent?.trim()==='极客智坊')).toBe(true);
 expect(root.querySelector<HTMLInputElement>('.page-search input')!.readOnly).toBe(false);
});
it('filters by vendor and keyword together',async()=>{
 const root=await mount();
 await choose('厂商筛选','极客智坊');
 expect(rowText(root)).toContain('deepseek-v4-pro');expect(rowText(root)).not.toContain('deepseek-flash');
 const search=root.querySelector<HTMLInputElement>('.page-search input')!;search.value='没有这条';search.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 expect(rowText(root)).not.toContain('deepseek');expect(root.textContent).toContain('无匹配结果');
 search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 await choose('厂商筛选','全部厂商');
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
 api.list.mockResolvedValue([{id:'p',name:'p',displayName:'厂商',models:[model('ok-model'),model('bad'),{...model('off-model'),enabled:false}]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='测试已启用')!.click();await flush();
 [...document.querySelectorAll<HTMLButtonElement>('.el-message-box button')].find(node=>node.textContent?.trim()==='开始')!.click();
 await vi.waitFor(()=>expect(api.updateModel).toHaveBeenCalledWith('bad',{enabled:false}));
 expect(api.updateModel).not.toHaveBeenCalledWith('ok-model',{enabled:false});
 const probed=api.probe.mock.calls.map(call=>call[0].modelRowId);
 expect(probed).toContain('ok-model');
 expect(probed).toContain('bad');
 expect(probed).not.toContain('off-model');
});
it('tests the checked models, including disabled ones, and skips images',async()=>{
 api.probe.mockReset();api.updateModel.mockReset();
 api.updateModel.mockResolvedValue({});
 api.probe.mockImplementation(async(body:{modelRowId:string})=>body.modelRowId==='on-model'?{ok:false,message:'检查失败'}:{ok:true,message:'检查通过'});
 api.list.mockResolvedValue([{id:'p',name:'p',displayName:'厂商',models:[model('on-model'),{...model('off-model'),enabled:false},{...model('pic'),purpose:'image'},model('other')]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 for (const id of ['on-model','off-model','pic']) {
  [...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes(id))!.querySelector<HTMLElement>('.el-checkbox')!.click();
 }
 await flush();
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.includes('测试所选'))!.click();await flush();
 [...document.querySelectorAll<HTMLButtonElement>('.el-message-box button')].find(node=>node.textContent?.trim()==='开始')!.click();
 await vi.waitFor(()=>expect(api.updateModel).toHaveBeenCalledWith('on-model',{enabled:false}));
 expect(api.probe.mock.calls.map(call=>call[0].modelRowId).sort()).toEqual(['off-model','on-model']);
 expect(api.updateModel).not.toHaveBeenCalledWith('off-model',{enabled:false});
});
it('probes a disabled model from its row button',async()=>{
 api.probe.mockReset();api.updateModel.mockReset();
 api.probe.mockResolvedValue({ok:true,message:'检查通过'});
 api.list.mockResolvedValue([{id:'p',name:'p',displayName:'厂商',models:[{...model('off-model'),enabled:false}]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 const row=[...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes('off-model'))!;
 [...row.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='测试')!.click();
 await vi.waitFor(()=>expect(api.probe).toHaveBeenCalledWith({modelRowId:'off-model'},expect.anything()));
 expect(api.updateModel).not.toHaveBeenCalled();
});
it('disables a model when its row test cannot connect',async()=>{
 api.probe.mockReset();api.updateModel.mockReset();
 api.updateModel.mockResolvedValue({});
 api.probe.mockResolvedValue({ok:false,message:'检查失败'});
 api.list.mockResolvedValue([{id:'p',name:'p',displayName:'厂商',models:[model('off-model')]}]);
 const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 const row=[...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes('off-model'))!;
 [...row.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='测试')!.click();
 await vi.waitFor(()=>expect(api.updateModel).toHaveBeenCalledWith('off-model',{enabled:false}));
});
it('colors every vendor name the same as that vendor dot',async()=>{
 const root=await mount();
 document.querySelector('input[aria-label="厂商筛选"]')!.closest('.el-select')!.querySelector<HTMLElement>('.el-select__wrapper')!.click();await flush();
 const option=(label:string)=>[...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node=>node.textContent?.trim()===label)!;
 const geek=option('极客智坊');const direct=option('DeepSeek直连');
 const colorOf=(id:string)=>[...root.querySelectorAll('.el-table__body-wrapper tbody tr')].find(node=>node.textContent?.includes(id))!.querySelector<HTMLElement>('.prov-name')!.style.color;
 expect(colorOf('deepseek-v4-pro')).toBe(geek.querySelector<HTMLElement>('.mark-dot')!.style.backgroundColor);
 expect(colorOf('claude-fable-5')).toBe(colorOf('deepseek-v4-pro'));
 expect(colorOf('deepseek-flash')).toBe(direct.querySelector<HTMLElement>('.mark-dot')!.style.backgroundColor);
 expect(colorOf('deepseek-flash')).not.toBe(colorOf('deepseek-v4-pro'));
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
 const selected=[...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='测试所选');
 expect(selected?.classList.contains('el-button--primary')).toBe(true);
 const purpose=document.querySelector('input[aria-label="用途筛选"]')!.closest<HTMLElement>('.el-select')!;
 expect(purpose.style.display).toBe('none');
});
it('clears each filter dropdown back to the full list',async()=>{
 const root=await mount();
 const cases:[string,string][]=[['厂商筛选','极客智坊'],['用途筛选','对话'],['运行状态','待检查'],['启用筛选','已启用']];
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
 await choose('厂商筛选','极客智坊');
 await choose('用途筛选','对话');
 await choose('运行状态','待检查');
 await choose('启用筛选','已启用');
 const search=root.querySelector<HTMLInputElement>('.page-search input')!;
 search.value='没有这条';search.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 expect(root.textContent).toContain('无匹配结果');
 [...root.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()==='重置')!.click();await flush();
 expect(search.value).toBe('');
 expect(rowText(root)).toContain('deepseek-flash');
 expect(rowText(root)).toContain('claude-fable-5');
 expect(rowText(root)).toContain('custom-unknown');
 for (const label of ['厂商筛选','用途筛选','运行状态','启用筛选']) {
  const select=document.querySelector(`input[aria-label="${label}"]`)!.closest('.el-select')!;
  expect(select.textContent).toMatch(label==='启用筛选'?/启用与禁用/:/全部/);
 }
});
it('resets pagination when a filter changes',async()=>{
 await mount();api.list.mockResolvedValue([{id:'proxy',name:'proxy',displayName:'代理',models:Array.from({length:25},(_,i)=>model(`gpt-4-${i}`))},{id:'claude',name:'claude',displayName:'Claude厂商',models:[model('claude-last')]}]);
 app!.unmount();app=undefined;document.body.innerHTML='';const root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminModels)}).use(ElementPlus);app.mount(root);await flush();
 root.querySelector<HTMLButtonElement>('.btn-next')!.click();await flush();
 expect(root.querySelector('.el-pager .is-active')?.textContent?.trim()).toBe('2');
 await choose('厂商筛选','Claude厂商');
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
 const vendor=image.querySelector<HTMLElement>('.prov-name')!;expect(vendor.tagName).toBe('SPAN');vendor.click();await flush();expect(document.querySelector('.models-dialog')).toBeNull();
});
