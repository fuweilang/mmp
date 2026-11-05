<template>
  <div>
    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="billing-table"
      header-cell-class-name="billing-table-header"
      empty-text="暂无企业钱包"
    >
      <el-table-column label="企业" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="enterprise-cell">
            <span class="enterprise-dot" :style="{ backgroundColor: enterpriseColor(row.tenantId) }" />
            <span>{{ row.tenantName }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="tenantSlug" label="品牌" min-width="120" show-overflow-tooltip />
      <el-table-column prop="balanceCoins" label="余额 AI币" width="120">
        <template #default="{ row }">
          <span class="wallet-num-blue">{{ row.balanceCoins }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="totalCredited" label="累计入账" width="110">
        <template #default="{ row }">
          <span>{{ row.totalCredited }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="totalDebited" label="累计消耗" width="110">
        <template #default="{ row }">
          <span>{{ row.totalDebited }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="$emit('open-funds', row)">详情</el-button>
            <el-button text type="primary" @click="$emit('open-adjust', row, 'credit')">调账</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <div class="table-pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @update:current-page="$emit('update:page', $event)"
        @update:page-size="$emit('update:pageSize', $event)"
        @current-change="$emit('page-change')"
        @size-change="$emit('size-change')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AdminWalletRow } from '@/api/admin';
import { enterpriseColor } from './walletDisplay';

defineProps<{
  rows: AdminWalletRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
}>();

defineEmits<{
  'open-funds': [row: AdminWalletRow];
  'open-adjust': [row: AdminWalletRow, mode: 'credit' | 'debit'];
  'update:page': [page: number];
  'update:pageSize': [size: number];
  'page-change': [];
  'size-change': [];
}>();
</script>

<style scoped>
.enterprise-option,
.enterprise-cell {
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

.operation-buttons {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 0;
}

.operation-buttons :deep(.el-button) {
  margin: 0;
  min-height: 28px;
  padding: 4px 6px;
}

.billing-table {
  width: 100%;
}

.wallet-num-blue {
  color: var(--app-primary-color, #4A53A3);
}

:deep(.billing-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.billing-table .el-table__body td),
:deep(.billing-table .el-table__body .cell),
:deep(.billing-table .el-table__body .el-button.is-text) {
  font-size: 13px;
}

.table-pager,
.ledger-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.table-pager :deep(.el-pagination),
.ledger-pager :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
  row-gap: 6px;
}
</style>
