import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import type { OfficialAgentRow } from '../src/api/admin';

const api = vi.hoisted(() => ({ list: vi.fn(), offline: vi.fn() }));
vi.mock('../src/api/admin', () => ({ adminOfficialAgentApi: api }));

import { useOfficialAgents } from '../src/composables/useOfficialAgents';
import AdminOfficialAgentsList from '../src/views/admin/official-agents/AdminOfficialAgentsList.vue';

let app: App | undefined;
let root: HTMLElement | undefined;

async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

afterEach(() => {
  app?.unmount();
  root?.remove();
  ElMessage.closeAll();
  document.querySelectorAll('.el-overlay,.el-popper').forEach((node) => node.remove());
  vi.resetAllMocks();
});

describe('官方专家单个下架后的实时列表', () => {
  it.each(['PUBLISHED', 'ALL'] as const)('%s 标签下下架后同步列表和数量，切换已下架可见', async (initialStatus) => {
    let serverRow: OfficialAgentRow = {
      id: 'agent-1', key: 'sales', kind: 'KNOWLEDGE', category: null,
      capabilities: [], status: 'PUBLISHED', avatarUrl: null,
      draft: { name: '销冠智能体', summary: '', openingQuestions: [], systemPrompt: '', toolScope: [] },
      onlineVersion: null, versions: [], grants: [], activeGrantCount: 0,
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    };
    // Only the HTTP boundary is replaced: the composable and table render for real.
    api.list.mockImplementation(async ({ status }) => ({
      items: !status || status === serverRow.status ? [{ ...serverRow }] : [],
      statusCounts: serverRow.status === 'PUBLISHED'
        ? { all: 1, DRAFT: 0, PUBLISHED: 1, OFFLINE: 0 }
        : { all: 1, DRAFT: 0, PUBLISHED: 0, OFFLINE: 1 },
    }));
    api.offline.mockImplementation(async () => {
      serverRow = { ...serverRow, status: 'OFFLINE' };
      return { ...serverRow };
    });

    let agents!: ReturnType<typeof useOfficialAgents>;
    root = document.createElement('div');
    document.body.append(root);
    app = createApp({
      setup() {
        agents = useOfficialAgents();
        agents.statusFilter.value = initialStatus;
        agents.keyword.value = '销冠';
        agents.categoryFilter.value = 'content';
        return () => h(AdminOfficialAgentsList, {
          rows: agents.pagedRows.value, total: agents.rows.value.length,
          loading: agents.loading.value, statusCounts: agents.statusCounts.value,
          keyword: agents.keyword.value, statusFilter: agents.statusFilter.value,
          categoryFilter: agents.categoryFilter.value, hasFilters: agents.hasFilters.value,
          currentPage: agents.currentPage.value, pageSize: agents.pageSize.value,
          canAuthor: true, highlightedId: '', selectedCount: 0, bulkOfflineLoading: false,
          publishingId: '', offlineId: agents.offlineId.value, deletingId: '',
          onOffline: agents.offline,
          'onUpdate:statusFilter': (value) => { agents.statusFilter.value = value; },
          onSearch: agents.onSearchNow,
        });
      },
    }).use(ElementPlus);
    app.mount(root);
    await agents.load();
    await flush();

    const tableRows = () => root!.querySelectorAll('.el-table__body tr.el-table__row');
    expect(tableRows()).toHaveLength(1);
    const offlineButton = Array.from(root.querySelectorAll('button'))
      .find((node) => node.textContent?.trim() === '下架')!;
    offlineButton.click();
    await flush();
    document.querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--danger')!.click();
    await flush();

    expect(root.querySelector('.status-tabs')?.textContent).toContain('已发布 0');
    expect(root.querySelector('.status-tabs')?.textContent).toContain('已下架 1');
    expect(tableRows()).toHaveLength(initialStatus === 'PUBLISHED' ? 0 : 1);
    if (initialStatus === 'ALL') expect(tableRows()[0].textContent).toContain('已下架');
    expect(agents.statusFilter.value).toBe(initialStatus);
    expect(agents.keyword.value).toBe('销冠');
    expect(agents.categoryFilter.value).toBe('content');

    const offlineTab = Array.from(root.querySelectorAll<HTMLElement>('.el-radio-button'))
      .find((node) => node.textContent?.includes('已下架'))!;
    offlineTab.click();
    await flush();
    expect(agents.statusFilter.value).toBe('OFFLINE');
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0].textContent).toContain('销冠智能体');
    expect(tableRows()[0].textContent).toContain('已下架');
  });
});
