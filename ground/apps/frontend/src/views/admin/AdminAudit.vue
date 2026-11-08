<template>
  <section class="audit-page">
    <div class="audit-header">
      <h1>操作审计</h1>
      <p>查看全平台与各企业的操作日志。敏感字段已脱敏；详情默认折叠。</p>
    </div>

    <div class="audit-toolbar">
      <el-select
        v-model="tenantId"
        class="filter-enterprise"
        clearable
        filterable
        placeholder="全部企业"
        @change="onSearch"
      >
        <el-option label="仅平台" value="__platform__">
          <span class="enterprise-option platform-option">
            <span class="visual-dot platform-dot" />
            <span>仅平台</span>
          </span>
        </el-option>
        <el-option
          v-for="item in enterprises"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        >
          <span class="enterprise-option">
            <span class="visual-dot" :style="{ backgroundColor: tenantColor(item.id) }" />
            <span>{{ item.name }}</span>
          </span>
        </el-option>
      </el-select>

      <el-select
        v-model="actionFilter"
        class="filter-action"
        clearable
        filterable
        placeholder="全部操作"
        @change="onActionExact"
      >
        <el-option
          v-for="item in actionOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>

      <el-select
        v-model="actionPrefix"
        class="filter-action"
        clearable
        placeholder="操作前缀"
        @change="onActionPrefix"
      >
        <el-option label="官方专家相关（admin_…official_agent）" value="__official_agent__" />
        <el-option label="全部总后台（admin_）" value="admin_" />
      </el-select>

      <el-input
        v-model="actorDraft"
        class="filter-actor"
        clearable
        placeholder="操作者（姓名 / 手机 / ID）"
        @clear="onSearch"
        @keyup.enter="onSearch"
      />

      <el-date-picker
        v-model="dateRange"
        class="filter-date"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        clearable
        @change="onSearch"
      />

      <el-button type="primary" class="toolbar-button" :loading="loading" @click="onSearch">
        搜索
      </el-button>
      <el-button class="toolbar-button" :disabled="loading" @click="onReset">重置</el-button>
    </div>

    <el-alert
      v-if="error"
      class="page-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    >
      <el-button text type="primary" @click="load">重试</el-button>
    </el-alert>

    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="audit-table"
      header-cell-class-name="audit-table-header"
      empty-text="还没有审计记录"
    >
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="企业" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span
            v-if="row.tenantId"
            class="enterprise-cell"
            :style="{ color: tenantColor(row.tenantId) }"
          >
            <span class="visual-dot" :style="{ backgroundColor: tenantColor(row.tenantId) }" />
            <span>{{ row.enterpriseName || row.tenantId }}</span>
          </span>
          <span v-else class="enterprise-cell platform-only">
            <span class="visual-dot platform-dot" />
            <span>仅平台</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ actionLabel(row.action) }}</template>
      </el-table-column>
      <el-table-column label="操作者" min-width="140">
        <template #default="{ row }">
          <el-tooltip
            :content="actorTooltip(row)"
            placement="top"
            :disabled="!actorTooltip(row)"
          >
            <span class="actor-cell">{{ row.actorName || '-' }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="IP" width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.ip || '-' }}</template>
      </el-table-column>
      <el-table-column label="详情" min-width="220">
        <template #default="{ row }">
          <template v-if="hasMeta(row.meta)">
            <el-button
              text
              type="primary"
              class="meta-toggle"
              @click="toggleMeta(row.id)"
            >
              {{ expandedIds.has(row.id) ? '收起' : '展开' }}
            </el-button>
            <pre v-if="expandedIds.has(row.id)" class="meta-pre">{{ formatMeta(row.meta) }}</pre>
          </template>
          <span v-else class="meta-empty">-</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="audit-pagination">
      <el-pagination
        background
        layout="total, prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPage"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { AuditActionLabel } from '@mammoth/shared';
import {
  adminAuditApi,
  adminEnterpriseApi,
  type AdminAuditRow,
  type AdminEnterpriseRow,
} from '../../api/admin';
import { tenantColor } from '@/components/admin/roles/roleDisplay';
import { formatDateTime } from '../../utils/format';

const pageSize = 20;

const loading = ref(false);
const error = ref('');
const rows = ref<AdminAuditRow[]>([]);
const total = ref(0);
const page = ref(1);
const enterprises = ref<AdminEnterpriseRow[]>([]);

const route = useRoute();
const tenantId = ref('');
const actionFilter = ref('');
const actionPrefix = ref('');
const actorDraft = ref('');
const dateRange = ref<[string, string] | null>(null);
const expandedIds = reactive(new Set<string>());

const actionOptions = Object.entries(AuditActionLabel)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));

function actionLabel(action: string) {
  return AuditActionLabel[action] || action;
}

function hasMeta(meta: unknown) {
  if (meta == null) return false;
  if (typeof meta === 'object' && !Array.isArray(meta) && Object.keys(meta as object).length === 0) {
    return false;
  }
  return true;
}

function formatMeta(meta: unknown) {
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

function toggleMeta(id: string) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
}

function actorTooltip(row: AdminAuditRow) {
  const parts = [row.actorPhone, row.userId].filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
}

async function loadEnterprises() {
  try {
    enterprises.value = await adminEnterpriseApi.list();
  } catch {
    enterprises.value = [];
  }
}

async function loadAudit() {
  loading.value = true;
  error.value = '';
  try {
    const prefix = actionPrefix.value === '__official_agent__' ? 'admin_' : (actionPrefix.value || undefined);
    const data = await adminAuditApi.list({
      page: page.value,
      pageSize: actionPrefix.value === '__official_agent__' ? 100 : pageSize,
      tenantId: tenantId.value || undefined,
      action: actionFilter.value || undefined,
      actionPrefix: actionFilter.value ? undefined : prefix,
      actor: actorDraft.value.trim() || undefined,
      from: dateRange.value?.[0],
      to: dateRange.value?.[1],
    });
    if (actionPrefix.value === '__official_agent__' && !actionFilter.value) {
      const filtered = data.rows.filter((row) => row.action.includes('official_agent'));
      rows.value = filtered;
      total.value = filtered.length;
    } else {
      rows.value = data.rows;
      total.value = data.total;
    }
    expandedIds.clear();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载审计失败';
    ElMessage.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function load() {
  page.value = 1;
  await Promise.all([loadEnterprises(), loadAudit()]);
}

function onSearch() {
  page.value = 1;
  void loadAudit();
}

function onActionExact() {
  if (actionFilter.value) actionPrefix.value = '';
  onSearch();
}

function onActionPrefix() {
  if (actionPrefix.value) actionFilter.value = '';
  onSearch();
}

function onReset() {
  tenantId.value = '';
  actionFilter.value = '';
  actionPrefix.value = '';
  actorDraft.value = '';
  dateRange.value = null;
  page.value = 1;
  void loadAudit();
}

function onPage(next: number) {
  page.value = next;
  void loadAudit();
}

onMounted(() => {
  const qAction = typeof route.query.action === 'string' ? route.query.action : '';
  const qPrefix = typeof route.query.actionPrefix === 'string' ? route.query.actionPrefix : '';
  if (qAction) actionFilter.value = qAction;
  if (qPrefix) actionPrefix.value = qPrefix === 'admin_' ? 'admin_' : qPrefix;
  void load();
});
</script>

<style scoped>
.audit-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.audit-header {
  margin: 0 0 14px;
}

.audit-header h1 {
  color: #333946;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 6px;
}

.audit-header p {
  color: #667085;
  font-size: 13px;
  margin: 0;
}

.audit-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 12px;
}

.filter-enterprise {
  width: 200px;
}

.filter-action {
  width: 200px;
}

.filter-actor {
  width: 220px;
}

.filter-date {
  width: 280px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.toolbar-button + .toolbar-button {
  margin-left: 0;
}

.page-alert {
  margin-bottom: 12px;
}

.audit-table {
  width: 100%;
}

:deep(.audit-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.el-table__body td),
:deep(.el-table__body .cell) {
  font-size: 13px;
  color: #667085;
}

.enterprise-option,
.enterprise-cell {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  min-width: 0;
}

.visual-dot {
  border-radius: 50%;
  flex: 0 0 8px;
  height: 8px;
  width: 8px;
}

.platform-dot {
  background: #8b909b;
}

.platform-only {
  color: #8b909b;
}

.actor-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.meta-toggle {
  padding: 0;
}

.meta-pre {
  background: #f8fafc;
  border: 1px solid #eef0f4;
  color: #333946;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  margin: 6px 0 0;
  max-height: 220px;
  overflow: auto;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta-empty {
  color: #98a2b3;
}

.audit-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

:deep(.el-button--primary) {
  --el-button-bg-color: #4A53A3;
  --el-button-border-color: #4A53A3;
  --el-button-hover-bg-color: #3E468C;
  --el-button-hover-border-color: #3E468C;
}
</style>
