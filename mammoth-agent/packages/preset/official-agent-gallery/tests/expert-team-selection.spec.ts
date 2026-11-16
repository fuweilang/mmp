import { expect, it } from 'vitest'
import { compositionHashOf, parseSelection } from '../src/task-composition.ts'

const one = { protocol: 1, selectionVersion: 1, expertRef: { id: 'lead', versionId: 'v1' }, skillRef: null, skillRefs: [] as const }

it('keeps a single expert on the old shape', () => {
  expect(parseSelection(one)).toEqual({ protocol: 1, selectionVersion: 1, expertRef: { id: 'lead', versionId: 'v1' }, skillRef: null, skillRefs: [] })
})

it('keeps the first expert as the lead and rejects a fourth or a duplicate', () => {
  const team = parseSelection({
    ...one,
    expertRefs: [{ id: 'lead', versionId: 'v1' }, { id: 'law', versionId: 'v2' }],
  })
  expect(team.expertRef).toEqual({ id: 'lead', versionId: 'v1' })
  expect(team.expertRefs).toHaveLength(2)
  expect(() => parseSelection({ ...one, expertRef: null, expertRefs: [{ id: 'a', versionId: '1' }, { id: 'b', versionId: '1' }, { id: 'c', versionId: '1' }, { id: 'd', versionId: '1' }] })).toThrow('TASK_SELECTION_TOO_MANY_EXPERTS')
  expect(() => parseSelection({ ...one, expertRefs: [{ id: 'lead', versionId: 'v1' }, { id: 'lead', versionId: 'v2' }] })).toThrow('TASK_SELECTION_DUPLICATE_EXPERT')
  expect(() => parseSelection({ ...one, expertRefs: [{ id: 'other', versionId: 'v1' }] })).toThrow('TASK_SELECTION_EXPERT_MISMATCH')
})

it('does not change a one-expert composition hash unless a team is stored', () => {
  const base = { expert: null, skill: null, skillHash: null, selectionHash: 's', authScope: { userId: 'u', scope: 's' } }
  expect(compositionHashOf(base)).toBe(compositionHashOf({ ...base }))
  expect(compositionHashOf({ ...base, experts: [{ agentId: 'law' }] as never })).not.toBe(compositionHashOf(base))
})
