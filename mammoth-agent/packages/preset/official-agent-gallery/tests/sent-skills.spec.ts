import { describe, expect, it } from 'vitest'
import { officialGallerySentSkillsProjection } from '../src/projection.ts'
import { compositionHashOf } from '../src/task-composition.ts'

function skill(name: string, key: string, avatarUrl?: string | null) {
  return {
    sessionSource: { key, ...(avatarUrl === undefined ? {} : { avatarUrl }) },
    skill: { name },
  }
}

describe('sent skill projection', () => {
  it('keeps chip order, a legacy single skill, and the same state for an unrelated event', () => {
    const init = officialGallerySentSkillsProjection.init()
    const listed = officialGallerySentSkillsProjection.apply(init, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-1', skills: [skill('学院学习指南', 'academy'), skill('百炼模型推荐', 'bailian', 'https://example.test/b.png')] },
    })
    expect(listed.byRequest['req-1']).toEqual([
      { name: '学院学习指南', key: 'academy', icon: null },
      { name: '百炼模型推荐', key: 'bailian', icon: 'https://example.test/b.png' },
    ])
    expect(officialGallerySentSkillsProjection.wire.viewSchema.parse(officialGallerySentSkillsProjection.wire.view(listed))).toEqual(listed.byRequest)
    const again = officialGallerySentSkillsProjection.apply(listed, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-1', skills: [skill('学院学习指南', 'academy'), skill('百炼模型推荐', 'bailian', 'https://example.test/b.png')] },
    })
    expect(again).toBe(listed)
    const legacy = officialGallerySentSkillsProjection.apply(listed, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-2', skill: skill('学院学习指南', 'academy') },
    })
    expect(legacy.byRequest['req-2']).toEqual([{ name: '学院学习指南', key: 'academy', icon: null }])
    expect(officialGallerySentSkillsProjection.apply(legacy, { type: 'user/message', data: {} })).toBe(legacy)
    expect(officialGallerySentSkillsProjection.apply(legacy, { type: 'official-gallery/attempt', data: { requestId: 'req-3' } })).toBe(legacy)
    const placed = officialGallerySentSkillsProjection.apply(legacy, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-4', skills: [skill('学院学习指南', 'academy'), skill('品牌视觉规范', 'brand')], skillMarks: [0, 9] },
    })
    expect(placed.byRequest['req-4']).toEqual([
      { name: '学院学习指南', key: 'academy', icon: null, offset: 0 },
      { name: '品牌视觉规范', key: 'brand', icon: null, offset: 9 },
    ])
    const base = { expert: null, skill: null, skillHash: null, selectionHash: 's', authScope: { userId: 'u', scope: 't' } }
    expect(compositionHashOf(base)).toBe(compositionHashOf({ ...base, skillMarks: [0, 9] } as unknown as Parameters<typeof compositionHashOf>[0]))
  })
})
