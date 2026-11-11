import { describe, expect, it } from 'vitest'
import { officialGalleryAnswerExpertProjection } from '../src/projection.ts'
import { MAMMOTH_AI_ANSWER } from '../src/types.ts'

const expert = {
  name: 'UI设计师',
  agentId: 'expert-ui',
  systemPrompt: 'ROLE',
  toolScope: ['web_search'],
}

describe('answer expert projection', () => {
  it('shows the expert claimed for that turn and keeps a later expert on its own turn', () => {
    const init = officialGalleryAnswerExpertProjection.init()
    const pending = officialGalleryAnswerExpertProjection.apply(init, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-1', expert },
    })
    expect(officialGalleryAnswerExpertProjection.wire.view(pending)).toEqual({})
    const first = officialGalleryAnswerExpertProjection.apply(pending, {
      type: 'official-gallery/attempt-start',
      data: { requestId: 'req-1', turn: 1 },
    })
    expect(officialGalleryAnswerExpertProjection.wire.viewSchema.parse(officialGalleryAnswerExpertProjection.wire.view(first))).toEqual({
      '1': { name: 'UI设计师', agentId: 'expert-ui' },
    })
    const same = officialGalleryAnswerExpertProjection.apply(first, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-1', expert },
    })
    expect(same).toBe(first)
    const switched = officialGalleryAnswerExpertProjection.apply(first, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-2', expert: { ...expert, name: '获客文案专家', agentId: 'expert-copy' } },
    })
    const second = officialGalleryAnswerExpertProjection.apply(switched, {
      type: 'official-gallery/attempt-start',
      data: { requestId: 'req-2', turn: 2 },
    })
    expect(officialGalleryAnswerExpertProjection.wire.view(second)).toEqual({
      '1': { name: 'UI设计师', agentId: 'expert-ui' },
      '2': { name: '获客文案专家', agentId: 'expert-copy' },
    })
    const unnamed = officialGalleryAnswerExpertProjection.apply(second, {
      type: 'official-gallery/attempt',
      data: { requestId: 'req-3', expert: null },
    })
    expect(officialGalleryAnswerExpertProjection.wire.view(unnamed)).toEqual({
      '1': { name: 'UI设计师', agentId: 'expert-ui' },
      '2': { name: '获客文案专家', agentId: 'expert-copy' },
    })
    const third = officialGalleryAnswerExpertProjection.apply(unnamed, {
      type: 'official-gallery/attempt-start',
      data: { requestId: 'req-3', turn: 3 },
    })
    expect(officialGalleryAnswerExpertProjection.wire.view(third)['3']).toEqual(MAMMOTH_AI_ANSWER)
    const signed = officialGalleryAnswerExpertProjection.apply(third, {
      type: 'official-gallery/answer-identity',
      data: { turn: 4 },
    })
    expect(officialGalleryAnswerExpertProjection.wire.view(signed)['4']).toEqual(MAMMOTH_AI_ANSWER)
    expect(officialGalleryAnswerExpertProjection.apply(signed, {
      type: 'official-gallery/answer-identity',
      data: { turn: 1 },
    })).toBe(signed)
    expect(officialGalleryAnswerExpertProjection.apply(signed, { type: 'user/message', data: {} })).toBe(signed)
  })
})
