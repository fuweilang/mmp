export type SkillField = 'name' | 'summary' | 'instruction' | 'zip';

export type SkillFormInput = {
  name: string;
  summary: string;
  instruction: string;
  mode: 'form' | 'zip';
  replacingZip: boolean;
  editing: boolean;
  enabled: boolean;
  enable: boolean;
  hasPackage: boolean;
  zipSelected: boolean;
  zipReady: boolean;
  zipError: string;
  contentSource: 'zip' | 'form' | 'none';
};

/**
 * Errors that must stop the write.
 * 「保存并启用」缺介绍或指令时不在这里拦截：先存草稿，再由启用接口拒绝并保持停用。
 * 已启用技能仍须在写入前保持完整，避免把线上配置改成残缺。
 */
export function skillFormIssues(input: SkillFormInput): Partial<Record<SkillField, string>> {
  const issues: Partial<Record<SkillField, string>> = {};
  if (!input.name.trim()) issues.name = '请填写名称';
  if (input.replacingZip && input.zipSelected && !input.zipReady) {
    issues.zip = input.zipError || '请先等技能包校验通过';
  }
  if (!input.enabled) return issues;
  if (!input.summary.trim()) issues.summary = '请填写一句话介绍';
  if (input.replacingZip) {
    const ready = input.zipReady || (input.hasPackage && !input.zipSelected);
    if (!ready) issues.zip = issues.zip || '请上传并通过校验的技能包';
  } else if (!input.instruction.trim() && !input.hasPackage) {
    issues.instruction = '请填写技能指令';
  } else if (input.hasPackage && !input.instruction.trim() && input.contentSource !== 'zip') {
    issues.instruction = '技能指令不能为空';
  }
  return issues;
}

/** While enabling, do not replace stored intro or instructions with blanks. */
export function keepStoredExecution(input: {
  enable: boolean;
  summary: string;
  instruction: string;
  previousSummary: string;
  previousInstruction: string;
  hasPackage: boolean;
}): { summary: string | undefined; instruction: string | undefined } {
  if (!input.enable) return { summary: input.summary, instruction: input.instruction };
  return {
    summary: !input.summary.trim() && input.previousSummary.trim() ? undefined : input.summary,
    instruction:
      !input.instruction.trim() && (input.previousInstruction.trim() || input.hasPackage)
        ? undefined
        : input.instruction,
  };
}

export function skillFormToast(issues: Partial<Record<SkillField, string>>) {
  return Object.values(issues).filter(Boolean).join('；');
}

export function clampPage(current: number, pageSize: number, total: number) {
  const size = Math.max(1, pageSize);
  const last = Math.max(1, Math.ceil(Math.max(0, total) / size));
  return Math.min(Math.max(1, current), last);
}

export function skillDeleteConfirm(input: { name: string }) {
  const name = input.name.trim() || '未命名技能';
  return {
    title: '删除技能',
    message: `确定删除技能「${name}」？删除后不可再选用，已有对话和任务记录不受影响。`,
    confirm: '删除',
    cancel: '取消',
  };
}

/** Cancel, close, or an in-flight request must not call the API again. */
export function skillDeleteRequest(input: { confirmed: boolean; inFlight: boolean }) {
  if (!input.confirmed || input.inFlight) return 'skip' as const;
  return 'call' as const;
}
