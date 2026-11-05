import { Prisma } from '@prisma/client';

export const PAY_CHANNEL_WECHAT = 'wechat';
export const PAY_CHANNEL_ALIPAY = 'alipay';
export const PAY_CHANNEL_MOCK = 'mock';
export const PAY_CHANNELS = [PAY_CHANNEL_WECHAT, PAY_CHANNEL_ALIPAY] as const;
export type PayChannel = (typeof PAY_CHANNELS)[number];

export const RECHARGE_STATUS_PENDING = 'pending';
export const RECHARGE_STATUS_CONFIRMED = 'confirmed';
export const RECHARGE_STATUS_EXPIRED = 'expired';
export const RECHARGE_STATUS_FAILED = 'failed';
export const RECHARGE_STATUS_CANCELLED = 'cancelled';

export const CONFIRMED_BY_WECHAT = 'wechat_pay';
export const CONFIRMED_BY_ALIPAY = 'alipay';
export const CONFIRMED_BY_QUERY = 'pay_query';
export const CONFIRMED_BY_MOCK = 'mock_pay';

export const QR_EXPIRE_MINUTES = 30;
export const QUERY_MIN_INTERVAL_MS = 4000;
export const WALLET_RECHARGE_MAX_AMOUNT = new Prisma.Decimal('100000.00');
export const DEFAULT_PAY_NOTIFY_BASE_URL = 'http://127.0.0.1:5201';
export const CHANNEL_NOT_CONFIGURED_MESSAGE = '支付通道未配置，请联系平台';
export const CHANNEL_REQUEST_FAILED_MESSAGE = '支付通道请求失败，请稍后重试';
export const MOCK_PAY_DISABLED_MESSAGE = '支付模拟未开启（设置 PAY_PROVIDER=mock，且非 production）';

export function isMockPayEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  return String(process.env.PAY_PROVIDER || '').trim() === 'mock';
}
