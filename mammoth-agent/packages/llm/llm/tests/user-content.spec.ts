import { describe, expect, it } from 'vitest'
import { isLibrarySourceReference, librarySourceUrl, userContentText, userVisibleText } from '../src/user-content.ts'

const reference = { source: 'library', nodeId: 'node/a', versionId: 'version 1', name: 'Plan.md' } as const

describe('user-facing source content', () => {
  it('copies selected file identities and original text without the model excerpt', () => {
    const second = { ...reference, nodeId: 'other-node' }
    const content = [
      { type: 'text', text: 'PRIVATE EXCERPT', reference },
      { type: 'text', text: 'SECOND PRIVATE EXCERPT', reference: second },
      { type: 'text', text: 'Compare ' }, { type: 'text', text: 'these files.' },
    ]
    expect(userContentText(content)).toBe(
      '[Plan.md](/ground-library/nodes/node%2Fa/source?versionId=version%201)\n\n'
      + '[Plan.md](/ground-library/nodes/other-node/source?versionId=version%201)\n\nCompare these files.',
    )
    expect(content[0]?.text).toBe('PRIVATE EXCERPT')
    expect(librarySourceUrl(reference)).toBe('/ground-library/nodes/node%2Fa/source?versionId=version%201')
  })

  it('preserves legacy text and text with malformed or foreign metadata', () => {
    expect(userContentText([
      null, 4, { type: 'text', text: 'Original Library citation' },
      { type: 'text', text: '\nmalformed', reference: { ...reference, versionId: '' } },
      { type: 'text', text: '\nforeign', reference: { ...reference, source: 'other' } },
      { type: 'text', text: '\ninvalid size', reference: { ...reference, bytes: -1 } },
      { type: 'file', attachment: { name: 'ordinary.txt', bytes: 4 } },
    ])).toBe('Original Library citation\nmalformed\nforeign\ninvalid size')
    for (const value of [null, {}, { ...reference, name: '' }, { ...reference, versionNo: 0 }, { ...reference, bytes: NaN }]) {
      expect(isLibrarySourceReference(value)).toBe(false)
    }
    expect(isLibrarySourceReference({ ...reference, versionNo: 2, bytes: 0 })).toBe(true)
  })

  it('keeps the question and drops the enterprise-knowledge trailer', () => {
    const question = '泡泡玛特的商业模式你了解多少？'
    const stored = `${question}\n\n【企业知识库】当前权限范围内没有检索到相关资料。请告知用户未找到依据。`
    expect(userVisibleText(stored)).toBe(question)
    expect(userVisibleText('【企业知识库】 手写原文')).toBe('【企业知识库】 手写原文')
    expect(userContentText([{ type: 'text', text: stored }])).toBe(question)
  })

  it('escapes source names without changing ordinary user text', () => {
    expect(userContentText([{ type: 'text', text: 'PRIVATE', reference: { ...reference, name: 'a]\\b\n.md' } }]))
      .toBe('[a\\]\\\\b .md](/ground-library/nodes/node%2Fa/source?versionId=version%201)')
    expect(userContentText([{ type: 'text', text: '' }])).toBe('')
  })
})
