<template>
  <section class="official-agents-page">
    <div class="page-intro">
      <div>
        <h2>专家配置</h2>
        <p>维护官方专家配置、发布与版本。</p>
      </div>
      <div class="header-actions">
        <el-button v-if="canAuthor" @click="categoryManagerOpen = true">分类管理</el-button>
        <el-button @click="openAuditDrawer">运营审计</el-button>
        <el-button v-if="canAuthor" type="primary" @click="goCreate">新建专家</el-button>
      </div>
    </div>

    <el-alert v-if="categoryError" :title="`分类加载失败：${categoryError}`" type="error" :closable="false" show-icon><el-button text @click="loadCategories">重试</el-button></el-alert>
    <CatalogCategoryManager v-model="categoryManagerOpen" kind="expert" />

    <AdminOfficialAgentsList
      ref="listRef"
      v-model:keyword="keyword"
      v-model:status-filter="statusFilter"
      v-model:category-filter="categoryFilter"
      :rows="pagedRows"
      :total="rows.length"
      :loading="loading"
      :status-counts="statusCounts"
      :has-filters="hasFilters"
      :current-page="currentPage"
      :page-size="pageSize"
      :can-author="canAuthor"
      :highlighted-id="highlightedId"
      :selected-count="selectedPublishedRows.length"
      :selected-publish-count="selectedPublishableRows.length"
      :bulk-offline-loading="bulkOfflineLoading"
      :bulk-publish-loading="bulkPublishLoading"
      :publishing-id="publishingId"
      :offline-id="offlineId"
      :deleting-id="deletingId"
      @search-input="onSearchInput"
      @search="onSearchNow"
      @reset="onReset"
      @create="goCreate"
      @bulk-offline="onBulkOffline"
      @bulk-publish="onBulkPublish"
      @viewer="openViewer"
      @edit="goEdit"
      @publish-records="openPublishRecords"
      @publish="onPublish"
      @offline="offline"
      @delete="onDelete"
      @selection-change="onSelectionChange"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    />

    <AgentEditorDrawer
      v-if="canAuthor"
      ref="editorRef"
      :model-value="editorOpen"
      :agent="editorAgent"
      @update:model-value="onEditorVisibility"
      @saved="onSaved"
      @created="onEditorCreated"
      @published="onEditorPublished"
    />

    <AgentVersionDialog
      v-model="publishRecordsOpen"
      :agent="publishRecordsAgent"
      :versions="publishRecords"
      :loading="publishRecordsLoading"
      :can-author="canAuthor"
      :rollback-id="rollbackId"
      :category-options="categoryOptions"
      @rollback="rollback"
    />

    <AgentViewerDialog
      v-model="viewerOpen"
      :agent="viewerAgent"
      :discovery="viewerDiscovery"
      :loading="viewerLoading"
    />

    <AgentAuditDrawer
      v-model="auditOpen"
      :rows="auditRows"
      :loading="auditLoading"
      @refresh="loadAudit"
      @full-audit="goFullAudit"
    />
  </section>
</template>

<script setup lang="ts">
import CatalogCategoryManager from '../../components/admin/CatalogCategoryManager.vue';
import { useCatalogCategories } from '../../composables/useCatalogCategories';
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createExpertEditorResources, expertEditorResourcesKey } from '../../components/admin/expert-editor-resources';
const editorResources = createExpertEditorResources();
provide(expertEditorResourcesKey, editorResources);
import AdminOfficialAgentsList from './official-agents/AdminOfficialAgentsList.vue';
import AgentEditorDrawer from '../../components/admin/official-agents/AgentEditorDrawer.vue';
import AgentVersionDialog from '../../components/admin/official-agents/AgentVersionDialog.vue';
import AgentViewerDialog from '../../components/admin/official-agents/AgentViewerDialog.vue';
import AgentAuditDrawer from '../../components/admin/official-agents/AgentAuditDrawer.vue';
import { formatPublishMissingToast } from '../../utils/admin-official-agent-form-errors';
import { adminAuditApi, adminOfficialAgentApi, type AdminAuditRow, type OfficialAgentRow } from '../../api/admin';
import '../../styles/expertWorkspace.css';
import { useAuthStore } from '../../stores/auth';
import { canAuthorExperts } from '../../utils/knowledge-admin';
import { useOfficialAgents } from '../../composables/useOfficialAgents';

const categoryManagerOpen = ref(false);
const { options: categoryOptions, error: categoryError, load: loadCategories } = useCatalogCategories('expert');
onMounted(() => { void loadCategories(); });
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const canAuthor = computed(() => canAuthorExperts(auth.session));

const {
  rows,
  statusCounts,
  keyword,
  statusFilter,
  categoryFilter,
  highlightedId,
  hasFilters,
  loading,
  currentPage,
  pageSize,
  pagedRows,
  load,
  onSearchInput,
  onSearchNow,
  onReset,
  focusCreatedAgent,
  editorOpen,
  editorAgent,
  openCreate,
  openEdit,
  onEditorSaved,
  onEditorPublished,
  publishingId,
  offlineId,
  deletingId,
  bulkOfflineLoading,
  bulkPublishLoading,
  selectedRows,
  selectedPublishableRows,
  publish,
  bulkPublish,
  offline,
  remove,
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
  onPageChange,
  onPageSizeChange,
} = useOfficialAgents({
  canAuthor: () => canAuthor.value,
  saving: () => Boolean(editorRef.value?.isSaving?.()),
});

// Expert filtering is server-side: discard a deleted choice and replace its request.
watch(categoryOptions, options => {
  if (categoryFilter.value && !options.some(item => item.value === categoryFilter.value)) {
    categoryFilter.value = '';
    onSearchNow();
  }
});

const listRef = ref<InstanceType<typeof AdminOfficialAgentsList> | null>(null);
const editorRef = ref<InstanceType<typeof AgentEditorDrawer> | null>(null);
const selectedPublishedRows = computed(() => selectedRows.value.filter((row) => row.status === 'PUBLISHED'));
let bypassLeaveGuard = false;

function editorTarget(): { kind: 'new' } | { kind: 'edit'; id: string } | null {
  if (route.name === 'admin-official-agents-new') return { kind: 'new' };
  if (route.name === 'admin-official-agents-edit' && typeof route.params.id === 'string' && route.params.id) {
    return { kind: 'edit', id: route.params.id };
  }
  return null;
}

function goCreate() {
  void router.push({ name: 'admin-official-agents-new' });
}

function goEdit(row: OfficialAgentRow) {
  openEdit(row);
  void router.push({ name: 'admin-official-agents-edit', params: { id: row.id } });
}

async function leaveToList() {
  // router.back() resolves before the navigation guard runs, which used to clear
  // bypassLeaveGuard too early and ask for discard a second time. Await replace.
  await router.replace({ name: 'admin-official-agents' });
}

function onEditorVisibility(open: boolean) {
  editorOpen.value = open;
  if (open || !editorTarget()) return;
  bypassLeaveGuard = true;
  void leaveToList().finally(() => { bypassLeaveGuard = false; });
}

async function syncEditorRoute() {
  const target = editorTarget();
  if (!target) {
    editorOpen.value = false;
    return;
  }
  if (!canAuthor.value) {
    await router.replace({ name: 'admin-official-agents' });
    return;
  }
  if (target.kind === 'new') {
    openCreate();
    return;
  }
  const cached = rows.value.find((item) => item.id === target.id) ?? (editorAgent.value?.id === target.id ? editorAgent.value : null);
  if (cached) {
    const switching = editorOpen.value && editorAgent.value?.id !== cached.id;
    openEdit(cached);
    if (switching) editorRef.value?.reload?.();
    return;
  }
  try {
    const detail = await adminOfficialAgentApi.detail(target.id);
    const current = editorTarget();
    if (current?.kind !== 'edit' || current.id !== target.id) return;
    openEdit(detail);
  } catch (error) {
    const current = editorTarget();
    if (current?.kind !== 'edit' || current.id !== target.id) return;
    ElMessage.error(error instanceof Error ? error.message : '找不到这个专家');
    await router.replace({ name: 'admin-official-agents' });
  }
}

onBeforeRouteUpdate(async (to, from) => {
  const fromEdit = from.name === 'admin-official-agents-new' || from.name === 'admin-official-agents-edit';
  const same = from.name === to.name && from.params.id === to.params.id;
  if (!fromEdit || same || bypassLeaveGuard) return true;
  return await editorRef.value?.confirmDiscard?.() ?? true;
});

function onSelectionChange(selected: OfficialAgentRow[]) {
  selectedRows.value = selected;
}

function onSaved(row: OfficialAgentRow) {
  onEditorSaved(row);
  editorAgent.value = row;
  if (!rows.value.some((item) => item.id === row.id)) rows.value = [row, ...rows.value];
}

function onEditorCreated(id: string) {
  focusCreatedAgent(id);
  void load();
  if (route.name !== 'admin-official-agents-new') return;
  bypassLeaveGuard = true;
  void router.replace({ name: 'admin-official-agents-edit', params: { id } }).finally(() => { bypassLeaveGuard = false; });
}

async function onPublish(row: OfficialAgentRow) {
  const result = await publish(row);
  if (result.status !== 'missing') return;
  ElMessage.error(formatPublishMissingToast(result.missing));
  goEdit(row);
  await nextTick();
  editorRef.value?.focusMissingField(result.missing);
}

async function onDelete(row: OfficialAgentRow) {
  const deleted = await remove(row);
  if (!deleted || route.name !== 'admin-official-agents-edit' || route.params.id !== row.id) return;
  bypassLeaveGuard = true;
  try {
    await router.replace({ name: 'admin-official-agents' });
  } finally {
    bypassLeaveGuard = false;
  }
}

async function onBulkPublish() {
  if (!await bulkPublish()) return;
  selectedRows.value = [];
  listRef.value?.clearSelection?.();
}

async function onBulkOffline() {
  if (bulkPublishLoading.value) return;
  const ids = selectedPublishedRows.value.map((row) => row.id);
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm(
      `将下架 ${ids.length} 个已发布专家。下架后企业目录不可见，受控执行会被拒绝。确定？`,
      '批量下架官方专家',
      { type: 'warning', confirmButtonText: '下架', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  bulkOfflineLoading.value = true;
  try {
    const result = await adminOfficialAgentApi.bulkOffline(ids);
    await load();
    selectedRows.value = [];
    listRef.value?.clearSelection?.();
    ElMessage.success(
      `批量下架完成：下架 ${result.summary.offlined} · 跳过 ${result.summary.skipped} · 错误 ${result.summary.errors}`,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量下架失败');
  } finally {
    bulkOfflineLoading.value = false;
  }
}

const auditOpen = ref(false);
const auditLoading = ref(false);
const auditRows = ref<AdminAuditRow[]>([]);

async function openAuditDrawer() {
  auditOpen.value = true;
  await loadAudit();
}

async function loadAudit() {
  auditLoading.value = true;
  try {
    // 用前缀筛出官方专家相关写操作；meta 中含 agentId/versionId/tenant，不含提示词正文。
    const result = await adminAuditApi.list({
      page: 1,
      pageSize: 100,
      actionPrefix: 'admin_',
    });
    auditRows.value = result.rows.filter((row) => row.action.includes('official_agent'));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载审计失败');
  } finally {
    auditLoading.value = false;
  }
}

function goFullAudit() {
  void router.push({ path: '/admin/audit', query: { actionPrefix: 'admin_' } });
}

watch(() => [route.name, route.params.id], () => { void syncEditorRoute(); });
onMounted(() => { void editorResources.load().catch(() => {}); void load().finally(() => { void syncEditorRoute(); }); });
</script>

<style scoped>
.official-agents-page {
  background: #fff;
  font-size: 13px;
  --el-font-size-base: 13px;
  min-height: calc(100vh - 120px);
  padding: 15px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  /* Prevent the fixed-ops table from stretching the whole workspace; scroll stays local. */
  overflow-x: hidden;
}

.page-intro {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 18px;
}

.page-intro h2 {
  color: #333946;
  font-size: 18px;
  margin: 0 0 6px;
}

.page-intro p {
  color: #667085;
  font-size: 13px;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .page-intro {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }
}
</style>
<style>
.el-dialog.official-agent-dialog,
.el-drawer.official-agent-audit,
.el-dialog.expert-metadata-dialog,
.el-dialog.expert-skill-content-dialog,
.el-dialog.expert-resource-dialog {
  font-size: 13px;
  --el-font-size-base: 13px;
}
</style>
