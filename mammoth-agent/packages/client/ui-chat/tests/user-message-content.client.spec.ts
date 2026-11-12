import { describe, expect, it } from 'vitest'
import { userMessageContent } from '../src/client/chat/user-message-content.ts'

const reference = { source: 'library', nodeId: 'first', versionId: 'v1', name: 'Same.md' } as const

describe('prepared user content', () => {
  it('separates saved library cards from text without mutating logged excerpts', () => {
    const source = { type: 'text', text: 'PRIVATE MODEL EXCERPT', reference }
    const second = { ...reference, nodeId: 'second' }
    const result = userMessageContent([
      source, { type: 'text', text: 'SECOND PRIVATE', reference: second },
      { type: 'text', text: 'Read ' }, { type: 'text', text: 'both.' },
    ])
    expect(result).toEqual({ text: 'Read both.', attachments: [
      { type: 'library', reference }, { type: 'library', reference: second },
    ], extraBlocks: [] })
    expect(source.text).toBe('PRIVATE MODEL EXCERPT')
  })

  it('hides the enterprise-knowledge trailer from the bubble', () => {
    const question = '泡泡玛特的商业模式你了解多少？'
    const result = userMessageContent([{
      type: 'text',
      text: `${question}\n\n【企业知识库】当前权限范围内没有检索到相关资料。请告知用户未找到依据。`,
    }])
    expect(result.text).toBe(question)
  })

  it('retains malformed/foreign source text and unknown blocks with ordinary attachment order', () => {
    const file = { attachmentId: 'file-id', name: 'ordinary.txt', bytes: 2 }
    const image = { attachmentId: 'image-id', mediaType: 'image/png', width: 1, height: 1, bytes: 1 }
    const result = userMessageContent([
      null, { type: 'text', text: 'Malformed', reference: { ...reference, versionId: '' } },
      { type: 'image', attachment: image }, { type: 'file', attachment: file },
      { type: 'text', text: ' foreign', reference: { ...reference, source: 'other' } },
      { type: 'future' },
    ])
    expect(result).toEqual({ text: 'Malformed foreign', attachments: [
      { type: 'image', image: { attachment: image } }, { type: 'file', file },
    ], extraBlocks: [null, { type: 'future' }] })
  })
})
