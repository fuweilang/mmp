export function rechargeStatusLabel(status: string) {
  if (status === 'pending') return '待支付';
  if (status === 'confirmed') return '已入账';
  if (status === 'expired') return '已过期';
  if (status === 'failed') return '失败';
  if (status === 'cancelled') return '已取消';
  return status || '—';
}

export function rechargeStatusTagType(status: string): 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'pending') return 'warning';
  if (status === 'confirmed') return 'success';
  if (status === 'expired') return 'info';
  if (status === 'failed') return 'danger';
  if (status === 'cancelled') return 'info';
  return 'info';
}

export function payChannelLabel(channel: string) {
  if (channel === 'wechat') return '微信';
  if (channel === 'alipay') return '支付宝';
  if (channel === 'mock') return '模拟';
  return channel || '—';
}

export function ledgerTypeLabel(type: string) {
  if (type === 'recharge' || type === 'qr_topup') return '充值';
  if (type === 'chat_consume') return '对话消耗';
  if (type === 'chat_freeze') return '预冻结';
  if (type === 'chat_unfreeze') return '解冻';
  if (type === 'manual_adjust') return '手动调账';
  if (type === 'signup_gift') return '开户赠送';
  return type || '—';
}

export function ledgerDirectionLabel(direction: string) {
  if (direction === 'in') return '入账';
  if (direction === 'out') return '出账';
  return direction || '—';
}
