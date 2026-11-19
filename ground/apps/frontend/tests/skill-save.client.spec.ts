import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import AdminOfficialSkills from '../src/views/admin/AdminOfficialSkills.vue';

const api = vi.hoisted(() => ({ list: vi.fn(), createFromForm: vi.fn(), createFromZip: vi.fn(), enable: vi.fn(), detail:vi.fn(), update:vi.fn(), saveDiscovery:vi.fn(), validateZip:vi.fn() }));
vi.mock('../src/api/admin', async original => ({
  ...await original<typeof import('../src/api/admin')>(), adminOfficialSkillApi: api,
}));
let app: App | undefined;
let root: HTMLElement | undefined;
beforeEach(() => {
  vi.resetAllMocks(); api.list.mockResolvedValue([]);
  api.createFromForm.mockResolvedValue({ id: 'skill-new', key: 'skill-new', name: '测试技能', summary: '', instruction: '', enabled: false, contentSource: 'form' });
  api.enable.mockRejectedValue(new Error('启用失败：缺少一句话介绍'));
});
afterEach(() => {
  app?.unmount(); root?.remove(); app = undefined; root = undefined;
  ElMessage.closeAll(); document.querySelectorAll('.el-overlay,.el-popper').forEach(node => node.remove());
});
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLElement>('button,label.el-radio')].find(node => node.textContent?.trim() === text);
  expect(button, text).toBeTruthy(); button!.click(); await nextTick();
}
async function input(placeholder: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[placeholder="${placeholder}"]`)!;
  expect(field).toBeTruthy(); field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
}
async function mount() {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(AdminOfficialSkills) }).use(ElementPlus); app.mount(root);
  await vi.waitFor(() => expect(api.list).toHaveBeenCalled());
  await click('新建技能'); await input('用户看到的名称，可以是中文', '测试技能');
}
it('does not create a skill when save-and-enable is missing the introduction', async () => {
  await mount(); await click('在线填写');
  await input('步骤、要求和输出。名称和介绍不能代替这段执行内容', '按要求执行');
  await click('保存并启用');
  await vi.waitFor(() => expect(document.querySelector('.official-skill-dialog .el-form-item.is-error')?.textContent).toContain('请填写一句话介绍'));
  expect(api.createFromForm).not.toHaveBeenCalled(); expect(api.enable).not.toHaveBeenCalled();
});
it('does not create a ZIP skill without a validated package', async () => {
  await mount(); await input('用一句话说明这个技能做什么', '整理内容');
  await click('保存并启用');
  await vi.waitFor(() => expect(document.querySelector('.official-skill-dialog')?.textContent).toContain('请上传并通过校验的技能包'));
  expect(api.createFromForm).not.toHaveBeenCalled(); expect(api.createFromZip).not.toHaveBeenCalled(); expect(api.enable).not.toHaveBeenCalled();
});
it('continues to allow an explicit incomplete draft save', async () => {
  await mount(); await click('在线填写'); await click('保存');
  await vi.waitFor(() => expect(api.createFromForm).toHaveBeenCalledTimes(1));
  expect(api.enable).not.toHaveBeenCalled();
});

it.each(['新的完整问题',''])('edits or clears recommended questions without losing existing fields: %s',async(questionText)=>{
 const detail={id:'existing',key:'existing',name:'已有技能',summary:'一句话用途',enabled:true,contentSource:'form',packageRevision:1,instruction:'执行正文',updatedAt:'v1',categories:[],discoveryDetail:{schemaVersion:1,displayRevision:2,introduction:'保留详细说明',outputs:['已有交付'],materials:['已有材料'],boundaries:['已有边界'],starters:[{text:'原提问'}]}};
 api.list.mockResolvedValue([detail]);api.detail.mockResolvedValue(detail);api.saveDiscovery.mockResolvedValue({...detail,updatedAt:'v2'});
 root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminOfficialSkills)}).use(ElementPlus);app.mount(root);
 await vi.waitFor(()=>expect(root!.textContent).toContain('已有技能'));
 expect(root!.textContent).not.toContain('技能介绍');await click('编辑');
 await vi.waitFor(()=>expect(document.querySelector<HTMLTextAreaElement>('[aria-label="推荐提问 1"]')?.value).toBe('原提问'));
 const question=document.querySelector<HTMLTextAreaElement>('[aria-label="推荐提问 1"]')!;question.value=questionText;question.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
 await click('保存修改');
 await vi.waitFor(()=>expect(api.saveDiscovery).toHaveBeenCalledTimes(1));
 expect(api.saveDiscovery.mock.calls[0]).toEqual(['existing',{expectedUpdatedAt:'v1',discoveryDetail:{...detail.discoveryDetail,starters:questionText?[{text:questionText}]:[]}}]);
 expect(api.update).not.toHaveBeenCalled();
});

it('creates once when public-detail save fails, then retries with the saved timestamp',async()=>{
 api.createFromForm.mockResolvedValue({id:'created',key:'created',name:'测试技能',summary:'用途',instruction:'',enabled:false,contentSource:'form',updatedAt:'after-create'});
 api.list.mockResolvedValueOnce([]).mockResolvedValue([{id:'created',key:'created',name:'测试技能',summary:'用途',enabled:false,updatedAt:'after-create',categories:[]}]);
 api.saveDiscovery.mockRejectedValueOnce(new Error('介绍保存失败')).mockResolvedValueOnce({id:'created',updatedAt:'after-public'});
 await mount();await click('在线填写');
 await click('添加推荐提问');await input('例如：帮我设计一个老客推荐活动','请帮我做计划');
 await click('保存');await vi.waitFor(()=>expect(api.saveDiscovery).toHaveBeenCalledTimes(1));
 expect(document.querySelector('.official-skill-dialog')).not.toBeNull();
 await vi.waitFor(()=>expect(root!.querySelector('.el-table__body')?.textContent).toContain('测试技能'));
 await click('保存');await vi.waitFor(()=>expect(api.saveDiscovery).toHaveBeenCalledTimes(2));
 expect(api.createFromForm).toHaveBeenCalledTimes(1);
 expect(api.saveDiscovery.mock.calls[1][1].expectedUpdatedAt).toBe('after-create');
});
it('cancel does not persist draft questions',async()=>{
 await mount();await click('添加推荐提问');await input('例如：帮我设计一个老客推荐活动','不要保存');await click('取消');
 expect(api.createFromForm).not.toHaveBeenCalled();expect(api.saveDiscovery).not.toHaveBeenCalled();
});
it.each(['','人工写的介绍'])('imports the package description only when the summary is empty: %s',async(summary)=>{
 api.validateZip.mockResolvedValue({key:'test-skill',name:'测试技能',summary:'技能包description',resourceCount:0});
 await mount();if(summary)await input('用一句话说明这个技能做什么',summary);
 const file=new File(['zip fixture'],'skill.zip',{type:'application/zip'});
 const picker=document.querySelector<HTMLInputElement>('.official-skill-dialog input[type=file][accept*=".zip"]')!;
 expect(picker).toBeTruthy();Object.defineProperty(picker,'files',{configurable:true,value:[file]});picker.dispatchEvent(new Event('change',{bubbles:true}));
 await vi.waitFor(()=>expect(api.validateZip).toHaveBeenCalled());
 await vi.waitFor(()=>expect(document.querySelector<HTMLTextAreaElement>('[placeholder="用一句话说明这个技能做什么"]')?.value).toBe(summary||'技能包description'));
});
it('preserves question ordering controls in the merged editor',async()=>{
 const detail={id:'ordered',key:'ordered',name:'排序技能',summary:'用途',enabled:true,contentSource:'form',instruction:'正文',updatedAt:'v1',categories:[],discoveryDetail:{schemaVersion:1,displayRevision:1,introduction:'',outputs:[],materials:[],boundaries:[],starters:[{text:'第一条'},{text:'第二条'}]}};
 api.list.mockResolvedValue([detail]);api.detail.mockResolvedValue(detail);api.saveDiscovery.mockResolvedValue({...detail,updatedAt:'v2'});
 root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(AdminOfficialSkills)}).use(ElementPlus);app.mount(root);
 await vi.waitFor(()=>expect(root!.textContent).toContain('排序技能'));await click('编辑');
 await vi.waitFor(()=>expect(document.querySelector('[aria-label="推荐提问 2"]')).toBeTruthy());await click('下移');await click('保存修改');
 await vi.waitFor(()=>expect(api.saveDiscovery).toHaveBeenCalledTimes(1));
 expect(api.saveDiscovery.mock.calls[0][1].discoveryDetail.starters).toEqual([{text:'第二条'},{text:'第一条'}]);
});

it('shows newly added unused categories in the list filter and immediately follows directory rename/order',async()=>{
 const {useCatalogCategories}=await import('../src/composables/useCatalogCategories');
 const categories=useCatalogCategories('skill');
 categories.apply({version:100000,items:[{key:'office',name:'办公协作',sortOrder:0}]});
 root=document.createElement('div');document.body.append(root);
 app=createApp({render:()=>h(AdminOfficialSkills)}).use(ElementPlus);app.mount(root);
 await vi.waitFor(()=>expect(api.list).toHaveBeenCalled());
 // The shared directory is updated by the management dialog after a successful save.
 categories.apply({version:100001,items:[{key:'cat-unused',name:'新增未使用分类',sortOrder:0},{key:'office',name:'办公新名称',sortOrder:1}]});
 await nextTick();
 root.querySelectorAll<HTMLElement>('.toolbar-select .el-select__wrapper')[1]!.click();
 await nextTick();
 const listId=root.querySelectorAll('.toolbar-select [role=combobox]')[1]!.getAttribute('aria-controls')!;
 await vi.waitFor(()=>expect([...document.getElementById(listId)!.querySelectorAll('[role=option]')].map(el=>el.textContent?.trim())).toEqual(['新增未使用分类','办公新名称']));
 [...document.querySelectorAll<HTMLElement>('[role=option]')].find(el=>el.textContent?.trim()==='新增未使用分类')!.click();
 await nextTick();
 expect(root.textContent).toContain('新增未使用分类');
 expect(api.createFromForm).not.toHaveBeenCalled();
});

let filterDirectoryVersion=200000;
it.each(['removed','renamed','reordered'] as const)('clears a deleted selection but preserves valid selections when the directory is %s',async(change)=>{
 const {useCatalogCategories}=await import('../src/composables/useCatalogCategories');
 const categories=useCatalogCategories('skill');
 const items=[{key:'office',name:'办公协作',sortOrder:0},{key:'cat-unused',name:'未使用分类',sortOrder:1}];
 categories.apply({version:++filterDirectoryVersion,items});
 api.list.mockResolvedValue([{id:'filter-skill',key:'filter-skill',name:'正常技能',summary:'用途',enabled:true,categories:['office']}]);
 root=document.createElement('div');document.body.append(root);
 app=createApp({render:()=>h(AdminOfficialSkills)}).use(ElementPlus);app.mount(root);
 await vi.waitFor(()=>expect(root!.textContent).toContain('正常技能'));
 root.querySelectorAll<HTMLElement>('.toolbar-select .el-select__wrapper')[1]!.click();await nextTick();
 const listId=root.querySelectorAll('.toolbar-select [role=combobox]')[1]!.getAttribute('aria-controls')!;
 [...document.getElementById(listId)!.querySelectorAll<HTMLElement>('[role=option]')].find(el=>el.textContent?.trim()==='未使用分类')!.click();await nextTick();
 expect(root.textContent).not.toContain('正常技能');
 const updated=change==='removed'?[items[0]]:change==='renamed'?[items[0],{...items[1],name:'分类新名称'}]:[{...items[1],sortOrder:0},{...items[0],sortOrder:1}];
 categories.apply({version:++filterDirectoryVersion,items:updated});await nextTick();
 const selector=root.querySelectorAll('.toolbar-select')[1]!;
 if(change==='removed'){
  expect(selector.querySelector('[role=combobox]')?.getAttribute('aria-expanded')).toBe('false');
  expect(selector.textContent).not.toContain('cat-unused');
  expect(root.textContent).toContain('正常技能');
 }else{
  expect(selector.textContent).toContain(change==='renamed'?'分类新名称':'未使用分类');
  expect(root.textContent).not.toContain('正常技能');
 }
 expect(api.list).toHaveBeenCalledTimes(1);
});
