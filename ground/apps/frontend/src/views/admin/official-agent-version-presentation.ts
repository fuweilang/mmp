/**
 * Admin 官方智能体列表/详情时间展示。
 * 仅格式化创建/更新时间（含秒），不含对外版本文案。
 */

/** 无效输入返回 —；有效 Date 用 zh-CN 本地时区（本机 Asia/Shanghai）格式化为到秒。 */
export function formatAgentDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** 列表摘要：创建 + 更新；缺省字段显示 —。 */
export function formatAgentTimeSummary(input: {
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}): { createdAt: string; updatedAt: string } {
  return {
    createdAt: formatAgentDateTime(input.createdAt),
    updatedAt: formatAgentDateTime(input.updatedAt),
  };
}
