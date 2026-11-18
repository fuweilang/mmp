<template>
  <FundsReportPanel
    v-model="drawerVisible"
    :ledger-type="ledgerType"
    :title="drawerTitle"
    :loading="fundsLoading"
    :ledger-loading="ledgerLoading"
    :report="fundsReport"
    :ledger-page="ledgerPage"
    :ledger-page-size="ledgerPageSize"
    :ledger-total="ledgerTotal"
    @closed="onDrawerClosed"
    @adjust="openAdjustFromDrawer"
    @update:ledger-page="(p) => (ledgerPage = p)"
    @update:ledger-page-size="(s) => (ledgerPageSize = s)"
    @ledger-page-change="onLedgerPageChange"
    @ledger-size-change="onLedgerSizeChange"
    @ledger-type-change="onLedgerTypeChange"
  />
  <AdjustDialog
    v-model="adjustVisible"
    v-model:adjust-mode="adjustMode"
    v-model:custom-coin-amount="customCoinAmount"
    v-model:remark="adjustForm.remark"
    :target="adjustTarget"
    :fixed-coin-amounts="fixedCoinAmounts"
    :selected-coin-amount="selectedCoinAmount"
    :using-custom-amount="usingCustomAmount"
    :adjusting="adjusting"
    @select-fixed="selectFixedAmount"
    @custom-input="handleCustomAmountInput"
    @submit="submitAdjust"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminBillingApi, type AdminWalletRow } from '@/api/admin';
import { ApiError } from '@/api/http';
import AdjustDialog from './AdjustDialog.vue';
import FundsReportPanel from './FundsReportPanel.vue';

const fixedCoinAmounts = [1000, 5000, 10000, 50000, 100000];
const fundsLoading = ref(false);
const ledgerLoading = ref(false);
const fundsTenantId = ref('');
const titleHint = ref('');
const fundsReport = ref<Awaited<ReturnType<typeof adminBillingApi.getEnterpriseFunds>> | null>(null);
const drawerVisible = ref(false);
const ledgerPage = ref(1);
const ledgerPageSize = ref(20);
const ledgerTotal = ref(0);
const ledgerType = ref('');
const adjusting = ref(false);
const adjustVisible = ref(false);
const adjustTarget = ref<AdminWalletRow | null>(null);
const adjustMode = ref<'credit' | 'debit'>('credit');
const selectedCoinAmount = ref(1000);
const customCoinAmount = ref('');
const usingCustomAmount = ref(false);
const adjustForm = reactive({ remark: '' });

const drawerTitle = computed(() => fundsReport.value?.tenant.name || titleHint.value || '企业 AI 币');

async function loadFunds(tenantId: string, opts?: { page?: number; keepPage?: boolean }) {
  fundsTenantId.value = tenantId;
  drawerVisible.value = true;
  if (!opts?.keepPage) ledgerPage.value = opts?.page ?? 1;
  const page = opts?.page ?? ledgerPage.value;
  const onlyLedger = Boolean(fundsReport.value?.tenant?.id === tenantId && opts?.keepPage);
  if (onlyLedger) ledgerLoading.value = true;
  else fundsLoading.value = true;
  try {
    const report = await adminBillingApi.getEnterpriseFunds(tenantId, {
      page,
      pageSize: ledgerPageSize.value,
      type: ledgerType.value || undefined,
    });
    fundsReport.value = report;
    ledgerPage.value = report.ledgerPage?.page ?? page;
    ledgerPageSize.value = report.ledgerPage?.pageSize ?? ledgerPageSize.value;
    ledgerTotal.value = report.ledgerPage?.total ?? (report.ledger?.length ?? 0);
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '加载明细失败');
  } finally {
    fundsLoading.value = false;
    ledgerLoading.value = false;
  }
}

async function onLedgerPageChange(page: number) {
  if (!fundsTenantId.value) return;
  await loadFunds(fundsTenantId.value, { page, keepPage: true });
}

async function onLedgerSizeChange(size: number) {
  ledgerPageSize.value = size;
  ledgerPage.value = 1;
  if (!fundsTenantId.value) return;
  await loadFunds(fundsTenantId.value, { page: 1, keepPage: true });
}

async function onLedgerTypeChange(type: string) {
  ledgerType.value = type || '';
  ledgerPage.value = 1;
  if (!fundsTenantId.value) return;
  await loadFunds(fundsTenantId.value, { page: 1, keepPage: true });
}

function onDrawerClosed() {
  fundsTenantId.value = '';
  titleHint.value = '';
  fundsReport.value = null;
  ledgerPage.value = 1;
  ledgerTotal.value = 0;
  ledgerType.value = '';
}

function resetAdjustAmount() {
  selectedCoinAmount.value = 1000;
  customCoinAmount.value = '';
  usingCustomAmount.value = false;
}

function selectFixedAmount(amount: number) {
  selectedCoinAmount.value = amount;
  customCoinAmount.value = '';
  usingCustomAmount.value = false;
}

function handleCustomAmountInput(value: string | number) {
  const amount = String(value || '').replace(/\D/g, '');
  customCoinAmount.value = amount;
  usingCustomAmount.value = Boolean(amount);
  if (usingCustomAmount.value) selectedCoinAmount.value = Number(amount) || 0;
}

function openAdjustFromDrawer(mode: 'credit' | 'debit' = 'credit') {
  if (!fundsReport.value) return;
  adjustTarget.value = {
    tenantId: fundsReport.value.tenant.id,
    tenantName: fundsReport.value.tenant.name,
    tenantSlug: fundsReport.value.tenant.slug,
    tenantType: '',
    tenantStatus: '',
    balanceCoins: fundsReport.value.wallet.balanceCoins,
    totalCredited: fundsReport.value.wallet.totalCredited,
    totalDebited: fundsReport.value.wallet.totalDebited,
    updatedAt: '',
    admins: [],
  };
  adjustMode.value = mode;
  adjustForm.remark = mode === 'debit' ? '超管手动调减' : '超管手动入账';
  resetAdjustAmount();
  adjustVisible.value = true;
}

async function submitAdjust() {
  if (!adjustTarget.value) return;
  const raw = usingCustomAmount.value ? Number(customCoinAmount.value) : selectedCoinAmount.value;
  const coins = Math.floor(Number(raw) || 0);
  if (coins <= 0) {
    ElMessage.warning('请填写有效的 AI币数量');
    return;
  }
  const deltaCoins = adjustMode.value === 'debit' ? -coins : coins;
  adjusting.value = true;
  try {
    const key = `manual-${adjustTarget.value.tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const res = await adminBillingApi.adjustWallet({
      tenantId: adjustTarget.value.tenantId,
      deltaCoins,
      idempotencyKey: key,
      remark: adjustForm.remark || undefined,
    });
    ElMessage.success(`${adjustMode.value === 'debit' ? '调减' : '入账'}成功，余额 ${res.balanceCoins.toLocaleString('zh-CN')} AI币`);
    adjustVisible.value = false;
    if (fundsTenantId.value === adjustTarget.value.tenantId) {
      await loadFunds(adjustTarget.value.tenantId);
    }
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '调账失败');
  } finally {
    adjusting.value = false;
  }
}

function open(tenantId: string, title = '') {
  titleHint.value = title;
  void loadFunds(tenantId);
}

function close() {
  drawerVisible.value = false;
}

defineExpose({ open, close });
</script>
