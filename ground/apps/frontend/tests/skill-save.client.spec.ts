import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import AdminOfficialSkills from '../src/views/admin/AdminOfficialSkills.vue';

const api = vi.hoisted(() => ({ list: vi.fn(), createFromForm: vi.fn(), createFromZip: vi.fn(), enable: vi.fn() }));
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
