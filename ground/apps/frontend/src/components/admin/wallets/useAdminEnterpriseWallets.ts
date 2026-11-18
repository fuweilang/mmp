import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  adminBillingApi,
  type AdminWalletRow,
} from '@/api/admin';
import { ApiError } from '@/api/http';

export function useAdminEnterpriseWallets() {
  const WALLET_PATH = '/admin/enterprise-wallets';
  const FILTER_STORAGE_KEY = 'admin.enterprise-wallets.tenantId';
  const fixedCoinAmounts = [1000, 5000, 10000, 50000, 100000];

  const route = useRoute();
  const router = useRouter();
  const loading = ref(false);
  const fundsLoading = ref(false);
  const ledgerLoading = ref(false);
  const fundsTenantId = ref('');
  const fundsReport = ref<Awaited<ReturnType<typeof adminBillingApi.getEnterpriseFunds>> | null>(null);
  const drawerVisible = ref(false);
  const ledgerPage = ref(1);
  const ledgerPageSize = ref(20);
  const ledgerTotal = ref(0);
  const ledgerType = ref('');
  const ordersVisible = ref(false);
  const ordersTenantId = ref('');
  const ordersTitle = ref('');
  const ordersStatus = ref('');
  const adjusting = ref(false);
  const error = ref('');
  const wallets = ref<AdminWalletRow[]>([]);
  const selectedTenantId = ref('');
  const walletsPage = ref(1);
  const walletsPageSize = ref(10);
  const rechargeOrders = ref<Array<{
    id: string;
    orderNo: string;
    amountYuan: string;
    aiCoins: number;
    status: string;
    channel: string;
    tenantName?: string;
    createdAt: string;
  }>>([]);
  const ordersLoading = ref(false);
  const ordersPage = ref(1);
  const ordersPageSize = ref(20);
  const ordersTotal = ref(0);

  function readStoredFilter(): string {
    try {
      return localStorage.getItem(FILTER_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function persistFilter(tenantId: string) {
    try {
      if (tenantId) localStorage.setItem(FILTER_STORAGE_KEY, tenantId);
      else localStorage.removeItem(FILTER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const adjustVisible = ref(false);
  const adjustTarget = ref<AdminWalletRow | null>(null);
  const adjustMode = ref<'credit' | 'debit'>('credit');
  const selectedCoinAmount = ref(1000);
  const customCoinAmount = ref('');
  const usingCustomAmount = ref(false);
  const adjustForm = reactive({
    remark: '',
  });

  const enterpriseOptions = computed(() => wallets.value);

  const filteredWallets = computed(() => {
    if (!selectedTenantId.value) return wallets.value;
    return wallets.value.filter((w) => w.tenantId === selectedTenantId.value);
  });

  const pagedWallets = computed(() => {
    const start = (walletsPage.value - 1) * walletsPageSize.value;
    return filteredWallets.value.slice(start, start + walletsPageSize.value);
  });

  const drawerTitle = computed(() => fundsReport.value?.tenant.name || '企业 AI 币');





  async function loadFunds(tenantId: string, opts?: { page?: number; keepPage?: boolean }) {
    fundsTenantId.value = tenantId;
    drawerVisible.value = true;
    if (!opts?.keepPage) {
      ledgerPage.value = opts?.page ?? 1;
    }
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
      // 入账（含首次开户赠送）发生在资金接口里。流水翻页不再拉整表。
      if (!onlyLedger) {
        const wasMissing = !wallets.value.some((w) => w.tenantId === tenantId);
        await refreshWallets();
        if (wasMissing) walletsPage.value = 1;
      }
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

  function openFunds(row: AdminWalletRow) {
    router.replace({
      path: WALLET_PATH,
      query: { ...route.query, tenantId: row.tenantId },
    });
  }

  function onDrawerClosed() {
    fundsTenantId.value = '';
    fundsReport.value = null;
    ledgerPage.value = 1;
    ledgerTotal.value = 0;
    ledgerType.value = '';
    const q = { ...route.query };
    delete q.tenantId;
    router.replace({ path: WALLET_PATH, query: q });
  }

  function openOrders(row: AdminWalletRow) {
    ordersTenantId.value = row.tenantId;
    ordersTitle.value = row.tenantName;
    ordersStatus.value = '';
    ordersPage.value = 1;
    ordersVisible.value = true;
    void loadOrders({ page: 1 });
  }

  function onOrdersClosed() {
    ordersVisible.value = false;
    ordersTenantId.value = '';
    ordersTitle.value = '';
    ordersStatus.value = '';
    rechargeOrders.value = [];
    ordersPage.value = 1;
    ordersTotal.value = 0;
  }

  async function loadOrders(opts?: { page?: number }) {
    if (!ordersTenantId.value) return;
    const tenantId = ordersTenantId.value;
    ordersLoading.value = true;
    const page = opts?.page ?? ordersPage.value;
    try {
      const res = await adminBillingApi.listRechargeOrders({
        tenantId,
        status: ordersStatus.value || undefined,
        page,
        pageSize: ordersPageSize.value,
      });
      if (tenantId !== ordersTenantId.value) return;
      rechargeOrders.value = res.items ?? [];
      ordersPage.value = res.page ?? page;
      ordersPageSize.value = res.pageSize ?? ordersPageSize.value;
      ordersTotal.value = res.total ?? 0;
    } catch {
      /* soft fail */
    } finally {
      ordersLoading.value = false;
    }
  }

  async function onOrdersPageChange(page: number) {
    await loadOrders({ page });
  }

  async function onOrdersSizeChange(size: number) {
    ordersPageSize.value = size;
    ordersPage.value = 1;
    await loadOrders({ page: 1 });
  }

  async function onOrdersStatusChange(status: string | null | undefined) {
    ordersStatus.value = status || '';
    ordersPage.value = 1;
    await loadOrders({ page: 1 });
  }

  function onWalletsPageChange() {
    /* v-model already updated */
  }

  function onWalletsSizeChange() {
    walletsPage.value = 1;
  }

  function onEnterpriseFilterChange(tenantId: string | null | undefined) {
    selectedTenantId.value = tenantId || '';
    persistFilter(selectedTenantId.value);
    walletsPage.value = 1;
  }

  function onEnterpriseFilterClear() {
    selectedTenantId.value = '';
    persistFilter('');
    walletsPage.value = 1;
  }

  let walletListSeq = 0;

  async function refreshWallets() {
    const seq = ++walletListSeq;
    loading.value = true;
    error.value = '';
    try {
      const rows = await adminBillingApi.listWallets();
      if (seq !== walletListSeq) return;
      wallets.value = rows;
      const openFundsId = fundsTenantId.value;
      if (
        selectedTenantId.value
        && selectedTenantId.value !== openFundsId
        && !rows.some((w) => w.tenantId === selectedTenantId.value)
      ) {
        selectedTenantId.value = '';
        persistFilter('');
      }
    } catch (e) {
      if (seq !== walletListSeq) return;
      error.value = e instanceof ApiError ? e.message : '加载失败';
    } finally {
      if (seq === walletListSeq) loading.value = false;
    }
  }

  async function reload() {
    await refreshWallets();
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

  function resolvedAdjustCoins(): number {
    const raw = usingCustomAmount.value ? Number(customCoinAmount.value) : selectedCoinAmount.value;
    const n = Math.floor(Number(raw) || 0);
    return n > 0 ? n : 0;
  }

  function openAdjust(row: AdminWalletRow, mode: 'credit' | 'debit' = 'credit') {
    adjustTarget.value = row;
    adjustMode.value = mode;
    adjustForm.remark = mode === 'debit' ? '超管手动调减' : '超管手动入账';
    resetAdjustAmount();
    adjustVisible.value = true;
  }

  function openAdjustFromDrawer(mode: 'credit' | 'debit' = 'credit') {
    if (!fundsReport.value) return;
    const row =
      wallets.value.find((w) => w.tenantId === fundsReport.value!.tenant.id) ||
      ({
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
      } as AdminWalletRow);
    openAdjust(row, mode);
  }

  async function submitAdjust() {
    if (!adjustTarget.value) return;
    const coins = resolvedAdjustCoins();
    if (!coins) {
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
      await reload();
      if (fundsTenantId.value === adjustTarget.value.tenantId) {
        await loadFunds(adjustTarget.value.tenantId);
      }
    } catch (e) {
      ElMessage.error(e instanceof ApiError ? e.message : '调账失败');
    } finally {
      adjusting.value = false;
    }
  }

  watch(
    () => route.query.tenantId,
    (id) => {
      if (typeof id === 'string' && id) void loadFunds(id);
    },
    { immediate: true },
  );

  watch(filteredWallets, (rows) => {
    const maxPage = Math.max(1, Math.ceil(rows.length / walletsPageSize.value) || 1);
    if (walletsPage.value > maxPage) walletsPage.value = maxPage;
  });

  onMounted(() => {
    selectedTenantId.value = readStoredFilter();
    void reload();
  });
  return {
    fixedCoinAmounts,
    loading,
    fundsLoading,
    ledgerLoading,
    fundsReport,
    drawerVisible,
    ledgerPage,
    ledgerPageSize,
    ledgerTotal,
    ledgerType,
    ordersVisible,
    ordersTitle,
    ordersStatus,
    adjusting,
    error,
    selectedTenantId,
    walletsPage,
    walletsPageSize,
    rechargeOrders,
    ordersLoading,
    ordersPage,
    ordersPageSize,
    ordersTotal,
    adjustVisible,
    adjustTarget,
    adjustMode,
    selectedCoinAmount,
    customCoinAmount,
    usingCustomAmount,
    adjustForm,
    enterpriseOptions,
    filteredWallets,
    pagedWallets,
    drawerTitle,
    onLedgerPageChange,
    onLedgerSizeChange,
    onLedgerTypeChange,
    openFunds,
    openOrders,
    onDrawerClosed,
    onOrdersClosed,
    loadOrders,
    onOrdersPageChange,
    onOrdersSizeChange,
    onOrdersStatusChange,
    onWalletsPageChange,
    onWalletsSizeChange,
    onEnterpriseFilterChange,
    onEnterpriseFilterClear,
    reload,
    selectFixedAmount,
    handleCustomAmountInput,
    openAdjust,
    openAdjustFromDrawer,
    submitAdjust,
  };
}
