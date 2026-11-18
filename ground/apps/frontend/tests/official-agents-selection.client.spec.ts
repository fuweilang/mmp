import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import type { OfficialAgentRow, OfficialAgentStatus } from '../src/api/admin';

const api = vi.hoisted(() => ({ list: vi.fn(), bulkOffline: vi.fn() }));
vi.mock('../src/api/admin', async (original) => ({
  ...await original<typeof import('../src/api/admin')>(),
  adminOfficialAgentApi: api,
  adminKnowledgeCoreApi: { editorCatalog: async () => [], profiles: async () => [] },
  adminLlmProviderApi: { list: async () => [] },
}));
vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({ session: { platformRoleKey: 'super_admin' } }),
}));

import AdminOfficialAgents from '../src/views/admin/AdminOfficialAgents.vue';

let app: App | undefined;
let root: HTMLElement | undefined;

async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

afterEach(() => {
  ElMessageBox.close();
  ElMessage.closeAll();
  app?.unmount();
  root?.remove();
  document.querySelectorAll('.el-overlay,.el-popper').forEach((node) => node.remove());
  vi.resetAllMocks();
});

describe('专家列表选择与批量下架', () => {
  it.each([
    { tab: 'OFFLINE', label: '已下架', selected: 2, offlinable: 0 },
    { tab: 'DRAFT', label: '未发布', selected: 1, offlinable: 0 },
    { tab: 'PUBLISHED', label: '已发布', selected: 1, offlinable: 1 },
    { tab: 'ALL', label: '全部', selected: 4, offlinable: 1 },
  ] as const)('$label 标签全选、取消和单选正常，批量下架仅计入已发布项', async ({ tab, label, selected, offlinable }) => {
    const rows: OfficialAgentRow[] = (['OFFLINE', 'OFFLINE', 'DRAFT', 'PUBLISHED'] as OfficialAgentStatus[]).map((status, index) => ({
      id: `agent-${index}`, key: `expert-${index}`, kind: 'GENERAL', category: null,
      capabilities: [], status, avatarUrl: null,
      draft: { name: `专家${index}`, summary: '', openingQuestions: [], systemPrompt: '', toolScope: [] },
      onlineVersion: null, versions: [], grants: [], activeGrantCount: 0,
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    }));
    api.list.mockImplementation(async ({ status }) => ({
      items: status ? rows.filter((row) => row.status === status) : rows,
      statusCounts: { all: 4, DRAFT: 1, PUBLISHED: 1, OFFLINE: 2 },
    }));
    api.bulkOffline.mockResolvedValue({ results: [], summary: { offlined: 1, skipped: 0, errors: 0 } });
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/admin/official-agents', name: 'admin-official-agents', component: AdminOfficialAgents },
    ] });
    await router.push('/admin/official-agents');
    await router.isReady();
    root = document.createElement('div');
    document.body.append(root);
    app = createApp({ render: () => h(RouterView) }).use(ElementPlus).use(router);
    app.mount(root);
    await flush();
    if (tab !== 'ALL') {
      Array.from(root.querySelectorAll<HTMLElement>('.el-radio-button'))
        .find((node) => node.textContent?.startsWith(label))!.click();
      await flush();
    }

    const header = () => root!.querySelector<HTMLInputElement>('.el-table__header-wrapper input[type="checkbox"]')!;
    const rowCheckboxes = () => Array.from(root!.querySelectorAll<HTMLInputElement>('.el-table__body input[type="checkbox"]'));
    const bulkButton = () => Array.from(root!.querySelectorAll<HTMLButtonElement>('button'))
      .find((node) => node.textContent?.includes('批量下架'))!;

    expect(rowCheckboxes()).toHaveLength(selected);
    header().click();
    await flush();
    await vi.waitFor(() => expect(rowCheckboxes().filter((node) => node.checked)).toHaveLength(selected));
    expect(bulkButton().textContent).toContain(`批量下架（${offlinable}）`);
    expect(bulkButton().disabled).toBe(offlinable === 0);

    if (offlinable) {
      bulkButton().click();
      await flush();
      document.querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--danger')!.click();
      await flush();
      expect(api.bulkOffline).toHaveBeenCalledWith(['agent-3']);
      // Restore the selection cleared after a successful bulk operation.
      header().click();
      await vi.waitFor(() => expect(rowCheckboxes().filter((node) => node.checked)).toHaveLength(selected));
    } else {
      expect(api.bulkOffline).not.toHaveBeenCalled();
    }

    header().click();
    await flush();
    await vi.waitFor(() => expect(rowCheckboxes().every((node) => !node.checked)).toBe(true));
    expect(bulkButton().disabled).toBe(true);
    rowCheckboxes()[0].click();
    await flush();
    expect(rowCheckboxes()[0].checked).toBe(true);
    expect(rowCheckboxes().filter((node) => node.checked)).toHaveLength(1);
  });
});
