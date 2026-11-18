<template>
  <el-drawer
    :model-value="modelValue"
    size="680px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="$emit('closed')"
  >
    <template #header>
      <div class="drawer-title-row">
        <span class="drawer-title">{{ title }}</span>
        <el-button v-if="report" type="primary" @click="$emit('adjust', 'credit')">调账</el-button>
      </div>
    </template>
    <div v-loading="loading" class="funds-drawer">
      <template v-if="report">
        <section class="balance-block">
          <div class="balance-row">
            <div>
              <div class="balance-label">余额</div>
              <div class="balance-num">{{ report.wallet.balanceCoins.toLocaleString('zh-CN') }}</div>
            </div>
            <div class="balance-side">
              <span>入账 {{ report.wallet.totalCredited.toLocaleString('zh-CN') }}</span>
              <span>消耗 {{ report.wallet.totalDebited.toLocaleString('zh-CN') }}</span>
            </div>
          </div>
          <p v-if="report.consistency && !report.consistency.ok" class="recon-bad">
            对账不符：余额 {{ report.consistency.balanceCoins.toLocaleString('zh-CN') }}，按流水应为
            {{ report.consistency.expectedCoins.toLocaleString('zh-CN') }}
            <template v-if="report.consistency.danglingFreezes > 0">
              ，另有 {{ report.consistency.danglingFreezes }} 笔冻结未结束
            </template>
          </p>
        </section>

        <section>
          <div class="section-head">
            <h3>流水</h3>
            <el-select
              :model-value="ledgerType"
              clearable
              placeholder="全部类型"
              style="width: 148px"
              @change="$emit('ledger-type-change', $event || '')"
            >
              <el-option label="全部" value="" />
              <el-option
                v-for="item in ledgerTypeOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              >
                <span class="type-option">
                  <i class="type-dot" :style="{ background: item.color }" />
                  <span :style="{ color: item.color }">{{ item.label }}</span>
                </span>
              </el-option>
            </el-select>
          </div>
          <LedgerTable
            :rows="(report.ledger || []) as LedgerRow[]"
            :loading="ledgerLoading"
            :page="ledgerPage"
            :page-size="ledgerPageSize"
            :total="ledgerTotal"
            @update:page="$emit('update:ledgerPage', $event)"
            @update:page-size="$emit('update:ledgerPageSize', $event)"
            @page-change="$emit('ledger-page-change', $event)"
            @size-change="$emit('ledger-size-change', $event)"
          />
        </section>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import LedgerTable, { type LedgerRow } from './LedgerTable.vue';
import { ledgerTypeOptions } from './walletDisplay';

defineProps<{
  modelValue: boolean;
  title: string;
  loading: boolean;
  ledgerLoading: boolean;
  ledgerType: string;
  report: null | {
    wallet: { balanceCoins: number; totalCredited: number; totalDebited: number };
    ledger: LedgerRow[];
    consistency?: {
      balanceCoins: number;
      expectedCoins: number;
      frozenNetCoins: number;
      danglingFreezes: number;
      ok: boolean;
    };
  };
  ledgerPage: number;
  ledgerPageSize: number;
  ledgerTotal: number;
}>();

defineEmits<{
  'update:modelValue': [v: boolean];
  closed: [];
  adjust: [mode: 'credit' | 'debit'];
  'update:ledgerPage': [page: number];
  'update:ledgerPageSize': [size: number];
  'ledger-page-change': [page: number];
  'ledger-size-change': [size: number];
  'ledger-type-change': [type: string];
}>();
</script>

<style scoped>
.drawer-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
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

.funds-drawer {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 200px;
}

.balance-label {
  color: #667085;
  font-size: 12px;
  margin-bottom: 4px;
}

.balance-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.balance-num {
  color: #333946;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.balance-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: #667085;
  font-size: 13px;
}

.recon-bad {
  margin: 10px 0 0;
  color: #b42318;
  font-size: 13px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333946;
}

.type-option {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.type-dot {
  border-radius: 50%;
  flex: 0 0 8px;
  height: 8px;
  width: 8px;
}
</style>
