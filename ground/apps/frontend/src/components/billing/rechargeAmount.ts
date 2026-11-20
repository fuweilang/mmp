import { ElMessage } from 'element-plus';

export const FIXED_AMOUNTS = ['100', '500', '2000', '5000', '10000'];
export const WALLET_RECHARGE_MAX = 100000;

export function normalizeCustomAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot < 0) return cleaned;
  const integerPart = cleaned.slice(0, firstDot).replace(/\./g, '');
  const decimalPart = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
  return `${integerPart}.${decimalPart}`;
}

export function formatAmountLabel(amount: string) {
  return Number(amount).toLocaleString('zh-CN');
}

export function validateWalletAmount(amount: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    ElMessage.warning('请输入大于 0 的充值金额，最多两位小数');
    return false;
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    ElMessage.warning('请输入大于 0 的充值金额');
    return false;
  }
  if (value > WALLET_RECHARGE_MAX) {
    ElMessage.warning('自定义充值金额不能超过 100000.00');
    return false;
  }
  return true;
}
