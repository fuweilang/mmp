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

/** Client preview of the save rules. The server repeats the enable check. */
export function skillFormIssues(input: SkillFormInput): Partial<Record<SkillField, string>> {
  const issues: Partial<Record<SkillField, string>> = {};
  if (!input.name.trim()) issues.name = '请填写名称';
  const needsInstruction = input.enable || input.enabled;
  const zipMode = input.replacingZip;
  if (zipMode && input.zipSelected && !input.zipReady) {
    issues.zip = input.zipError || '请先等技能包校验通过';
  }
  if (needsInstruction) {
    if (!input.summary.trim()) issues.summary = '请填写一句话介绍';
    if (zipMode) {
      const ready = input.zipReady || (input.editing && input.hasPackage && !input.zipSelected);
      if (!ready) issues.zip = issues.zip || '请上传并通过校验的技能包';
    } else if (!input.instruction.trim() && !input.hasPackage) {
      issues.instruction = '请填写技能指令';
    } else if (input.editing && input.hasPackage && !input.instruction.trim() && input.contentSource !== 'zip') {
      issues.instruction = '技能指令不能为空';
    }
  }
  return issues;
}

export function skillFormToast(issues: Partial<Record<SkillField, string>>) {
  return Object.values(issues).filter(Boolean).join('；');
}
