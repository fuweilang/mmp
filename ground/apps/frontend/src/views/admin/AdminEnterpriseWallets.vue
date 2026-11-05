<template>
  <section class="wallets-page">
    <div class="page-head">
      <div>
        <h1>企业钱包</h1>
        <p>查看企业 AI币余额、扫码充值记录；支持详情流水与手动调账。</p>
      </div>
      <div class="page-head-actions">
        <el-select
          v-model="selectedTenantId"
          class="global-enterprise-select"
          :class="{ 'has-selected': Boolean(selectedTenantId) }"
          clearable
          filterable
          placeholder="输入企业名称 / 品牌搜索"
          popper-class="wallets-enterprise-select-popper"
          @change="onEnterpriseFilterChange"
          @clear="onEnterpriseFilterClear"
        >
          <el-option
            v-for="item in enterpriseOptions"
            :key="item.tenantId"
            :label="enterpriseOptionLabel(item)"
            :value="item.tenantId"
          >
            <span class="enterprise-option">
              <span class="enterprise-dot" :style="{ backgroundColor: enterpriseColor(item.tenantId) }" />
              <span>{{ enterpriseOptionLabel(item) }}</span>
            </span>
          </el-option>
        </el-select>
        <el-button class="filter-reset" @click="onEnterpriseFilterClear">重置</el-button>
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

    <el-card shadow="never" class="section-card funds-card">
      <template #header>
        <div class="card-header">
          <strong>企业钱包</strong>
          <div class="card-header-actions">
            <el-button v-if="fundsMainTab === 'orders'" text type="primary" @click="loadOrders()">刷新充值</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="fundsMainTab" class="funds-tabs" @tab-change="onMainTabChange">
        <el-tab-pane label="企业钱包" name="wallets">
          <WalletTable
            :rows="pagedWallets"
            :loading="loading"
            :page="walletsPage"
            :page-size="walletsPageSize"
            :total="filteredWallets.length"
            @open-funds="openFunds"
            @open-adjust="(row, mode) => openAdjust(row, mode)"
            @update:page="(p) => (walletsPage = p)"
            @update:page-size="(s) => (walletsPageSize = s)"
            @page-change="onWalletsPageChange"
            @size-change="onWalletsSizeChange"
          />
        </el-tab-pane>

        <el-tab-pane label="扫码充值记录" name="orders">
          <div class="orders-filters">
            <el-select
              v-model="ordersStatus"
              clearable
              placeholder="订单状态"
              style="width: 140px"
              @change="onOrdersStatusChange"
            >
              <el-option label="全部" value="" />
              <el-option label="待支付" value="pending" />
              <el-option label="已入账" value="confirmed" />
              <el-option label="已取消" value="cancelled" />
              <el-option label="已过期" value="expired" />
              <el-option label="失败" value="failed" />
            </el-select>
          </div>
          <OrdersTable
            :rows="rechargeOrders"
            :loading="ordersLoading"
            :page="ordersPage"
            :page-size="ordersPageSize"
            :total="ordersTotal"
            @update:page="(p) => (ordersPage = p)"
            @update:page-size="(s) => (ordersPageSize = s)"
            @page-change="onOrdersPageChange"
            @size-change="onOrdersSizeChange"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-alert class="side-hint" type="info" :closable="false" show-icon>
      <template #title>
        <div class="side-hint-body">
          <span>售价倍率与充值汇率请前往</span>
          <router-link class="side-link" to="/admin/pricing-config">AI币计价配置</router-link>
          <span>；Token 用量与扣费对账见</span>
          <router-link class="side-link" to="/admin/enterprise-token-stats">企业token用量</router-link>
          <span>（AI币以 chat_consume 实扣为准）。余额不足会拦截对话（precheck/charge）。</span>
        </div>
      </template>
    </el-alert>

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
  </section>
</template>

<script setup lang="ts">
import WalletTable from '@/components/admin/wallets/WalletTable.vue';
import OrdersTable from '@/components/admin/wallets/OrdersTable.vue';
import FundsReportPanel from '@/components/admin/wallets/FundsReportPanel.vue';
import AdjustDialog from '@/components/admin/wallets/AdjustDialog.vue';
import { enterpriseColor, enterpriseOptionLabel } from '@/components/admin/wallets/walletDisplay';
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
  fundsMainTab,
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
  onDrawerClosed,
  loadOrders,
  onOrdersPageChange,
  onOrdersSizeChange,
  onOrdersStatusChange,
  onWalletsPageChange,
  onWalletsSizeChange,
  onEnterpriseFilterChange,
  onEnterpriseFilterClear,
  onMainTabChange,
  reload,
  selectFixedAmount,
  handleCustomAmountInput,
  openAdjust,
  openAdjustFromDrawer,
  submitAdjust,
} = useAdminEnterpriseWallets();
</script>

<style scoped>
.wallets-page {
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  padding: 15px;
  min-height: 100%;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.page-head h1 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #333946;
}
.page-head p {
  margin: 0;
  color: #667085;
  font-size: 13px;
}
.page-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.global-enterprise-select {
  width: 280px;
}
.global-enterprise-select.has-selected :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px #4A53A3 inset;
}
.wallets-page :deep(.el-button),
.wallets-page :deep(.el-input__wrapper),
.wallets-page :deep(.el-textarea__inner),
.wallets-page :deep(.el-select__wrapper) {
  border-radius: 0;
}
.page-alert {
  margin-bottom: 0;
}
.section-card {
  border-radius: 0;
  border-color: #dfe5ef;
}
.section-card :deep(.el-card__header) {
  padding: 14px 16px;
  border-bottom-color: #dfe5ef;
  background: #fff;
}
.section-card :deep(.el-card__body) {
  padding: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.card-header strong {
  color: #333946;
  font-size: 15px;
}
.card-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.enterprise-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.enterprise-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.funds-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.orders-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.side-hint {
  border-radius: 0;
}
.side-hint-body {
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
}
.side-link {
  color: #4A53A3;
  margin: 0 4px;
  text-decoration: none;
}
.side-link:hover {
  text-decoration: underline;
}
@media (max-width: 720px) {
  .global-enterprise-select {
    width: 100%;
  }

}
</style>

<style>
.wallets-enterprise-select-popper.el-select-dropdown,
.wallets-enterprise-select-popper .el-select-dropdown__wrap,
.wallets-enterprise-select-popper .el-select-dropdown__list {
  border-radius: 0;
}

.wallets-enterprise-select-popper .el-select-dropdown__item {
  border-radius: 0;
  font-size: 13px;
}
</style>
