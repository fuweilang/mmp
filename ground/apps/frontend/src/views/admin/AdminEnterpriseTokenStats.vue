<template>
  <section class="ets-page">
    <div class="page-head">
      <h1>token用量统计</h1>
      <div class="page-head-actions">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          clearable
          class="ets-date"
          @change="reload"
        />
        <el-select
          v-model="modelFilter"
          clearable

          placeholder="全部模型"
          class="ets-model"
          @change="reload"
        >
          <el-option v-for="m in modelOptions" :key="m" :label="modelOptionLabel(m)" :value="m" />
        </el-select>
        <el-input
          v-model="filterDraft"
          clearable
          placeholder="搜索企业"
          class="ets-search"
          @clear="onFilterNow"
          @input="onFilterInput"
          @keyup.enter="onFilterNow"
        />
        <el-button :loading="loading" @click="reload">刷新</el-button>
        <el-button :loading="loading" @click="onReset">重置</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="ets-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />

    <div v-if="overview" class="usage-hero">
      <div>
        <div class="usage-label">Token 消耗</div>
        <div class="usage-num">{{ formatNum(overview.totals.totalTokens) }}</div>
      </div>
      <div class="usage-side">
        <span>Input {{ formatNum(overview.totals.inputTokens) }}</span>
        <span>Output {{ formatNum(overview.totals.outputTokens) }}</span>
        <span>笔数 {{ formatNum(overview.totals.turns) }}</span>
        <span>有用量企业 {{ formatNum(usageEnterprises.length) }}</span>
      </div>
    </div>

    <div class="ets-main">
      <el-tabs v-model="activeTab" class="ets-tabs">
        <el-tab-pane label="企业" name="enterprise">
          <el-table
            v-loading="loading"
            :data="pagedRows"
            border
            class="ets-table"
            header-cell-class-name="ets-table-header"
            empty-text="暂无用量"
            @row-click="openDetail"
          >
            <el-table-column prop="tenantName" label="企业" min-width="180" show-overflow-tooltip />
            <el-table-column label="Token" width="140" prop="totalTokens">
              <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
            </el-table-column>
            <el-table-column label="Input" width="130" prop="inputTokens">
              <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
            </el-table-column>
            <el-table-column label="Output" width="130" prop="outputTokens">
              <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
            </el-table-column>
            <el-table-column label="笔数" width="90" prop="turns">
              <template #default="{ row }">{{ formatNum(row.turns) }}</template>
            </el-table-column>
            <el-table-column label="成员数" width="100" prop="memberCount">
              <template #default="{ row }">{{ formatNum(row.memberCount) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="168" fixed="right" align="center">
              <template #default="{ row }">
                <div class="operation-buttons">
                  <el-button text type="primary" @click.stop="openDetail(row)">成员用量</el-button>
                  <el-button text type="primary" @click.stop="openAiCoins(row)">AI币</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div class="ets-pagination">
            <el-pagination
              :current-page="currentPage"
              :page-size="pageSize"
              background
              layout="total, sizes, prev, pager, next"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredRows.length"
              @current-change="onPageChange"
              @size-change="onPageSizeChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="按模型" name="model">
          <el-table
            v-loading="loading"
            :data="modelRows"
            border
            class="ets-table ets-table--static"
            header-cell-class-name="ets-table-header"
            empty-text="暂无模型用量"
          >
            <el-table-column prop="model" label="模型" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ modelOptionLabel(row.model) }}</template>
            </el-table-column>
            <el-table-column label="Token" width="160" prop="totalTokens">
              <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
            </el-table-column>
            <el-table-column label="Input" width="140" prop="inputTokens">
              <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
            </el-table-column>
            <el-table-column label="Output" width="140" prop="outputTokens">
              <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
            </el-table-column>
            <el-table-column label="笔数" width="100" prop="turns">
              <template #default="{ row }">{{ formatNum(row.turns) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <EnterpriseUsageDrawer ref="usageDrawer" @closed="onUsageClosed" />
    <EnterpriseFundsDrawer ref="fundsDrawer" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  adminBillingApi,
  type EnterpriseTokenStatsEnterprise,
  type EnterpriseTokenStatsOverview,
} from '../../api/admin';
import { ApiError } from '../../api/http';
import EnterpriseUsageDrawer from '@/components/admin/EnterpriseUsageDrawer.vue';
import EnterpriseFundsDrawer from '@/components/admin/wallets/EnterpriseFundsDrawer.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const overview = ref<EnterpriseTokenStatsOverview | null>(null);
const dateRange = ref<[string, string] | null>(null);
const modelFilter = ref<string>('');
const filterDraft = ref('');
const filterQuery = ref('');
const currentPage = ref(1);
const pageSize = ref(10);
const activeTab = ref<'enterprise' | 'model'>('enterprise');
const fundsDrawer = ref<{ open: (tenantId: string, title?: string) => void; close: () => void } | null>(null);
const usageDrawer = ref<{ open: (tenantId: string, title?: string, query?: { from?: string; to?: string; model?: string }) => void; close: () => void } | null>(null);
let filterTimer = 0;

const modelOptions = computed(() => overview.value?.models ?? []);
const offlineModelSet = computed(() => new Set(overview.value?.offlineModels ?? []));
function modelOptionLabel(id: string) {
  return offlineModelSet.value.has(id) ? `${id}（已下线）` : id;
}

const usageEnterprises = computed(() =>
  (overview.value?.enterprises ?? [])
    .filter((row) => (row.totalTokens || 0) > 0 || (row.turns || 0) > 0)
    .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0) || (b.turns || 0) - (a.turns || 0)),
);

const modelRows = computed(() =>
  [...(overview.value?.byModel ?? [])]
    .filter((row) => (row.totalTokens || 0) > 0)
    .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0) || (b.turns || 0) - (a.turns || 0)),
);

const filteredRows = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return usageEnterprises.value;
  return usageEnterprises.value.filter((row) => row.tenantName.toLowerCase().includes(q));
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

function formatNum(n: number) {
  return Number(n || 0).toLocaleString('zh-CN');
}

function onFilterInput() {
  window.clearTimeout(filterTimer);
  filterTimer = window.setTimeout(onFilterNow, 500);
}

function onFilterNow() {
  window.clearTimeout(filterTimer);
  filterQuery.value = filterDraft.value;
  currentPage.value = 1;
}

function onPageChange(page: number) {
  currentPage.value = page;
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
}

function onReset() {
  dateRange.value = null;
  modelFilter.value = '';
  filterDraft.value = '';
  filterQuery.value = '';
  currentPage.value = 1;
  void reload();
}

function queryParams() {
  return {
    from: dateRange.value?.[0] || undefined,
    to: dateRange.value?.[1] || undefined,
    model: modelFilter.value || undefined,
  };
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    overview.value = await adminBillingApi.listEnterpriseTokenStats(queryParams());
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function openAiCoins(row: EnterpriseTokenStatsEnterprise) {
  usageDrawer.value?.close();
  fundsDrawer.value?.open(row.tenantId, row.tenantName);
}

function openDetail(row: EnterpriseTokenStatsEnterprise) {
  fundsDrawer.value?.close();
  usageDrawer.value?.open(row.tenantId, row.tenantName, queryParams());
  router.replace({
    path: '/admin/enterprise-token-stats',
    query: { ...route.query, tenantId: row.tenantId },
  });
}

function onUsageClosed() {
  if (!route.query.tenantId) return;
  const q = { ...route.query };
  delete q.tenantId;
  router.replace({ path: '/admin/enterprise-token-stats', query: q });
}

onMounted(async () => {
  await reload();
  const tid = typeof route.query.tenantId === 'string' ? route.query.tenantId : '';
  if (!tid) return;
  const row = overview.value?.enterprises.find((e) => e.tenantId === tid);
  usageDrawer.value?.open(tid, row?.tenantName || '', queryParams());
});

onBeforeUnmount(() => window.clearTimeout(filterTimer));
</script>

<style scoped>
.ets-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.page-head {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.page-head h1 {
  margin: 0;
  color: #333946;
  font-size: 20px;
  font-weight: 600;
}

.page-head-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.ets-date { width: 260px; }
.ets-model { width: 180px; }
.ets-search { width: 220px; }

.ets-alert { margin-top: 12px; }

.usage-hero {
  align-items: flex-end;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
}

.usage-hero--drawer { margin-top: 0; }

.usage-label {
  color: #667085;
  font-size: 12px;
  margin-bottom: 4px;
}

.usage-num {
  color: #333946;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.usage-side {
  align-items: flex-end;
  color: #667085;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 4px;
}

.ets-tabs { margin-top: 16px; }
.ets-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }

.ets-table { width: 100%; }

:deep(.ets-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.ets-table .el-table__body td),
:deep(.ets-table .el-table__body .cell),
:deep(.ets-table .el-table__body .el-button.is-text) {
  font-size: 13px;
}

:deep(.ets-table .el-table__row) { cursor: pointer; }

:deep(.ets-table--static .el-table__row) { cursor: default; }

.operation-buttons {
  align-items: center;
  display: inline-flex;
  gap: 2px;
  justify-content: center;
}

.operation-buttons :deep(.el-button) {
  margin: 0;
  min-height: 28px;
  padding: 4px 6px;
}

.ets-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.drawer-title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.drawer-section {
  color: #333946;
  font-size: 14px;
  font-weight: 600;
  margin: 22px 0 10px;
}

.ets-drawer-body { min-height: 160px; }

@media (max-width: 900px) {
  .page-head { flex-direction: column; }
  .ets-date, .ets-model, .ets-search { width: 100%; }
}
</style>
