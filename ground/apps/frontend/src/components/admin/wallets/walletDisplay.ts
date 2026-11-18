import type { AdminWalletRow } from '@/api/admin';

export function enterpriseOptionLabel(item: AdminWalletRow) {
  return item.tenantName;
}

export const ledgerTypeOptions = [
  { value: 'recharge', label: '充值', color: '#4A53A3' },
  { value: 'chat_consume', label: '对话消耗', color: '#B42318' },
  { value: 'chat_freeze', label: '预冻结', color: '#B54708' },
  { value: 'chat_unfreeze', label: '解冻', color: '#0E9384' },
  { value: 'signup_gift', label: '开户赠送', color: '#067647' },
  { value: 'manual_adjust', label: '调账', color: '#6941C6' },
] as const;

const ledgerTypeColorByValue: Record<string, string> = {
  qr_topup: '#4A53A3',
  ...Object.fromEntries(ledgerTypeOptions.map((item) => [item.value, item.color])),
};

export function ledgerTypeLabel(type: string) {
  if (type === 'qr_topup') return '充值';
  return ledgerTypeOptions.find((item) => item.value === type)?.label || type || '—';
}

export function ledgerTypeColor(type: string) {
  return ledgerTypeColorByValue[type] || '#333946';
}

export function formatDelta(n: number) {
  const text = Math.abs(n).toLocaleString('zh-CN');
  if (n > 0) return `+${text}`;
  if (n < 0) return `-${text}`;
  return '0';
}

export function ledgerMetaText(row: {
  type?: string;
  model?: string | null;
  provider?: string | null;
  tokens?: number | null;
  orderNo?: string | null;
  channel?: string | null;
  tokensPerAiCoin?: number | null;
}) {
  const type = row.type || '';
  if (type === 'chat_consume') {
    const parts: string[] = [];
    if (row.model) parts.push(row.model);
    else if (row.provider) parts.push(row.provider);
    if (row.tokens != null) parts.push(`${Number(row.tokens).toLocaleString('zh-CN')} tokens`);
    return parts.length ? parts.join(' · ') : '—';
  }
  if (type === 'recharge' || type === 'qr_topup') {
    const parts: string[] = [];
    if (row.orderNo) parts.push(row.orderNo);
    if (row.channel) parts.push(channelLabel(row.channel));
    return parts.length ? parts.join(' · ') : '—';
  }
  return '—';
}

function channelLabel(channel: string) {
  if (channel === 'wechat') return '微信';
  if (channel === 'alipay') return '支付宝';
  if (channel === 'mock') return '模拟';
  return channel;
}

export function ledgerDetailText(row: {
  type?: string;
  model?: string | null;
  provider?: string | null;
  tokens?: number | null;
  orderNo?: string | null;
  channel?: string | null;
  tokensPerAiCoin?: number | null;
  amountYuan?: string | number | null;
  actorName?: string | null;
  remark?: string | null;
}) {
  const parts: string[] = [];
  const meta = ledgerMetaText(row);
  if (meta !== '—') parts.push(meta);
  if (row.amountYuan != null && row.amountYuan !== '') parts.push(`¥${row.amountYuan}`);
  if (row.actorName) parts.push(row.actorName);
  if (row.remark) parts.push(row.remark);
  return parts.length ? parts.join(' · ') : '—';
}
