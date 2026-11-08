import { describe, expect, it } from 'vitest'
import { fetchLibraryItems, fetchLibrarySource, libraryItemsUrl, readLibraryItems } from '../src/client/api.ts'
import {
  addLibraryChip, choiceBlock, libraryRef, librarySourceText, parseLibraryRef, stageLocalFile,
} from '../src/client/selection.ts'
import { createChipStore } from '../src/client/store.ts'

const ready = {
  nodeId: 'node-1', versionId: 'ver-1', versionNo: 2, name: '制度.md', kind: 'FILE' as const,
  parseStatus: 'READY', parseReason: null,
}

describe('library selection', () => {
  it('keeps chips waiting and ignores files that are not ready', () => {
    const first = addLibraryChip([], ready)
    expect(first.sent).toBe(false)
    expect(first.chips).toEqual([{ nodeId: 'node-1', versionId: 'ver-1', versionNo: 2, name: '制度.md' }])
    const again = addLibraryChip(first.chips, ready)
    expect(again.chips).toHaveLength(1)
    const zip = { ...ready, versionId: 'ver-z', name: '包.zip', parseStatus: 'DOWNLOAD_ONLY', parseReason: '仅下载' }
    expect(choiceBlock(zip).disabled).toBe(true)
    expect(addLibraryChip(first.chips, zip).chips).toHaveLength(1)
    expect(stageLocalFile('本地.docx').persisted).toBe(false)
    expect(choiceBlock({ ...ready, kind: 'FOLDER' }).reason).toBe('not-file')
    expect(choiceBlock({ ...ready, parseStatus: null, parseReason: null, versionId: null, versionNo: null }).reason).toBe('unavailable')
    expect(choiceBlock({ ...ready, parseStatus: 'FAILED', parseReason: null, versionId: 'ver-1', versionNo: null }).reason).toBe('FAILED')
    expect(choiceBlock({ ...ready, versionNo: null }).reason).toBe('READY')
    expect(choiceBlock({ ...ready, versionId: null, parseStatus: 'READY' }).disabled).toBe(true)
  })

  it('serializes only a server-returned version', () => {
    expect(parseLibraryRef(libraryRef({ nodeId: 'node-1', versionId: 'ver-1' }))).toEqual({ nodeId: 'node-1', versionId: 'ver-1' })
    expect(parseLibraryRef('nope')).toBeNull()
    const text = librarySourceText({ name: '制度.md', versionId: 'ver-1', locator: 'paragraph:1', quote: '第一段' })
    expect(text).toContain('ver-1')
    expect(text).toContain('第一段')
    expect(text).toContain('<untrusted-library-data>')
  })

  it('lists without a tenant query and rejects a swapped version', async () => {
    expect(libraryItemsUrl('http://ground.test/', 'mine', '制度')).toBe('http://ground.test/api/library/items?view=mine&q=%E5%88%B6%E5%BA%A6')
    expect(libraryItemsUrl('http://ground.test', 'shared', '').includes('tenant')).toBe(false)
    const listed = await fetchLibraryItems('http://ground.test', 'mine', '', async (url) => {
      expect(url).not.toContain('tenant')
      return Response.json({ items: [{ id: 'node-1', name: '制度.md', kind: 'FILE', currentVersion: { id: 'ver-1', versionNo: 2, parseStatus: 'READY', parseReason: null } }] })
    })
    expect(readLibraryItems({ items: [] })).toEqual([])
    expect(listed[0]?.versionId).toBe('ver-1')
    await fetchLibraryItems('http://ground.test', 'trash', '', async () => Response.json({ items: [] }))
    await expect(fetchLibraryItems('http://ground.test', 'recent', '', async () => new Response('no', { status: 503 }))).rejects.toThrow(/503/)
    expect(readLibraryItems(null)).toEqual([])
    expect(readLibraryItems(1)).toEqual([])
    expect(readLibraryItems({ items: 'nope' })).toEqual([])
    expect(readLibraryItems({ items: [{ name: '缺', kind: 'FILE' }, { id: 'n', kind: 'FILE' }, { id: 'f', name: '目录', kind: 'FOLDER' }] })).toEqual([
      expect.objectContaining({ nodeId: 'f', versionId: null, parseStatus: null }),
    ])
    expect(readLibraryItems({ items: [{ id: 'x', name: 'x', kind: 'OTHER' }] })).toEqual([])
    await expect(fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => new Response('no', { status: 404 }))).rejects.toThrow(/404/)
    const opened = await fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({
      name: '制度.md', versionId: 'ver-1', locator: 'paragraph:1', quote: '正文',
    }))
    expect(opened.quote).toBe('正文')
    const openedWithoutSignal = await fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({
      name: '制度.md', versionId: 'ver-1',
    }))
    expect(openedWithoutSignal.locator).toBeNull()
    await expect(fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({
      name: '制度.md', versionId: 'other', locator: 'paragraph:1', quote: '正文',
    }))).rejects.toThrow(/different version/)
  })

  it('stores a chip without a sent flag other than false', () => {
    const store = createChipStore()
    expect(store.get('absent')).toEqual([])
    expect(store.add('s1', ready)).toEqual({ sent: false })
    expect(store.get('s1')).toHaveLength(1)
    store.remove('s1', 'ver-1')
    expect(store.get('s1')).toEqual([])
    const seen: number[] = []
    const stop = store.subscribe(() => { seen.push(store.get('s1').length) })
    store.add('s1', { ...ready, versionId: 'ver-2', name: '第二.md' })
    store.remove('missing', 'ver-2')
    store.remove('s1', 'ver-2')
    stop()
    expect(seen.length).toBeGreaterThan(0)
  })
})
