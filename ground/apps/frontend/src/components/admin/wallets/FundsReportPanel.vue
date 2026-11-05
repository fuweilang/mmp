<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    size="860px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @closed="$emit('closed')"
  >
    <div v-loading="loading" class="funds-drawer">
      <template v-if="report">
        <section class="drawer-section">
          <h3>余额</h3>
          <div class="metric-row">
            <div class="metric">
              <label>余额 AI币</label>
              <b>{{ report.wallet.balanceCoins.toLocaleString('zh-CN') }}</b>
            </div>
            <div class="metric">
              <label>累计入账</label>
              <b>{{ report.wallet.totalCredited.toLocaleString('zh-CN') }}</b>
            </div>
            <div class="metric">
              <label>累计消耗</label>
              <b>{{ report.wallet.totalDebited.toLocaleString('zh-CN') }}</b>
            </div>
          </div>
          <div v-if="report.consistency" class="recon-row">
            <el-tag :type="report.consistency.ok ? 'success' : 'danger'" size="small">
              {{ report.consistency.ok ? '对账一致' : '对账不符' }}
            </el-tag>
            <span class="recon-text">
              余额 {{ report.consistency.balanceCoins.toLocaleString('zh-CN') }}
              ＝ 入账 − 出账 − 净冻结 {{ report.consistency.frozenNetCoins.toLocaleString('zh-CN') }}
              <template v-if="report.consistency.danglingFreezes > 0">
                ；残留冻结 {{ report.consistency.danglingFreezes }} 笔（进程中断泄漏，待人工处理）
              </template>
            </span>
          </div>
        </section>

        <section class="drawer-section">
          <div class="section-head">
            <h3>流水</h3>
            <el-select
              :model-value="ledgerType"
              clearable
              placeholder="类型筛选"
              style="width: 150px"
              @change="$emit('ledger-type-change', $event || '')"
            >
              <el-option label="全部" value="" />
              <el-option label="充值" value="recharge" />
              <el-option label="对话消耗" value="chat_consume" />
              <el-option label="预冻结" value="chat_freeze" />
              <el-option label="解冻" value="chat_unfreeze" />
              <el-option label="开户赠送" value="signup_gift" />
              <el-option label="调账" value="manual_adjust" />
            </el-select>
          </div>
          <p class="section-desc">
            充值含旧 qr_topup；AI币以 ledger 为准。扣费 = floor(tokens / tokensPerAiCoin)。关键信息含模型/tokens/订单号/渠道。
          </p>
          <el-alert
            class="ledger-note"
            type="info"
            :closable="false"
            show-icon
            title="历史流水可能按旧公式记账，不回填；对账请以 ledger 合计为准（余额≈入账−出账）。"
          />
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

        <section class="drawer-section">
          <h3>操作</h3>
          <p class="section-desc">手动增减企业 AI币（写 ledger manual_adjust）。</p>
          <div class="drawer-actions">
            <el-button type="primary" @click="$emit('adjust', 'credit')">增加余额</el-button>
            <el-button @click="$emit('adjust', 'debit')">减少余额</el-button>
          </div>
        </section>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import LedgerTable, { type LedgerRow } from './LedgerTable.vue';

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
.funds-drawer {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 200px;
}

.drawer-section h3 {
  margin: 0 0 8px;
  font-size: 15px;
  color: #333946;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.section-head h3 {
  margin: 0;
}

.section-desc {
  margin: 0 0 10px;
  color: #8b909b;
  font-size: 12px;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #dfe5ef;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric label {
  color: #8b909b;
  font-size: 12px;
}

.metric b {
  color: #333946;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.drawer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ledger-note {
  margin: 0 0 10px;
  border-radius: 0;
}

.recon-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.recon-text {
  color: #667085;
  font-size: 12px;
}
</style>
