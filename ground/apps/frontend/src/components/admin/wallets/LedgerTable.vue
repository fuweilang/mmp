<template>
  <div>
    <div class="ledger-table-wrap">
      <el-table
        v-loading="loading"
        :data="rows"
        border
        class="billing-table ledger-table"
        header-cell-class-name="billing-table-header"
        empty-text="暂无流水"
        max-height="420"
        table-layout="fixed"
      >
        <el-table-column label="类型" width="88">
          <template #default="{ row }">{{ ledgerTypeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column label="变动" width="88">
          <template #default="{ row }">
            <span :class="row.deltaCoins >= 0 ? 'delta-in' : 'delta-out'">
              {{ formatDelta(row.deltaCoins) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="实付" width="72">
          <template #default="{ row }">
            {{ row.amountYuan != null ? `¥${row.amountYuan}` : '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="balanceAfter" label="余额" width="80" />
        <el-table-column label="关键信息" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ ledgerMetaText(row) }}</template>
        </el-table-column>
        <el-table-column prop="actorName" label="操作人" width="72" show-overflow-tooltip />
        <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="136">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
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
import { formatDelta, ledgerMetaText, ledgerTypeLabel } from './walletDisplay';

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

.delta-in {
  color: #067647;
  font-weight: 600;
}

.delta-out {
  color: #b42318;
  font-weight: 600;
}

.ledger-table-wrap {
  width: 100%;
  overflow-x: hidden;
}

.ledger-table-wrap :deep(.el-table__body-wrapper),
.ledger-table-wrap :deep(.el-table__header-wrapper) {
  overflow-x: hidden !important;
}

.ledger-table {
  width: 100%;
}
</style>
