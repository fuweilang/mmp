import type { AdminWalletRow } from '@/api/admin';

export function enterpriseOptionLabel(item: AdminWalletRow) {
  return item.tenantSlug ? `${item.tenantName}（${item.tenantSlug}）` : item.tenantName;
}

export function enterpriseColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 62% 48%)`;
}

export function ledgerTypeLabel(type: string) {
  if (type === 'recharge' || type === 'qr_topup') return '充值';
  if (type === 'chat_consume') return '对话消耗';
  if (type === 'chat_freeze') return '预冻结';
  if (type === 'chat_unfreeze') return '解冻';
  if (type === 'manual_adjust') return '调账';
  if (type === 'signup_gift') return '开户赠送';
  return type || '—';
}

export function formatDelta(n: number) {
  if (n > 0) return `+${n}`;
  return String(n);
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
    if (row.tokensPerAiCoin != null) parts.push(`N=${row.tokensPerAiCoin}`);
    return parts.length ? parts.join(' · ') : '—';
  }
  if (type === 'recharge' || type === 'qr_topup') {
    const parts: string[] = [];
    if (row.orderNo) parts.push(row.orderNo);
    if (row.channel) parts.push(row.channel);
    return parts.length ? parts.join(' · ') : '—';
  }
  return '—';
}
