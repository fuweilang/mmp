import { ConflictException } from '@nestjs/common';
import { slugSkillKey } from './skill-package';

export type SkillEnableGap = 'name' | 'summary' | 'instruction';

const GAP_LABEL: Record<SkillEnableGap, string> = {
  name: '名称',
  summary: '一句话介绍',
  instruction: '技能指令',
};

/** What still blocks enabling. Category, image and discovery are intentionally absent. */
export function skillEnableGaps(input: {
  name: string;
  summary: string;
  instruction: string;
  hasPackage: boolean;
}): SkillEnableGap[] {
  const gaps: SkillEnableGap[] = [];
  if (!String(input.name || '').trim()) gaps.push('name');
  if (!String(input.summary || '').trim()) gaps.push('summary');
  if (!input.hasPackage || !String(input.instruction || '').trim()) gaps.push('instruction');
  return gaps;
}

export function skillEnableMessage(gaps: SkillEnableGap[], action: 'enable' | 'save' = 'enable') {
  const text = gaps.map((gap) => GAP_LABEL[gap]).join('、');
  return action === 'enable' ? `启用失败：缺少${text}` : `保存失败：已启用技能仍需${text}`;
}

/** Ordered key attempts. The first free one is stored; callers supply entropy. */
export function candidateSkillKeys(seed: string, entropy: readonly string[]) {
  const base = slugSkillKey(seed) || 'skill';
  const keys = [base];
  for (const item of entropy) {
    const suffix = String(item || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    if (!suffix) continue;
    const key = `${base}-${suffix}`.replace(/-+/g, '-').slice(0, 64);
    if (/^[a-z][a-z0-9-]{1,63}$/.test(key) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Reject a stale editor. Missing expected stamp means the caller is not claiming a version. */
export function assertFreshStamp(currentIso: string, expectedIso?: string | null) {
  if (!expectedIso) return;
  if (currentIso !== expectedIso) {
    throw new ConflictException('技能已更新，请重新打开后保存');
  }
}

/**
 * Allocate the next package revision only after the row is locked and the stamp matches.
 * A mismatch throws before any directory is created.
 */
export function packageWriteClaim(
  locked: { updatedAt: string; revision: number },
  expectedUpdatedAt?: string | null,
) {
  assertFreshStamp(locked.updatedAt, expectedUpdatedAt);
  return { revision: locked.revision + 1 };
}

/** Decide a ZIP replace before any package bytes are stored. */
export function zipReplaceDecision(currentKey: string, parsed: { key: string; keyDerived: boolean }) {
  if (parsed.keyDerived || parsed.key === currentKey) return { ok: true as const, key: currentKey };
  return { ok: false as const, message: '技能包标识与当前技能不一致，原技能未替换' };
}
