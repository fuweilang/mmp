<template>
  <section class="ets-page">
    <div class="ets-header">
      <h1>企业token用量</h1>
      <p>
        本页统计各企业 Token 与 AI币消耗（AI币以 ledger chat_consume 实扣为准，与企业钱包流水对齐）。充值/调账见
        <router-link to="/admin/enterprise-wallets">企业钱包</router-link>。
      </p>
    </div>

    <div class="ets-filter-card">
      <div class="ets-filters-left">
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
          filterable
          placeholder="全部模型"
          class="ets-model"
          @change="reload"
        >
          <el-option v-for="m in modelOptions" :key="m" :label="modelOptionLabel(m)" :value="m" />
        </el-select>
        <el-input
          v-model="filterDraft"
          clearable
          placeholder="按企业名称 / 品牌过滤"
          class="ets-search"
          @clear="onFilterNow"
          @input="onFilterInput"
          @keyup.enter="onFilterNow"
        />
      </div>
      <div class="ets-filters-right">
        <el-button type="primary" :loading="loading" @click="reload">查询</el-button>
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

    <div v-if="overview" class="ets-metrics">
      <div class="ets-metric">
        <div class="ets-metric-label">Token消耗</div>
        <div class="ets-metric-value">{{ formatNum(overview.totals.totalTokens) }}</div>
      </div>
      <div class="ets-metric">
        <div class="ets-metric-label">
          AI币实扣
          <span class="ets-ai-hint">chat_consume</span>
        </div>
        <div class="ets-metric-value">{{ formatNum(overview.totals.consumedAiCoins ?? 0) }}</div>
      </div>
      <div class="ets-metric">
        <div class="ets-metric-label">Input</div>
        <div class="ets-metric-value">{{ formatNum(overview.totals.inputTokens) }}</div>
      </div>
      <div class="ets-metric">
        <div class="ets-metric-label">Output</div>
        <div class="ets-metric-value">{{ formatNum(overview.totals.outputTokens) }}</div>
      </div>
      <div class="ets-metric">
        <div class="ets-metric-label">笔数</div>
        <div class="ets-metric-value">{{ formatNum(overview.totals.turns) }}</div>
      </div>
      <div class="ets-metric">
        <div class="ets-metric-label">企业数</div>
        <div class="ets-metric-value">{{ overview.enterprises.length }}</div>
      </div>
    </div>

    <div class="ets-main">
      <el-tabs v-model="activeTab" class="ets-tabs">
        <el-tab-pane label="企业" name="enterprise">
          <div class="ets-tab-hint">点击行或「成员明细」打开抽屉</div>
          <el-table
            v-loading="loading"
            :data="pagedRows"
            border
            class="ets-table"
            header-cell-class-name="ets-table-header"
            empty-text="暂无 Token消耗"
            highlight-current-row
            show-summary
            :summary-method="getEnterpriseSummaries"
            @row-click="openDetail"
          >
            <el-table-column prop="tenantName" label="企业" min-width="160" show-overflow-tooltip />
            <el-table-column prop="tenantSlug" label="品牌" min-width="110" show-overflow-tooltip />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.tenantType === 'AGENCY'" size="small" type="warning" effect="plain">代理商</el-tag>
                <el-tag v-else size="small" type="primary" effect="plain">企业</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Token消耗" width="130" prop="totalTokens">
              <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
            </el-table-column>
            <el-table-column label="AI币实扣" width="130" prop="consumedAiCoins">
              <template #header>
                <span>AI币实扣</span>
                <el-tooltip
                  content="同时间窗 tenant_ai_ledger.chat_consume.coins 合计；与企业钱包流水对齐。按模型成本、倍率与充值汇率结算；价格快照保存在每笔账单中。"
                  placement="top"
                >
                  <span class="ets-col-tip" @click.stop>说明</span>
                </el-tooltip>
              </template>
              <template #default="{ row }">
                <span>{{ formatNum(row.consumedAiCoins ?? 0) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Input" width="120" prop="inputTokens">
              <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
            </el-table-column>
            <el-table-column label="Output" width="120" prop="outputTokens">
              <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
            </el-table-column>
            <el-table-column label="笔数" width="90" prop="turns">
              <template #default="{ row }">{{ formatNum(row.turns) }}</template>
            </el-table-column>
            <el-table-column label="有用量成员" width="110" prop="memberCount">
              <template #default="{ row }">{{ formatNum(row.memberCount) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right" align="center" class-name="ets-op-cell">
              <template #default="{ row }">
                <el-button class="ets-op-btn" link type="primary" @click.stop="openDetail(row)">成员明细</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="ets-pagination">
            <el-pagination
              :current-page="currentPage"
              :page-size="pageSize"
              background
              layout="total, sizes, prev, pager, next"
              :page-sizes="[10, 20, 50]"
              :total="filteredRows.length"
              @current-change="onPageChange"
              @size-change="onPageSizeChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="按模型" name="model">
          <div class="ets-tab-hint">点击行可同步顶部模型筛选；再点同一行取消</div>
          <el-table
            v-loading="loading"
            :data="overview?.byModel ?? []"
            border
            class="ets-table"
            header-cell-class-name="ets-table-header"
            empty-text="暂无模型用量"
            highlight-current-row
            :row-class-name="modelRowClassName"
            @row-click="onModelRowClick"
          >
            <el-table-column prop="model" label="模型" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ modelOptionLabel(row.model) }}</template>
            </el-table-column>
            <el-table-column label="Token消耗" width="160" prop="totalTokens">
              <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
            </el-table-column>
            <el-table-column label="AI币实扣" width="140" prop="consumedAiCoins">
              <template #default="{ row }">
                <span>{{ formatNum(row.consumedAiCoins ?? 0) }}</span>
              </template>
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

    <el-drawer
      v-model="detailOpen"
      :title="detailTitle"
      size="min(960px, 96vw)"
      destroy-on-close
      class="ets-drawer"
    >
      <div v-loading="detailLoading" class="ets-drawer-body">
        <template v-if="detail">
          <div class="ets-metrics ets-metrics--drawer">
            <div class="ets-metric">
              <div class="ets-metric-label">Token消耗</div>
              <div class="ets-metric-value">{{ formatNum(detail.totals.totalTokens) }}</div>
            </div>
            <div class="ets-metric">
              <div class="ets-metric-label">
                AI币实扣
                <span class="ets-ai-hint">chat_consume</span>
              </div>
              <div class="ets-metric-value">{{ formatNum(detail.totals.consumedAiCoins ?? 0) }}</div>
            </div>
            <div class="ets-metric">
              <div class="ets-metric-label">Input</div>
              <div class="ets-metric-value">{{ formatNum(detail.totals.inputTokens) }}</div>
            </div>
            <div class="ets-metric">
              <div class="ets-metric-label">Output</div>
              <div class="ets-metric-value">{{ formatNum(detail.totals.outputTokens) }}</div>
            </div>
            <div class="ets-metric">
              <div class="ets-metric-label">笔数</div>
              <div class="ets-metric-value">{{ formatNum(detail.totals.turns) }}</div>
            </div>
            <div class="ets-metric">
              <div class="ets-metric-label">成员数</div>
              <div class="ets-metric-value">{{ detail.members.length }}</div>
            </div>
          </div>

          <el-table
            :data="detail.members"
            border
            class="ets-table ets-drawer-table"
            header-cell-class-name="ets-table-header"
            empty-text="该企业暂无 Token消耗"
            max-height="520"
            show-summary
            :summary-method="getMemberSummaries"
            style="width: 100%"
          >
            <el-table-column prop="name" label="成员" min-width="110" show-overflow-tooltip />
            <el-table-column prop="phone" label="手机" width="120" />
            <el-table-column prop="username" label="Octop" min-width="100" show-overflow-tooltip />
            <el-table-column label="Token消耗" width="110" prop="totalTokens">
              <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
            </el-table-column>
            <el-table-column label="AI币实扣" width="120" prop="consumedAiCoins">
              <template #header>
                <span>AI币实扣</span>
                <el-tooltip
                  content="该成员时段内 chat_consume 实扣合计"
                  placement="top"
                >
                  <span class="ets-col-tip" @click.stop>说明</span>
                </el-tooltip>
              </template>
              <template #default="{ row }">
                <span>{{ formatNum(row.consumedAiCoins ?? 0) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Input" width="90" prop="inputTokens">
              <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
            </el-table-column>
            <el-table-column label="Output" width="90" prop="outputTokens">
              <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
            </el-table-column>
            <el-table-column label="笔数" width="72" prop="turns">
              <template #default="{ row }">{{ formatNum(row.turns) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { TableColumnCtx } from 'element-plus';
import {
  adminBillingApi,
  type EnterpriseTokenStatsDetail,
  type EnterpriseTokenStatsEnterprise,
  type EnterpriseTokenStatsOverview,
} from '../../api/admin';
import { ApiError } from '../../api/http';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const detailLoading = ref(false);
const error = ref('');
const overview = ref<EnterpriseTokenStatsOverview | null>(null);
const dateRange = ref<[string, string] | null>(null);
const modelFilter = ref<string>('');
const filterDraft = ref('');
const filterQuery = ref('');
const currentPage = ref(1);
const pageSize = ref(10);
const activeTab = ref<'enterprise' | 'model'>('enterprise');
const detailOpen = ref(false);
const detail = ref<EnterpriseTokenStatsDetail | null>(null);
let filterTimer = 0;

const modelOptions = computed(() => overview.value?.models ?? []);
const offlineModelSet = computed(() => new Set(overview.value?.offlineModels ?? []));
function modelOptionLabel(id: string) {
  return offlineModelSet.value.has(id) ? `${id}（已下线）` : id;
}

const detailTitle = computed(() => {
  const name = detail.value?.tenant.name;
  return name ? `成员 Token消耗 — ${name}` : '成员 Token消耗';
});

const filteredRows = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  const rows = overview.value?.enterprises ?? [];
  if (!q) return rows;
  return rows.filter(
    (r) => r.tenantName.toLowerCase().includes(q) || r.tenantSlug.toLowerCase().includes(q),
  );
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

const filteredTotals = computed(() => {
  return filteredRows.value.reduce(
    (acc, r) => {
      acc.totalTokens += r.totalTokens || 0;
      acc.consumedAiCoins += r.consumedAiCoins || 0;
      acc.inputTokens += r.inputTokens || 0;
      acc.outputTokens += r.outputTokens || 0;
      acc.turns += r.turns || 0;
      acc.memberCount += r.memberCount || 0;
      return acc;
    },
    { totalTokens: 0, consumedAiCoins: 0, inputTokens: 0, outputTokens: 0, turns: 0, memberCount: 0 },
  );
});

function formatNum(n: number) {
  return Number(n || 0).toLocaleString('zh-CN');
}

function getEnterpriseSummaries(param: {
  columns: TableColumnCtx<EnterpriseTokenStatsEnterprise>[];
  data: EnterpriseTokenStatsEnterprise[];
}) {
  const { columns } = param;
  const t = filteredTotals.value;
  return columns.map((col, index) => {
    if (index === 0) return '合计（筛选）';
    const prop = col.property;
    if (prop === 'totalTokens') return formatNum(t.totalTokens);
    if (prop === 'consumedAiCoins') return formatNum(t.consumedAiCoins);
    if (prop === 'inputTokens') return formatNum(t.inputTokens);
    if (prop === 'outputTokens') return formatNum(t.outputTokens);
    if (prop === 'turns') return formatNum(t.turns);
    if (prop === 'memberCount') return formatNum(t.memberCount);
    return '';
  });
}

function getMemberSummaries(param: {
  columns: TableColumnCtx<EnterpriseTokenStatsDetail['members'][number]>[];
  data: EnterpriseTokenStatsDetail['members'];
}) {
  const { columns, data } = param;
  const t = data.reduce(
    (acc, r) => {
      acc.totalTokens += r.totalTokens || 0;
      acc.consumedAiCoins += r.consumedAiCoins || 0;
      acc.inputTokens += r.inputTokens || 0;
      acc.outputTokens += r.outputTokens || 0;
      acc.turns += r.turns || 0;
      return acc;
    },
    { totalTokens: 0, consumedAiCoins: 0, inputTokens: 0, outputTokens: 0, turns: 0 },
  );
  return columns.map((col, index) => {
    if (index === 0) return '合计';
    const prop = col.property;
    if (prop === 'totalTokens') return formatNum(t.totalTokens);
    if (prop === 'consumedAiCoins') return formatNum(t.consumedAiCoins);
    if (prop === 'inputTokens') return formatNum(t.inputTokens);
    if (prop === 'outputTokens') return formatNum(t.outputTokens);
    if (prop === 'turns') return formatNum(t.turns);
    return '';
  });
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

function onModelRowClick(row: { model: string }) {
  modelFilter.value = modelFilter.value === row.model ? '' : row.model;
  currentPage.value = 1;
  void reload();
}

function modelRowClassName({ row }: { row: { model: string } }) {
  return modelFilter.value === row.model ? 'ets-model-row-active' : '';
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

async function openDetail(row: EnterpriseTokenStatsEnterprise) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  router.replace({
    path: '/admin/enterprise-token-stats',
    query: { ...route.query, tenantId: row.tenantId },
  });
  try {
    detail.value = await adminBillingApi.getEnterpriseTokenStatsDetail({
      tenantId: row.tenantId,
      ...queryParams(),
    });
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '加载成员用量失败');
  } finally {
    detailLoading.value = false;
  }
}

watch(
  () => detailOpen.value,
  (open) => {
    if (!open && route.query.tenantId) {
      const q = { ...route.query };
      delete q.tenantId;
      router.replace({ path: '/admin/enterprise-token-stats', query: q });
    }
  },
);

onMounted(async () => {
  await reload();
  const tid = typeof route.query.tenantId === 'string' ? route.query.tenantId : '';
  if (tid && overview.value) {
    const row = overview.value.enterprises.find((e) => e.tenantId === tid);
    if (row) void openDetail(row);
  }
});

onBeforeUnmount(() => window.clearTimeout(filterTimer));
</script>

<style scoped>
.ets-page {
  --app-primary-color: #4A53A3;
  --app-primary-hover-color: #3E468C;
  --app-primary-light-color: #EEF0F8;
  --el-color-primary: #4A53A3;
  --el-color-primary-dark-2: #3E468C;
  --el-color-primary-light-3: #6b7fff;
  --el-color-primary-light-5: #9aa8ff;
  --el-color-primary-light-7: #c5ccff;
  --el-color-primary-light-8: #d9deff;
  --el-color-primary-light-9: #EEF0F8;
  --el-border-radius-base: 0;
  --el-border-radius-small: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  padding: 15px;
  min-height: 100%;
}

.ets-header h1 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #333946;
  font-weight: 600;
}

.ets-header p {
  margin: 0;
  color: #667085;
  font-size: 14px;
  max-width: 720px;
  line-height: 1.6;
}

.ets-header a {
  color: #4A53A3;
}

.ets-filter-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #dfe5ef;
}

.ets-filters-left,
.ets-filters-right {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.ets-date {
  width: 260px;
}

.ets-model {
  width: 180px;
}

.ets-search {
  width: 220px;
}

.ets-alert {
  margin: 0;
}

.ets-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.ets-metrics--drawer {
  margin-bottom: 16px;
}

.ets-metric {
  background: #fff;
  border: 1px solid #dfe5ef;
  padding: 12px 14px;
  min-width: 0;
}

.ets-metric-label {
  color: #8b909b;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.ets-metric-value {
  color: #333946;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-all;
}

.ets-main {
  background: #fff;
  border: 1px solid #dfe5ef;
  padding: 0 16px 16px;
}

.ets-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.ets-tabs :deep(.el-tabs__item) {
  color: #667085;
  font-weight: 500;
}

.ets-tabs :deep(.el-tabs__item.is-active) {
  color: #4A53A3;
}

.ets-tabs :deep(.el-tabs__active-bar),
.ets-tabs :deep(.el-tabs__ink-bar) {
  background-color: #4A53A3;
}

.ets-tab-hint {
  margin: 0 0 10px;
  color: #8b909b;
  font-size: 13px;
}

.ets-table {
  width: 100%;
}

:deep(.ets-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

.ets-col-tip {
  margin-left: 4px;
  color: #8b909b;
  font-size: 12px;
  font-weight: 400;
  cursor: help;
  border-bottom: 1px dashed #c0c4cc;
}

.ets-ai-hint {
  margin-left: 4px;
  color: #8b909b;
  font-size: 12px;
  font-weight: 400;
}

:deep(.ets-table .el-table__body td),
:deep(.ets-table .el-table__body .cell),
:deep(.ets-table .el-table__footer .cell),
:deep(.ets-table .el-table__body .el-button.is-link) {
  font-size: 13px;
}

:deep(.ets-table .el-table__footer-wrapper td) {
  background: #f8fafc !important;
  color: #333946;
  font-weight: 600;
}

:deep(.ets-table .el-table__row) {
  cursor: pointer;
}

:deep(.ets-table .el-table__body tr:hover > td) {
  background: #f8fafc !important;
}

:deep(.ets-table .ets-model-row-active > td) {
  background: #EEF0F8 !important;
}

.ets-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

:deep(.ets-op-cell .cell) {
  font-size: 0;
  line-height: 1;
}
:deep(.ets-op-cell .ets-op-btn),
:deep(.ets-op-cell .el-button) {
  font-size: 13px;
  margin: 0;
  padding: 0 4px;
  vertical-align: middle;
}

.ets-drawer-body {
  min-height: 120px;
  overflow-x: hidden;
}

:deep(.ets-drawer .el-drawer__body) {
  overflow-x: hidden;
}

.ets-drawer-table {
  width: 100%;
}

:deep(.ets-drawer-table .el-table__body-wrapper),
:deep(.ets-drawer-table .el-table__header-wrapper),
:deep(.ets-drawer-table .el-table__footer-wrapper) {
  overflow-x: hidden !important;
}

@media (max-width: 1200px) {
  .ets-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .ets-date,
  .ets-model,
  .ets-search {
    width: 100%;
    max-width: 320px;
  }
}

@media (max-width: 720px) {
  .ets-metrics,
  .ets-metrics--drawer {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
