import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import type { OfficialAgentRow } from '../src/api/admin';

const api = vi.hoisted(() => ({ list: vi.fn(), publish: vi.fn() }));
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

function expert(id: string, status: OfficialAgentRow['status'] = 'OFFLINE'): OfficialAgentRow {
  return {
    id, key: id, kind: 'GENERAL', category: null, capabilities: [], status, avatarUrl: null,
    draft: {
      name: id, summary: '专家简介', openingQuestions: [], systemPrompt: '专家指令', toolScope: [],
      expertDefinition: { profile: { role: '研究顾问' } },
    },
    onlineVersion: null, versions: [], grants: [], activeGrantCount: 0,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  };
}

async function mount(rows: OfficialAgentRow[]) {
  api.list.mockImplementation(async ({ status }) => ({
    items: rows.filter((row) => !status || row.status === status).map((row) => ({ ...row })),
    statusCounts: {
      all: rows.length,
      DRAFT: rows.filter((row) => row.status === 'DRAFT').length,
      PUBLISHED: rows.filter((row) => row.status === 'PUBLISHED').length,
      OFFLINE: rows.filter((row) => row.status === 'OFFLINE').length,
    },
  }));
  api.publish.mockImplementation(async (id: string) => {
    const row = rows.find((item) => item.id === id)!;
    row.status = 'PUBLISHED';
    return { ...row };
  });
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
}

function button(label: string) {
  const node = Array.from(root!.querySelectorAll<HTMLButtonElement>('button'))
    .find((item) => item.textContent?.includes(label));
  expect(node, label).toBeTruthy();
  return node!;
}

async function selectAll() {
  root!.querySelector<HTMLInputElement>('.el-table__header-wrapper input[type="checkbox"]')!.click();
  await vi.waitFor(() => expect(button('一键发布').disabled).toBe(false));
}

async function confirmPublish() {
  button('一键发布').click();
  await flush();
  document.querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--primary')!.click();
  await flush();
}

describe('一键发布选中的官方专家', () => {
  it('全部标签当前页只有一条已下架时，全选计数为一且仅发布该条，不处理其他页', async () => {
    await mount([
      expert('本页已下架'),
      ...Array.from({ length: 9 }, (_, index) => expert(`已发布${index}`, 'PUBLISHED')),
      expert('下一页已下架'), expert('下一页草稿', 'DRAFT'),
    ]);
    expect(root!.querySelectorAll('.el-table__body tr.el-table__row')).toHaveLength(10);
    await selectAll();
    expect(button('一键发布').textContent).toContain('一键发布（1）');
    expect(button('批量下架').textContent).toContain('批量下架（9）');
    button('一键发布').click();
    await flush();
    expect(document.querySelector('.el-message-box')?.textContent).toContain('选中的 1 个专家');
    document.querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--primary')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('一键发布完成：成功 1 · 失败 0'));
    expect(api.publish.mock.calls.map(([id]) => id)).toEqual(['本页已下架']);
  });

  it('全选已发布项时一键发布计数为零且禁用', async () => {
    await mount([expert('已经发布', 'PUBLISHED')]);
    root!.querySelector<HTMLInputElement>('.el-table__header-wrapper input[type="checkbox"]')!.click();
    await vi.waitFor(() => expect(root!.querySelector<HTMLInputElement>('.el-table__body input[type="checkbox"]')!.checked).toBe(true));
    expect(button('一键发布').textContent).toContain('一键发布（0）');
    expect(button('一键发布').disabled).toBe(true);
    button('一键发布').click();
    await flush();
    expect(api.publish).not.toHaveBeenCalled();
    expect(document.querySelector('.el-message-box')).toBeNull();
  });

  it('混合选择未发布、已下架和已发布时，仅发布前两项', async () => {
    await mount([expert('待发布草稿', 'DRAFT'), expert('下架专家'), expert('已经发布', 'PUBLISHED')]);
    await selectAll();
    expect(button('一键发布').textContent).toContain('一键发布（2）');
    await confirmPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain('一键发布完成：成功 2 · 失败 0'));
    expect(api.publish.mock.calls.map(([id]) => id)).toEqual(['待发布草稿', '下架专家']);
  });

  it('在批量下架右侧使用主题主色，无选择禁用；已下架全选发布后立即更新列表和数量', async () => {
    await mount([expert('专家甲'), expert('专家乙'), expert('未选中的草稿', 'DRAFT')]);
    const publishButton = button('一键发布');
    expect(button('批量下架').nextElementSibling).toBe(publishButton);
    expect(publishButton.classList.contains('el-button--primary')).toBe(true);
    expect(publishButton.disabled).toBe(true);
    Array.from(root!.querySelectorAll<HTMLElement>('.el-radio-button'))
      .find((node) => node.textContent?.startsWith('已下架'))!.click();
    await flush();
    await selectAll();
    expect(publishButton.textContent).toContain('一键发布（2）');

    let finish!: (row: OfficialAgentRow) => void;
    api.publish.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await confirmPublish();
    expect(publishButton.classList.contains('is-loading')).toBe(true);
    expect(button('批量下架').disabled).toBe(true);
    publishButton.click();
    await flush();
    expect(api.publish).toHaveBeenCalledTimes(1);
    // Release the first HTTP response and let the second request use the normal fixture.
    api.list.mockResolvedValue({
      items: [], statusCounts: { all: 3, DRAFT: 1, PUBLISHED: 2, OFFLINE: 0 },
    });
    finish(expert('专家甲', 'PUBLISHED'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('一键发布完成：成功 2 · 失败 0'));
    expect(api.publish.mock.calls.map(([id]) => id)).toEqual(['专家甲', '专家乙']);
    expect(root!.querySelectorAll('.el-table__body tr.el-table__row')).toHaveLength(0);
    expect(root!.querySelector('.status-tabs')?.textContent).toContain('已发布 2');
    expect(root!.querySelector('.status-tabs')?.textContent).toContain('已下架 0');
    expect(publishButton.disabled).toBe(true);
    expect(api.list).toHaveBeenCalledTimes(3);
  });

  it('取消确认不发布，保留勾选项且按钮恢复可用', async () => {
    await mount([expert('专家甲')]);
    await selectAll();
    button('一键发布').click();
    await flush();
    document.querySelector<HTMLButtonElement>('.el-message-box__btns .el-button:not(.el-button--primary)')!.click();
    await flush();
    expect(api.publish).not.toHaveBeenCalled();
    expect(button('一键发布').disabled).toBe(false);
    expect(root!.querySelector<HTMLInputElement>('.el-table__body input[type="checkbox"]')!.checked).toBe(true);
  });

  it('必填项缺失和接口失败分别展示原因，其余选中项继续发布', async () => {
    const incomplete = expert('缺少简介的专家');
    incomplete.draft.summary = '';
    await mount([expert('正常专家甲'), incomplete, expert('接口失败的专家'), expert('正常专家乙', 'DRAFT')]);
    const publish = api.publish.getMockImplementation()!;
    api.publish.mockImplementation(async (id: string) => {
      if (id === '接口失败的专家') throw new Error('关联技能已停用');
      return publish(id);
    });
    await selectAll();
    await confirmPublish();
    await vi.waitFor(() => expect(document.querySelector('.el-message-box')?.textContent).toContain('一键发布完成：成功 2 · 失败 2'));
    expect(document.querySelector('.el-message-box')?.textContent).toContain('缺少简介的专家：发布前请完善：一句话介绍');
    expect(document.querySelector('.el-message-box')?.textContent).toContain('接口失败的专家：关联技能已停用');
    expect(api.publish.mock.calls.map(([id]) => id)).toEqual(['正常专家甲', '接口失败的专家', '正常专家乙']);
    expect(root!.querySelector('.status-tabs')?.textContent).toContain('已发布 2');
    expect(root!.querySelector('.status-tabs')?.textContent).toContain('已下架 2');
    document.querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--primary')!.click();
    await flush();
    expect(button('一键发布').disabled).toBe(true);
  });
});
