<template>
  <el-dialog
    :model-value="modelValue"
    :title="adjustMode === 'debit' ? '减少余额' : '增加余额'"
    width="480px"
    destroy-on-close
    :close-on-click-modal="false"
    class="adjust-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form label-width="88px" class="adjust-form" @submit.prevent>
      <el-form-item label="企业">
        <span class="adjust-enterprise">{{ target?.tenantName }}</span>
      </el-form-item>
      <el-form-item label="当前余额">
        <span>{{ (target?.balanceCoins ?? 0).toLocaleString('zh-CN') }} AI币</span>
      </el-form-item>
      <el-form-item label="调账数量" required>
        <div class="direction-badge" :class="adjustMode === 'debit' ? 'is-minus' : 'is-plus'">
          <span class="direction-sign">{{ adjustMode === 'debit' ? '−' : '+' }}</span>
          <div>
            <strong>{{ adjustMode === 'debit' ? '减少余额' : '增加余额' }}</strong>
            <p>{{ adjustMode === 'debit' ? '将从企业钱包扣减下方 AI币。' : '将向企业钱包增加下方 AI币。' }}</p>
          </div>
        </div>
        <div class="amount-options">
          <button
            v-for="amount in fixedCoinAmounts"
            :key="amount"
            type="button"
            class="amount-card"
            :class="{
              active: selectedCoinAmount === amount && !usingCustomAmount,
              'is-debit': adjustMode === 'debit',
            }"
            @click="$emit('select-fixed', amount)"
          >
            <small>{{ adjustMode === 'debit' ? '−' : '+' }}</small>
            <span>{{ amount.toLocaleString('zh-CN') }}</span>
          </button>
        </div>
        <el-input
          :model-value="customCoinAmount"
          class="custom-amount"
          :class="{ 'is-active': usingCustomAmount, 'is-debit': adjustMode === 'debit' }"
          clearable
          placeholder="自定义 AI币数量，如 2000"
          @update:model-value="$emit('update:customCoinAmount', String($event ?? ''))"
          @input="$emit('custom-input', $event)"
        >
          <template #prefix>
            <span class="custom-amount-prefix">{{ adjustMode === 'debit' ? '−' : '+' }}</span>
          </template>
        </el-input>
        <div class="adjust-mode-switch">
          <el-radio-group :model-value="adjustMode" size="small" @update:model-value="$emit('update:adjustMode', $event)">
            <el-radio-button value="credit">增加</el-radio-button>
            <el-radio-button value="debit">减少</el-radio-button>
          </el-radio-group>
        </div>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          :model-value="remark"
          maxlength="200"
          show-word-limit
          type="textarea"
          :rows="2"
          :placeholder="adjustMode === 'debit' ? '选填，如冲正、退款' : '选填，如对公到账、商务补偿'"
          @update:model-value="$emit('update:remark', String($event ?? ''))"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="adjusting" @click="$emit('submit')">
        {{ adjustMode === 'debit' ? '确认调减' : '确认入账' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { AdminWalletRow } from '@/api/admin';

defineProps<{
  modelValue: boolean;
  adjustMode: 'credit' | 'debit';
  target: AdminWalletRow | null;
  fixedCoinAmounts: number[];
  selectedCoinAmount: number | null;
  usingCustomAmount: boolean;
  customCoinAmount: string;
  remark: string;
  adjusting: boolean;
}>();

defineEmits<{
  'update:modelValue': [v: boolean];
  'update:adjustMode': [mode: 'credit' | 'debit'];
  'update:customCoinAmount': [v: string];
  'update:remark': [v: string];
  'select-fixed': [amount: number];
  'custom-input': [value: string | number];
  submit: [];
}>();
</script>

<style scoped>
.adjust-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.adjust-enterprise {
  color: #333946;
  font-weight: 600;
}

.direction-badge {
  align-items: center;
  border: 1px solid #e5eaf5;
  border-radius: 0;
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  width: 100%;
}

.direction-sign {
  align-items: center;
  display: inline-flex;
  font-size: 22px;
  font-weight: 800;
  height: 32px;
  justify-content: center;
  line-height: 1;
  width: 32px;
}

.direction-badge strong {
  color: #333946;
  display: block;
  font-size: 13px;
  font-weight: 700;
}

.direction-badge p {
  color: #8b909b;
  font-size: 12px;
  line-height: 1.4;
  margin: 2px 0 0;
}

.direction-badge.is-plus {
  background: #EEF0F8;
  border-color: #c9d4ff;
}

.direction-badge.is-plus .direction-sign {
  color: #4A53A3;
}

.direction-badge.is-minus {
  background: #fff5f5;
  border-color: #fecdca;
}

.direction-badge.is-minus .direction-sign {
  color: #b42318;
}

.amount-options {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
  margin-bottom: 10px;
}

.amount-card {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d8dee9;
  border-radius: 0;
  color: #333946;
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 800;
  gap: 2px;
  height: 42px;
  justify-content: center;
  letter-spacing: -0.03em;
  line-height: 1;
  padding: 0;
}

.amount-card small {
  color: #98a2b3;
  font-size: 12px;
  font-weight: 700;
}

.amount-card:hover:not(.active) {
  border-color: #4A53A3;
  color: #4A53A3;
}

.amount-card:hover:not(.active) small {
  color: #4A53A3;
}

.amount-card.active {
  background: #4A53A3;
  border-color: #4A53A3;
  color: #ffffff;
}

.amount-card.active small {
  color: rgba(255, 255, 255, 0.78);
}

.amount-card.is-debit.active {
  background: #f04438;
  border-color: #f04438;
}

.amount-card.is-debit:hover:not(.active) {
  border-color: #f04438;
  color: #b42318;
}

.custom-amount {
  width: 100%;
  margin-bottom: 10px;
}

.custom-amount.is-active :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #4A53A3 inset;
}

.custom-amount.is-debit.is-active :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #f04438 inset;
}

.custom-amount-prefix {
  color: #667085;
  font-weight: 700;
}

.adjust-mode-switch {
  margin-top: 4px;
}

.adjust-mode-switch :deep(.el-radio-button__inner) {
  border-radius: 0;
}

</style>

<style>
.adjust-dialog { border-radius: 0; }
</style>
