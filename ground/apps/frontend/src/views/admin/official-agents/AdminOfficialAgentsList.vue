<template>
  <div class="agent-list">
    <div class="agent-toolbar">
      <el-input
        :model-value="keyword"
        class="keyword-input"
        clearable
        placeholder="搜索名称、标识、ID 或简介"
        :prefix-icon="Search"
        @update:model-value="emit('update:keyword', $event)"
        @input="emit('search-input')"
        @clear="emit('search')"
        @keyup.enter="emit('search')"
      />
      <el-button type="primary" @click="emit('search')">搜索</el-button>
      <el-button @click="emit('reset')">重置</el-button>
      <el-button
        v-if="canAuthor"
        type="warning"
        :disabled="!selectedCount"
        :loading="bulkOfflineLoading"
        @click="emit('bulk-offline')"
      >
        批量下架（{{ selectedCount }}）
      </el-button>
    </div>

    <el-radio-group
      :model-value="statusFilter"
      class="status-tabs"
      @update:model-value="onStatusChange"
    >
      <el-radio-button value="ALL">全部 {{ statusCounts.all }}</el-radio-button>
      <el-radio-button value="DRAFT">未发布 {{ statusCounts.DRAFT }}</el-radio-button>
      <el-radio-button value="PUBLISHED">已发布 {{ statusCounts.PUBLISHED }}</el-radio-button>
      <el-radio-button value="OFFLINE">已下架 {{ statusCounts.OFFLINE }}</el-radio-button>
    </el-radio-group>

    <div class="agent-table-wrap">
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="rows"
      border
      class="agent-table"
      row-key="id"
      :row-class-name="rowClassName"
      @selection-change="onSelectionChange"
    >
      <el-table-column v-if="canAuthor" type="selection" width="48" :selectable="canSelectOffline" />
      <el-table-column label="专家" min-width="260">
        <template #default="{ row }">
          <div class="agent-identity">
            <div class="agent-avatar" aria-hidden="true">
              <img
                v-if="row.avatarUrl && !isAvatarBroken(row)"
                :src="row.avatarUrl"
                :alt="row.draft.name"
                @error="onAvatarError(row)"
              />
              <UserRound v-else :size="22" aria-hidden="true" />
            </div>
            <div class="agent-identity-text">
              <div class="agent-name">{{ row.draft.name }}</div>
              <div class="agent-key">{{ row.key }}</div>
              <div class="agent-id">{{ row.id }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="row.kind === 'KNOWLEDGE' ? 'warning' : 'primary'">
            {{ kindLabel(row.kind) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <div class="status-cell">
            <el-tag size="small" :type="statusType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
            <el-tag
              v-if="row.hasUnpublishedChanges"
              size="small"
              type="warning"
              effect="plain"
            >
              有未发布修改
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="410" fixed="right" align="center" class-name="agent-ops-col" label-class-name="agent-ops-col">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="emit('viewer', row)">查看</el-button>
            <el-button v-if="canAuthor" text type="primary" @click="emit('discovery', row)">专家介绍</el-button>
            <el-button v-if="canAuthor" text type="primary" @click="emit('edit', row)">编辑</el-button>
            <el-button text type="primary" @click="emit('publish-records', row)">发布记录</el-button>
            <el-button v-if="canAuthor" text type="primary" :loading="previewingId===row.id" @click="emit('preview', row)">不可变预览</el-button>
            <el-button
              text
              type="primary"
              v-if="canAuthor"
              :loading="publishingId === row.id"
              @click="emit('publish', row)"
            >
              发布
            </el-button>
            <el-button
              v-if="canAuthor && row.status === 'PUBLISHED'"
              text
              type="warning"
              :loading="offlineId === row.id"
              @click="emit('offline', row)"
            >
              下架
            </el-button>
            <el-button
              text
              type="danger"
              v-if="canAuthor"
              :loading="deletingId === row.id"
              @click="emit('delete', row)"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="hasFilters ? '没有符合条件的专家' : '还没有官方专家'">
          <el-button v-if="canAuthor && !hasFilters" type="primary" @click="emit('create')">新建专家</el-button>
        </el-empty>
      </template>
    </el-table>
    </div>

    <div class="pagination-row">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        background
        layout="total, sizes, prev, pager, next"
        :page-sizes="[10, 20, 50]"
        :total="total"
        @current-change="emit('page-change', $event)"
        @size-change="emit('page-size-change', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Search, UserRound } from 'lucide-vue-next';
import type { OfficialAgentRow, OfficialAgentStatus, OfficialAgentStatusCounts } from '../../../api/admin';
import { formatDate, kindLabel, statusLabel, statusType } from '../../../components/admin/official-agents/agent-display';

const props = defineProps<{
  rows: OfficialAgentRow[];
  total: number;
  loading: boolean;
  statusCounts: OfficialAgentStatusCounts;
  keyword: string;
  statusFilter: OfficialAgentStatus | 'ALL';
  hasFilters: boolean;
  currentPage: number;
  pageSize: number;
  canAuthor: boolean;
  highlightedId: string;
  selectedCount: number;
  bulkOfflineLoading: boolean;
  publishingId: string;
  previewingId: string;
  offlineId: string;
  deletingId: string;
}>();

const emit = defineEmits<{
  'update:keyword': [value: string];
  'update:statusFilter': [value: OfficialAgentStatus | 'ALL'];
  'search-input': [];
  search: [];
  reset: [];
  create: [];
  'bulk-offline': [];
  viewer: [row: OfficialAgentRow];
  discovery: [row: OfficialAgentRow];
  edit: [row: OfficialAgentRow];
  'publish-records': [row: OfficialAgentRow];
  preview: [row: OfficialAgentRow];
  publish: [row: OfficialAgentRow];
  offline: [row: OfficialAgentRow];
  delete: [row: OfficialAgentRow];
  'selection-change': [rows: OfficialAgentRow[]];
  'page-change': [page: number];
  'page-size-change': [size: number];
}>();

const tableRef = ref();
const brokenAvatarIds = reactive<Record<string, boolean>>({});

/** 缓存键含头像地址：换头像后 url 变化即重新尝试加载（原实现保存后清理缓存）。 */
function avatarCacheKey(row: OfficialAgentRow) {
  return `${row.id}:${row.avatarUrl ?? ''}`;
}

function isAvatarBroken(row: OfficialAgentRow) {
  return Boolean(brokenAvatarIds[avatarCacheKey(row)]);
}

function onStatusChange(value: OfficialAgentStatus | 'ALL') {
  emit('update:statusFilter', value);
  emit('search');
}

function onAvatarError(row: OfficialAgentRow) {
  brokenAvatarIds[avatarCacheKey(row)] = true;
}

function canSelectOffline(row: OfficialAgentRow) {
  return row.status === 'PUBLISHED';
}

function onSelectionChange(rowsSelected: OfficialAgentRow[]) {
  emit('selection-change', rowsSelected);
}

function rowClassName({ row }: { row: OfficialAgentRow }) {
  return row.id === props.highlightedId ? 'agent-row-highlight' : '';
}

defineExpose({
  clearSelection: () => tableRef.value?.clearSelection?.(),
});
</script>

<style scoped>
.agent-table-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  /* Contain width so el-table can shrink inside flex/grid ancestors and scroll internally. */
  overflow: hidden;
}

.agent-table-wrap :deep(.el-table) {
  width: 100% !important;
}

.agent-table-wrap :deep(.el-table__inner-wrapper),
.agent-table-wrap :deep(.el-table__header-wrapper),
.agent-table-wrap :deep(.el-table__body-wrapper),
.agent-table-wrap :deep(.el-table__footer-wrapper) {
  /* Element Plus sync-scrolls header/body; ancestors must not force expand. */
  min-width: 0;
}

.agent-table-wrap :deep(.el-table__body-wrapper) {
  overflow-x: auto !important;
}

.agent-toolbar,
.operation-buttons {
  align-items: center;
  display: flex;
}

.agent-toolbar {
  flex-wrap: wrap;
  gap: 10px;
}

.keyword-input {
  width: 260px;
}

.status-tabs {
  display: flex;
  flex-wrap: wrap;
  margin: 12px 0 14px;
}

.agent-id {
  color: #98a2b3;
  font-size: 12px;
  line-height: 16px;
  word-break: break-all;
}

:deep(.agent-row-highlight > td.el-table__cell) {
  background: #f3efff !important;
}

:deep(.agent-row-highlight:hover > td.el-table__cell) {
  background: #ebe4ff !important;
}

.status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.agent-identity {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.agent-identity-text {
  min-width: 0;
}

.agent-avatar {
  align-items: center;
  background: #eef2ff;
  border: 1px solid #dfe5ef;
  border-radius: 8px;
  color: #4338ca;
  display: inline-flex;
  flex: none;
  font-size: 14px;
  font-weight: 600;
  height: 36px;
  justify-content: center;
  line-height: 1;
  overflow: hidden;
  width: 36px;
}

.agent-avatar img {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.agent-name {
  color: #333946;
  font-weight: 600;
}

.agent-key,
.muted {
  color: #98a2b3;
  font-size: 12px;
}

/* 操作列：表头与按钮组始终水平居中；按钮数量变化/换行时每行仍居中 */
.agent-table .operation-buttons,
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  align-content: center;
  gap: 4px;
  width: 100%;
  margin: 0;
  white-space: normal;
}

.operation-buttons :deep(.el-button.is-text),
.agent-table .operation-buttons :deep(.el-button.is-text) {
  padding-inline: 2px;
  margin: 0;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* 仅收紧专家列表操作列左右留白，不改全局 el-table；表头/单元格内容居中 */
:deep(.agent-ops-col.el-table__cell),
:deep(th.agent-ops-col),
:deep(.el-table__header th.agent-ops-col .cell),
:deep(.el-table__body td.agent-ops-col .cell) {
  padding-left: 6px;
  padding-right: 6px;
  text-align: center;
}

:deep(.el-table__body td.agent-ops-col .cell) {
  display: flex;
  justify-content: center;
  align-items: center;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .agent-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .keyword-input {
    width: 100%;
  }

  .pagination-row {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
