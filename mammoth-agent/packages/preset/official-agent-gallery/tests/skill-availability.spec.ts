import { describe, expect, it } from 'vitest'
import { skillStepAccess, skillTagLabel } from '../src/skill-availability.ts'

describe('deleted skill execution', () => {
  it('keeps a frozen attempt on its snapshot and blocks a later execution', () => {
    expect(skillStepAccess(true)).toBe('snapshot')
    expect(skillStepAccess(false)).toBe('reselect')
  })

  it('marks a historical tag without dropping the name', () => {
    expect(skillTagLabel('简报整理', true)).toBe('简报整理 已删除')
    expect(skillTagLabel('简报整理', false)).toBe('简报整理')
  })
})
