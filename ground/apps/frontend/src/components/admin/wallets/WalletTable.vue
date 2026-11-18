<template>
  <div>
    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="billing-table"
      header-cell-class-name="billing-table-header"
      empty-text="暂无企业 AI 币"
    >
      <el-table-column label="企业" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.tenantName }}</template>
      </el-table-column>
      <el-table-column label="企业管理员" min-width="180">
        <template #default="{ row }">
          <div v-if="row.admins?.length" class="admin-list">
            <div v-for="admin in row.admins" :key="admin.id" class="admin-item">
              <span class="admin-name">{{ admin.name }}</span>
              <span class="admin-phone">{{ admin.phone }}</span>
            </div>
          </div>
          <span v-else class="admin-empty">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="余额" width="140">
        <template #default="{ row }">
          <span class="balance-num">{{ row.balanceCoins.toLocaleString('zh-CN') }}</span>
        </template>
      </el-table-column>
      <el-table-column label="最近变动" width="160">
        <template #default="{ row }">{{ row.updatedAt ? formatDateTime(row.updatedAt) : '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="$emit('open-funds', row)">明细</el-button>
            <el-button text type="primary" @click="$emit('open-adjust', row)">调账</el-button>
            <el-button text type="primary" @click="$emit('open-orders', row)">充值记录</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <div class="table-pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
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
import { formatDateTime } from '@/utils/format';

defineProps<{
  rows: AdminWalletRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
}>();

defineEmits<{
  'open-funds': [row: AdminWalletRow];
  'open-adjust': [row: AdminWalletRow];
  'open-orders': [row: AdminWalletRow];
  'update:page': [page: number];
  'update:pageSize': [size: number];
  'page-change': [];
  'size-change': [];
}>();
</script>

<style scoped>
.admin-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.admin-name {
  color: #333946;
}

.admin-phone {
  color: #667085;
  font-size: 12px;
}

.admin-empty {
  color: #98a2b3;
}

.balance-num {
  color: var(--app-primary-color, #4A53A3);
}

.operation-buttons {
  align-items: center;
  display: inline-flex;
  gap: 2px;
  justify-content: center;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}

.billing-table {
  width: 100%;
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

:deep(.el-button) {
  margin: 0;
  min-height: 28px;
  padding: 4px 6px;
}

.table-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.table-pager :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
  row-gap: 6px;
}
</style>
