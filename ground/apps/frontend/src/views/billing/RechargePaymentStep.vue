<template>
  <div class="payment-step">
    <div class="pay-hero">
      <div class="pay-amount">
        <span>支付金额</span>
        <strong><small>¥</small>{{ formattedDisplayAmount }}</strong>
      </div>
      <div class="order-summary">
        <span>充值单号</span>
        <strong>{{ createdOrder?.orderNo ?? '生成中…' }}</strong>
        <span v-if="createdOrder?.aiCoins != null" class="coins-line">到账 {{ createdOrder.aiCoins.toLocaleString('zh-CN') }} AI币</span>
      </div>
    </div>
    <p v-if="mockPayEnabled" class="mock-pay-hint">
      本地开发：点模拟支付直接入账，不生成微信/支付宝码。
    </p>

    <div v-if="!mockPayEnabled" class="channel-options" aria-label="支付方式">
      <el-button
        v-if="wechatOk"
        class="channel-button is-wechat"
        :class="{ 'is-active': selectedChannel === 'wechat' }"
        :disabled="payLoading"
        @click="$emit('select-channel', 'wechat')"
      >
        <img :src="wechatIcon" alt="" class="channel-brand-icon">
        <span class="channel-copy"><strong>微信支付</strong></span>
      </el-button>
      <el-button
        v-if="alipayOk"
        class="channel-button is-alipay"
        :class="{ 'is-active': selectedChannel === 'alipay' }"
        :disabled="payLoading"
        @click="$emit('select-channel', 'alipay')"
      >
        <img :src="alipayIcon" alt="" class="channel-brand-icon">
        <span class="channel-copy"><strong>支付宝</strong></span>
      </el-button>
    </div>

    <el-alert
      v-if="!mockPayEnabled && !wechatOk && !alipayOk"
      type="warning"
      :closable="false"
      show-icon
      title="支付通道未配置。本地请设 PAY_PROVIDER=mock。"
    />

    <section
      v-if="!mockPayEnabled && selectedChannel && selectedChannel !== 'mock'"
      v-loading="payLoading"
      class="payment-action"
      :class="`is-${selectedChannel}`"
    >
      <div class="qr-panel">
        <img
          v-if="qrImageUrl"
          :src="qrImageUrl"
          class="qr-image"
          :alt="selectedChannel === 'wechat' ? '微信支付二维码' : '支付宝支付二维码'"
        >
        <div v-else class="qr-empty">
          <CircleAlert v-if="payError" :size="22" />
          <ScanLine v-else :size="26" />
          <span>{{ payError ? '二维码生成失败' : '二维码生成中…' }}</span>
        </div>
      </div>
      <div class="action-help">
        {{ selectedChannel === 'wechat' ? '微信扫一扫' : '支付宝扫一扫' }}
      </div>
      <div v-if="payError" class="inline-feedback is-error">
        <CircleAlert :size="15" />
        <span>{{ payError }}</span>
        <el-button link type="danger" :loading="payLoading" @click="$emit('retry')">重试</el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { CircleAlert, ScanLine } from 'lucide-vue-next';
import type { RechargeOrder } from '../../api/console';
import wechatIcon from '../../assets/images/wechat.ico';
import alipayIcon from '../../assets/images/zhifubao.ico';
import type { PayChannel } from './useRechargeDialog';

defineProps<{
  mockPayEnabled: boolean;
  wechatOk: boolean;
  alipayOk: boolean;
  payLoading: boolean;
  selectedChannel: PayChannel | '';
  qrImageUrl: string;
  payError: string;
  formattedDisplayAmount: string;
  createdOrder: RechargeOrder | null;
}>();

defineEmits<{
  (e: 'select-channel', channel: Exclude<PayChannel, 'mock'>): void;
  (e: 'retry'): void;
}>();
</script>

<style scoped>
.payment-step { display: grid; gap: 18px; }
.pay-hero {
  align-items: center;
  background: #f7f9fc;
  border: 1px solid #e1e7f0;
  display: flex;
  height: 88px;
  justify-content: space-between;
  padding: 14px 18px;
}
.mock-pay-hint {
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}
.pay-amount { display: grid; gap: 3px; }
.pay-amount > span { color: #64748b; font-size: 12px; font-weight: 700; }
.pay-amount > strong {
  color: #111827;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.035em;
  line-height: 1;
}
.pay-amount > strong small {
  color: var(--el-color-primary);
  font-size: 17px;
  margin-right: 3px;
}
.order-summary {
  border-left: 1px solid #dce3ed;
  display: grid;
  gap: 4px;
  max-width: 300px;
  padding-left: 18px;
  text-align: right;
}
.order-summary span { color: #94a3b8; font-size: 11px; font-weight: 700; }
.order-summary strong { color: #475569; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.order-summary .coins-line { color: #64748b; font-size: 12px; font-weight: 600; }
.channel-options {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.channel-button.el-button {
  align-items: center;
  background: #fff;
  border-color: #d8dee9;
  color: #334155;
  display: flex;
  height: 62px;
  justify-content: flex-start;
  margin-left: 0;
  padding: 0 14px;
  border-radius: 0;
}
.channel-button.el-button :deep(> span) {
  align-items: center;
  display: flex;
  width: 100%;
}
.channel-button.is-wechat:hover:not(:disabled),
.channel-button.is-wechat.is-active {
  background: #f0fbf5;
  border-color: #07c160;
  color: #057b40;
}
.channel-button.is-wechat.is-active { box-shadow: inset 0 0 0 1px #07c160; }
.channel-button.is-alipay:hover:not(:disabled),
.channel-button.is-alipay.is-active {
  background: #f0f7ff;
  border-color: #1677ff;
  color: #0e5dcc;
}
.channel-button.is-alipay.is-active { box-shadow: inset 0 0 0 1px #1677ff; }
.channel-brand-icon {
  display: block;
  flex: 0 0 22px;
  height: 22px;
  margin-right: 8px;
  object-fit: contain;
  width: 22px;
}
.channel-copy {
  display: grid;
  margin-left: 10px;
  text-align: left;
}
.channel-copy strong { color: currentColor; font-size: 14px; line-height: 1; }
.payment-action {
  align-content: start;
  background: #fff;
  border: 1px solid #e1e7f0;
  display: grid;
  gap: 10px;
  justify-items: center;
  padding: 16px 14px;
}
.payment-action.is-wechat { border-top: 2px solid #07c160; }
.payment-action.is-alipay { border-top: 2px solid #1677ff; }
.qr-panel {
  align-items: center;
  background: #fff;
  border: 1px solid #e1e7f0;
  display: flex;
  height: 188px;
  justify-content: center;
  width: 188px;
}
.qr-image { display: block; height: 180px; width: 180px; }
.qr-empty {
  align-items: center;
  color: #94a3b8;
  display: grid;
  font-size: 13px;
  gap: 8px;
  justify-items: center;
  padding: 20px;
  text-align: center;
}
.action-help { color: #7c899c; font-size: 11px; text-align: center; }
.footer-channel.el-button .channel-brand-icon {
  flex-basis: 20px;
  height: 20px;
  margin-right: 8px;
  width: 20px;
}
.inline-feedback {
  align-items: flex-start;
  display: flex;
  font-size: 11px;
  gap: 6px;
  line-height: 1.45;
  padding: 8px 9px;
}
.inline-feedback svg { flex: none; }
.inline-feedback.is-error { background: #fef2f2; color: #991b1b; }
.inline-feedback.is-error .el-button {
  flex: none;
  height: auto;
  margin-left: auto;
  padding: 0;
}
.channel-brand-icon {
  display: block;
  flex: 0 0 22px;
  height: 22px;
  margin-right: 8px;
  object-fit: contain;
  width: 22px;
}
.footer-channel.el-button .channel-brand-icon {
  flex-basis: 20px;
  height: 20px;
  margin-right: 8px;
  width: 20px;
}
</style>
