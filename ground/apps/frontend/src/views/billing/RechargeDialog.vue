<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="560px"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    class="recharge-dialog"
    @closed="resetDialog"
  >
    <RechargeAmountStep
      v-if="step === 'form'"
      :enterprise-name="enterpriseName"
      :fixed-amounts="FIXED_AMOUNTS"
      :selected-amount="selectedAmount"
      :custom-amount="customAmount"
      :using-custom-amount="usingCustomAmount"
      @select-fixed="selectFixedAmount"
      @custom-input="handleCustomAmountInput"
    />

    <RechargePaymentStep
      v-else
      :mock-pay-enabled="mockPayEnabled"
      :wechat-ok="wechatOk"
      :alipay-ok="alipayOk"
      :pay-loading="payLoading"
      :selected-channel="selectedChannel"
      :qr-image-url="qrImageUrl"
      :pay-error="payError"
      :formatted-display-amount="formattedDisplayAmount"
      :created-order="createdOrder"
      @select-channel="selectChannel"
      @retry="retryCurrentChannel"
    />

    <template #footer>
      <template v-if="step === 'form'">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          v-if="mockPayEnabled"
          type="primary"
          :loading="payLoading"
          :disabled="payLoading"
          @click="startMockPay"
        >模拟支付</el-button>
        <template v-else>
          <el-button
            v-if="wechatOk"
            class="footer-channel is-wechat"
            :loading="payLoading"
            :disabled="payLoading"
            @click="startPayFromForm('wechat')"
          >
            <img :src="wechatIcon" alt="" class="channel-brand-icon">
            微信支付
          </el-button>
          <el-button
            v-if="alipayOk"
            class="footer-channel is-alipay"
            :loading="payLoading"
            :disabled="payLoading"
            @click="startPayFromForm('alipay')"
          >
            <img :src="alipayIcon" alt="" class="channel-brand-icon">
            支付宝
          </el-button>
        </template>
      </template>
      <template v-else>
        <el-button v-if="!mockPayEnabled" class="pay-back" :disabled="payLoading" @click="goBackToForm">
          上一步
        </el-button>
        <el-button class="pay-close" @click="dialogVisible = false">关闭</el-button>
        <el-button
          v-if="mockPayEnabled"
          type="primary"
          :loading="payLoading"
          :disabled="payLoading"
          @click="startMockPay"
        >模拟支付</el-button>
        <el-button
          v-else-if="payError && selectedChannel && selectedChannel !== 'mock'"
          type="primary"
          :loading="payLoading"
          @click="retryCurrentChannel"
        >重试</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PayChannels, RechargeOrder } from '../../api/console';
import { useAuthStore } from '../../stores/auth';
import wechatIcon from '../../assets/images/wechat.ico';
import alipayIcon from '../../assets/images/zhifubao.ico';
import { useRechargeDialog } from './useRechargeDialog';
import RechargeAmountStep from './RechargeAmountStep.vue';
import RechargePaymentStep from './RechargePaymentStep.vue';

const auth = useAuthStore();
const enterpriseName = computed(() => auth.session?.currentTenant?.name || '—');

const props = withDefaults(defineProps<{
  modelValue: boolean;
  channels: PayChannels | null;
  presetOrder?: RechargeOrder | null;
}>(), {
  presetOrder: null,
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'success', order: RechargeOrder): void;
}>();

const {
  FIXED_AMOUNTS,
  mockPayEnabled,
  wechatOk,
  alipayOk,
  step,
  payLoading,
  selectedAmount,
  customAmount,
  usingCustomAmount,
  createdOrder,
  selectedChannel,
  qrImageUrl,
  payError,
  dialogTitle,
  formattedDisplayAmount,
  dialogVisible,
  resetDialog,
  selectFixedAmount,
  handleCustomAmountInput,
  startMockPay,
  startPayFromForm,
  goBackToForm,
  selectChannel,
  retryCurrentChannel,
} = useRechargeDialog(props, emit);
</script>

<style scoped>
.channel-brand-icon {
  display: block;
  flex: 0 0 22px;
  height: 22px;
  margin-right: 8px;
  object-fit: contain;
  width: 22px;
}
.footer-channel.el-button {
  align-items: center;
  background: #fff;
  font-weight: 700;
  height: 36px;
  padding: 0 14px;
  border-radius: 0;
}
.footer-channel.el-button .channel-brand-icon {
  flex-basis: 20px;
  height: 20px;
  margin-right: 8px;
  width: 20px;
}
.footer-channel.is-wechat { border-color: #07c160; color: #07c160; }
.footer-channel.is-wechat:hover:not(:disabled) { background: #f0fbf5; }
.footer-channel.is-alipay { border-color: #1677ff; color: #1677ff; }
.footer-channel.is-alipay:hover:not(:disabled) { background: #f0f7ff; }
.pay-back.el-button { color: #667085; border-color: #d8dee9; border-radius: 0; }
.pay-close.el-button {
  background: #333946;
  border-color: #333946;
  color: #fff;
  border-radius: 0;
}
.pay-close.el-button:hover {
  background: #1f2430;
  border-color: #1f2430;
  color: #fff;
}

.footer-channel :deep(.channel-brand-icon),
.channel-brand-icon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
  vertical-align: middle;
}
</style>

<style>
.recharge-dialog.el-dialog {
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.14);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  max-width: calc(100vw - 24px);
  border-radius: 0;
}
.recharge-dialog.el-dialog .el-dialog__header {
  border-bottom: 1px solid #e5eaf3;
  box-shadow: inset 3px 0 0 var(--el-color-primary);
  margin-right: 0;
  padding: 16px 20px 14px;
}
.recharge-dialog.el-dialog .el-dialog__title {
  color: #111827;
  font-size: 16px;
  font-weight: 800;
}
.recharge-dialog.el-dialog .el-dialog__body {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 18px 20px 8px;
}
.recharge-dialog.el-dialog .el-dialog__footer {
  border-top: 1px solid #eef2f7;
  padding: 12px 20px 16px;
}
</style>

