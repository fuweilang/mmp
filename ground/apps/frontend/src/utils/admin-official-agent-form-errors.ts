/** Summarize Element Plus form invalidFields into one Chinese toast line. */

export const EDITOR_FIELD_LABELS: Record<string, string> = {
  name: '专家名称',
  key: '标识',
  summary: '一句话介绍',
  expertRole: '角色定位',
  systemPrompt: '专家指令',
  kind: '类型',
  category: '分类',
  capabilitiesText: '能力标签',
  toolScope: '可用工具',
  linkedSkillIds: '关联技能',
  openingQuestionsText: '推荐提问',
};

export type FormInvalidFields = Record<
  string,
  Array<{ message?: string; field?: string }> | undefined
>;

export function summarizeInvalidFields(invalidFields: FormInvalidFields | false | null | undefined): {
  lines: string[];
  firstProp: string | null;
} {
  if (!invalidFields || typeof invalidFields !== 'object') {
    return { lines: ['请检查表单填写'], firstProp: null };
  }
  const lines: string[] = [];
  let firstProp: string | null = null;
  for (const [prop, items] of Object.entries(invalidFields)) {
    if (!items?.length) continue;
    if (!firstProp) firstProp = prop;
    const label = EDITOR_FIELD_LABELS[prop] ?? prop;
    const reasons = [
      ...new Set(
        items
          .map((item) => (typeof item?.message === 'string' ? item.message.trim() : ''))
          .filter(Boolean),
      ),
    ];
    const reason = reasons[0] || '填写有误';
    // Avoid "专家名称：请输入专家名称" duplication when message already names the field.
    const line = reason.includes(label) ? reason : `${label}：${reason}`;
    if (!lines.includes(line)) lines.push(line);
  }
  return { lines: lines.length ? lines : ['请检查表单填写'], firstProp };
}

export function formatValidationToast(lines: string[]): string {
  const unique = [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
  if (!unique.length) return '请检查表单填写';
  if (unique.length === 1) return unique[0]!;
  return `请完善以下内容：${unique.join('；')}`;
}

export function formatPublishMissingToast(missing: string[]): string {
  const unique = [...new Set(missing.map((item) => item.trim()).filter(Boolean))];
  if (!unique.length) return '发布前请完善必填项';
  return `发布前请完善：${unique.join('、')}`;
}
