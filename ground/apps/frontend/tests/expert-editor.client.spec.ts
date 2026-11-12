import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import AdminOfficialAgents from '../src/views/admin/AdminOfficialAgents.vue';
import ExpertDraftPreview from '../src/components/admin/ExpertDraftPreview.vue';
import ExpertResourcePicker from '../src/components/admin/ExpertResourcePicker.vue';
import ExpertKnowledgePanel from '../src/components/admin/ExpertKnowledgePanel.vue';
import { createExpertEditorResources } from '../src/components/admin/expert-editor-resources';

const fixture = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), create: vi.fn(), preview: vi.fn(), publish: vi.fn(), removeAvatar: vi.fn(), uploadAvatar:vi.fn(), listSkills:vi.fn(), skillDetail:vi.fn(), catalog:vi.fn(),bases:vi.fn(), releases:vi.fn(), documents:vi.fn(),chunks:vi.fn(),profiles:vi.fn(),health:vi.fn(),extracted:vi.fn(),createBase:vi.fn(),upload:vi.fn(),job:vi.fn(),jobAction:vi.fn(),release:vi.fn(),providers:vi.fn(),usage:vi.fn() }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ session: { platformRoleKey: 'super_admin' } }) }));
vi.mock('../src/utils/agent', () => ({ agentWebUrl: 'http://127.0.0.1:5201/agent/' }));
vi.mock('../src/api/admin', async original => ({
  ...await original<typeof import('../src/api/admin')>(),
  adminOfficialAgentApi: fixture,
  adminOfficialSkillApi: { enabledOptions: async () => [], list:fixture.listSkills,detail:fixture.skillDetail },
  adminLlmProviderApi: { list: fixture.providers },
  adminKnowledgeCoreApi: { editorCatalog:fixture.catalog,profiles:fixture.profiles,bases:fixture.bases,releases:fixture.releases,documents:fixture.documents,chunks:fixture.chunks,health:fixture.health,extracted:fixture.extracted,createBase:fixture.createBase,upload:fixture.upload,job:fixture.job,jobAction:fixture.jobAction,release:fixture.release,usage:fixture.usage,originalUrl:()=>'/test-original' },
}));
let app: App | undefined, root: HTMLElement | undefined;
let row: any;
beforeEach(() => {
  // jsdom has no scrolling layout; Element Plus uses this browser API to reveal invalid fields.
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.resetAllMocks();
  vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:64,height:64,close:vi.fn()}));
  vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=>'blob:avatar-test');static revokeObjectURL=vi.fn();});
  fixture.providers.mockResolvedValue([]);fixture.usage.mockResolvedValue([]);
  fixture.listSkills.mockResolvedValue([]);
  fixture.bases.mockResolvedValue([]);fixture.profiles.mockResolvedValue([]);
  fixture.catalog.mockImplementation(async()=>Promise.all((await fixture.bases()).map(async(base:any)=>({base,documents:base.enabled ? await fixture.documents(base.id) : [],releases:base.enabled ? await fixture.releases(base.id) : []}))));
  fixture.extracted.mockResolvedValue({text:'资料正文原文',nextOffset:null,hasGaps:false});
  row = { id: 'expert-one', key: 'expert-one', kind: 'GENERAL', status: 'DRAFT', avatarUrl: null, category: null,
    capabilities: [], linkedSkillIds: [], linkedSkills: [], createdAt: null, updatedAt: null,
    draft: { name: '测试专家', summary: '专家简介', systemPrompt: '原指令', openingQuestions: [], toolScope: [],
      expertDefinition: { profile: { role: '研究顾问' } }, executionConfig: { route: 'KNOWLEDGE_CORE', retrievalPolicy: 'OFF', releaseIds: [], budgetTokens: 8000, generationModel: { mode: 'AUTO' } } } };
  fixture.list.mockImplementation(async () => ({ items: [row], statusCounts: { all: 1, DRAFT: 1, PUBLISHED: 0, OFFLINE: 0 } }));
  fixture.update.mockImplementation(async (_id, draft) => (row = { ...row, draft: { ...row.draft, ...draft } }));
  fixture.create.mockImplementation(async draft => (row = { ...row, draft: { ...row.draft, ...draft } }));
  fixture.preview.mockResolvedValue({ agentId: 'expert-one', previewId: 'preview-one', launch: { path: '/agent?expertPreview=preview-one&expertId=expert-one' }, expiresAt: '2099-01-01T00:00:00Z' });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No live requests in DOM fixture'));
});
afterEach(async () => {
  ElMessageBox.close(); ElMessage.closeAll(); app?.unmount(); root?.remove(); app = undefined; root = undefined;
  document.querySelectorAll('.el-overlay,.el-popper').forEach(node => node.remove());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); await nextTick();
});
async function click(text: string, where: ParentNode = document) {
  if (text==='保存并试聊') {
    const question=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]');
    if (question && !question.value) {question.value='测试试聊问题';question.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();}
  }
  if (text === '保存并发布') {
    const menu = document.querySelector<HTMLElement>('[aria-label="更多专家操作"]');
    expect(menu).toBeTruthy();
    menu!.click();
    await nextTick();
    await vi.waitFor(() => expect([...document.querySelectorAll('[role="menuitem"]')].some(node => node.textContent?.trim() === text)).toBe(true));
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(node => node.textContent?.trim() === text)!.click();
    return;
  }
  if (['基本信息', '角色、流程与交付要求', '高级：自动标识'].includes(text) && !document.querySelector('.expert-metadata-dialog')) {
    document.querySelector<HTMLButtonElement>('.expert-name-button')!.click();
    await nextTick();
  }
  if (text === '基本信息') return;
  if (['角色、流程与交付要求','高级：自动标识'].includes(text)) {
    const more=[...document.querySelectorAll<HTMLElement>('.expert-metadata-dialog button')].find(b=>b.textContent?.trim()==='更多设置');
    if(more?.getAttribute('aria-expanded')==='false') {more.click();await nextTick();}
  }
  if (text === '完成') text='确认';
  const candidates = [
    ...where.querySelectorAll<HTMLElement>('button,[role="button"],[role="tab"]'),
    ...document.querySelectorAll<HTMLElement>('.expert-metadata-dialog button,.expert-metadata-dialog [role="button"]'),
  ];
  const button = candidates.find(node => node.getAttribute('aria-label') === text || node.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  button!.click();
  await nextTick();
}
function dialog() { return document.querySelector<HTMLElement>('.official-agent-editor')!; }
async function mount(create = false) {
  root = document.createElement('div'); document.body.append(root);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
  await router.push('/'); await router.isReady();
  app = createApp({ render: () => h(AdminOfficialAgents) }); app.use(ElementPlus); app.use(router); app.mount(root);
  await vi.waitFor(() => expect(root!.textContent).toContain('测试专家'));
  click(create ? '新建专家' : '编辑', root); await nextTick();
  await vi.waitFor(() => expect(dialog()).toBeTruthy());
  await vi.waitFor(() => expect(dialog().textContent).not.toContain('正在检查依赖'));
}
async function prompt(value: string) {
  const input = dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="专家指令"]')!;
  expect(input).toBeTruthy(); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
}

it('a stale prefetch cannot overwrite resources refreshed after a knowledge mutation', async () => {
  let finishOld!:(value:unknown)=>void;
  fixture.catalog.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockResolvedValueOnce([{base:{id:'new',name:'最新资料',enabled:true},documents:[],releases:[]}]);
  const resources=createExpertEditorResources(),old=resources.load();
  resources.invalidate();await resources.load();
  finishOld([]);expect((await old).catalog[0].base.id).toBe('new');
  expect(resources.peek()?.catalog[0].base.id).toBe('new');
  await resources.load();expect(fixture.catalog).toHaveBeenCalledTimes(2);
});

it('preloads one shared metadata batch and reopens the editor without a column loading mask or per-base requests', async () => {
  fixture.catalog.mockResolvedValue(Array.from({length:67},(_,i)=>({base:{id:`base-${i}`,name:`资料${i}`,enabled:true,ownerAgentId:i===0?'expert-one':null},documents:[],releases:[]})));
  await mount();
  expect(dialog().querySelector('.expert-capabilities-scroll .el-loading-mask')).toBeNull();
  expect(dialog().textContent).toContain('资料0');
  expect(fixture.catalog).toHaveBeenCalledTimes(1);expect(fixture.providers).toHaveBeenCalledTimes(1);
  expect(fixture.bases).not.toHaveBeenCalled();expect(fixture.documents).not.toHaveBeenCalled();expect(fixture.releases).not.toHaveBeenCalled();
  await click('返回专家列表',dialog());await click('编辑',root);await nextTick();
  expect(dialog().textContent).toContain('资料0');
  expect(dialog().querySelector('.expert-capabilities-scroll .el-loading-mask')).toBeNull();
  expect(fixture.catalog).toHaveBeenCalledTimes(1);expect(fixture.providers).toHaveBeenCalledTimes(1);
});

it('edit opens three adjacent configuration panels and keeps saved draft open', async () => {
  await mount();
  for (const name of ['个性化', '能力', '预览']) expect([...dialog().querySelectorAll('h2')].map(x => x.textContent)).toContain(name);
  expect(dialog().classList.contains('is-fullscreen')).toBe(true);
  await prompt('当前新指令'); await click('保存草稿', dialog());
  await vi.waitFor(() => expect(fixture.update).toHaveBeenCalledWith('expert-one', expect.objectContaining({ systemPrompt: '当前新指令' })));
  expect(dialog().textContent).toContain('草稿已保存'); expect(dialog().querySelector('iframe')).toBeNull();
});

it('capabilities offers only precreated platform skills in a Monica-style selection dialog', async () => {
  fixture.listSkills.mockResolvedValue([{id:'precreated',key:'precreated',name:'平台现有技能',summary:'仅选择已有技能',enabledAt:'2026-11-01',packageRevision:1}]);
  await mount();
  const capabilities=dialog().querySelector('[aria-label="专家能力配置"]')!;
  expect(capabilities.textContent).not.toContain('内置工具');
  expect(capabilities.textContent).not.toContain('平台技能');
  await click('添加技能',capabilities);
  const picker=document.querySelector('.expert-resource-dialog')!;
  expect(picker).toBeTruthy();expect(picker.textContent).toContain('平台现有技能');
  expect(picker.textContent).not.toContain('技能管理');expect(picker.textContent).not.toContain('创建');
  await click('添加',picker);await nextTick();
  expect(capabilities.textContent).toContain('平台现有技能');
});
it('expert knowledge has one Monica add entry with create and platform catalog inside it', async () => {
  await mount();
  const panel=dialog().querySelector('[aria-label="专家能力配置"]')!;
  expect(panel.textContent).not.toContain('所属知识库');expect(panel.textContent).not.toContain('引用其他专家');
  expect([...panel.querySelectorAll('button')].filter(b=>b.textContent?.trim()==='添加知识库')).toHaveLength(1);
  await click('添加知识库',panel);
  await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-picker')).toBeTruthy());
  expect(document.querySelector('.expert-knowledge-picker')?.textContent).toContain('创建知识库');
  expect(document.querySelector('.expert-knowledge-picker')?.textContent).toContain('我的知识库');
});
it('an automatic expert library remains accessible as one compact row without exposing ownership controls', async () => {
  fixture.bases.mockResolvedValue([{id:'owned',name:'已建专家资料库',enabled:true,ownerAgentId:'expert-one'}]);fixture.documents.mockResolvedValue([]);fixture.releases.mockResolvedValue([]);
  await mount();
  const panel=dialog().querySelector('[aria-label="专家能力配置"]')!;
  await vi.waitFor(()=>expect(panel.textContent).toContain('已建专家资料库'));
  expect(panel.textContent).not.toContain('所属知识库');
  await click('查看已建专家资料库',panel);
  await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-documents h2')?.textContent).toBe('已建专家资料库'));
  await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-documents')?.textContent).toContain('暂无资料'));
  expect(fixture.update).not.toHaveBeenCalled();
});
it('preview saves current inputs before freezing and marks later edits as stale', async () => {
  await mount(); await prompt('要试聊的最新指令');
  await click('保存并试聊', dialog());
  await vi.waitFor(() => expect(dialog().querySelector('iframe')).toBeTruthy());
  expect(fixture.update.mock.invocationCallOrder[0]).toBeLessThan(fixture.preview.mock.invocationCallOrder[0]);
  expect(dialog().querySelector('iframe')?.src).toContain('expertPreview=preview-one');
  await prompt('下一版指令'); expect(dialog().textContent).not.toContain('配置已修改');
  expect(dialog().querySelector('iframe')?.src).toContain('preview-one'); expect(fixture.preview).toHaveBeenCalledTimes(1);
  await click('保存草稿', dialog()); await vi.waitFor(() => expect(fixture.update).toHaveBeenCalledTimes(2));
  expect(dialog().textContent).not.toContain('配置已修改');
});
it('save failure keeps the new input and does not start a stale preview', async () => {
  await mount(); await prompt('不能丢失的指令'); fixture.update.mockRejectedValueOnce(new Error('模拟保存失败'));
  await click('保存并试聊', dialog());
  await vi.waitFor(() => expect(dialog().textContent).toContain('模拟保存失败'));
  expect(fixture.preview).not.toHaveBeenCalled(); expect(dialog().querySelector('iframe')).toBeNull();
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="专家指令"]')?.value).toBe('不能丢失的指令');
});
it('closing a dirty form asks before discarding and cancelling preserves input', async () => {
  await mount(); await prompt('未保存');
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
  await click('返回专家列表', dialog()); await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="专家指令"]')?.value).toBe('未保存');
});
it('new experts use Core without silently migrating existing legacy experts', async () => {
  row.draft.executionConfig = undefined; await mount();
  expect(dialog().textContent).not.toContain('当前保留旧知识配置');
  expect(dialog().querySelector('[aria-label="专家指令"]')).toBeTruthy();
  expect(dialog().textContent).toContain('使用平台知识库');
  expect(fixture.update).not.toHaveBeenCalled();
});
it('preview API failure remains recoverable and never publishes', async () => {
  await mount(); fixture.preview.mockRejectedValueOnce(new Error('模拟预览失败')); await click('保存并试聊', dialog());
  await vi.waitFor(() => expect(dialog().textContent).toContain('模拟预览失败'));
  expect(fixture.publish).not.toHaveBeenCalled(); expect(dialog().querySelector('iframe')).toBeNull();
});
it('new expert preview first creates a draft and uses the returned identity', async () => {
  await mount(true);
  await prompt('新专家测试指令');
  const name = document.querySelector<HTMLInputElement>('input[aria-label="专家名称"]')!;
  expect(name).toBeTruthy(); name.value = '新专家'; name.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
  await prompt('新建指令'); await click('保存并试聊', dialog());
  await vi.waitFor(() => expect(fixture.preview).toHaveBeenCalledWith('expert-one'));
  expect(fixture.create.mock.invocationCallOrder[0]).toBeLessThan(fixture.preview.mock.invocationCallOrder[0]);
  expect(fixture.create.mock.calls[0][0].executionConfig.route).toBe('KNOWLEDGE_CORE');
});

it('sending shows the question immediately without dimming the form and preserves edits made during preparation', async () => {
  await mount(); await prompt('请求中的指令');
  let finish!: (value: any) => void;
  fixture.update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click('保存并试聊', dialog());
  await vi.waitFor(() => expect(fixture.update).toHaveBeenCalled());
  expect(dialog().querySelector('.expert-preview-outgoing')?.textContent).toContain('测试试聊问题');
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="专家指令"]')!.disabled).toBe(false);
  expect([...dialog().querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === '返回专家列表')!.disabled).toBe(true);
  expect(fixture.preview).not.toHaveBeenCalled();
  await prompt('准备期间继续修改的指令');
  finish(row); await vi.waitFor(() => expect(dialog().textContent).toContain('配置在准备试聊时发生了变化'));
  expect(fixture.preview).not.toHaveBeenCalled();
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="专家指令"]')!.value).toBe('准备期间继续修改的指令');
  expect(dialog().textContent).toContain('有未保存修改');
});

it('reset clears the conversation immediately without saving or preparing until the next send', async () => {
  await mount();await click('保存并试聊',dialog());await vi.waitFor(()=>expect(dialog().querySelector('iframe')).toBeTruthy());
  const frame=dialog().querySelector('iframe')!,post=vi.spyOn(frame.contentWindow!,'postMessage');
  const deliver=(data:object)=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{agentId:'expert-one',previewId:'preview-one',...data}}));
  deliver({type:'mmp.expert-preview.ready'});await nextTick();deliver({...post.mock.calls[0][0],type:'mmp.expert-preview.accepted'});deliver({type:'mmp.expert-preview.content',hasMessages:true,userCount:1});await nextTick();
  await click('重新试聊',dialog());await nextTick();
  expect(dialog().querySelector('.expert-preview-profile')?.textContent).toContain('测试专家');
  expect(dialog().querySelector('iframe')).toBeNull();expect(fixture.preview).toHaveBeenCalledTimes(1);
  await click('保存并试聊',dialog());await vi.waitFor(()=>expect(fixture.preview).toHaveBeenCalledTimes(2));
});

it('the first question is immediately interruptible before a preview has finished preparing', async () => {
  const preview=vi.fn();root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(ExpertDraftPreview,{name:'等待中的专家',summary:'',starters:['直接发送'],avatarUrl:null,launchUrl:'',expiresAt:'',busy:false,disabled:false,stale:false,error:'',onPreview:preview})});app.use(ElementPlus);app.mount(root);
  await click('直接发送',root);
  const input=root.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(input.disabled).toBe(false);expect(input.readOnly).toBe(true);
  const stop=root.querySelector<HTMLButtonElement>('[aria-label="停止生成"]');expect(stop).toBeTruthy();expect(stop!.disabled).toBe(false);
  await click('停止生成',root);
  expect(input.readOnly).toBe(false);expect(root.querySelector('[aria-label="正在回复"]')).toBeNull();
  expect(root.querySelector('.expert-preview-user-bubble')?.textContent).toBe('直接发送');
});

it('an unacknowledged stop blocks another send and an actual failure restores the stop action for retry', async () => {
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(ExpertDraftPreview,{name:'测试专家',summary:'',avatarUrl:null,launchUrl:'http://127.0.0.1:5201/agent/?expertId=expert&expertPreview=frozen',expiresAt:'2099-01-01',busy:false,disabled:false,stale:false,error:''})});app.use(ElementPlus);app.mount(root);await nextTick();
  const frame=root.querySelector('iframe')!,post=vi.spyOn(frame.contentWindow!,'postMessage');
  const deliver=(data:object)=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{agentId:'expert',previewId:'frozen',...data}}));
  deliver({type:'mmp.expert-preview.ready'});deliver({type:'mmp.expert-preview.state',running:true});await nextTick();
  vi.useFakeTimers();
  try {
    await click('停止生成',root);const request=post.mock.calls.at(-1)![0];
    await vi.advanceTimersByTimeAsync(5000);await nextTick();
    expect(root.querySelector<HTMLButtonElement>('[aria-label="停止生成"]')!.disabled).toBe(true);
    expect(root.querySelector('[aria-label="保存并试聊"]')).toBeNull();
    deliver({...request,type:'mmp.expert-preview.error'});await nextTick();
    expect(root.querySelector<HTMLButtonElement>('[aria-label="停止生成"]')!.disabled).toBe(false);
    expect(root.querySelector('[aria-label="保存并试聊"]')).toBeNull();
    await click('停止生成',root);const retry=post.mock.calls.at(-1)![0];expect(retry.requestId).not.toBe(request.requestId);
    deliver({...retry,type:'mmp.expert-preview.accepted'});await nextTick();
    expect(root.querySelector('[aria-label="保存并试聊"]')).toBeTruthy();
  } finally {vi.useRealTimers();}
});

it('reset while generating shows a new welcome even when stopping the old turn fails', async () => {
  const preview=vi.fn();root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(ExpertDraftPreview,{name:'测试专家',summary:'',avatarUrl:null,launchUrl:'http://127.0.0.1:5201/agent/?expertId=expert&expertPreview=frozen',expiresAt:'2099-01-01',busy:false,disabled:false,stale:true,error:'',onPreview:preview})});app.use(ElementPlus);app.mount(root);await nextTick();
  const frame=root.querySelector('iframe')!,post=vi.spyOn(frame.contentWindow!,'postMessage');
  const deliver=(data:object)=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{agentId:'expert',previewId:'frozen',...data}}));
  deliver({type:'mmp.expert-preview.ready'});deliver({type:'mmp.expert-preview.content',hasMessages:true,userCount:1});deliver({type:'mmp.expert-preview.state',running:true});await nextTick();
  expect(root.textContent).not.toContain('配置已修改');
  expect(root.querySelector<HTMLButtonElement>('[aria-label="重新试聊"]')!.disabled).toBe(false);
  await click('重新试聊',root);expect(root.querySelector('.expert-preview-profile')).toBeTruthy();
  const cancel=post.mock.calls.at(-1)![0];expect(cancel.type).toBe('mmp.expert-preview.cancel');
  deliver({...cancel,type:'mmp.expert-preview.error',message:'停止失败'});await nextTick();
  await vi.waitFor(()=>expect(preview).toHaveBeenCalledWith());
  expect(root.textContent).not.toContain('停止生成失败');expect(root.querySelector('.expert-preview-profile')).toBeTruthy();
});

it('a hidden startup failure preserves the question and recreates a working preview on resend', async () => {
  await mount();await click('保存并试聊',dialog());
  await vi.waitFor(()=>expect(dialog().querySelector('iframe')).toBeTruthy());
  let frame=dialog().querySelector('iframe')!;
  const deliver=(data:object)=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{agentId:'expert-one',previewId:'preview-one',...data}}));
  deliver({type:'mmp.expert-preview.unavailable'});await nextTick();
  expect(dialog().textContent).toContain('试聊暂时无法启动');
  expect(dialog().querySelector('iframe')).toBeNull();
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!.value).toBe('测试试聊问题');
  await click('保存并试聊',dialog());
  await vi.waitFor(()=>expect(fixture.preview).toHaveBeenCalledTimes(2));
  await vi.waitFor(()=>expect(dialog().querySelector('iframe')).toBeTruthy());frame=dialog().querySelector('iframe')!;
  const post=vi.spyOn(frame.contentWindow!,'postMessage');deliver({type:'mmp.expert-preview.ready'});await nextTick();
  expect(post).toHaveBeenCalledTimes(1);
  deliver({...post.mock.calls[0][0],type:'mmp.expert-preview.accepted'});
  deliver({type:'mmp.expert-preview.content',hasMessages:true,userCount:1});await nextTick();
  expect(dialog().querySelector('.expert-preview-outgoing')).toBeNull();
  expect(dialog().querySelector<HTMLElement>('.expert-preview-viewport')!.style.display).not.toBe('none');
});

it('publication failure retains saved draft and makes no claim that it went live', async () => {
  await mount(); await prompt('发布失败仍保留的草稿');
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
  fixture.publish.mockRejectedValueOnce(new Error('模拟发布失败'));
  await click('保存并发布', dialog()); await vi.waitFor(() => expect(fixture.publish).toHaveBeenCalled());
  await vi.waitFor(() => expect(document.body.textContent).toContain('修改已保存，发布失败'));
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="专家指令"]')!.value).toBe('发布失败仍保留的草稿');
});

it('expired preview shows an actionable restart without silently replacing the conversation', async () => {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ExpertDraftPreview, { name: '专家', summary: '简介', avatarUrl: null,
    launchUrl: 'http://127.0.0.1:5201/agent/?expertPreview=expired', expiresAt: '2000-01-01T00:00:00Z', busy: false, disabled: false, stale: false, error: '' }) });
  app.use(ElementPlus); app.mount(root); await nextTick();
  expect(root.textContent).toContain('本次试聊已到期'); expect(root.querySelector('[aria-label="重新试聊"]')).toBeTruthy();
  expect(root.querySelector('iframe')!.src).toContain('expired');
});

it('preview persistence locks explicit avatar, new-expert kind and key controls too', async () => {
  await mount(true);
  await prompt('新专家测试指令');
  const name = document.querySelector<HTMLInputElement>('input[aria-label="专家名称"]')!;
  name.value = '新专家'; name.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
  await click('角色、流程与交付要求', dialog()); await click('高级：自动标识', dialog()); await nextTick();
  let finish!: (value: any) => void;
  fixture.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click('保存并试聊', dialog()); await vi.waitFor(() => expect(fixture.create).toHaveBeenCalled());
  try {
    const upload = document.querySelector<HTMLButtonElement>('.expert-metadata-dialog [aria-label="编辑头像"]')!;
    expect.soft(upload.disabled, 'avatar must not override the disabled form').toBe(true);
    expect.soft([...document.querySelectorAll<HTMLInputElement>('.expert-metadata-dialog input[type="radio"]')].every(r => r.disabled), 'new-expert kind must stay frozen').toBe(true);
    expect.soft(document.querySelector<HTMLInputElement>('input[placeholder="可留空自动生成；创建后只读"]')!.disabled, 'new-expert key must stay frozen').toBe(true);
  } finally { finish(row); await vi.waitFor(() => expect(dialog().querySelector('iframe')).toBeTruthy()); }
});

it('avatar click offers upload and AI entry without remove, and unconfigured generation is explicit', async () => {
  row.avatarUrl='https://example.test/original.png';await mount();await click('基本信息',dialog());
  const metadata=document.querySelector('.expert-metadata-dialog')!;
  expect(metadata.textContent).not.toContain('移除');expect(metadata.textContent).not.toContain('保留原图');
  await click('编辑头像',metadata);
  await vi.waitFor(()=>expect(document.querySelector('.catalog-avatar-menu')).toBeTruthy());
  const menu=document.querySelector('.catalog-avatar-menu')!;
  expect(menu.textContent).toContain('上传图片');await click('AI 生成',menu);
  await vi.waitFor(()=>expect(document.querySelector('.catalog-avatar-generation')?.textContent).toContain('尚未配置生图模型'));
  expect(fixture.removeAvatar).not.toHaveBeenCalled();
});

it('staged avatar synchronizes metadata, header and preview before save, then retains saved URL', async () => {
  await mount();await click('基本信息',dialog());
  await click('编辑头像',document.querySelector('.expert-metadata-dialog')!);
  await vi.waitFor(()=>expect(document.querySelector('.catalog-avatar-menu input[type="file"]')).toBeTruthy());
  const input=document.querySelector<HTMLInputElement>('.catalog-avatar-menu input[type="file"]')!;
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);
  const file=new File([png],'头像.png',{type:'image/png'});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(document.querySelector('.expert-metadata-dialog .catalog-icon-preview img')?.getAttribute('src')).toBe('blob:avatar-test'));
  expect(dialog().querySelector('.expert-header-avatar img')?.getAttribute('src')).toBe('blob:avatar-test');
  expect(dialog().querySelector('.expert-preview-avatar img')?.getAttribute('src')).toBe('blob:avatar-test');
  expect(fixture.uploadAvatar).not.toHaveBeenCalled();
  fixture.uploadAvatar.mockImplementationOnce(async()=>row={...row,avatarUrl:'/uploads/saved-avatar.png'});
  await click('确认');await click('保存草稿',dialog());
  await vi.waitFor(()=>expect(fixture.uploadAvatar).toHaveBeenCalled());
  await vi.waitFor(()=>expect(dialog().querySelector('.expert-header-avatar img')?.getAttribute('src')).toBe('/uploads/saved-avatar.png'));
  expect(dialog().querySelector('.expert-preview-avatar img')?.getAttribute('src')).toBe('/uploads/saved-avatar.png');
});

it('existing tool aliases and unavailable IDs stay visible and can be removed individually', async () => {
  row.draft.toolScope = ['delegate', 'retired-tool'];
  await mount();
  expect(dialog().querySelector('[aria-label="专家能力配置"]')!.textContent).not.toContain('已有工具权限');
  await click('高级：自动标识',dialog());
  const controls = () => [...document.querySelectorAll<HTMLInputElement>('.expert-metadata-dialog .expert-tool-options input[type="checkbox"]')];
  const alias = controls().find(input => input.value === 'delegate');
  const retired = controls().find(input => input.value === 'retired-tool');
  expect(alias?.checked, 'existing collaboration permission must be visible').toBe(true);
  expect(retired?.checked, 'unavailable permissions must remain removable').toBe(true);
  retired!.click();
  await nextTick();
  expect(controls().find(input => input.value === 'delegate')?.checked).toBe(true);
  await click('完成');
  await click('保存草稿', dialog());
  await vi.waitFor(() => expect(fixture.update).toHaveBeenCalledWith('expert-one', expect.objectContaining({ toolScope: ['delegate'] })));
});

it('focusing the real preview textarea sends no request and missing instructions are reported only on send', async () => {
  await mount();
  await prompt('');
  const question=dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!;
  expect(question).toBeTruthy();
  question.focus(); question.click(); await nextTick();
  expect(fixture.update).not.toHaveBeenCalled(); expect(fixture.preview).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('systemPrompt is required');
  await click('保存并试聊',dialog());
  expect(dialog().textContent).toContain('请先填写左侧专家指令');
  expect(fixture.preview).not.toHaveBeenCalled();
  expect(question.value).toBe('测试试聊问题');
  await click('保存并试聊',dialog());await nextTick();
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!.disabled).toBe(false);
  expect(fixture.preview).not.toHaveBeenCalled();
});

it('a conversation starter sends immediately and shows the expert identity while waiting for the first character', async () => {
  row.avatarUrl='https://example.test/expert.png';row.draft.openingQuestions=['直接试聊这句话'];
  await mount();await click('直接试聊这句话',dialog());
  await vi.waitFor(()=>expect(fixture.preview).toHaveBeenCalledTimes(1));
  expect(dialog().querySelector('.expert-preview-outgoing')?.textContent).toContain('直接试聊这句话');
  expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!.value).toBe('');
  const waiting=dialog().querySelector('[aria-label="正在回复"]')!;
  expect(waiting.textContent).toContain('测试专家');
  expect(waiting.querySelector('img')?.src).toBe('https://example.test/expert.png');
});

it('opening rows add inline, remove individually and preserve canonical starters', async () => {
  row.draft.openingQuestions=['旧开场白'];
  row.draft.expertDefinition.discoveryDetail={introduction:'保留原介绍',starters:[{text:'旧开场白',label:'原标签'}]};
  await mount(); await click('会话开始',dialog());
  const inputs=()=>[...dialog().querySelectorAll<HTMLInputElement>('.expert-starter-row input')];
  expect(inputs()).toHaveLength(2);
  expect(document.querySelector('.catalog-discovery-dialog')).toBeNull();
  inputs()[1].value='新的开场白';inputs()[1].dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
  expect(inputs()).toHaveLength(3);
  await click('保存草稿',dialog());
  await vi.waitFor(()=>expect(fixture.update).toHaveBeenCalled());
  expect(fixture.update.mock.calls[0][1]).toMatchObject({openingQuestions:['旧开场白','新的开场白'],expertDefinition:{discoveryDetail:{introduction:'保留原介绍',starters:[{text:'旧开场白',label:'原标签'},{text:'新的开场白'}]}}});
  await click('移除开场白 1',dialog());await click('移除开场白 1',dialog());
  await click('保存草稿',dialog());await vi.waitFor(()=>expect(fixture.update).toHaveBeenCalledTimes(2));
  expect(fixture.update.mock.calls[1][1]).toMatchObject({openingQuestions:[],expertDefinition:{discoveryDetail:{starters:[]}}});
});

it('model picker directly selects platform models and retains existing retrieval configuration without its settings UI', async () => {
  fixture.providers.mockResolvedValue([{id:'provider',displayName:'平台服务',enabled:true,hasApiKey:true,models:[{id:'model-a',displayName:'模型 A',enabled:true},{id:'model-b',displayName:'模型 B',enabled:false}]}]);
  await mount();
  const caps=dialog().querySelector('[aria-label="专家能力配置"]')!;
  expect(caps.textContent).not.toContain('检索设置');
  await click('自动选择模型',caps);
  await vi.waitFor(()=>expect(document.querySelector('.expert-model-menu')).toBeTruthy());
  const menu=document.querySelector('.expert-model-menu')!;
  expect(menu.querySelector('.el-select')).toBeNull();
  const unavailable=[...menu.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('模型 B'))!;
  expect(unavailable.disabled).toBe(true);
  await click('模型 A',menu);await click('保存草稿',dialog());
  await vi.waitFor(()=>expect(fixture.update).toHaveBeenCalled());
  expect(fixture.update.mock.calls[0][1].executionConfig).toMatchObject({generationModel:{mode:'FIXED',modelId:'model-a'},budgetTokens:8000,retrievalPolicy:'OFF',route:'KNOWLEDGE_CORE'});
});

it('skills come from the platform catalog and selections are saved as real skill IDs', async () => {
  fixture.listSkills.mockResolvedValue([{id:'platform-skill',key:'platform-skill',name:'后台已有技能',summary:'后台技能说明',category:null,enabledAt:'2026-11-01',packageRevision:2}]);
  await mount();await click('添加技能',dialog());
  const picker=document.querySelector('.expert-resource-dialog')!;
  await vi.waitFor(()=>expect(picker.textContent).toContain('后台已有技能'));
  await click('添加',picker);await nextTick();
  await click('关闭技能选择',picker);
  await click('保存草稿',dialog());
  await vi.waitFor(()=>expect(fixture.update).toHaveBeenCalledWith('expert-one',expect.objectContaining({linkedSkillIds:['platform-skill']})));
  expect(fixture.listSkills).toHaveBeenCalled();
});

it('resource selection keeps unavailable bindings removable while blocking new unready resources', async () => {
  const selected=ref(['missing-release']);
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(ExpertResourcePicker,{modelValue:selected.value,'onUpdate:modelValue':value=>{selected.value=value;},resources:[{id:'ready',name:'平台知识库 v1',summary:'已发布资料',status:'可用',selectable:true},{id:'pending',name:'处理中的知识库',summary:'尚未完成索引',status:'处理中',selectable:false}],title:'选择平台知识库',resourceLabel:'知识库',manageLabel:'知识库管理',manageUrl:'/admin/official-knowledge',loading:false,error:''})});
  app.use(ElementPlus);app.mount(root);await nextTick();await click('选择平台知识库',root);
  const picker=document.querySelector('.expert-resource-dialog')!;
  const pending=[...picker.querySelectorAll('.resource-picker-row')].find(label=>label.textContent?.includes('处理中的知识库'))!.querySelector<HTMLButtonElement>('.resource-select')!;
  expect(pending.disabled).toBe(true);
  await click('移除技能 已失效技能',picker);await nextTick();
  expect(selected.value).toEqual([]);
});

it('platform knowledge binds a real release and opens its document chunks with pagination', async () => {
  fixture.profiles.mockResolvedValue([{id:'embedding',task:'EMBEDDING',enabled:true}]);
  fixture.health.mockResolvedValue({configured:true});
  fixture.bases.mockResolvedValue([{id:'kb',name:'后台知识库',enabled:true},{id:'disabled-kb',name:'停用的知识库',enabled:false}]);
  fixture.releases.mockResolvedValue([{id:'release',version:3,items:[{indexRevisionId:'index'}]}]);
  fixture.documents.mockResolvedValue([{id:'document',title:'接待须知',enabled:true,revisions:[{id:'revision',indexes:[{id:'index',profileId:'embedding',status:'READY',chunkCount:2}]}]}]);
  fixture.chunks.mockResolvedValueOnce({chunks:[{id:'chunk1',ordinal:0,text:'第一段原文'}],nextOffset:1,totalChunks:2}).mockResolvedValueOnce({chunks:[{id:'chunk2',ordinal:1,text:'第二段原文'}],nextOffset:null,totalChunks:2});
  await mount();await click('添加知识库',dialog());
  const picker=document.querySelector('.expert-knowledge-picker')!;
  await vi.waitFor(()=>expect(picker.textContent).toContain('后台知识库'));
  expect(fixture.releases).not.toHaveBeenCalledWith('disabled-kb');expect(fixture.documents).not.toHaveBeenCalledWith('disabled-kb');
  expect(picker.textContent).not.toContain('v3');
  await click('添加',picker.querySelector('.expert-knowledge-catalog-row')!);await nextTick();
  await click('关闭添加知识库',picker);
  await click('保存草稿',dialog());
  await vi.waitFor(()=>expect(fixture.update).toHaveBeenCalledWith('expert-one',expect.objectContaining({executionConfig:expect.objectContaining({releaseIds:['release'],retrievalPolicy:'REQUIRED'})})));
  await click('查看后台知识库',dialog());
  await vi.waitFor(()=>expect(document.body.textContent).toContain('接待须知'));
  await click('预览接待须知');
  await vi.waitFor(()=>expect(document.body.textContent).toContain('资料正文原文'));
  await click('分段');
  await vi.waitFor(()=>expect(document.body.textContent).toContain('第一段原文'));
  expect(fixture.chunks).toHaveBeenCalledWith('document','revision','index',0);
  await click('加载更多分段');
  await vi.waitFor(()=>expect(document.body.textContent).toContain('第二段原文'));
  expect(fixture.chunks).toHaveBeenLastCalledWith('document','revision','index',1);
});

it('first preview question is handed only to the matching frame and failures retain its exact text', async () => {
  const launch=ref('');const approved=ref('');const preview=vi.fn();
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(ExpertDraftPreview,{name:'测试专家',summary:'',avatarUrl:null,launchUrl:launch.value,expiresAt:'2099-01-01',approvedRequestId:approved.value,busy:false,disabled:false,stale:false,error:'',onPreview:preview})});
  app.use(ElementPlus);app.mount(root);await nextTick();
  const input=root.querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!;
  input.value='  第一行问题\n第二行  ';input.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
  const composing=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});
  input.dispatchEvent(composing);expect(composing.defaultPrevented).toBe(false);expect(preview).not.toHaveBeenCalled();
  await click('保存并试聊',root);expect(preview).toHaveBeenCalledWith('  第一行问题\n第二行  ',expect.any(String));
  launch.value='http://127.0.0.1:5201/agent/?expertId=expert&expertPreview=frozen';await nextTick();
  const frame=root.querySelector('iframe')!;const post=vi.spyOn(frame.contentWindow!,'postMessage');
  const ready={type:'mmp.expert-preview.ready',agentId:'expert',previewId:'frozen'};
  const deliver=(data:object,origin='http://127.0.0.1:5201',source:MessageEventSource=frame.contentWindow!)=>window.dispatchEvent(new MessageEvent('message',{data,origin,source}));
  deliver(ready,'https://untrusted.example');deliver(ready,undefined,window);deliver({...ready,previewId:'other'});
  expect(post).not.toHaveBeenCalled();
  deliver(ready);expect(post).not.toHaveBeenCalled();
  approved.value=preview.mock.calls[0][1];await nextTick();expect(post).toHaveBeenCalledTimes(1);
  const sent=post.mock.calls[0][0];
  expect(sent).toMatchObject({type:'mmp.expert-preview.submit',agentId:'expert',previewId:'frozen',text:'  第一行问题\n第二行  '});
  deliver({...sent,type:'mmp.expert-preview.error',message:'输入尚未就绪'});await nextTick();
  expect(root.textContent).toContain('输入尚未就绪');
  expect(root.querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')?.value).toBe('  第一行问题\n第二行  ');
  deliver({...ready,type:'mmp.expert-preview.state',running:true});await nextTick();
  expect(root.querySelector('[aria-label="停止生成"]')).toBeTruthy();
  deliver({...ready,type:'mmp.expert-preview.state',running:false},'https://untrusted.example');await nextTick();
  expect(root.querySelector('[aria-label="停止生成"]')).toBeTruthy();
  await click('停止生成',root);
  expect(post).toHaveBeenLastCalledWith(expect.objectContaining({type:'mmp.expert-preview.cancel',agentId:'expert',previewId:'frozen'}),'http://127.0.0.1:5201');
  deliver({...post.mock.calls.at(-1)![0],type:'mmp.expert-preview.accepted'});
  deliver({...ready,type:'mmp.expert-preview.state',running:false});await nextTick();
  expect(root.querySelector('[aria-label="保存并试聊"]')).toBeTruthy();
  await click('保存并试聊',root);approved.value=preview.mock.calls.at(-1)![1];await nextTick();
  const dispatched=post.mock.calls.length;
  deliver(ready);await nextTick();
  expect(input.disabled).toBe(false);
  expect(input.value).toBe('  第一行问题\n第二行  ');
  expect(root.textContent).toContain('试聊已重新连接');
  expect(post).toHaveBeenCalledTimes(dispatched);
});

it('compact preview keeps one composer, reuses a current conversation and refreshes edited instructions and knowledge before sending', async () => {
  fixture.profiles.mockResolvedValue([{id:'embedding',task:'EMBEDDING',enabled:true}]);fixture.health.mockResolvedValue({configured:true});
  fixture.bases.mockResolvedValue([{id:'kbA',name:'测试资料A',enabled:true},{id:'kbB',name:'测试资料B',enabled:true}]);
  fixture.releases.mockImplementation(async(id:string)=>[{id:id==='kbA'?'A':'B',version:1,items:[{indexRevisionId:id==='kbA'?'indexA':'indexB'}]}]);
  fixture.documents.mockImplementation(async(id:string)=>[{id:'document-'+id,title:id==='kbA'?'资料A':'资料B',enabled:true,revisions:[{id:'revision-'+id,indexes:[{id:id==='kbA'?'indexA':'indexB',profileId:'embedding',status:'READY',chunkCount:1}]}]}]);
  row.draft.executionConfig.releaseIds=['A'];row.draft.executionConfig.retrievalPolicy='REQUIRED';
  fixture.preview.mockImplementation(async()=>{const id=`frozen-${fixture.preview.mock.calls.length}`;return {agentId:'expert-one',previewId:id,launch:{path:`/agent?expertPreview=${id}&expertId=expert-one`},expiresAt:'2099-01-01T00:00:00Z'};});
  await mount();await click('保存并试聊',dialog());
  await vi.waitFor(()=>expect(dialog().querySelector('iframe')).toBeTruthy());
  let frame=dialog().querySelector('iframe')!;
  expect(new URL(frame.src).searchParams.get('expertEmbed')).toBe('1');
  const sendReady=()=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{type:'mmp.expert-preview.ready',agentId:'expert-one',previewId:new URL(frame.src).searchParams.get('expertPreview')}}));
  let post=vi.spyOn(frame.contentWindow!,'postMessage');sendReady();await nextTick();
  expect(post).toHaveBeenCalledTimes(1);
  const accept=()=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{...post.mock.calls.at(-1)![0],type:'mmp.expert-preview.accepted'}}));
  accept();await nextTick();
  const question=dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!;
  expect(question).toBeTruthy();question.value='第二轮继续';question.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();await click('保存并试聊',dialog());
  await vi.waitFor(()=>expect(post).toHaveBeenCalledTimes(2));expect(fixture.preview).toHaveBeenCalledTimes(1);accept();await nextTick();
  await prompt('更新后的左侧指令');await click('移除测试资料A',dialog());await click('添加知识库',dialog());
  const picker=document.querySelector('.expert-knowledge-picker')!;
  await vi.waitFor(()=>expect(picker.textContent).toContain('测试资料B'));
  const target=[...picker.querySelectorAll('.expert-knowledge-catalog-row')].find(row=>row.textContent?.includes('测试资料B'))!;
  await click('添加',target);await click('关闭添加知识库',picker);
  await nextTick();question.value='读取新的知识库';question.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
  await vi.waitFor(()=>expect(dialog().querySelector<HTMLButtonElement>('[aria-label="保存并试聊"]')!.disabled,dialog().textContent ?? '').toBe(false));
  await click('保存并试聊',dialog());
  await vi.waitFor(()=>expect(fixture.preview).toHaveBeenCalledTimes(2));
  expect(fixture.update).toHaveBeenLastCalledWith('expert-one',expect.objectContaining({systemPrompt:'更新后的左侧指令',executionConfig:expect.objectContaining({releaseIds:['B']})}));
  expect(fixture.update.mock.invocationCallOrder.at(-1)).toBeLessThan(fixture.preview.mock.invocationCallOrder.at(-1)!);
  expect(post).toHaveBeenCalledTimes(2);
  frame=dialog().querySelector('iframe')!;post=vi.spyOn(frame.contentWindow!,'postMessage');sendReady();await nextTick();
  expect(post).toHaveBeenCalledWith(expect.objectContaining({previewId:'frozen-2',text:'读取新的知识库'}),'http://127.0.0.1:5201');
});

it('uploading the first owned knowledge file renews an opened preview without editing the prompt', async () => {
  const base={id:'owned-kb',name:'专家自有资料',enabled:true,ownerAgentId:'expert-one',autoUpdate:true};
  const documentRow={id:'owned-doc',title:'最新资料.md',enabled:true,revisions:[{id:'revision',createdAt:'2026-11-10T10:00:00Z',originalName:'最新资料.md',sizeBytes:20,indexes:[{id:'index',profileId:'embedding',status:'READY',chunkCount:1}]}]};
  const release={id:'release',version:1,items:[{indexRevisionId:'index'}]};
  let ready=false,released=false;
  fixture.profiles.mockResolvedValue([{id:'embedding',task:'EMBEDDING',enabled:true,model:'测试语义服务'}]);fixture.health.mockResolvedValue({configured:true});
  fixture.bases.mockResolvedValue([base]);fixture.documents.mockImplementation(async()=>ready?[documentRow]:[]);fixture.releases.mockImplementation(async()=>released?[release]:[]);
  fixture.upload.mockImplementation(async()=>{ready=true;return {id:'job'};});fixture.job.mockResolvedValue({status:'SUCCEEDED',index:{id:'index',status:'READY'}});
  fixture.release.mockImplementation(async()=>{released=true;return release;});
  fixture.preview.mockImplementation(async()=>{const id=`frozen-${fixture.preview.mock.calls.length}`;return {agentId:'expert-one',previewId:id,launch:{path:`/agent?expertPreview=${id}&expertId=expert-one`},expiresAt:'2099-01-01T00:00:00Z'};});
  await mount();await click('保存并试聊',dialog());await vi.waitFor(()=>expect(dialog().querySelector('iframe')).toBeTruthy());
  const frame=dialog().querySelector('iframe')!,post=vi.spyOn(frame.contentWindow!,'postMessage');
  window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{type:'mmp.expert-preview.ready',agentId:'expert-one',previewId:'frozen-1'}}));await nextTick();
  window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:5201',source:frame.contentWindow,data:{...post.mock.calls[0]![0],type:'mmp.expert-preview.accepted'}}));await nextTick();
  await click('查看专家自有资料',dialog());await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-documents input[type="file"]')).toBeTruthy());
  const docs=document.querySelector('.expert-knowledge-documents')!,file=docs.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(file,'files',{configurable:true,value:[new File(['仅存在知识库的新事实'],'最新资料.md',{type:'text/markdown'})]});file.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(fixture.release).toHaveBeenCalledTimes(1));await vi.waitFor(()=>expect(docs.textContent).toContain('已就绪'));
  await click('关闭知识库资料',docs);
  const question=dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="预览问题"]')!;
  question.value='读取新上传的资料';question.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
  await vi.waitFor(()=>expect(dialog().querySelector<HTMLButtonElement>('[aria-label="保存并试聊"]')!.disabled).toBe(false));
  await click('保存并试聊',dialog());await vi.waitFor(()=>expect(fixture.preview).toHaveBeenCalledTimes(2));
  expect(fixture.update).not.toHaveBeenCalled();
});

it('multiple embedding services keep upload actionable and explain the required selection', async () => {
  fixture.bases.mockResolvedValue([{id:'kb',name:'新建空库',enabled:true}]);fixture.documents.mockResolvedValue([]);fixture.releases.mockResolvedValue([]);
  fixture.profiles.mockResolvedValue([{id:'first',task:'EMBEDDING',enabled:true,model:'服务一'},{id:'second',task:'EMBEDDING',enabled:true,model:'服务二'}]);fixture.health.mockResolvedValue({configured:true});
  root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(ExpertKnowledgePanel,{modelValue:[]})});app.use(ElementPlus);app.mount(root);
  await click('添加知识库',root);await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-picker')?.textContent).toContain('新建空库'));
  await click('查看新建空库资料');const docs=document.querySelector('.expert-knowledge-documents')!;
  await vi.waitFor(()=>expect(docs.textContent).toContain('暂无资料'));
  const select=docs.querySelector<HTMLSelectElement>('select')!;
  expect(select.value).toBe('');expect(select.options[0].textContent).toBe('请选择语义服务');
  const upload=[...docs.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='上传文件')!;
  expect(upload.disabled).toBe(false);await click('上传文件',docs);
  expect(docs.textContent).toContain('请选择语义服务，再上传文件');expect(document.activeElement).toBe(select);expect(fixture.upload).not.toHaveBeenCalled();
  select.value='second';select.dispatchEvent(new Event('change',{bubbles:true}));await nextTick();
  expect(docs.textContent).not.toContain('请选择语义服务，再上传文件');expect(upload.disabled).toBe(false);
});

it('a new library inherits the expert bound embedding profile when several services exist', async () => {
  const oldBase={id:'old-kb',name:'原知识库',enabled:true},newBase={id:'new-kb',name:'新建知识库',enabled:true};
  fixture.bases.mockResolvedValue([oldBase]);fixture.documents.mockImplementation(async id=>id==='old-kb'?[{id:'doc',enabled:true,title:'已关联资料',revisions:[{id:'revision',indexes:[{id:'bound-index',profileId:'bound-profile',status:'READY'}]}]}]:[]);
  fixture.releases.mockImplementation(async id=>id==='old-kb'?[{id:'bound-release',items:[{indexRevisionId:'bound-index'}]}]:[]);
  fixture.profiles.mockResolvedValue([{id:'other-profile',task:'EMBEDDING',enabled:true,model:'其他服务'},{id:'bound-profile',task:'EMBEDDING',enabled:true,model:'专家原服务'}]);fixture.health.mockResolvedValue({configured:true});fixture.createBase.mockResolvedValue(newBase);
  root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(ExpertKnowledgePanel,{modelValue:['bound-release']})});app.use(ElementPlus);app.mount(root);
  await click('添加知识库',root);await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-picker')?.textContent).toContain('原知识库'));
  await click('创建知识库');const name=document.querySelector<HTMLInputElement>('#expert-knowledge-base-name')!;name.value='新建知识库';name.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();
  document.querySelector<HTMLFormElement>('.expert-knowledge-create form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-documents h2')?.textContent).toBe('新建知识库'));
  const docs=document.querySelector('.expert-knowledge-documents')!;
  expect(docs.querySelector<HTMLSelectElement>('select')!.value).toBe('bound-profile');
  expect([...docs.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='上传文件')!.disabled).toBe(false);
});

it('new knowledge uploads retry the same request and bind only after the latest document is ready and released', async () => {
  const selected=ref<string[]>([]), disabled=ref(false), blockers=vi.fn();
  const base={id:'new-kb',name:'新建测试知识库',enabled:true};
  const documentRow={id:'new-doc',title:'验收资料.md',enabled:true,revisions:[{id:'new-revision',createdAt:'2026-11-10T10:00:00Z',originalName:'验收资料.md',sizeBytes:20,indexes:[{id:'new-index',profileId:'embedding',createdAt:'2026-11-10T10:00:01Z',status:'READY',chunkCount:1}]}]};
  let ready=false, finishJob!:(value:unknown)=>void, finishRelease!:(value:unknown)=>void;
  fixture.profiles.mockResolvedValue([{id:'embedding',enabled:true,task:'EMBEDDING',model:'测试语义服务'}]);fixture.health.mockResolvedValue({configured:true});
  fixture.createBase.mockResolvedValue(base);fixture.documents.mockImplementation(async()=>ready?[documentRow]:[]);fixture.releases.mockResolvedValue([]);
  fixture.upload.mockRejectedValueOnce(new Error('模拟响应丢失')).mockResolvedValue({id:'upload-job'});
  fixture.job.mockImplementation(()=>new Promise(resolve=>{finishJob=resolve;}));
  const released={id:'new-release',version:1,items:[{indexRevisionId:'new-index'}]};
  fixture.release.mockImplementation(()=>new Promise(resolve=>{finishRelease=resolve;}));
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(ExpertKnowledgePanel,{modelValue:selected.value,disabled:disabled.value,'onUpdate:modelValue':ids=>{selected.value=ids;},onBlockers:blockers})});app.use(ElementPlus);app.mount(root);
  await click('添加知识库',root);await click('创建知识库',document.querySelector('.expert-knowledge-picker')!);
  const create=document.querySelector('.expert-knowledge-create')!, name=create.querySelector<HTMLInputElement>('input')!;
  name.value=base.name;name.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();await click('创建',create);
  await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-documents')?.textContent).toContain(base.name));
  const docs=document.querySelector('.expert-knowledge-documents')!, file=docs.querySelector<HTMLInputElement>('input[type="file"]')!;
  await vi.waitFor(()=>expect([...docs.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='上传文件')!.disabled).toBe(false));
  Object.defineProperty(file,'files',{configurable:true,value:[new File(['上传原文内容'],'验收资料.md',{type:'text/markdown'})]});
  file.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(document.body.textContent).toContain('上传结果待确认'));
  expect(selected.value).toEqual([]);expect(fixture.release).not.toHaveBeenCalled();expect(blockers.mock.lastCall?.[0].length).toBeGreaterThan(0);
  await click('重试上传',docs);
  await vi.waitFor(()=>expect(fixture.job).toHaveBeenCalled());
  expect(fixture.upload.mock.calls[0][1].get('idempotencyKey')).toBe(fixture.upload.mock.calls[1][1].get('idempotencyKey'));
  expect(fixture.release).not.toHaveBeenCalled();expect(selected.value).toEqual([]);
  ready=true;finishJob({status:'SUCCEEDED',index:{id:'new-index',status:'READY'}});
  await vi.waitFor(()=>expect(fixture.release).toHaveBeenCalledTimes(1));
  disabled.value=true;await nextTick();finishRelease(released);
  await vi.waitFor(()=>expect(docs.textContent).toContain('继续检查'));
  expect(selected.value).toEqual([]);
  fixture.releases.mockResolvedValue([released]);fixture.job.mockResolvedValue({status:'SUCCEEDED',index:{id:'new-index',status:'READY'}});
  disabled.value=false;await nextTick();await click('继续检查',docs);
  await vi.waitFor(()=>expect(selected.value).toEqual(['new-release']));
  expect(fixture.release).toHaveBeenCalledTimes(1);
  expect(fixture.release).toHaveBeenCalledWith('new-kb',['new-index']);expect(blockers.mock.lastCall?.[0]).toEqual([]);
  expect(root.textContent).toContain(base.name);expect(root.querySelector('.expert-knowledge-bound')?.textContent).not.toContain('v1');
});

it('viewing a bound knowledge library uses its frozen original revision and index even when newer platform content exists', async () => {
  const oldRevision={id:'old-revision',createdAt:'2026-11-10T00:00:00Z',originalName:'已关联原文.md',sizeBytes:20,indexes:[{id:'old-index',profileId:'embedding',status:'READY',chunkCount:1}]};
  const newRevision={id:'new-revision',createdAt:'2026-11-11T00:00:00Z',originalName:'平台新原文.md',sizeBytes:25,indexes:[{id:'new-index',profileId:'embedding',status:'READY',chunkCount:1}]};
  fixture.bases.mockResolvedValue([{id:'base',name:'历史资料库',enabled:true}]);fixture.profiles.mockResolvedValue([{id:'embedding',task:'EMBEDDING',enabled:true}]);fixture.health.mockResolvedValue({configured:true});
  fixture.documents.mockResolvedValue([{id:'document',title:'历史资料',enabled:true,revisions:[newRevision,oldRevision]}]);
  fixture.releases.mockResolvedValue([{id:'old-release',version:1,items:[{indexRevisionId:'old-index'}]},{id:'new-release',version:2,items:[{indexRevisionId:'new-index'}]}]);
  fixture.chunks.mockResolvedValue({chunks:[],nextOffset:null,totalChunks:0});fixture.extracted.mockResolvedValue({text:'实际绑定的旧原文',nextOffset:null,hasGaps:false});
  root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(ExpertKnowledgePanel,{modelValue:['old-release']})});app.use(ElementPlus);app.mount(root);
  await vi.waitFor(()=>expect(root!.textContent).toContain('历史资料库'));await click('查看历史资料库',root);
  await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-documents')?.textContent).toContain('已关联原文.md'));
  expect(document.querySelector('.expert-knowledge-documents')?.textContent).not.toContain('平台新原文.md');
  await click('预览历史资料');await vi.waitFor(()=>expect(document.body.textContent).toContain('实际绑定的旧原文'));
  expect(fixture.extracted).toHaveBeenCalledWith('document','old-revision','old-index',0);
  expect(fixture.chunks).toHaveBeenCalledWith('document','old-revision','old-index',0);
  expect(fixture.release).not.toHaveBeenCalled();
});

it('failed processing retries the same server job and recovers a lost retry response without a duplicate retry or document', async () => {
  const selected=ref<string[]>([]);let succeeded=false;
  fixture.bases.mockResolvedValue([{id:'kb',name:'重试测试库',enabled:true}]);fixture.profiles.mockResolvedValue([{id:'embedding',task:'EMBEDDING',enabled:true}]);fixture.health.mockResolvedValue({configured:true});fixture.releases.mockResolvedValue([]);
  fixture.documents.mockImplementation(async()=>succeeded?[{id:'doc',title:'重试资料.md',enabled:true,revisions:[{id:'revision',createdAt:'2026-11-10',originalName:'重试资料.md',sizeBytes:10,indexes:[{id:'index',status:'READY',profileId:'embedding',chunkCount:1}]}]}]:[]);
  const job=()=>({id:'same-job',status:succeeded?'SUCCEEDED':'FAILED',index:{id:'index',status:succeeded?'READY':'FAILED'}});
  fixture.upload.mockResolvedValue({id:'same-job'});fixture.job.mockImplementation(async()=>job());
  fixture.jobAction.mockImplementationOnce(async()=>{succeeded=true;throw new Error('模拟重试响应丢失');});
  fixture.release.mockResolvedValue({id:'release',version:1,items:[{indexRevisionId:'index'}]});
  root=document.createElement('div');document.body.append(root);app=createApp({render:()=>h(ExpertKnowledgePanel,{modelValue:selected.value,'onUpdate:modelValue':ids=>{selected.value=ids;}})});app.use(ElementPlus);app.mount(root);
  await click('添加知识库',root);await vi.waitFor(()=>expect(document.querySelector('.expert-knowledge-picker')?.textContent).toContain('重试测试库'));
  await click('查看重试测试库资料',document.querySelector('.expert-knowledge-picker')!);
  const docs=document.querySelector('.expert-knowledge-documents')!, input=docs.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input,'files',{configurable:true,value:[new File(['可恢复上传'],'重试资料.md')]});input.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(docs.textContent).toContain('重试处理'));await click('重试处理',docs);
  await vi.waitFor(()=>expect(docs.textContent).toContain('模拟重试响应丢失'));
  expect(fixture.jobAction).toHaveBeenCalledWith('same-job','retry');await click('重试处理',docs);
  await vi.waitFor(()=>expect(selected.value).toEqual(['release']));
  expect(fixture.jobAction).toHaveBeenCalledTimes(1);expect(fixture.upload).toHaveBeenCalledTimes(1);
});

it('knowledge controls inside the expert form never submit or navigate the outer form', async () => {
  const submit=vi.fn();
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h('form',{onSubmit:(event:Event)=>{event.preventDefault();submit();}},h(ExpertKnowledgePanel,{modelValue:[]}))});app.use(ElementPlus);app.mount(root);
  const add=root.querySelector<HTMLButtonElement>('.expert-knowledge-add')!;
  expect(add.type).toBe('button');await click('添加知识库',root);
  expect(submit).not.toHaveBeenCalled();expect(document.querySelector('.expert-knowledge-picker')).toBeTruthy();
});
