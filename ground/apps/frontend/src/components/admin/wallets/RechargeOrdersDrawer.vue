<template>
  <el-drawer
    :model-value="modelValue"
    size="720px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="$emit('closed')"
  >
    <template #header>
      <div class="drawer-title-row">
        <span class="drawer-title">{{ title }}</span>
      </div>
    </template>
    <div class="orders-drawer">
      <div class="section-head">
        <h3>充值记录</h3>
        <el-select
          :model-value="status"
          clearable
          placeholder="全部状态"
          style="width: 140px"
          @change="$emit('status-change', $event || '')"
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
        :rows="rows"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="total"
        @update:page="$emit('update:page', $event)"
        @update:page-size="$emit('update:pageSize', $event)"
        @page-change="$emit('page-change', $event)"
        @size-change="$emit('size-change', $event)"
      />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import OrdersTable from './OrdersTable.vue';

defineProps<{
  modelValue: boolean;
  title: string;
  status: string;
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
  'update:modelValue': [v: boolean];
  closed: [];
  'status-change': [status: string];
  'update:page': [page: number];
  'update:pageSize': [size: number];
  'page-change': [page: number];
  'size-change': [size: number];
}>();
</script>

<style scoped>
.drawer-title-row {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 8px;
}

.drawer-title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.orders-drawer {
  min-height: 200px;
}

.section-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-head h3 {
  color: #333946;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
</style>
