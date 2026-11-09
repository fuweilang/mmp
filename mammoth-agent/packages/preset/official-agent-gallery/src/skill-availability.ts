/** How one already-open skill task may use its binding on the next step. */
export type SkillStepAccess = 'snapshot' | 'reselect'

/**
 * A turn that already froze a skill attempt keeps reading that revision.
 * Any later execution has to ask Ground again and can be told the skill was deleted.
 */
export function skillStepAccess(hasFrozenAttempt: boolean): SkillStepAccess {
  return hasFrozenAttempt ? 'snapshot' : 'reselect'
}

export function skillTagLabel(name: string, deleted: boolean) {
  return deleted ? `${name} 已删除` : name
}
