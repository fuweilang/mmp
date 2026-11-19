import { expect, it } from 'vitest'
import { libraryTextHits } from '../src/ground-billing.ts'

it('keeps citable library text and drops image-only hits', () => {
  const hits = libraryTextHits({
    hits: [
      { nodeId: 'n2', versionId: 'v2', name: '说明.md', locator: 'paragraph:1', quote: '泡泡玛特', image: false },
      { nodeId: 'n1', versionId: 'v1', name: '小悟空.jpg', locator: 'image', quote: '', image: true },
      { nodeId: '../x', versionId: 'v3', name: '坏.md', locator: 'paragraph:1', quote: '不给链接' },
    ],
  })
  expect(hits).toEqual([
    {
      documentName: '说明.md',
      ordinal: 0,
      snippet: '泡泡玛特',
      locator: 'paragraph:1',
      source: '/ground-library/nodes/n2/source?versionId=v2&locator=paragraph%3A1',
    },
    {
      documentName: '坏.md',
      ordinal: 0,
      snippet: '不给链接',
      locator: 'paragraph:1',
      source: '',
    },
  ])
})
