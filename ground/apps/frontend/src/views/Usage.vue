<template>
  <section class="usage-page">
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

    <el-empty v-if="!hasTenant" description="请先选择企业" />

    <template v-else>
      <div class="usage-toolbar">
        <el-select
          v-model="actionFilter"
          class="action-filter"
          clearable
          placeholder="全部操作"
          @change="onSearch"
        >
          <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" class="toolbar-button" :loading="loadingAudit" @click="onSearch">搜索</el-button>
        <el-button class="toolbar-button" :disabled="loadingAudit" @click="onReset">重置</el-button>
      </div>
      <el-table
        :data="rows"
        v-loading="loadingAudit"
        border
        class="usage-table"
        header-cell-class-name="usage-table-header"
        empty-text="还没有审计记录"
      >
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="140">
          <template #default="{ row }">{{ actionLabel(row.action) }}</template>
        </el-table-column>
        <el-table-column label="操作者" min-width="140">
          <template #default="{ row }">
            <el-tooltip
              :content="operatorTooltipContent(row.userId)"
              placement="top"
              :disabled="!isTruncatedOperatorId(row.userId)"
            >
              <span class="operator-cell">{{ operatorName(row.userId) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="IP" width="140">
          <template #default="{ row }">{{ row.ip || '-' }}</template>
        </el-table-column>
      </el-table>
      <div class="usage-pagination">
        <el-pagination
          background
          layout="total, prev, pager, next, jumper"
          :total="total"
          :page-size="20"
          :current-page="page"
          @current-change="onPage"
        />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { AuditActionLabel } from '@mammoth/shared';
import { auditApi, type AuditRow } from '../api/console';
import { tenantApi, type SimpleMember } from '../api/tenants';
import { useAuthStore } from '../stores/auth';
import { formatDateTime } from '../utils/format';

const auth = useAuthStore();
const hasTenant = computed(() => Boolean(auth.session?.currentTenant));
const error = ref('');
const loadingAudit = ref(false);
const rows = ref<AuditRow[]>([]);
const members = ref<SimpleMember[]>([]);
const total = ref(0);
const page = ref(1);
const actionFilter = ref('');
const actionOptions = Object.entries(AuditActionLabel).map(([value, label]) => ({ value, label }));

function actionLabel(action: string) {
  return AuditActionLabel[action] || action;
}

const OPERATOR_ID_MAX = 8;

function resolveOperator(userId: string | null) {
  if (!userId) return { display: '-', fullId: '', isIdFallback: false };
  const member = members.value.find((item) => item.user.id === userId);
  if (member?.user.name) {
    return { display: member.user.name, fullId: userId, isIdFallback: false };
  }
  const truncated = userId.length > OPERATOR_ID_MAX;
  return {
    display: truncated ? `${userId.slice(0, OPERATOR_ID_MAX)}…` : userId,
    fullId: userId,
    isIdFallback: truncated,
  };
}

function operatorName(userId: string | null) {
  return resolveOperator(userId).display;
}

function isTruncatedOperatorId(userId: string | null) {
  return resolveOperator(userId).isIdFallback;
}

function operatorTooltipContent(userId: string | null) {
  const resolved = resolveOperator(userId);
  return resolved.isIdFallback ? resolved.fullId : resolved.display;
}

async function loadAudit() {
  if (!auth.session?.currentTenant) {
    rows.value = [];
    total.value = 0;
    return;
  }
  loadingAudit.value = true;
  error.value = '';
  try {
    const data = await auditApi.list(page.value, actionFilter.value);
    rows.value = data.rows;
    total.value = data.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载审计失败';
    ElMessage.error(error.value);
  } finally {
    loadingAudit.value = false;
  }
}

async function loadMembers() {
  if (!auth.session?.currentTenant) {
    members.value = [];
    return;
  }
  try {
    members.value = await tenantApi.simpleMembers();
  } catch {
    members.value = [];
  }
}

async function load() {
  page.value = 1;
  await Promise.all([loadAudit(), loadMembers()]);
}

function onSearch() {
  page.value = 1;
  void loadAudit();
}

function onReset() {
  actionFilter.value = '';
  page.value = 1;
  void loadAudit();
}

function onPage(next: number) {
  page.value = next;
  void loadAudit();
}

onMounted(load);
watch(() => auth.session?.currentTenant?.id, load);
</script>

<style scoped>
.usage-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.usage-toolbar {
  align-items: center;
  display: flex;
  gap: 10px;
  margin: 0 0 12px;
}

.action-filter {
  width: 200px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.toolbar-button + .toolbar-button {
  margin-left: 0;
}

.usage-table {
  width: 100%;
}

.usage-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

:deep(.usage-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

.operator-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

:deep(.el-table__body td),
:deep(.el-table__body .cell) {
  font-size: 13px;
}
</style>
