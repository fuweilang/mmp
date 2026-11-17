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

export type SkillDeletePlan = {
  allowed: true;
  /** Drop the row from the admin list and from new catalog/session entry points. */
  hideFromAdminList: true;
  hideFromNewUse: true;
  /** Packages, expert links and pinned historical reads stay. */
  retainPackages: true;
  retainAgentLinks: true;
  retainUserHistory: true;
};

/** Enabled skills and expert links are not blockers. Deletion never cascades user history. */
export function planSkillDelete(_input: { enabled: boolean; linkedAgentCount: number } = { enabled: false, linkedAgentCount: 0 }): SkillDeletePlan {
  return {
    allowed: true,
    hideFromAdminList: true,
    hideFromNewUse: true,
    retainPackages: true,
    retainAgentLinks: true,
    retainUserHistory: true,
  };
}

export function skillDeletePatch(now: Date) {
  return { deletedAt: now, enabledAt: null as null };
}

export function skillVisibleInAdmin(row: { deletedAt: Date | string | null }) {
  return row.deletedAt == null;
}

export function skillOfferedForNewUse(row: { deletedAt: Date | string | null; enabledAt: Date | string | null; revision: number }) {
  return skillVisibleInAdmin(row) && row.enabledAt != null && row.revision > 0;
}

/** A pinned package revision stays readable after the skill leaves the catalog. */
export function skillHistoryReadable(revision: number | undefined) {
  return revision !== undefined;
}

export const SKILL_DELETED_MESSAGE = '技能已删除，请重新选择';

/** New session or a later execution. A pinned revision is not enough to start again. */
export function skillStartDecision(input: { deleted: boolean; enabled: boolean; revision: number }) {
  if (input.deleted) {
    return { ok: false as const, code: 'OFFICIAL_SKILL_DELETED', message: SKILL_DELETED_MESSAGE };
  }
  if (!input.enabled || input.revision < 1) {
    return { ok: false as const, code: 'OFFICIAL_CONTENT_DISABLED', message: '该技能暂不可用' };
  }
  return { ok: true as const };
}

/**
 * Content and resource reads.
 * A revision keeps an in-flight or historical snapshot working after delete.
 * A read without a revision is a new use and is rejected.
 */
export function skillReadDecision(input: { deleted: boolean; enabled: boolean; pinnedRevision: number | undefined }) {
  if (input.pinnedRevision !== undefined) return { ok: true as const, snapshot: true };
  if (input.deleted) {
    return { ok: false as const, code: 'OFFICIAL_SKILL_DELETED', message: SKILL_DELETED_MESSAGE };
  }
  if (!input.enabled) {
    return { ok: false as const, code: 'OFFICIAL_CONTENT_DISABLED', message: '该技能暂不可用' };
  }
  return { ok: true as const, snapshot: false };
}

/** Deleted rows stay deleted. Disable can be enabled again; delete cannot. */
export function skillCanRevive(deleted: boolean) {
  return !deleted;
}

/** Decide a ZIP replace before any package bytes are stored. */
export function zipReplaceDecision(currentKey: string, parsed: { key: string; keyDerived: boolean }) {
  if (parsed.keyDerived || parsed.key === currentKey) return { ok: true as const, key: currentKey };
  return { ok: false as const, message: '技能包标识与当前技能不一致，原技能未替换' };
}
