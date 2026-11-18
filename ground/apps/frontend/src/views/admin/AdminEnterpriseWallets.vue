<template>
  <section class="wallets-page">
    <div class="page-head">
      <h1>企业 AI 币</h1>
      <div class="page-head-actions">
        <el-select-v2
          v-model="selectedTenantId"
          class="enterprise-select"
          :options="enterpriseSelectOptions"
          clearable
          filterable
          placeholder="搜索企业"
          @change="onEnterpriseFilterChange"
        />
        <el-button :loading="loading" @click="reload">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="page-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />

    <WalletTable
      class="wallets-table"
      :rows="pagedWallets"
      :loading="loading"
      :page="walletsPage"
      :page-size="walletsPageSize"
      :total="filteredWallets.length"
      @open-funds="openFunds"
      @open-adjust="openAdjust"
      @open-orders="openOrders"
      @update:page="(p) => (walletsPage = p)"
      @update:page-size="(s) => (walletsPageSize = s)"
      @page-change="onWalletsPageChange"
      @size-change="onWalletsSizeChange"
    />

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

    <RechargeOrdersDrawer
      v-model="ordersVisible"
      :title="ordersTitle"
      :status="ordersStatus"
      :rows="rechargeOrders"
      :loading="ordersLoading"
      :page="ordersPage"
      :page-size="ordersPageSize"
      :total="ordersTotal"
      @closed="onOrdersClosed"
      @status-change="onOrdersStatusChange"
      @update:page="(p) => (ordersPage = p)"
      @update:page-size="(s) => (ordersPageSize = s)"
      @page-change="onOrdersPageChange"
      @size-change="onOrdersSizeChange"
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
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import WalletTable from '@/components/admin/wallets/WalletTable.vue';
import FundsReportPanel from '@/components/admin/wallets/FundsReportPanel.vue';
import RechargeOrdersDrawer from '@/components/admin/wallets/RechargeOrdersDrawer.vue';
import AdjustDialog from '@/components/admin/wallets/AdjustDialog.vue';
import { enterpriseOptionLabel } from '@/components/admin/wallets/walletDisplay';
import { useAdminEnterpriseWallets } from '@/components/admin/wallets/useAdminEnterpriseWallets';

const {
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
  openAdjust,
  onDrawerClosed,
  onOrdersClosed,
  onOrdersPageChange,
  onOrdersSizeChange,
  onOrdersStatusChange,
  onWalletsPageChange,
  onWalletsSizeChange,
  onEnterpriseFilterChange,
  reload,
  selectFixedAmount,
  handleCustomAmountInput,
  openAdjustFromDrawer,
  submitAdjust,
} = useAdminEnterpriseWallets();

const enterpriseSelectOptions = computed(() =>
  enterpriseOptions.value.map((item) => ({
    value: item.tenantId,
    label: enterpriseOptionLabel(item),
  })),
);
</script>

<style scoped>
.wallets-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.page-head {
  align-items: center;
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
  gap: 10px;
}

.enterprise-select {
  width: 220px;
}

.wallets-table {
  margin-top: 16px;
}

.page-alert {
  margin-top: 12px;
}

@media (max-width: 720px) {
  .page-head {
    align-items: stretch;
    flex-direction: column;
  }

  .enterprise-select,
  .page-head-actions,
  .page-head-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
