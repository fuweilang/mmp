<template>
  <div class="recharge-step">
    <el-form label-width="88px" class="recharge-form">
      <el-form-item label="充值企业">
        <div class="enterprise-name">{{ enterpriseName }}</div>
        <p class="enterprise-wallet-hint">资金将进入该企业的 AI 币钱包，供本企业成员对话共用，不是个人余额。</p>
      </el-form-item>
      <el-form-item label="充值金额">
        <div class="amount-options">
          <button
            v-for="amount in fixedAmounts"
            :key="amount"
            type="button"
            class="amount-card"
            :class="{ active: selectedAmount === amount && !usingCustomAmount }"
            @click="$emit('select-fixed', amount)"
          >
            <small>¥</small>
            <span>{{ formatAmountLabel(amount) }}</span>
          </button>
        </div>
        <el-input
          :model-value="customAmount"
          class="custom-amount"
          :class="{ 'is-active': usingCustomAmount }"
          clearable
          placeholder="自定义金额，上限 100,000.00"
          @update:model-value="$emit('update:customAmount', String($event ?? ''))"
          @input="$emit('custom-input', String($event ?? ''))"
        >
          <template #prefix>
            <span class="custom-amount-prefix">¥</span>
          </template>
        </el-input>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { formatAmountLabel } from './rechargeAmount';

defineProps<{
  enterpriseName: string;
  fixedAmounts: string[];
  selectedAmount: string;
  customAmount: string;
  usingCustomAmount: boolean;
}>();

defineEmits<{
  (e: 'select-fixed', amount: string): void;
  (e: 'update:customAmount', v: string): void;
  (e: 'custom-input', v: string): void;
}>();
</script>

<style scoped>
.recharge-step,
.recharge-form { padding-top: 2px; }
.enterprise-wallet-hint {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.enterprise-name {
  color: #333946;
  font-size: 14px;
  font-weight: 600;
  line-height: 32px;
}
.amount-options {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
}
.amount-card {
  align-items: center;
  background: #fff;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  color: #1f2937;
  cursor: pointer;
  display: inline-flex;
  font-size: 16px;
  font-weight: 800;
  gap: 2px;
  height: 44px;
  justify-content: center;
  letter-spacing: -0.03em;
  line-height: 1;
  padding: 0;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.amount-card small { color: #94a3b8; font-size: 12px; font-weight: 700; }
.amount-card:hover:not(:disabled):not(.active) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.amount-card:hover:not(:disabled):not(.active) small { color: var(--el-color-primary); }
.amount-card.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}
.amount-card.active small { color: rgba(255, 255, 255, 0.78); }
.custom-amount { margin-top: 10px; }
.custom-amount :deep(.el-input__wrapper) {
  background: #fff;
  box-shadow: 0 0 0 1px #d8dee9 inset;
  min-height: 52px;
  padding: 0 14px;
  border-radius: 0;
}
.custom-amount :deep(.el-input__inner) {
  color: #1f2937;
  font-size: 16px;
  font-weight: 800;
  height: 52px;
}
.custom-amount.is-active :deep(.el-input__wrapper),
.custom-amount :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.custom-amount-prefix {
  color: #94a3b8;
  font-size: 16px;
  font-weight: 800;
}
</style>
