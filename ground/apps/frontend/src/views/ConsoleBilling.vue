<template>
  <section class="billing-console">
    <div class="head">
      <div>
        <h1>AI 币充值</h1>
        <p class="sub">充值进入<strong>企业 AI 币钱包</strong>（非个人）；入账以支付回调或查单为准。</p>
      </div>
      <el-button :loading="loading" @click="reload">刷新</el-button>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="page-alert" />

    <div class="balance-hero">
      <div class="balance-hero__accent">
        <div class="label">当前余额</div>
        <div class="balance">{{ formatCoins(wallet?.balanceCoins) }} <small>AI币</small></div>
      </div>
      <div class="balance-hero__action">
        <el-button v-if="canRecharge" type="primary" @click="openCreate">扫码充值</el-button>
        <el-alert
          v-else
          type="info"
          :closable="false"
          title="无充值权限（需要「充值」权限）"
          show-icon
          class="role-alert"
        />
      </div>
    </div>

    <el-card shadow="never" class="card tabs-card">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="充值记录" name="orders">
          <div class="ledger-filters">
            <el-date-picker
              v-model="ordersRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开始"
              end-placeholder="结束"
              style="width: 260px"
              @change="onOrdersSearch"
            />
            <el-select
              v-model="ordersStatus"
              clearable
              placeholder="状态"
              style="width: 120px"
              @change="onOrdersSearch"
            >
              <el-option label="全部" value="" />
              <el-option label="待支付" value="pending" />
              <el-option label="已入账" value="confirmed" />
              <el-option label="已过期" value="expired" />
              <el-option label="已取消" value="cancelled" />
              <el-option label="失败" value="failed" />
            </el-select>
            <el-select
              v-model="ordersChannel"
              clearable
              placeholder="渠道"
              style="width: 120px"
              @change="onOrdersSearch"
            >
              <el-option label="全部" value="" />
              <el-option label="微信" value="wechat" />
              <el-option label="支付宝" value="alipay" />
              <el-option label="模拟" value="mock" />
            </el-select>
            <el-select
              v-model="ordersCreatedByUserId"
              clearable
              filterable
              placeholder="充值人"
              style="width: 140px"
              @change="onOrdersSearch"
            >
              <el-option
                v-for="m in orderMembers"
                :key="m.user.id"
                :label="m.user.name"
                :value="m.user.id"
              />
            </el-select>
            <el-button type="primary" class="filter-search-btn" :loading="ordersLoading" @click="onOrdersSearch">搜索</el-button>
            <el-button :disabled="ordersLoading" @click="onOrdersReset">重置</el-button>
          </div>
          <div class="table-panel">
          <el-table v-loading="ordersLoading" :data="orders" border class="billing-table" empty-text="暂无充值记录">
            <el-table-column prop="orderNo" label="单号" min-width="160" show-overflow-tooltip />
            <el-table-column prop="amountYuan" label="金额(元)" width="100" />
            <el-table-column prop="aiCoins" label="AI币" width="100" />
            <el-table-column label="渠道" width="90">
              <template #default="{ row }">{{ payChannelLabel(row.channel) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="rechargeStatusTagType(row.status)" effect="plain" size="small">
                  {{ rechargeStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="充值人" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.createdByName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" min-width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="ordersPage"
              v-model:page-size="ordersPageSize"
              :total="ordersTotal"
              :page-sizes="[20, 30, 50]"
              layout="total, sizes, prev, pager, next"
              background
              small
              @current-change="loadOrders"
              @size-change="onOrdersSizeChange"
            />
          </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="AI币流水" name="ledger">
          <div class="ledger-filters">
            <el-select
              v-model="ledgerType"
              clearable
              placeholder="类型"
              style="width: 140px"
              @change="onLedgerSearch"
            >
              <el-option label="全部" value="" />
              <el-option label="充值" value="recharge" />
              <el-option label="充值(旧)" value="qr_topup" />
              <el-option label="手动调账" value="manual_adjust" />
              <el-option label="预冻结" value="chat_freeze" />
              <el-option label="解冻" value="chat_unfreeze" />
              <el-option label="开户赠送" value="signup_gift" />
            </el-select>
            <el-date-picker
              v-model="ledgerRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开始"
              end-placeholder="结束"
              style="width: 260px"
              @change="onLedgerSearch"
            />
            <el-select
              v-model="ledgerActorUserId"
              clearable
              filterable
              placeholder="员工"
              style="width: 140px"
              @change="onLedgerSearch"
            >
              <el-option
                v-for="m in orderMembers"
                :key="m.user.id"
                :label="m.user.name"
                :value="m.user.id"
              />
            </el-select>
            <el-button type="primary" class="filter-search-btn" :loading="ledgerLoading" @click="onLedgerSearch">搜索</el-button>
            <el-button :disabled="ledgerLoading" @click="onLedgerReset">重置</el-button>
            <router-link class="usage-link" to="/console/ai-usage">查看 AI币用量</router-link>
          </div>
          <div class="table-panel">
          <el-table v-loading="ledgerLoading" :data="ledgerItems" border class="billing-table" empty-text="暂无流水">
            <el-table-column prop="createdAt" label="时间" min-width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">{{ ledgerTypeLabel(String(row.type)) }}</template>
            </el-table-column>
            <el-table-column label="方向" width="80">
              <template #default="{ row }">
                <span :class="row.direction === 'in' ? 'delta-in' : 'delta-out'">
                  {{ ledgerDirectionLabel(String(row.direction)) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="AI币" width="100">
              <template #default="{ row }">
                <span :class="Number(row.deltaCoins ?? (row.direction === 'in' ? row.coins : -Number(row.coins))) >= 0 ? 'delta-in' : 'delta-out'">
                  {{ formatDelta(Number(row.deltaCoins ?? (row.direction === 'in' ? row.coins : -Number(row.coins)))) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="员工" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.actorName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="balanceAfter" label="余额快照" width="100" />
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="ledgerPage"
              v-model:page-size="ledgerPageSize"
              :total="ledgerTotal"
              :page-sizes="[20, 30, 50]"
              layout="total, sizes, prev, pager, next"
              background
              small
              @current-change="loadLedger"
              @size-change="onLedgerSizeChange"
            />
          </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <RechargeDialog
      v-model="rechargeVisible"
      :channels="channels"
      @success="onRechargeSuccess"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { hasPermission, isOrgAdmin } from '@mammoth/shared';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/http';
import {
  billingApi,
  type BillingWalletView,
  type PayChannels,
  type RechargeOrder,
} from '../api/console';
import { tenantApi, type SimpleMember } from '../api/tenants';
import RechargeDialog from './billing/RechargeDialog.vue';
import {
  ledgerDirectionLabel,
  ledgerTypeLabel,
  payChannelLabel,
  rechargeStatusLabel,
  rechargeStatusTagType,
} from './billing/billingDisplay';
import { formatDateTime } from '../utils/format';

const auth = useAuthStore();
/** 需 portal.console.billing；平台管/企管兜底与后端一致 */
const canRecharge = computed(() => {
  const s = auth.session;
  if (!s) return false;
  if (wallet.value?.canRecharge === true) return true;
  if (wallet.value?.canRecharge === false) return false;
  return hasPermission(s, 'portal.console.billing') || isOrgAdmin(s);
});

const loading = ref(false);
const error = ref('');
const wallet = ref<BillingWalletView | null>(null);
const channels = ref<PayChannels | null>(null);
const activeTab = ref<'orders' | 'ledger'>('orders');

const ordersLoading = ref(false);
const orders = ref<RechargeOrder[]>([]);
const ordersPage = ref(1);
const ordersPageSize = ref(20);
const ordersTotal = ref(0);
const ordersRange = ref<[string, string] | null>(null);
const ordersStatus = ref('');
const ordersChannel = ref('');
const ordersCreatedByUserId = ref('');
const orderMembers = ref<SimpleMember[]>([]);

const ledgerLoading = ref(false);
const ledgerItems = ref<Array<Record<string, unknown>>>([]);
const ledgerType = ref('');
const ledgerActorUserId = ref('');
const ledgerRange = ref<[string, string] | null>(null);
const ledgerPage = ref(1);
const ledgerPageSize = ref(20);
const ledgerTotal = ref(0);

const rechargeVisible = ref(false);
const suppressOrdersAutoSearch = ref(false);
const suppressLedgerAutoSearch = ref(false);

function formatCoins(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US');
}

function formatDelta(n: number) {
  if (n > 0) return `+${n}`;
  return String(n);
}

async function loadOrderMembers() {
  try {
    orderMembers.value = await tenantApi.simpleMembers();
  } catch {
    orderMembers.value = [];
  }
}

async function loadOrders() {
  ordersLoading.value = true;
  try {
    const res = await billingApi.orders({
      from: ordersRange.value?.[0] ? `${ordersRange.value[0]}T00:00:00` : undefined,
      to: ordersRange.value?.[1] ? `${ordersRange.value[1]}T23:59:59` : undefined,
      status: ordersStatus.value || undefined,
      channel: ordersChannel.value || undefined,
      createdByUserId: ordersCreatedByUserId.value || undefined,
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

async function loadLedger() {
  ledgerLoading.value = true;
  try {
    const res = await billingApi.ledger({
      type: ledgerType.value || undefined,
      actorUserId: ledgerActorUserId.value || undefined,
      from: ledgerRange.value?.[0] ? `${ledgerRange.value[0]}T00:00:00` : undefined,
      to: ledgerRange.value?.[1] ? `${ledgerRange.value[1]}T23:59:59` : undefined,
      page: ledgerPage.value,
      pageSize: ledgerPageSize.value,
    });
    ledgerItems.value = res.skipped ? [] : res.items;
    ledgerPage.value = res.page ?? ledgerPage.value;
    ledgerPageSize.value = res.pageSize ?? ledgerPageSize.value;
    ledgerTotal.value = res.total ?? 0;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '流水加载失败');
  } finally {
    ledgerLoading.value = false;
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
  ordersChannel.value = '';
  ordersCreatedByUserId.value = '';
  ordersPage.value = 1;
  await nextTick();
  suppressOrdersAutoSearch.value = false;
  void loadOrders();
}

function onOrdersSizeChange() {
  ordersPage.value = 1;
  void loadOrders();
}

function onLedgerSearch() {
  if (suppressLedgerAutoSearch.value) return;
  ledgerPage.value = 1;
  void loadLedger();
}

async function onLedgerReset() {
  suppressLedgerAutoSearch.value = true;
  ledgerType.value = '';
  ledgerActorUserId.value = '';
  ledgerRange.value = null;
  ledgerPage.value = 1;
  await nextTick();
  suppressLedgerAutoSearch.value = false;
  void loadLedger();
}

function onLedgerSizeChange() {
  ledgerPage.value = 1;
  void loadLedger();
}

function onTabChange(name: string | number) {
  if (name === 'ledger' && ledgerItems.value.length === 0 && !ledgerLoading.value) {
    void loadLedger();
  }
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const [w, c] = await Promise.all([billingApi.wallet(), billingApi.channels()]);
    wallet.value = w;
    channels.value = c;
    void loadOrderMembers();
    if (activeTab.value === 'orders') await loadOrders();
    else await loadLedger();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  } finally {
    loading.value = false;
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
.billing-console { display: flex; flex-direction: column; gap: 16px; background: #fff; padding: 15px; }
.head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.head h1 { margin: 0 0 4px; font-size: 20px; color: #333946; }
.sub { margin: 0; color: #667085; font-size: 13px; }
.card { border-radius: 0; }
.balance-hero {
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid #dfe5ef;
  background: #fff;
}
.balance-hero__accent {
  flex: 1 1 auto;
  padding: 16px 20px;
  background: var(--app-primary-light-color);
}
.balance-hero__action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 20px;
  background: #fff;
  border-left: 1px solid #dfe5ef;
  min-width: 160px;
}
.label { color: #667085; font-size: 13px; }
.balance { font-size: 28px; font-weight: 600; color: #333946; }
.balance small { font-size: 14px; font-weight: 400; color: #667085; }
.hint { color: #98a2b3; font-size: 12px; margin-top: 4px; }
.page-alert { margin: 0; }
.role-alert { max-width: 280px; }
.tabs-card :deep(.el-card__body) { padding-top: 8px; }
.ledger-filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  min-height: 32px;
  margin: 0 0 12px;
  flex-shrink: 0;
}
.ledger-filters > * {
  flex: 0 0 auto;
}
.filter-search-btn { min-width: 72px; }
.table-panel {
  position: relative;
  min-height: 420px;
}
.billing-table { width: 100%; min-height: 360px; }
.billing-table :deep(.el-loading-mask) { z-index: 2; }
.billing-table :deep(.el-table__empty-block) { min-height: 320px; }
.billing-table :deep(.el-table__header th) {
  background: #f8fafc;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}
.billing-table :deep(.el-table__body td) { font-size: 13px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.delta-in { color: #16a34a; }
.delta-out { color: #dc2626; }
.usage-link { color: #3b6ff0; font-size: 13px; text-decoration: none; align-self: center; }
.usage-link:hover { text-decoration: underline; }
</style>
