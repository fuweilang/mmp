import { computed, h, onBeforeUnmount, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  adminOfficialAgentApi,
  type OfficialAgentRow,
  type OfficialAgentStatus,
  type OfficialAgentStatusCounts,
  type OfficialAgentVersion,
} from '../api/admin';
import { useAdminSearch, useAdminTable } from './useAdminTable';
import { collectPublishMissing } from '../components/admin/official-agents/agent-display';
import { previewHostLaunchUrl } from '../utils/knowledge-admin';
import { agentWebUrl } from '../utils/agent';

export type PublishRowResult =
  | { status: 'missing'; missing: string[] }
  | { status: 'cancelled' }
  | { status: 'done' };

export interface OfficialAgentsOptions {
  /** 列表操作的前端守卫（原实现：预览/回滚/发布）。默认放行。 */
  canAuthor?: () => boolean;
  /** 编辑器保存中时拒绝列表操作（原 `publishingId || saving`）。 */
  saving?: () => boolean;
}

/**
 * 官方专家列表的数据面：加载、筛选分页、发布/下架/删除、发布记录与回滚、
 * 不可变预览、查看弹窗、专家介绍（discovery）与高亮。
 *
 * `discoveryId` / `highlightedId` 等跨区状态集中在此，不用全局 store。
 */
export function useOfficialAgents(options: OfficialAgentsOptions = {}) {
  const canAuthor = options.canAuthor ?? (() => true);
  const isSaving = options.saving ?? (() => false);

  const rows = ref<OfficialAgentRow[]>([]);
  const statusCounts = ref<OfficialAgentStatusCounts>({ all: 0, DRAFT: 0, PUBLISHED: 0, OFFLINE: 0 });
  const keyword = ref('');
  const statusFilter = ref<OfficialAgentStatus | 'ALL'>('ALL');
  const highlightedId = ref('');
  const discoveryId = ref('');
  let highlightTimer = 0;

  const hasFilters = computed(() => Boolean(keyword.value.trim() || statusFilter.value !== 'ALL'));

  const table = useAdminTable<OfficialAgentRow>({
    rows: () => rows.value,
    pageSize: 10,
    hasFilters: () => hasFilters.value,
    emptyAll: '还没有官方专家',
    emptyFiltered: '没有符合条件的专家',
    // 原实现改每页条数不重置页码，越界由分页组件 clamp。
    resetPageOnSizeChange: false,
  });
  const { currentPage, pageSize, pagedRows, resetPage, onPageChange, onPageSizeChange } = table;

  const search = useAdminSearch({
    debounceMs: 350,
    load: () => load(),
    resetPage,
    clearFilters: () => {
      keyword.value = '';
      statusFilter.value = 'ALL';
    },
  });
  const { loading } = search;

  async function load() {
    await search.runLoad(async (isCurrent) => {
      try {
        const result = await adminOfficialAgentApi.list({
          keyword: keyword.value.trim(),
          status: statusFilter.value === 'ALL' ? '' : statusFilter.value,
        });
        if (!isCurrent()) return;
        rows.value = result.items;
        statusCounts.value = result.statusCounts;
      } catch (error) {
        if (!isCurrent()) return;
        ElMessage.error(error instanceof Error ? error.message : '加载官方专家失败');
      }
    });
  }

  function replaceRow(next: OfficialAgentRow) {
    const index = rows.value.findIndex((row) => row.id === next.id);
    if (index >= 0) rows.value[index] = next;
    if (viewerAgent.value?.id === next.id) viewerAgent.value = next;
  }

  function focusCreatedAgent(id: string) {
    keyword.value = '';
    statusFilter.value = 'ALL';
    currentPage.value = 1;
    highlightedId.value = id;
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
      if (highlightedId.value === id) highlightedId.value = '';
    }, 4500);
  }

  const discoveryAgentStatus = computed(() => rows.value.find((row) => row.id === discoveryId.value)?.status ?? '');

  // ── 编辑器开合（列表侧只负责“打开哪一行”） ──
  const editorOpen = ref(false);
  const editorAgent = ref<OfficialAgentRow | null>(null);
  const editingId = ref('');
  function openCreate() {
    editorAgent.value = null;
    editingId.value = '';
    editorOpen.value = true;
  }
  function openEdit(row: OfficialAgentRow) {
    editorAgent.value = row;
    editingId.value = row.id;
    editorOpen.value = true;
  }
  function onEditorSaved(row: OfficialAgentRow) {
    replaceRow(row);
  }
  function onEditorPublished(row: OfficialAgentRow) {
    replaceRow(row);
    void load();
  }

  // ── 列表行操作 ──
  const publishingId = ref('');
  const offlineId = ref('');
  const deletingId = ref('');
  const bulkOfflineLoading = ref(false);
  const selectedRows = ref<OfficialAgentRow[]>([]);

  async function publish(row: OfficialAgentRow): Promise<PublishRowResult> {
    if (!canAuthor() || publishingId.value || isSaving()) return { status: 'cancelled' };
    const def = row.draft.expertDefinition ?? {};
    const profile = def.profile && typeof def.profile === 'object' ? def.profile as { role?: string } : {};
    const missing = collectPublishMissing({
      name: row.draft.name || '',
      summary: row.draft.summary || '',
      expertRole: String(profile.role || ''),
      systemPrompt: row.draft.systemPrompt || '',
      toolScope: row.draft.toolScope || [],
    });
    if (missing.length) return { status: 'missing', missing };
    try {
      await ElMessageBox.confirm(
        '发布后终端将使用当前已保存的待发布配置。确定发布？',
        '发布官方专家',
        { type: 'warning', confirmButtonText: '发布' },
      );
    } catch {
      return { status: 'cancelled' };
    }
    publishingId.value = row.id;
    try {
      replaceRow(await adminOfficialAgentApi.publish(row.id));
      await load();
      ElMessage.success('已发布');
      return { status: 'done' };
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '发布失败');
      return { status: 'cancelled' };
    } finally {
      publishingId.value = '';
    }
  }

  async function offline(row: OfficialAgentRow) {
    try {
      await ElMessageBox.confirm(
        '下架后，所有企业都不能再启动该专家的受控会话，历史版本和授权记录会保留。确定下架？',
        '下架官方专家',
        { type: 'warning', confirmButtonText: '下架', confirmButtonClass: 'el-button--danger' },
      );
    } catch {
      return;
    }
    offlineId.value = row.id;
    try {
      replaceRow(await adminOfficialAgentApi.offline(row.id));
      ElMessage.success('已下架');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '下架失败');
    } finally {
      offlineId.value = '';
    }
  }

  async function remove(row: OfficialAgentRow) {
    const expertName = (row.draft.name || row.key || '').trim() || '未命名专家';
    try {
      // Safe VNodes only — never concatenate unsanitized HTML for the highlighted name.
      await ElMessageBox.confirm(
        h('span', { class: 'official-agent-delete-confirm' }, [
          '确定永久删除专家',
          h(
            'span',
            {
              class: 'official-agent-delete-confirm__name',
              style: {
                color: 'var(--el-color-primary)',
                fontWeight: '600',
              },
            },
            `「${expertName}」`,
          ),
          '吗？将删除该专家的配置、版本与授权记录；不会清除用户历史对话，共享技能也不会被删除。删除后不可恢复。',
        ]),
        '删除官方专家',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger',
        },
      );
    } catch {
      return;
    }
    deletingId.value = row.id;
    try {
      await adminOfficialAgentApi.remove(row.id);
      rows.value = rows.value.filter((item) => item.id !== row.id);
      if (viewerAgent.value?.id === row.id) {
        viewerOpen.value = false;
        viewerAgent.value = null;
      }
      if (editingId.value === row.id) editorOpen.value = false;
      if (discoveryId.value === row.id) discoveryId.value = '';
      await load();
      ElMessage.success('已删除');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      deletingId.value = '';
    }
  }

  // ── 列表级“不可变预览” ──
  const previewingId = ref('');
  const previewOpen = ref(false);
  const previewPath = ref('');
  const previewExpiresAt = ref('');
  const previewError = ref('');
  async function preview(row: OfficialAgentRow) {
    if (!canAuthor()) return;
    previewingId.value = row.id;
    try {
      const created = await adminOfficialAgentApi.preview(row.id);
      previewPath.value = '';
      previewError.value = '';
      try {
        previewPath.value = previewHostLaunchUrl(created, agentWebUrl);
      } catch (e) {
        previewError.value = e instanceof Error ? e.message : '预览启动地址无效';
      }
      previewExpiresAt.value = created.expiresAt;
      previewOpen.value = true;
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '预览创建失败');
    } finally {
      previewingId.value = '';
    }
  }

  // ── 查看弹窗 ──
  const viewerOpen = ref(false);
  const viewerLoading = ref(false);
  const viewerAgent = ref<OfficialAgentRow | null>(null);
  const viewerDiscovery = ref<{
    introduction: string;
    outputs: string[];
    materials: string[];
    boundaries: string[];
    starters: Array<{ text: string }>;
  } | null>(null);

  async function openViewer(row: OfficialAgentRow) {
    viewerOpen.value = true;
    viewerAgent.value = row;
    viewerDiscovery.value = null;
    viewerLoading.value = true;
    try {
      const detail = await adminOfficialAgentApi.detail(row.id);
      viewerAgent.value = detail;
      replaceRow(detail);
      try {
        const discovery = await adminOfficialAgentApi.discovery(row.id);
        viewerDiscovery.value = {
          introduction: discovery.discoveryDetail?.introduction ?? '',
          outputs: discovery.discoveryDetail?.outputs ?? [],
          materials: discovery.discoveryDetail?.materials ?? [],
          boundaries: discovery.discoveryDetail?.boundaries ?? [],
          starters: (discovery.discoveryDetail?.starters ?? []).map((item: { text?: string }) => ({
            text: String(item?.text ?? ''),
          })).filter((item: { text: string }) => item.text),
        };
      } catch {
        // Discovery optional for view; fall back to empty sections.
        viewerDiscovery.value = {
          introduction: '',
          outputs: [],
          materials: [],
          boundaries: [],
          starters: (detail.draft.openingQuestions ?? []).map((text: string) => ({ text })),
        };
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '加载专家详情失败');
    } finally {
      viewerLoading.value = false;
    }
  }

  // ── 发布记录 / 回滚 ──
  const publishRecordsOpen = ref(false);
  const publishRecordsLoading = ref(false);
  const publishRecordsAgent = ref<OfficialAgentRow | null>(null);
  const publishRecords = ref<OfficialAgentVersion[]>([]);
  const rollbackId = ref('');

  async function openPublishRecords(row: OfficialAgentRow) {
    publishRecordsAgent.value = row;
    publishRecordsOpen.value = true;
    publishRecordsLoading.value = true;
    try {
      const detail = await adminOfficialAgentApi.detail(row.id);
      publishRecordsAgent.value = detail;
      publishRecords.value = [...(detail.versions ?? [])].sort(
        (a, b) => b.version - a.version,
      );
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '加载发布记录失败');
      publishRecords.value = [];
    } finally {
      publishRecordsLoading.value = false;
    }
  }

  async function rollback(version: OfficialAgentVersion) {
    if (!canAuthor()) return;
    const agent = publishRecordsAgent.value;
    if (!agent) return;
    try {
      await ElMessageBox.confirm(`将在线版本切换到 v${version.version}，草稿保持原样；新会话使用所选版本。`, '回滚版本', { type: 'warning' });
    } catch {
      return;
    }
    rollbackId.value = version.id;
    try {
      const next = await adminOfficialAgentApi.rollback(agent.id, version.id);
      replaceRow(next);
      publishRecordsAgent.value = next;
      ElMessage.success('在线版本已回滚，草稿保持原样');
      await load();
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '回滚失败');
    } finally {
      rollbackId.value = '';
    }
  }

  onBeforeUnmount(() => {
    window.clearTimeout(highlightTimer);
    search.dispose();
  });

  return {
    rows,
    statusCounts,
    keyword,
    statusFilter,
    highlightedId,
    discoveryId,
    discoveryAgentStatus,
    hasFilters,
    loading,
    currentPage,
    pageSize,
    pagedRows,
    onPageChange,
    onPageSizeChange,
    load,
    onSearchInput: search.onSearchInput,
    onSearchNow: search.onSearchNow,
    onReset: search.onReset,
    replaceRow,
    focusCreatedAgent,
    editorOpen,
    editorAgent,
    editingId,
    openCreate,
    openEdit,
    onEditorSaved,
    onEditorPublished,
    publishingId,
    offlineId,
    deletingId,
    bulkOfflineLoading,
    selectedRows,
    publish,
    offline,
    remove,
    previewingId,
    previewOpen,
    previewPath,
    previewExpiresAt,
    previewError,
    preview,
    viewerOpen,
    viewerLoading,
    viewerAgent,
    viewerDiscovery,
    openViewer,
    publishRecordsOpen,
    publishRecordsLoading,
    publishRecordsAgent,
    publishRecords,
    rollbackId,
    openPublishRecords,
    rollback,
  };
}
