import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import QRCode from 'qrcode';
import {
  billingApi,
  type PayChannels,
  type RechargeOrder,
} from '../../api/console';
import {
  FIXED_AMOUNTS,
  normalizeCustomAmountInput,
  formatAmountLabel,
  validateWalletAmount,
} from './rechargeAmount';

export type PayChannel = 'wechat' | 'alipay' | 'mock';

type EmitFn = {
  (e: 'update:modelValue', v: boolean): void;
  (e: 'success', order: RechargeOrder): void;
};

type Props = {
  modelValue: boolean;
  channels: PayChannels | null;
  presetOrder?: RechargeOrder | null;
};

const POLL_INTERVAL_MS = 3000;

export function useRechargeDialog(props: Props, emit: EmitFn) {
  const step = ref<'form' | 'pay'>('form');
  const payLoading = ref(false);
  const selectedAmount = ref('100');
  const customAmount = ref('');
  const usingCustomAmount = ref(false);
  const createdOrder = ref<RechargeOrder | null>(null);
  const selectedChannel = ref<PayChannel | ''>('');
  const qrImageUrl = ref('');
  const payError = ref('');
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollSeq = 0;
  let pollInFlightSeq = 0;
  let payRequestSeq = 0;
  let completingPaid = false;

  const mockPayEnabled = computed(() => Boolean(props.channels?.mockEnabled));
  const wechatOk = computed(() => Boolean(props.channels?.wechatConfigured));
  const alipayOk = computed(() => Boolean(props.channels?.alipayConfigured));

  const dialogVisible = computed({
    get: () => props.modelValue,
    set: (v: boolean) => {
      if (!v) cancelActivePaymentFlow();
      emit('update:modelValue', v);
    },
  });

  const dialogTitle = computed(() => (step.value === 'form' ? 'AI 币充值' : '扫码支付'));

  const displayAmount = computed(() => {
    if (createdOrder.value) return String(createdOrder.value.amountYuan);
    return usingCustomAmount.value ? customAmount.value : selectedAmount.value;
  });

  const formattedDisplayAmount = computed(() => {
    const value = Number(displayAmount.value);
    if (!Number.isFinite(value)) return String(displayAmount.value || '--');
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  watch(
    () => props.modelValue,
    (visible) => {
      if (!visible) {
        cancelActivePaymentFlow();
        return;
      }
      void resetDialog();
    },
  );

  function onVisiblePoll() {
    if (document.visibilityState !== 'visible' || !dialogVisible.value || !createdOrder.value) return;
    void pollStatus(pollSeq);
  }

  onMounted(() => {
    window.addEventListener('focus', onVisiblePoll);
    document.addEventListener('visibilitychange', onVisiblePoll);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('focus', onVisiblePoll);
    document.removeEventListener('visibilitychange', onVisiblePoll);
    void cancelPendingOrderOnClose();
    cancelActivePaymentFlow();
  });

  async function resetDialog() {
    await cancelPendingOrderOnClose();
    completingPaid = false;
    cancelActivePaymentFlow();
    step.value = 'form';
    payLoading.value = false;
    selectedAmount.value = '100';
    customAmount.value = '';
    usingCustomAmount.value = false;
    createdOrder.value = null;
    selectedChannel.value = '';
    qrImageUrl.value = '';
    payError.value = '';
  }

  function selectFixedAmount(amount: string) {
    selectedAmount.value = amount;
    customAmount.value = '';
    usingCustomAmount.value = false;
  }

  function handleCustomAmountInput(value: string) {
    const normalized = normalizeCustomAmountInput(value);
    customAmount.value = normalized;
    usingCustomAmount.value = Boolean(normalized);
    selectedAmount.value = usingCustomAmount.value ? normalized : '100';
  }



  function normalizeAmount() {
    return (usingCustomAmount.value ? customAmount.value : selectedAmount.value).trim().replace(/,/g, '');
  }


  async function ensureOrder() {
    if (createdOrder.value) return createdOrder.value;
    const amount = normalizeAmount();
    if (!validateWalletAmount(amount)) throw new Error('请输入合法充值金额');
    const order = await billingApi.createRecharge({
      amountYuan: Number(amount),
      idempotencyKey: `create-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    createdOrder.value = order;
    selectedAmount.value = String(order.amountYuan);
    return order;
  }

  async function startMockPay() {
    if (payLoading.value) return;
    payLoading.value = true;
    try {
      const order = await ensureOrder();
      step.value = 'pay';
      selectedChannel.value = 'mock';
      const res = await billingApi.payQr({ orderId: order.id, channel: 'mock' });
      createdOrder.value = res;
      if (res.status === 'confirmed') {
        completePaid();
        return;
      }
      ElMessage.warning('模拟支付未立即入账，请稍后刷新');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '模拟支付失败');
    } finally {
      payLoading.value = false;
    }
  }

  function startPayFromForm(channel: Exclude<PayChannel, 'mock'>) {
    if (payLoading.value) return;
    const amount = normalizeAmount();
    if (!validateWalletAmount(amount)) return;
    selectedAmount.value = amount;
    selectedChannel.value = channel;
    step.value = 'pay';
    void createChannelPayment(channel);
  }

  function goBackToForm() {
    cancelActivePaymentFlow();
    payLoading.value = false;
    selectedChannel.value = '';
    qrImageUrl.value = '';
    payError.value = '';
    createdOrder.value = null;
    step.value = 'form';
  }

  async function selectChannel(channel: Exclude<PayChannel, 'mock'>) {
    if (payLoading.value) return;
    if (selectedChannel.value === channel && !payError.value && qrImageUrl.value) return;
    cancelActivePaymentFlow();
    qrImageUrl.value = '';
    payError.value = '';
    selectedChannel.value = channel;
    // 渠道切换：重新下单避免串码
    createdOrder.value = null;
    await createChannelPayment(channel);
  }

  async function retryCurrentChannel() {
    if (!selectedChannel.value || selectedChannel.value === 'mock' || payLoading.value) return;
    cancelActivePaymentFlow();
    qrImageUrl.value = '';
    payError.value = '';
    await createChannelPayment(selectedChannel.value);
  }

  async function createChannelPayment(channel: Exclude<PayChannel, 'mock'>) {
    if (payLoading.value) return;
    const requestSeq = ++payRequestSeq;
    payLoading.value = true;
    try {
      const order = await ensureOrder();
      if (!isCurrentPayRequest(requestSeq, channel)) return;
      const result = await billingApi.payQr({ orderId: order.id, channel });
      if (!isCurrentPayRequest(requestSeq, channel)) return;
      createdOrder.value = result;
      if (result.status === 'confirmed') {
        completePaid();
        return;
      }
      startPolling();
      await preparePayQr(channel, result.codeUrl, requestSeq);
    } catch (error) {
      if (!isCurrentPayRequest(requestSeq, channel)) return;
      qrImageUrl.value = '';
      payError.value = error instanceof Error ? error.message : '发起支付失败，请稍后重试';
      stopPolling();
    } finally {
      if (requestSeq === payRequestSeq) payLoading.value = false;
    }
  }

  async function preparePayQr(channel: string, codeUrlValue: string | undefined, requestSeq: number) {
    const codeUrl = String(codeUrlValue || '').trim();
    if (!codeUrl) throw new Error(channel === 'wechat' ? '微信支付二维码生成失败' : '支付宝二维码生成失败');
    await renderQr(codeUrl);
    if (requestSeq !== payRequestSeq) return;
  }

  async function renderQr(codeUrl: string) {
    qrImageUrl.value = await QRCode.toDataURL(codeUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 188,
      color: { dark: '#111827', light: '#ffffff' },
    });
  }

  function isCurrentPayRequest(requestSeq: number, channel: string) {
    return (
      requestSeq === payRequestSeq &&
      dialogVisible.value &&
      step.value === 'pay' &&
      selectedChannel.value === channel
    );
  }

  async function cancelPendingOrderOnClose() {
    if (completingPaid) return;
    const order = createdOrder.value;
    if (!order || order.status !== 'pending') return;
    try {
      const latest = await billingApi.cancel(order.id);
      createdOrder.value = latest;
    } catch {
      /* ignore close-cancel failures */
    }
  }

  function cancelActivePaymentFlow() {
    payRequestSeq += 1;
    payLoading.value = false;
    stopPolling();
  }

  function completePaid() {
    const order = createdOrder.value;
    if (completingPaid || !order || !dialogVisible.value) return;
    completingPaid = true;
    stopPolling();
    ElMessage.success('支付成功，AI 币已入账');
    dialogVisible.value = false;
    emit('success', { ...order, status: 'confirmed' });
  }

  function startPolling() {
    stopPolling();
    const currentSeq = ++pollSeq;
    pollTimer = setInterval(() => {
      void pollStatus(currentSeq);
    }, POLL_INTERVAL_MS);
    void pollStatus(currentSeq);
  }

  function stopPolling() {
    pollSeq += 1;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollStatus(seq: number) {
    const order = createdOrder.value;
    if (!order || seq !== pollSeq || pollInFlightSeq === seq) return;
    pollInFlightSeq = seq;
    try {
      const status = await billingApi.status(order.id);
      if (seq !== pollSeq) return;
      createdOrder.value = status;
      if (status.status === 'confirmed') {
        completePaid();
        return;
      }
      if (status.status === 'failed' || status.status === 'expired') {
        stopPolling();
        payError.value = status.status === 'expired' ? '支付订单已过期，请返回重新创建' : '支付失败，请重试';
      }
    } catch {
      /* ignore */
    } finally {
      if (pollInFlightSeq === seq) pollInFlightSeq = 0;
    }
  }

  return {
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
    formatAmountLabel,
    startMockPay,
    startPayFromForm,
    goBackToForm,
    selectChannel,
    retryCurrentChannel,
  };
}

export type { Props as RechargeDialogProps };
