import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listEnterprises: vi.fn(),
  listSkills: vi.fn(),
  listRoles: vi.fn(),
  catalog: vi.fn(),
  tenantRoles: vi.fn(),
  tenantCatalog: vi.fn(),
  listAgents: vi.fn(),
  listAudit: vi.fn(),
  getAgent: vi.fn(),
  discovery: vi.fn(),
  consoleRoles: vi.fn(),
}));

vi.mock('../src/api/admin', () => ({
  adminUserApi: {
    list: api.listUsers,
    permissions: vi.fn(async () => ({ permissions: [], roles: [], isPlatformAdmin: false, tenantId: null, tenants: [] })),
  },
  adminEnterpriseApi: { list: api.listEnterprises },
  adminPermissionApi: { catalog: api.catalog },
  adminRoleApi: { list: api.listRoles },
  adminTenantRoleApi: { list: api.tenantRoles, catalog: api.tenantCatalog },
  adminOfficialSkillApi: { list: api.listSkills },
  adminOfficialAgentApi: {
    list: api.listAgents,
    detail: api.getAgent,
    discovery: api.discovery,
    preview: vi.fn(),
    remove: vi.fn(),
    publish: vi.fn(),
    offline: vi.fn(),
    bulkOffline: vi.fn(),
    rollback: vi.fn(),
  },
  adminAuditApi: { list: api.listAudit },
}));

vi.mock('../src/api/console', () => ({
  tenantRoleApi: { list: api.consoleRoles, remove: vi.fn(), catalog: vi.fn(async () => ({ categories: [] })) },
  adminEnterpriseApi: { list: api.listEnterprises },
}));

vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({
    session: {
      user: { id: 'actor', name: 'actor', isPlatformAdmin: true, platformRoleKey: 'super_admin' },
      platformRoleKey: 'super_admin',
      effectivePermissions: ['portal.admin.roles.write'],
      platformAccess: true,
    },
  }),
}));

import AdminUsers from '../src/views/admin/AdminUsers.vue';
import AdminEnterprises from '../src/views/admin/AdminEnterprises.vue';
import AdminOfficialSkills from '../src/views/admin/AdminOfficialSkills.vue';
import AdminRoles from '../src/views/admin/AdminRoles.vue';
import AdminOfficialAgentsList from '../src/views/admin/official-agents/AdminOfficialAgentsList.vue';
import Roles from '../src/views/Roles.vue';

let app: App | undefined;
let root: HTMLElement | undefined;

function mount(render: () => ReturnType<typeof h>, withRouter = false) {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp({ render }).use(ElementPlus);
  if (withRouter) app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:all(.*)*', component: { render: () => h('div') } }] }));
  app.mount(root);
  return root;
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await flush();
}

function button(text: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.trim() === text) ?? null;
}

function rowsOf(selector: string) {
  const scope = selector ? document.querySelector(selector) : document.body;
  return Array.from(scope?.querySelectorAll('.el-table__body tbody tr.el-table__row') ?? []);
}

function typeInto(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const user = (i: number) => ({
  id: `u-${i}`,
  name: `用户${i}`,
  phone: `130000000${String(i).padStart(2, '0')}`,
  email: null,
  isPlatformAdmin: false,
  status: 'active',
  createdAt: '2026-11-01T00:00:00Z',
  tenants: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  api.catalog.mockResolvedValue({ categories: [] });
  api.tenantCatalog.mockResolvedValue({ categories: [] });
  api.listEnterprises.mockResolvedValue([]);
  api.listRoles.mockResolvedValue([]);
  api.tenantRoles.mockResolvedValue([]);
  api.listSkills.mockResolvedValue([]);
  api.listAgents.mockResolvedValue({ items: [], statusCounts: { all: 0, DRAFT: 0, PUBLISHED: 0, OFFLINE: 0 } });
  api.listAudit.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 });
  api.consoleRoles.mockResolvedValue([]);
});

afterEach(() => {
  ElMessage.closeAll();
  app?.unmount();
  app = undefined;
  root?.remove();
  root = undefined;
  document.querySelectorAll('.el-overlay,.el-popper,.el-message,.el-select-dropdown').forEach((n) => n.remove());
});

describe('admin 列表公共层 · 页面挂载', () => {
  it('AdminUsers: 渲染/分页/筛选/空态', async () => {
    api.listUsers.mockResolvedValue(Array.from({ length: 25 }, (_, i) => user(i)));
    mount(() => h(AdminUsers));
    await flush();
    expect(rowsOf('.user-table')).toHaveLength(20);

    document.querySelector<HTMLButtonElement>('.el-pagination .btn-next')!.click();
    await flush();
    expect(rowsOf('.user-table')).toHaveLength(5);

    const keyword = document.querySelector<HTMLInputElement>('.user-search-keyword input')!;
    typeInto(keyword, '用户1');
    await wait(400);
    expect(api.listUsers.mock.calls.at(-1)?.[0]).toMatchObject({ keyword: '用户1' });

    api.listUsers.mockResolvedValue([]);
    button('重置')!.click();
    await flush();
    expect(document.querySelector('.user-table .el-table__empty-text')?.textContent).toContain('还没有用户');
  });

  it('AdminEnterprises: 渲染/分页/筛选/空态', async () => {
    api.listEnterprises.mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({
      id: `e-${i}`, name: `企业${i}`, slug: `slug-${i}`, type: 'ENTERPRISE', status: 'active',
      memberCount: 1, createdAt: '2026-11-01T00:00:00Z', admins: [], adminCount: 0, parentId: null, parentName: null,
    })));
    mount(() => h(AdminEnterprises));
    await flush();
    expect(rowsOf('.enterprise-table')).toHaveLength(20);

    document.querySelector<HTMLButtonElement>('.enterprise-table + .enterprise-pagination .btn-next, .enterprise-pagination .btn-next')!.click();
    await flush();
    expect(rowsOf('.enterprise-table')).toHaveLength(5);

    const keyword = document.querySelector<HTMLInputElement>('.enterprise-search-keyword input')!;
    typeInto(keyword, '企业1');
    await wait(400);
    // 企业1、企业10–企业19 共 11 行；筛选未生效时会渲染整页 20 行而变红。
    expect(rowsOf('.enterprise-table')).toHaveLength(11);

    api.listEnterprises.mockResolvedValue([]);
    button('重置')!.click();
    await flush();
    expect(document.querySelector('.enterprise-table .el-table__empty-text')?.textContent).toContain('还没有企业');
  });

  it('AdminOfficialSkills: 渲染/分页/筛选/空态', async () => {
    api.listSkills.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({
      id: `s-${i}`, key: `skill-${i}`, name: `技能${i}`, summary: '', category: 'common', categories: ['common'],
      enabledAt: '2026-11-01T00:00:00Z', enabled: true, packageRevision: 1, resourceCount: 0, instructionBytes: 0,
      linkedAgents: [], linkedAgentCount: 0, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    })));
    mount(() => h(AdminOfficialSkills));
    await flush();
    expect(rowsOf('.skills-table')).toHaveLength(10);

    document.querySelector<HTMLButtonElement>('.skills-pagination .btn-next')!.click();
    await flush();
    expect(rowsOf('.skills-table')).toHaveLength(2);

    const keyword = document.querySelector<HTMLInputElement>('.toolbar-search input')!;
    typeInto(keyword, '技能1');
    await wait(350);
    expect(api.listSkills.mock.calls.at(-1)?.[0]).toMatchObject({ keyword: '技能1' });

    api.listSkills.mockResolvedValue([]);
    button('重置')!.click();
    await flush();
    expect(document.querySelector('.skills-table .el-table__empty-text')?.textContent).toContain('还没有技能');
  });

  it('AdminRoles: 渲染/分页/筛选/空态', async () => {
    api.listRoles.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({
      id: `r-${i}`, key: `role-${i}`, name: `角色${i}`, description: null, scope: 'PLATFORM',
      builtIn: false, editable: true, permissionsLocked: false, permissions: [], userCount: 0,
    })));
    mount(() => h(AdminRoles), true);
    await flush();
    expect(rowsOf('')).toHaveLength(10);

    document.querySelector<HTMLButtonElement>('.el-pagination .btn-next')!.click();
    await flush();
    expect(rowsOf('')).toHaveLength(2);

    const keyword = document.querySelector<HTMLInputElement>('.role-search input')!;
    typeInto(keyword, '角色1');
    await wait(550);
    expect(api.listRoles.mock.calls.at(-1)?.[0]).toMatchObject({ keyword: '角色1' });

    api.listRoles.mockResolvedValue([]);
    button('重置')!.click();
    await flush();
    expect(document.body.textContent).toContain('暂无角色');
  });

  it('AdminOfficialAgentsList: 渲染/分页/筛选/空态', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `a-${i}`, key: `agent-${i}`, kind: 'GENERAL', category: null, capabilities: [], status: 'DRAFT',
      avatarUrl: null, draft: { name: `专家${i}`, summary: '', openingQuestions: [], systemPrompt: '', toolScope: [] },
      onlineVersion: null, versions: [], grants: [], activeGrantCount: 0,
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    }));
    const pageChange = vi.fn();
    const keywordUpdate = vi.fn();
    const baseProps = {
      rows,
      total: 12,
      loading: false,
      statusCounts: { all: 12, DRAFT: 12, PUBLISHED: 0, OFFLINE: 0 },
      keyword: '',
      statusFilter: 'ALL',
      hasFilters: false,
      currentPage: 1,
      pageSize: 10,
      canAuthor: true,
      highlightedId: '',
      selectedCount: 0,
      bulkOfflineLoading: false,
      publishingId: '',
      previewingId: '',
      offlineId: '',
      deletingId: '',
      onPageChange: pageChange,
      'onUpdate:keyword': keywordUpdate,
    };
    mount(() => h(AdminOfficialAgentsList, baseProps));
    await flush();
    expect(rowsOf('.agent-table')).toHaveLength(3);

    document.querySelector<HTMLButtonElement>('.pagination-row .btn-next')!.click();
    await flush();
    expect(pageChange).toHaveBeenCalledWith(2);

    const keyword = document.querySelector<HTMLInputElement>('.keyword-input input')!;
    keyword.value = '专家1';
    keyword.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(keywordUpdate).toHaveBeenCalledWith('专家1');

    app?.unmount();
    app = undefined;
    root?.remove();
    mount(() => h(AdminOfficialAgentsList, { ...baseProps, rows: [] }));
    await flush();
    expect(document.body.textContent).toContain('还没有官方专家');
  });

  it('Roles: 渲染/筛选/重置/空态', async () => {
    api.consoleRoles.mockResolvedValue([
      { id: 'r1', key: 'org_admin', name: '企业管理员', description: null, scope: 'ORG_PRESET', builtIn: true, editable: false, permissions: [], permKeys: [], userCount: 1 },
      { id: 'r2', key: 'org_member', name: '企业成员', description: null, scope: 'ORG_PRESET', builtIn: true, editable: true, permissions: [], permKeys: [], userCount: 2 },
    ]);
    mount(() => h(Roles), true);
    await flush();
    expect(rowsOf('.roles-table')).toHaveLength(2);

    const keyword = document.querySelector<HTMLInputElement>('.roles-search input')!;
    typeInto(keyword, '管理员');
    await wait(600);
    expect(rowsOf('.roles-table')).toHaveLength(1);

    typeInto(keyword, '');
    await wait(600);
    expect(rowsOf('.roles-table')).toHaveLength(2);

    api.consoleRoles.mockResolvedValue([]);
    app?.unmount();
    app = undefined;
    root?.remove();
    mount(() => h(Roles), true);
    await flush();
    expect(document.body.textContent).toContain('暂无角色');
  });
});
