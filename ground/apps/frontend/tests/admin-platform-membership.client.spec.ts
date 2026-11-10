import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import ElementPlus from 'element-plus';
import type { AdminEnterpriseRow } from '../src/api/admin';
import UserFormDialog from '../src/components/admin/users/UserFormDialog.vue';
import AdminUsers from '../src/views/admin/AdminUsers.vue';

const api = vi.hoisted(() => ({ listUsers: vi.fn(), updateUser: vi.fn(), listEnterprises: vi.fn(), listRoles: vi.fn() }));
vi.mock('../src/api/admin', () => ({
  adminUserApi: { list: api.listUsers, update: api.updateUser },
  adminEnterpriseApi: { list: api.listEnterprises },
  adminRoleApi: { list: api.listRoles },
  adminPermissionApi: { catalog: vi.fn() },
}));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ session: { user: { id: 'actor' }, platformRoleKey: 'super_admin' } }) }));
vi.mock('../src/components/admin/users/UserTable.vue', async () => {
  const { h } = await import('vue');
  return { default: { props: ['rows'], emits: ['edit'], setup: (props: any, { emit }: any) => () => h('button', { class: 'edit-user-fixture', onClick: () => emit('edit', props.rows[0]) }, '编辑') } };
});
vi.mock('../src/components/admin/users/UserPermViewDialog.vue', () => ({ default: { inheritAttrs: false, render: () => null } }));

let app: App | undefined;
let root: HTMLElement | undefined;
const enterprise = (id: string, name: string) => ({ id, name, type: 'ENTERPRISE', status: 'active' }) as AdminEnterpriseRow;
const makeForm = (tenantId = '') => reactive({ name: 'fixture', phone: '13000000000', password: '', passwordConfirm: '', roleKeys: ['super_admin'], tenantId });
const user = { id: 'target', name: 'fixture', phone: '13000000000', isPlatformAdmin: true, platformRoleKey: 'super_admin', roleKeys: ['super_admin'], status: 'active', tenants: [{ id: 'cm-existing', name: '真实既有企业', role: 'MEMBER' }] };
async function flush() { for (let i = 0; i < 4; i++) { await Promise.resolve(); await nextTick(); } }
function mount(render: () => ReturnType<typeof h>) {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render }).use(ElementPlus); app.mount(root);
}
const selectedText = () => document.querySelector('.user-form-dialog .el-select__placeholder')?.textContent?.trim();
beforeEach(() => {
  vi.clearAllMocks();
  api.listUsers.mockResolvedValue([user]); api.listRoles.mockResolvedValue([]);
  api.listEnterprises.mockResolvedValue([]); api.updateUser.mockResolvedValue({});
});
afterEach(() => {
  app?.unmount(); app = undefined; root?.remove(); root = undefined;
  document.querySelectorAll('.el-overlay,.el-popper,.el-message').forEach(n => n.remove());
});

it('keeps the locked platform role and places additive MEMBER help below the full-width field', async () => {
  const form = makeForm();
  mount(() => h(UserFormDialog, { modelValue: true, form, editingId: 'target', saving: false, enterprises: [], roleOptions: [] }));
  await flush();
  expect(document.body.textContent).toContain('加入终端企业');
  const help = document.querySelector('#user-member-enterprise-help')!;
  expect(help.textContent).toContain('成员（MEMBER）关系');
  expect(help.textContent).toContain('不替换或移除已有企业关系');
  expect(help.textContent).toContain('不修改平台角色，也不开放 Console');
  expect(help.closest('.el-form-item__content')?.querySelector('.el-select')).not.toBeNull();
  expect(help.classList.contains('form-hint')).toBe(true);
  expect(document.querySelector('.user-form-dialog')?.getAttribute('style')).toContain('560px');
  expect(form.roleKeys).toEqual(['super_admin']);
  expect(document.querySelectorAll('.el-select')).toHaveLength(1);
});

it('uses the real user-row name while options load, then prefers the refreshed server name without changing the ID', async () => {
  const form = makeForm('cm-existing');
  const state = reactive({ enterprises: [] as AdminEnterpriseRow[], loading: true });
  mount(() => h(UserFormDialog, { modelValue: true, form, editingId: 'target', saving: false, enterprises: state.enterprises, userEnterprises: user.tenants, enterprisesLoading: state.loading, roleOptions: [] }));
  await flush();
  expect(selectedText()).toBe('真实既有企业');
  expect(document.querySelector('.el-select')?.textContent).not.toContain('cm-existing');
  state.enterprises = [enterprise('cm-existing', '企业最新名称')]; state.loading = false;
  await vi.waitFor(() => expect(selectedText()).toBe('企业最新名称'));
  expect(document.querySelectorAll('.el-select-dropdown__item')).toHaveLength(1);
  expect(form.tenantId).toBe('cm-existing');
});

it('does not render an unknown ID or fabricate a name, and resolves it when asynchronous options arrive', async () => {
  const form = makeForm('cm-unknown');
  const state = reactive({ enterprises: [] as AdminEnterpriseRow[], error: '企业列表加载失败，请重试。' });
  const retry = vi.fn();
  mount(() => h(UserFormDialog, { modelValue: true, form, editingId: 'target', saving: false, enterprises: state.enterprises, enterprisesError: state.error, roleOptions: [], 'onReload-enterprises': retry }));
  await flush();
  expect(document.querySelector('.el-select')?.textContent).not.toContain('cm-unknown');
  expect(document.body.textContent).toContain('企业名称暂不可用');
  expect(document.body.textContent).toContain('企业列表加载失败');
  (document.querySelector('.enterprise-load-hint button') as HTMLButtonElement).click();
  expect(retry).toHaveBeenCalledOnce();
  expect(form.tenantId).toBe('cm-unknown');
  state.enterprises = [enterprise('cm-unknown', '后加载的真实企业')]; state.error = '';
  await vi.waitFor(() => expect(selectedText()).toBe('后加载的真实企业'));
  expect(document.querySelector('.enterprise-load-hint')).toBeNull();
});

it('AdminUsers supplies user-row names during asynchronous loading and saves the selected ID additively', async () => {
  let resolveList!: (value: AdminEnterpriseRow[]) => void;
  api.listEnterprises.mockImplementationOnce(() => new Promise(resolve => { resolveList = resolve; }));
  mount(() => h(AdminUsers)); await flush();
  (document.querySelector('.edit-user-fixture') as HTMLButtonElement).click(); await flush();
  expect(selectedText()).toBe('真实既有企业');
  resolveList([enterprise('cm-existing', '真实既有企业'), enterprise('cm-new', '新加入的企业')]);
  await flush();
  (document.querySelector('.user-form-dialog .el-select__wrapper') as HTMLElement).click(); await flush();
  const listId = document.querySelector('.user-form-dialog .el-select input')!.getAttribute('aria-controls')!;
  const option = [...document.getElementById(listId)!.querySelectorAll('.el-select-dropdown__item')].find(n => n.textContent?.trim() === '新加入的企业');
  expect(option).toBeDefined(); (option as HTMLElement).click(); await flush();
  expect(selectedText()).toBe('新加入的企业');
  const save = [...document.querySelectorAll('.user-form-dialog .el-dialog__footer button')].find(n => n.textContent?.includes('保存'));
  (save as HTMLButtonElement).click();
  await vi.waitFor(() => expect(api.updateUser).toHaveBeenCalledWith('target', { name: 'fixture', addMemberTenantId: 'cm-new' }));
  expect(api.updateUser.mock.calls[0][1]).not.toHaveProperty('tenantId');
  expect(api.updateUser.mock.calls[0][1]).not.toHaveProperty('roleKeys');
  expect(api.updateUser.mock.calls[0][1]).not.toHaveProperty('isPlatformAdmin');
});

it('AdminUsers retains the existing real name after load failure and supports retry without an implicit binding', async () => {
  api.listEnterprises.mockRejectedValueOnce(new Error('fixture load failure'));
  mount(() => h(AdminUsers)); await flush();
  (document.querySelector('.edit-user-fixture') as HTMLButtonElement).click(); await flush();
  expect(selectedText()).toBe('真实既有企业');
  expect(document.body.textContent).toContain('企业列表加载失败');
  api.listEnterprises.mockResolvedValueOnce([enterprise('cm-existing', '真实既有企业')]);
  (document.querySelector('.enterprise-load-hint button') as HTMLButtonElement).click(); await flush();
  expect(api.listEnterprises).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.enterprise-load-hint')).toBeNull();
  const save = [...document.querySelectorAll('.user-form-dialog .el-dialog__footer button')].find(n => n.textContent?.includes('保存'));
  (save as HTMLButtonElement).click();
  await vi.waitFor(() => expect(api.updateUser).toHaveBeenCalledWith('target', { name: 'fixture' }));
});
