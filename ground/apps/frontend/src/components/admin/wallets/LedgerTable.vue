<template>
  <div>
    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="billing-table"
      header-cell-class-name="billing-table-header"
      empty-text="暂无流水"
      max-height="480"
    >
      <el-table-column label="时间" width="148">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="类型" width="96">
        <template #default="{ row }">
          <span :style="{ color: ledgerTypeColor(row.type) }">{{ ledgerTypeLabel(row.type) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="变动" width="110">
        <template #default="{ row }">
          <span :class="row.deltaCoins >= 0 ? 'delta-in' : 'delta-out'">
            {{ formatDelta(row.deltaCoins) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="余额" width="110">
        <template #default="{ row }">{{ Number(row.balanceAfter).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="说明" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ ledgerDetailText(row) }}</template>
      </el-table-column>
    </el-table>
    <div class="ledger-pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[20, 30, 50]"
        layout="total, sizes, prev, pager, next"
        background
        small
        @update:current-page="$emit('update:page', $event)"
        @update:page-size="$emit('update:pageSize', $event)"
        @current-change="$emit('page-change', $event)"
        @size-change="$emit('size-change', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/format';
import { formatDelta, ledgerDetailText, ledgerTypeColor, ledgerTypeLabel } from './walletDisplay';

export type LedgerRow = {
  type: string;
  deltaCoins: number;
  amountYuan?: string | number | null;
  balanceAfter: number;
  actorName?: string | null;
  remark?: string | null;
  createdAt: string;
  tokens?: number | null;
  provider?: string | null;
  model?: string | null;
  orderNo?: string | null;
  channel?: string | null;
  tokensPerAiCoin?: number | null;
};

defineProps<{
  rows: LedgerRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
}>();

defineEmits<{
  'update:page': [page: number];
  'update:pageSize': [size: number];
  'page-change': [page: number];
  'size-change': [size: number];
}>();
</script>

<style scoped>
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
:deep(.billing-table .el-table__body .cell) {
  font-size: 13px;
}

.ledger-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.ledger-pager :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
  row-gap: 6px;
}

.delta-in {
  color: #067647;
  font-weight: 600;
}

.delta-out {
  color: #b42318;
  font-weight: 600;
}
</style>
