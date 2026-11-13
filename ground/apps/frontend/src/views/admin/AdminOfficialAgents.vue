<template>
  <section class="official-agents-page">
    <div class="page-intro">
      <div>
        <h2>专家配置</h2>
        <p>维护官方专家配置、发布与版本。</p>
      </div>
      <div class="header-actions">
        <el-button @click="openAuditDrawer">运营审计</el-button>
        <el-button v-if="canAuthor" type="primary" @click="openCreate">新建专家</el-button>
      </div>
    </div>

    <AdminOfficialAgentsList
      ref="listRef"
      v-model:keyword="keyword"
      v-model:status-filter="statusFilter"
      :rows="pagedRows"
      :total="rows.length"
      :loading="loading"
      :status-counts="statusCounts"
      :has-filters="hasFilters"
      :current-page="currentPage"
      :page-size="pageSize"
      :can-author="canAuthor"
      :highlighted-id="highlightedId"
      :selected-count="selectedRows.length"
      :bulk-offline-loading="bulkOfflineLoading"
      :publishing-id="publishingId"
      :previewing-id="previewingId"
      :offline-id="offlineId"
      :deleting-id="deletingId"
      @search-input="onSearchInput"
      @search="onSearchNow"
      @reset="onReset"
      @create="openCreate"
      @bulk-offline="onBulkOffline"
      @viewer="openViewer"
      @discovery="openDiscovery"
      @edit="openEdit"
      @publish-records="openPublishRecords"
      @preview="preview"
      @publish="onPublish"
      @offline="offline"
      @delete="remove"
      @selection-change="onSelectionChange"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    />

    <AgentEditorDrawer
      v-if="canAuthor"
      ref="editorRef"
      v-model="editorOpen"
      :agent="editorAgent"
      @saved="onEditorSaved"
      @created="onEditorCreated"
      @published="onEditorPublished"
      @discovery="openDiscovery"
    />

    <AgentVersionDialog
      v-model="publishRecordsOpen"
      :agent="publishRecordsAgent"
      :versions="publishRecords"
      :loading="publishRecordsLoading"
      :can-author="canAuthor"
      :rollback-id="rollbackId"
      @rollback="rollback"
    />

    <AgentPreviewDialog
      v-model="previewOpen"
      :path="previewPath"
      :expires-at="previewExpiresAt"
      :error="previewError"
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

    <CatalogDiscoveryEditor v-if="canAuthor && discoveryId" kind="expert" :resource-id="discoveryId" :agent-status="discoveryAgentStatus" @close="discoveryId=''" @saved="onDiscoverySaved" @published="onDiscoveryPublished" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createExpertEditorResources, expertEditorResourcesKey } from '../../components/admin/expert-editor-resources';
const editorResources = createExpertEditorResources();
provide(expertEditorResourcesKey, editorResources);
import CatalogDiscoveryEditor from '../../components/CatalogDiscoveryEditor.vue';
import AdminOfficialAgentsList from './official-agents/AdminOfficialAgentsList.vue';
import AgentEditorDrawer from '../../components/admin/official-agents/AgentEditorDrawer.vue';
import AgentVersionDialog from '../../components/admin/official-agents/AgentVersionDialog.vue';
import AgentPreviewDialog from '../../components/admin/official-agents/AgentPreviewDialog.vue';
import AgentViewerDialog from '../../components/admin/official-agents/AgentViewerDialog.vue';
import AgentAuditDrawer from '../../components/admin/official-agents/AgentAuditDrawer.vue';
import { formatPublishMissingToast } from '../../utils/admin-official-agent-form-errors';
import { adminAuditApi, adminOfficialAgentApi, type AdminAuditRow, type OfficialAgentRow } from '../../api/admin';
import '../../styles/expertWorkspace.css';
import { useAuthStore } from '../../stores/auth';
import { canAuthorExperts } from '../../utils/knowledge-admin';
import { useOfficialAgents } from '../../composables/useOfficialAgents';

const router = useRouter();
const auth = useAuthStore();
const canAuthor = computed(() => canAuthorExperts(auth.session));

const {
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
  load,
  onSearchInput,
  onSearchNow,
  onReset,
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
  onPageChange,
  onPageSizeChange,
} = useOfficialAgents({
  canAuthor: () => canAuthor.value,
  saving: () => Boolean(editorRef.value?.isSaving?.()),
});

const listRef = ref<InstanceType<typeof AdminOfficialAgentsList> | null>(null);
const editorRef = ref<InstanceType<typeof AgentEditorDrawer> | null>(null);

function openDiscovery(target: string | OfficialAgentRow) {
  discoveryId.value = typeof target === 'string' ? target : target.id;
}

function onSelectionChange(selected: OfficialAgentRow[]) {
  selectedRows.value = selected;
}

function onEditorCreated(id: string) {
  focusCreatedAgent(id);
  void load();
}

async function onPublish(row: OfficialAgentRow) {
  const result = await publish(row);
  if (result.status !== 'missing') return;
  ElMessage.error(formatPublishMissingToast(result.missing));
  openEdit(row);
  await nextTick();
  editorRef.value?.focusMissingField(result.missing);
}

async function onBulkOffline() {
  const ids = selectedRows.value.map((row) => row.id);
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

async function onDiscoverySaved() {
  await load();
  if (!editingId.value) return;
  const row = rows.value.find((item) => item.id === editingId.value);
  if (row) editorRef.value?.applyOpeningQuestions((row.draft.openingQuestions ?? []).join('\n'));
}

async function onDiscoveryPublished() {
  await onDiscoverySaved();
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

onMounted(() => { void editorResources.load().catch(() => {}); void load(); });
</script>

<style scoped>
.official-agents-page {
  background: #fff;
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
