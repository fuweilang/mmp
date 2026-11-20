<template>
  <section class="ai-usage-page">
    <div class="head">
      <h1>AI币用量</h1>
      <el-button v-if="canRecharge" type="primary" @click="openRecharge">去充值</el-button>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />

    <div class="facts">
      <div><span>当前余额</span><strong>{{ formatNum(walletBalance) }}</strong></div>
      <div><span>消耗 AI币</span><strong>{{ formatNum(totals.aiCoins) }}</strong></div>
    </div>

    <el-tabs v-model="tab" class="usage-tabs" @tab-change="onTab">
      <el-tab-pane label="用量明细" name="detail" />
      <el-tab-pane label="成员统计" name="members" />
    </el-tabs>

    <div class="filters">
      <el-date-picker
        v-model="range"
        type="daterange"
        clearable
        value-format="YYYY-MM-DD"
        start-placeholder="开始"
        end-placeholder="结束"
        style="width: 260px"
        @change="onSearch"
      />
      <el-select v-if="tab === 'detail'" v-model="userId" clearable filterable placeholder="成员" style="width: 160px" @change="onSearch">
        <el-option v-for="m in members" :key="m.userId" :label="m.name" :value="m.userId" />
      </el-select>
      <el-select v-if="tab === 'detail'" v-model="model" clearable filterable placeholder="模型" style="width: 220px" @change="onSearch">
        <el-option v-for="name in models" :key="name" :label="name" :value="name" />
      </el-select>
      <el-input
        v-if="tab === 'members'"
        v-model="memberName"
        clearable
        placeholder="成员名字"
        style="width: 160px"
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-button type="primary" class="search-btn" :loading="loading" @click="onSearch">搜索</el-button>
      <el-button :disabled="loading" @click="onReset">重置</el-button>
    </div>

    <el-table v-if="tab === 'members'" v-loading="loading" :data="memberStats" border empty-text="暂无成员" class="usage-table">
      <el-table-column label="成员" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.name }}</template>
      </el-table-column>
      <el-table-column label="Token" min-width="120">
        <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
      </el-table-column>
      <el-table-column label="Input" min-width="120">
        <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
      </el-table-column>
      <el-table-column label="Output" min-width="120">
        <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
      </el-table-column>
    </el-table>

    <el-table v-else v-loading="loading" :data="items" border empty-text="暂无用量" class="usage-table">
      <el-table-column label="时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.occurredAt) }}</template>
      </el-table-column>
      <el-table-column label="成员" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.memberName }}</template>
      </el-table-column>
      <el-table-column label="模型" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.model }}</template>
      </el-table-column>
      <el-table-column label="AI币" width="120">
        <template #default="{ row }">{{ formatNum(row.aiCoins) }}</template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="tab === 'members' ? memberTotal : total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="onSizeChange"
      />
    </div>

    <RechargeDialog v-model="rechargeVisible" :channels="channels" @success="onRechargeSuccess" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { hasPermission, isOrgAdmin } from '@mammoth/shared';
import { billingApi, type PayChannels } from '../api/console';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/http';
import { formatDateTime } from '../utils/format';
import RechargeDialog from '../components/billing/RechargeDialog.vue';

const auth = useAuthStore();
const canBilling = computed(
  () => hasPermission(auth.session, 'portal.console.billing') || isOrgAdmin(auth.session),
);
const walletCanRecharge = ref<boolean | null>(null);
const canRecharge = computed(() => {
  if (walletCanRecharge.value === true) return true;
  if (walletCanRecharge.value === false) return false;
  return canBilling.value;
});
const rechargeVisible = ref(false);
const channels = ref<PayChannels | null>(null);
const loading = ref(false);
const error = ref('');
const walletBalance = ref<number | null>(null);
const tab = ref<'detail' | 'members'>('detail');
const range = ref<[string, string] | null>(null);
const userId = ref('');
const model = ref('');
const memberName = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const memberTotal = ref(0);
const items = ref<
  Array<{
    id: string;
    occurredAt: string;
    memberName: string;
    model: string;
    aiCoins: number;
  }>
>([]);
const memberStats = ref<
  Array<{ userId: string; name: string; inputTokens: number; outputTokens: number; totalTokens: number }>
>([]);
const members = ref<Array<{ userId: string; name: string; phone: string | null }>>([]);
const models = ref<string[]>([]);
const totals = ref({ aiCoins: 0 });

function formatNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US');
}

function onTab() {
  page.value = 1;
  void load();
}

function onSearch() {
  page.value = 1;
  void load();
}

function onReset() {
  range.value = null;
  userId.value = '';
  model.value = '';
  memberName.value = '';
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
    walletBalance.value = w.skipped ? null : w.balanceCoins;
    walletCanRecharge.value = w.skipped ? null : w.canRecharge ?? null;
  } catch {
    walletBalance.value = null;
    walletCanRecharge.value = null;
  }
}

async function loadMembers() {
  const [stats, usage] = await Promise.all([
    billingApi.memberTokenStats({
      from: range.value?.[0],
      to: range.value?.[1],
      name: memberName.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    }),
    billingApi.tokenUsage({ from: range.value?.[0], to: range.value?.[1], page: 1, pageSize: pageSize.value }),
    loadWallet(),
  ]);
  if (stats.skipped) {
    memberStats.value = [];
    memberTotal.value = 0;
    totals.value = { aiCoins: 0 };
    return;
  }
  memberStats.value = stats.members ?? [];
  memberTotal.value = stats.total ?? 0;
  page.value = stats.page ?? page.value;
  pageSize.value = stats.pageSize ?? pageSize.value;
  totals.value = { aiCoins: usage.skipped ? 0 : usage.totals?.aiCoins ?? 0 };
  if (!usage.skipped) {
    members.value = usage.members ?? [];
    models.value = usage.models ?? [];
  }
}

async function load() {
  if (tab.value === 'members') {
    loading.value = true;
    error.value = '';
    try {
      await loadMembers();
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : '用量加载失败';
    } finally {
      loading.value = false;
    }
    return;
  }
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
      totals.value = { aiCoins: 0 };
      return;
    }
    items.value = res.items ?? [];
    total.value = res.total ?? 0;
    page.value = res.page ?? page.value;
    pageSize.value = res.pageSize ?? pageSize.value;
    members.value = res.members ?? [];
    models.value = res.models ?? [];
    totals.value = { aiCoins: res.totals?.aiCoins ?? 0 };
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '用量加载失败';
  } finally {
    loading.value = false;
  }
}

async function openRecharge() {
  if (!channels.value) {
    try {
      channels.value = await billingApi.channels();
    } catch (e) {
      ElMessage.error(e instanceof ApiError ? e.message : '充值渠道加载失败');
      return;
    }
  }
  rechargeVisible.value = true;
}

function onRechargeSuccess() {
  void loadWallet();
}

onMounted(() => {
  void load();
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
  align-items: center;
  gap: 16px;
}
.head h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: #333946;
}
.facts {
  display: flex;
  gap: 32px;
}
.facts div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.facts span {
  color: #667085;
  font-size: 13px;
}
.facts strong {
  color: var(--app-primary-color, #4a53a3);
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.usage-tabs :deep(.el-tabs__header) {
  margin: 0;
}
.usage-tabs :deep(.el-tabs__content) {
  display: none;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.search-btn {
  min-width: 72px;
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
.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
