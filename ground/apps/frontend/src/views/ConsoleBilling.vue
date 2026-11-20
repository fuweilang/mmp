<template>
  <section class="billing-console">
    <div class="head">
      <h1>AI币充值</h1>
      <el-button v-if="canRecharge" type="primary" @click="openCreate">扫码充值</el-button>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />

    <div class="facts">
      <div><span>当前余额</span><strong>{{ formatCoins(wallet?.balanceCoins) }}</strong></div>
    </div>

    <div class="filters">
      <el-date-picker
        v-model="ordersRange"
        type="daterange"
        clearable
        value-format="YYYY-MM-DD"
        start-placeholder="开始"
        end-placeholder="结束"
        style="width: 260px"
        @change="onOrdersSearch"
      />
      <el-select v-model="ordersStatus" clearable placeholder="状态" style="width: 120px" @change="onOrdersSearch">
        <el-option label="已入账" value="confirmed" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-button type="primary" class="search-btn" :loading="ordersLoading" @click="onOrdersSearch">搜索</el-button>
      <el-button :disabled="ordersLoading" @click="onOrdersReset">重置</el-button>
    </div>

    <el-table v-loading="ordersLoading" :data="orders" border class="billing-table" empty-text="暂无充值记录">
      <el-table-column prop="orderNo" label="单号" min-width="160" show-overflow-tooltip />
      <el-table-column label="时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="渠道" width="90">
        <template #default="{ row }">{{ payChannelLabel(row.channel) }}</template>
      </el-table-column>
      <el-table-column label="金额" width="120">
        <template #default="{ row }">{{ row.amountYuan }}</template>
      </el-table-column>
      <el-table-column label="AI币" width="120">
        <template #default="{ row }">{{ formatCoins(row.aiCoins) }}</template>
      </el-table-column>
      <el-table-column label="充值人" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.createdByName || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="rechargeStatusTagType(row.status)" effect="plain" size="small">
            {{ rechargeStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="ordersPage"
        v-model:page-size="ordersPageSize"
        :total="ordersTotal"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="loadOrders"
        @size-change="onOrdersSizeChange"
      />
    </div>

    <RechargeDialog v-model="rechargeVisible" :channels="channels" @success="onRechargeSuccess" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { hasPermission, isOrgAdmin } from '@mammoth/shared';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/http';
import { billingApi, type BillingWalletView, type PayChannels, type RechargeOrder } from '../api/console';
import RechargeDialog from '../components/billing/RechargeDialog.vue';
import { payChannelLabel, rechargeStatusLabel, rechargeStatusTagType } from './billing/billingDisplay';
import { formatDateTime } from '../utils/format';

const auth = useAuthStore();
const canRecharge = computed(() => {
  const s = auth.session;
  if (!s) return false;
  if (wallet.value?.canRecharge === true) return true;
  if (wallet.value?.canRecharge === false) return false;
  return hasPermission(s, 'portal.console.billing') || isOrgAdmin(s);
});

const error = ref('');
const wallet = ref<BillingWalletView | null>(null);
const channels = ref<PayChannels | null>(null);
const ordersLoading = ref(false);
const orders = ref<RechargeOrder[]>([]);
const ordersPage = ref(1);
const ordersPageSize = ref(10);
const ordersTotal = ref(0);
const ordersRange = ref<[string, string] | null>(null);
const ordersStatus = ref('');
const rechargeVisible = ref(false);
const suppressOrdersAutoSearch = ref(false);

function formatCoins(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US');
}

async function loadOrders() {
  ordersLoading.value = true;
  try {
    const res = await billingApi.orders({
      from: ordersRange.value?.[0] ? `${ordersRange.value[0]}T00:00:00` : undefined,
      to: ordersRange.value?.[1] ? `${ordersRange.value[1]}T23:59:59` : undefined,
      status: ordersStatus.value || undefined,
      page: ordersPage.value,
      pageSize: ordersPageSize.value,
    });
    orders.value = res.items ?? [];
    ordersPage.value = res.page ?? ordersPage.value;
    ordersPageSize.value = res.pageSize ?? ordersPageSize.value;
    ordersTotal.value = res.total ?? 0;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '充值记录加载失败');
  } finally {
    ordersLoading.value = false;
  }
}

function onOrdersSearch() {
  if (suppressOrdersAutoSearch.value) return;
  ordersPage.value = 1;
  void loadOrders();
}

async function onOrdersReset() {
  suppressOrdersAutoSearch.value = true;
  ordersRange.value = null;
  ordersStatus.value = '';
  ordersPage.value = 1;
  await nextTick();
  suppressOrdersAutoSearch.value = false;
  void loadOrders();
}

function onOrdersSizeChange() {
  ordersPage.value = 1;
  void loadOrders();
}

async function reload() {
  error.value = '';
  try {
    const [w, c] = await Promise.all([billingApi.wallet(), billingApi.channels()]);
    wallet.value = w;
    channels.value = c;
    await loadOrders();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  }
}

function openCreate() {
  rechargeVisible.value = true;
}

async function onRechargeSuccess() {
  await reload();
}

watch(rechargeVisible, (visible) => {
  if (!visible) void loadOrders();
});

onMounted(reload);
</script>

<style scoped>
.billing-console {
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
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.search-btn {
  min-width: 72px;
}
.billing-table {
  width: 100%;
  font-size: 13px;
}
.billing-table :deep(.el-table__header th) {
  background: #f8fafc;
  color: #333946;
  font-weight: 600;
}
.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
