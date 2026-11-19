import { afterEach, expect, it } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import type { AdminUserRow } from '../src/api/admin';
import UserTable from '../src/components/admin/users/UserTable.vue';

let app: App | undefined;
let root: HTMLElement | undefined;

function mount(rows: AdminUserRow[]) {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp({
    render: () => h(UserTable, {
      rows,
      loading: false,
      loadError: '',
      emptyText: '还没有用户',
      hasActiveFilters: false,
      currentPage: 1,
      pageSize: 20,
      total: rows.length,
      currentUserId: 'actor',
      actorIsSuperAdmin: true,
      statusChangingId: '',
      deletingId: '',
    }),
  }).use(ElementPlus);
  app.mount(root);
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

afterEach(() => {
  app?.unmount();
  app = undefined;
  root?.remove();
  root = undefined;
});

const base = {
  phone: '18552375428',
  email: null,
  isPlatformAdmin: false,
  status: 'active',
  createdAt: '2026-11-17T00:00:00.000Z',
} satisfies Partial<AdminUserRow>;

it('一家企业一行，角色写在企业名旁边', async () => {
  mount([{
    ...base,
    id: 'yang',
    name: '杨泽昆',
    roleKeys: ['org_admin'],
    roleNames: ['企业管理员'],
    tenants: [
      { id: 't1', name: '测试团队', role: 'ADMIN' },
      { id: 't2', name: '杨泽昆的个人空间', role: 'OWNER' },
      { id: 't3', name: '今典管理', role: 'MEMBER' },
    ],
  }]);
  await flush();
  const lines = [...document.querySelectorAll('.membership-line')].map((node) => node.textContent?.replace(/\s+/g, '') ?? '');
  expect(lines).toEqual(['测试团队企业管理员登录进入', '杨泽昆的个人空间企业管理员', '今典管理企业成员']);
  expect(document.body.textContent).not.toContain('角色');
});

it('最早一家停用时，登录进入标在下面第一家仍在用的企业', async () => {
  mount([{
    ...base,
    id: 'luo',
    name: '罗小军',
    roleKeys: ['org_admin', 'org_member'],
    roleNames: ['企业管理员', '企业成员'],
    tenants: [
      { id: 't1', name: '已停用企业', role: 'ADMIN', status: 'disabled' },
      { id: 't2', name: '猛犸战略部', role: 'MEMBER', status: 'active' },
      { id: 't3', name: '罗小军的个人空间', role: 'ADMIN', status: 'active' },
    ],
  }]);
  await flush();
  const lines = [...document.querySelectorAll('.membership-line')].map((node) => node.textContent?.replace(/\s+/g, '') ?? '');
  expect(lines).toEqual(['已停用企业企业管理员', '猛犸战略部企业成员登录进入', '罗小军的个人空间企业管理员']);
});

it('超级管理员只显示平台身份', async () => {
  mount([{
    ...base,
    id: 'root',
    name: '超级管理员',
    isPlatformAdmin: true,
    platformRoleKey: 'super_admin',
    roleKeys: ['super_admin', 'org_admin'],
    roleNames: ['超级管理员', '企业管理员'],
    tenants: [{ id: 't1', name: '测试团队', role: 'ADMIN' }],
  }]);
  await flush();
  expect(document.querySelector('.membership-line')).toBeNull();
  expect(document.body.textContent).toContain('超级管理员');
  expect(document.body.textContent).not.toContain('测试团队');
  expect(document.body.textContent).not.toContain('登录进入');
});
