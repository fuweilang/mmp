<template>
  <div>
    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="billing-table"
      header-cell-class-name="billing-table-header"
      empty-text="暂无充值记录"
    >
      <el-table-column prop="tenantName" label="企业" min-width="140" show-overflow-tooltip />
      <el-table-column prop="orderNo" label="单号" min-width="160" show-overflow-tooltip />
      <el-table-column prop="amountYuan" label="金额(元)" width="100">
        <template #default="{ row }">¥{{ row.amountYuan }}</template>
      </el-table-column>
      <el-table-column prop="aiCoins" label="入账 AI币" width="110">
        <template #default="{ row }">{{ Number(row.aiCoins || 0).toLocaleString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column prop="channel" label="渠道" width="90">
        <template #default="{ row }">{{ payChannelLabel(row.channel) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="rechargeStatusTagType(row.status)" effect="plain" size="small">
            {{ rechargeStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" min-width="160">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <div class="table-pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 30, 50]"
        layout="total, sizes, prev, pager, next"
        background
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
import {
  payChannelLabel,
  rechargeStatusLabel,
  rechargeStatusTagType,
} from '@/views/billing/billingDisplay';

defineProps<{
  rows: Array<{
    id: string;
    orderNo: string;
    amountYuan: string;
    aiCoins: number;
    status: string;
    channel: string;
    tenantName?: string;
    createdAt: string;
  }>;
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
}>();

defineEmits<{
  (e: 'update:page', v: number): void;
  (e: 'update:pageSize', v: number): void;
  (e: 'page-change', v: number): void;
  (e: 'size-change', v: number): void;
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

.table-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.table-pager :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
  row-gap: 6px;
}
</style>
