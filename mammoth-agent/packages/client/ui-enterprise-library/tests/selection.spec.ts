import { describe, expect, it } from 'vitest'
import { fetchLibraryItems, fetchLibrarySource, LibraryRequestError, libraryItemsUrl, readLibraryItems } from '../src/client/api.ts'
import {
  addLibraryChip, choiceBlock, libraryRef, librarySourceText, parseLibraryRef, stageLocalFile,
} from '../src/client/selection.ts'
import { attachLibraryReference, libraryReference } from '../src/client/selection.ts'

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
    expect(text).toContain('untrusted source data')
    expect(text).not.toContain('truncated')
    const truncated = librarySourceText({
      name: '制度.md', versionId: 'ver-1', locator: 'paragraph:1', quote: '第一段',
      truncated: true, truncationNote: '仅使用部分摘录，未读取全文。',
    })
    expect(truncated).toContain('only a partial excerpt was read')
    expect(truncated).toContain('仅使用部分摘录，未读取全文。')
    expect(truncated).toContain('"truncated":true')
  })

  it('lists without a tenant query and rejects a swapped version', async () => {
    expect(libraryItemsUrl('http://ground.test/', 'mine', '制度')).toBe('http://ground.test/ground-library/items?view=mine&q=%E5%88%B6%E5%BA%A6')
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
    expect(openedWithoutSignal.truncated).toBe(false)
    expect(openedWithoutSignal.truncationNote).toBeNull()
    const openedTruncated = await fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({
      name: '制度.md', versionId: 'ver-1', locator: 'paragraph:1', quote: '部分摘录',
      truncated: true, truncationNote: '仅使用部分摘录，未读取全文。',
    }))
    expect(openedTruncated.truncated).toBe(true)
    expect(openedTruncated.truncationNote).toBe('仅使用部分摘录，未读取全文。')
    const openedLegacyNote = await fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({
      name: '制度.md', versionId: 'ver-1', locator: 'paragraph:1', quote: '正文', truncationNote: '仅摘录',
    }))
    expect(openedLegacyNote.truncated).toBe(false)
    expect(openedLegacyNote.truncationNote).toBeNull()
    await expect(fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({
      name: '制度.md', versionId: 'other', locator: 'paragraph:1', quote: '正文',
    }))).rejects.toThrow(/different version/)
    const unauthorized = await fetchLibrarySource('http://ground.test', 'node-1', 'ver-1', async () => Response.json({ message: '登录已失效' }, { status: 401 })).catch((error: unknown) => error)
    expect(unauthorized).toBeInstanceOf(LibraryRequestError)
    expect(unauthorized).toMatchObject({ status: 401 })
    expect((unauthorized as Error).message).toContain('sign in again')
    expect((unauthorized as Error).message).toContain('登录已失效')
    const denied = await fetchLibraryItems('http://ground.test', 'shared', '', async () => Response.json({ message: '资料未授权' }, { status: 403 })).catch((error: unknown) => error)
    expect(denied).toMatchObject({ status: 403 })
    expect((denied as Error).message).toContain('not authorized')
    expect((denied as Error).message).toContain('资料未授权')
  })

  it('attaches a ready version to the composer and refuses an unparsed file', () => {
    const appended: string[] = []
    const input = { appendReference: (ref: { ref: string }) => { appended.push(ref.ref); return true } }
    expect(attachLibraryReference(input, ready)).toEqual({ sent: false, attached: true })
    expect(appended).toEqual(['node-1@ver-1'])
    expect(libraryReference({ ...ready, parseStatus: 'DOWNLOAD_ONLY' })).toBeNull()
    expect(attachLibraryReference(undefined, ready)).toEqual({ sent: false, attached: false })
    expect(attachLibraryReference(input, { ...ready, parseStatus: 'FAILED', parseReason: '失败' }).attached).toBe(false)
  })
})
