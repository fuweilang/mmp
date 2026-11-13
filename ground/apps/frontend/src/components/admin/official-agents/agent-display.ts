import type { TagProps } from 'element-plus';
import type { OfficialAgentCategory, OfficialAgentKind, OfficialAgentStatus } from '../../../api/admin';
import { formatAgentDateTime } from '../../../views/admin/official-agent-version-presentation';

export const CATEGORY_LABELS: Record<OfficialAgentCategory, string> = {
  common: '常用',
  productivity: '工作提效',
  content: '内容营销',
  sales: '销售增长',
  expertise: '专业知识',
  analytics: '数据分析',
};

export const TOOL_SCOPE_LABELS: Record<string, string> = {
  enterprise_knowledge: '企业资料 / 知识库',
  web_search: '联网检索',
  web_fetch: '网页阅读',
  tabular_analyze: '表格分析',
  delegate_official_agent: '团队协作',
  delegate: '团队协作',
};

export function kindLabel(kind: OfficialAgentKind) {
  return kind === 'KNOWLEDGE' ? '资料型' : '通用型';
}

export function categoryLabel(category: OfficialAgentCategory | null | undefined) {
  if (!category) return '未设置';
  return CATEGORY_LABELS[category] ?? category;
}

export function toolScopeLabel(tool: string) {
  return TOOL_SCOPE_LABELS[tool] ?? tool;
}

export function buildCapabilityLabels(toolScope: string[], stored: string[]) {
  const labels: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const text = label.trim();
    if (!text || seen.has(text) || labels.length >= 8) return;
    seen.add(text);
    labels.push(text);
  };
  for (const tool of [
    'enterprise_knowledge',
    'web_search',
    'web_fetch',
    'tabular_analyze',
    'delegate_official_agent',
    'delegate',
  ]) {
    if (toolScope.includes(tool)) push(toolScopeLabel(tool));
  }
  for (const label of stored) push(label);
  return labels;
}

export function statusLabel(status: OfficialAgentStatus) {
  const labels: Record<OfficialAgentStatus, string> = {
    DRAFT: '未发布',
    PUBLISHED: '已发布',
    OFFLINE: '已下架',
  };
  return labels[status];
}

export function statusType(status: OfficialAgentStatus): TagProps['type'] {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'OFFLINE') return 'info';
  return 'warning';
}

export function formatDate(value: string | null) {
  return formatAgentDateTime(value);
}

export function splitLines(value: string) {
  return [...new Set(value.split('\n').map((line) => line.trim()).filter(Boolean))];
}

/** 发布前必填校验（列表发布与编辑器发布共用）。 */
export function collectPublishMissing(source: {
  name: string;
  summary: string;
  expertRole: string;
  systemPrompt: string;
  toolScope: string[];
}): string[] {
  const missing: string[] = [];
  if (!source.name.trim()) missing.push('专家名称');
  if (!source.summary.trim()) missing.push('一句话介绍');
  if (!source.expertRole.trim()) missing.push('角色定位');
  if (!source.systemPrompt.trim()) missing.push('专家指令');
  const allowed = new Set([
    'enterprise_knowledge',
    'web_search',
    'web_fetch',
    'tabular_analyze',
    'delegate_official_agent',
    'delegate',
  ]);
  if (source.toolScope.some((tool) => tool && !allowed.has(tool))) {
    missing.push('可用工具（存在无效标识）');
  }
  return missing;
}
