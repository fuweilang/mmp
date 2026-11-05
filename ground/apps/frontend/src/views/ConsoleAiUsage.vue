<template>
  <section class="ai-usage-page">
    <div class="head">
      <div>
        <h1>AI币用量</h1>
        <p class="sub">本企业 Token / AI币消耗（按各模型采购成本和售价倍率结算，以账单实扣为准）。充值与调账请看「AI币充值」。</p>
      </div>
      <el-button v-if="canBilling" type="primary" @click="$router.push('/console/billing')">去充值</el-button>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <div class="wallet-row">
      <div class="wallet-card">
        <div class="label">当前 AI币余额</div>
        <div class="value">{{ formatNum(walletBalance) }}</div>
      </div>
      <div class="wallet-card">
        <div class="label">累计消耗 AI币</div>
        <div class="value">{{ formatNum(walletTotalDebited) }}</div>
        <div class="hint">与企业钱包同一口径</div>
      </div>
    </div>

    <div class="summary-row">
      <div class="summary-card">
        <div class="label">筛选消耗 Token</div>
        <div class="value">{{ formatNum(totals.totalTokens) }}</div>
      </div>
      <div class="summary-card">
        <div class="label">筛选消耗 AI币</div>
        <div class="value">{{ formatNum(totals.aiCoins) }}</div>
      </div>
      <div class="summary-card">
        <div class="label">对话轮次</div>
        <div class="value">{{ formatNum(totals.turns) }}</div>
      </div>
      <div class="summary-card">
        <div class="label">模型调用</div>
        <div class="value">{{ formatNum(totals.modelCalls) }}</div>
      </div>
    </div>

    <el-card v-if="canUsage" shadow="never" class="card">
      <div class="quota-head">
        <span class="quota-title">本月 Token 额度</span>
        <span class="quota-sub">
          企业额度：{{ quotaInfo.tenantQuota > 0 ? `${formatNum(quotaInfo.tenantQuota)}（已用 ${formatNum(quotaInfo.tenantUsed)}）` : '不限' }}
        </span>
      </div>
      <el-table :data="quotaInfo.members" border size="small" class="usage-table" empty-text="暂无成员">
        <el-table-column label="成员" min-width="140">
          <template #default="{ row }">
            <span class="member-cell" :style="{ color: memberColor(row.userId) }">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本月已用 Token" width="140">
          <template #default="{ row }">{{ formatNum(row.usedTokens) }}</template>
        </el-table-column>
        <el-table-column label="月度额度（0=不限）" width="220">
          <template #default="{ row }">
            <el-input-number
              :model-value="row.monthlyTokens"
              :min="0"
              :max="100000000"
              :step="100000"
              size="small"
              controls-position="right"
              style="width: 170px"
              @change="(v: number | undefined) => onSaveMemberQuota(row, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.exceeded" type="danger" size="small">已超限</el-tag>
            <el-tag v-else-if="row.monthlyTokens > 0" type="success" size="small">正常</el-tag>
            <el-tag v-else type="info" size="small">不限</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="card">
      <div class="filters">
        <el-date-picker
          v-model="range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始"
          end-placeholder="结束"
          style="width: 260px"
          @change="onSearch"
        />
        <el-select
          v-model="userId"
          clearable
          filterable
          placeholder="成员"
          style="width: 160px"
          @change="onSearch"
        >
          <el-option
            v-for="m in members"
            :key="m.userId"
            :label="m.name"
            :value="m.userId"
          >
            <span class="member-option">
              <i class="member-dot" :style="{ background: memberColor(m.userId) }" />
              <span :style="{ color: memberColor(m.userId) }">{{ m.name }}</span>
            </span>
          </el-option>
        </el-select>
        <el-select
          v-model="model"
          clearable
          filterable
          placeholder="模型"
          style="width: 200px"
          @change="onSearch"
        >
          <el-option v-for="m in models" :key="m" :label="m" :value="m">
            <span class="model-option">
              <i class="model-dot" :style="{ background: modelColor(m) }" />
              <span :style="{ color: modelColor(m) }">{{ m }}</span>
            </span>
          </el-option>
        </el-select>
        <el-button type="primary" :loading="loading" @click="onSearch">搜索</el-button>
        <el-button :disabled="loading" @click="onReset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="items" border empty-text="暂无用量" class="usage-table">
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.occurredAt) }}</template>
        </el-table-column>
        <el-table-column label="成员" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="member-cell" :style="{ color: memberColor(row.userId) }">{{ row.memberName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="模型" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="model-cell" :style="{ color: modelColor(row.model) }">
              <i class="model-dot" :style="{ background: modelColor(row.model) }" />
              {{ row.model }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="输入" width="100">
          <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
        </el-table-column>
        <el-table-column label="输出" width="100">
          <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
        </el-table-column>
        <el-table-column label="消耗 Token" width="120">
          <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
        </el-table-column>
        <el-table-column label="消耗 AI币" width="110">
          <template #default="{ row }">{{ formatNum(row.aiCoins) }}</template>
        </el-table-column>
        <el-table-column prop="clientKind" label="端" width="90" />
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { hasPermission, isOrgAdmin } from '@mammoth/shared';
import { ElMessage } from 'element-plus';
import { billingApi, usageApi } from '../api/console';
import type { UserTokenQuotaRow } from '../api/console';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/http';
import { formatDateTime } from '../utils/format';

const auth = useAuthStore();
const canBilling = computed(
  () => hasPermission(auth.session, 'portal.console.billing') || isOrgAdmin(auth.session),
);
const canUsage = computed(
  () => hasPermission(auth.session, 'portal.console.usage') || isOrgAdmin(auth.session),
);
const quotaInfo = ref<{ tenantQuota: number; tenantUsed: number; members: UserTokenQuotaRow[] }>({
  tenantQuota: 0,
  tenantUsed: 0,
  members: [],
});

async function loadQuotas() {
  if (!canUsage.value) return;
  try {
    const [q, t] = await Promise.all([usageApi.quota(), usageApi.tokenQuotas()]);
    quotaInfo.value = { tenantQuota: t.tenantQuota, tenantUsed: q.usedTokens ?? 0, members: t.members };
  } catch {
    // 额度区块失败不挡用量主流程
  }
}

async function onSaveMemberQuota(row: UserTokenQuotaRow, value: number | undefined) {
  const monthlyTokens = Math.max(0, Math.floor(Number(value ?? 0) || 0));
  if (monthlyTokens === row.monthlyTokens) return;
  try {
    const t = await usageApi.patchTokenQuota({ userId: row.userId, monthlyTokens });
    quotaInfo.value = { ...quotaInfo.value, tenantQuota: t.tenantQuota, members: t.members };
    ElMessage.success(`已更新「${row.name}」的月度 Token 额度`);
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '额度保存失败');
    void loadQuotas();
  }
}
const loading = ref(false);
const error = ref('');
const walletBalance = ref<number | null>(null);
const walletTotalDebited = ref<number | null>(null);
const range = ref<[string, string] | null>(null);
const userId = ref('');
const model = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const items = ref<
  Array<{
    id: string;
    occurredAt: string;
    userId: string;
    memberName: string;
    memberPhone: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    aiCoins: number;
    modelCalls: number;
    clientKind: string;
    source: string;
    threadId: string | null;
  }>
>([]);
const members = ref<Array<{ userId: string; name: string; phone: string | null }>>([]);
const models = ref<string[]>([]);
const totals = ref({
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  modelCalls: 0,
  aiCoins: 0,
});

function formatNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US');
}

const MODEL_PALETTE = [
  '#4A53A3',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#059669',
  '#ea580c',
];

function modelColor(name: string | null | undefined) {
  const s = String(name || '').trim() || '-';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MODEL_PALETTE[h % MODEL_PALETTE.length];
}

const MEMBER_PALETTE = [
  '#4A53A3',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#059669',
  '#ea580c',
];

/** Stable per userId so filter dot and table text stay matched. */
function memberColor(userId: string | null | undefined) {
  const s = String(userId || '').trim() || '-';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MEMBER_PALETTE[h % MEMBER_PALETTE.length];
}

function onSearch() {
  page.value = 1;
  void load();
}

function onReset() {
  range.value = null;
  userId.value = '';
  model.value = '';
  page.value = 1;
  void load();
}

function onSizeChange() {
  page.value = 1;
  void load();
}

async function loadWallet() {
  try {
    const w = await billingApi.wallet();
    if (w.skipped) {
      walletBalance.value = null;
      walletTotalDebited.value = null;
      return;
    }
    walletBalance.value = w.balanceCoins;
    walletTotalDebited.value = w.totalDebited ?? null;
  } catch {
    // 用量表仍可用；钱包失败不挡主流程
    walletBalance.value = null;
    walletTotalDebited.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [res] = await Promise.all([
      billingApi.tokenUsage({
        from: range.value?.[0],
        to: range.value?.[1],
        userId: userId.value || undefined,
        model: model.value || undefined,
        page: page.value,
        pageSize: pageSize.value,
      }),
      loadWallet(),
    ]);
    if (res.skipped) {
      items.value = [];
      total.value = 0;
      members.value = [];
      models.value = [];
      totals.value = {
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        modelCalls: 0,
        aiCoins: 0,
      };
      return;
    }
    items.value = res.items ?? [];
    total.value = res.total ?? 0;
    page.value = res.page ?? page.value;
    pageSize.value = res.pageSize ?? pageSize.value;
    members.value = res.members ?? [];
    models.value = res.models ?? [];
    totals.value = res.totals ?? totals.value;
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '用量加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  void loadQuotas();
});
</script>

<style scoped>
.ai-usage-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.head h1 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: #333946;
}
.sub {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}
.page-alert {
  margin: 0;
}
.wallet-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.wallet-card {
  border: 1px solid #dfe5ef;
  border-radius: 0;
  background: #fff;
  padding: 14px 16px;
}
.wallet-card .label {
  color: #667085;
  font-size: 13px;
  line-height: 1.4;
}
.wallet-card .value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--app-primary-color);
}
.wallet-card .hint {
  margin-top: 4px;
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.4;
}
.summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  border: 1px solid #dfe5ef;
  border-radius: 0;
  border-left: 3px solid var(--app-primary-color);
  background: #fff;
  padding: 14px 16px;
}
.summary-card .label {
  color: #667085;
  font-size: 13px;
  line-height: 1.4;
}
.summary-card .value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  color: #333946;
}
.card {
  border-radius: 0;
}
.card :deep(.el-card__body) {
  padding: 16px;
}
.quota-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.quota-title {
  font-size: 14px;
  font-weight: 600;
  color: #333946;
}
.quota-sub {
  color: #667085;
  font-size: 12px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 12px;
}
.model-option,
.model-cell,
.member-option,
.member-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.model-dot,
.member-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 8px;
}
.usage-table {
  width: 100%;
  font-size: 13px;
}
.usage-table :deep(.el-table__header th) {
  background: #f8fafc;
  color: #333946;
  font-weight: 600;
}
.usage-table :deep(.el-table__row:hover > td) {
  background: #f8fafc;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
@media (max-width: 900px) {
  .wallet-row,
  .summary-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
