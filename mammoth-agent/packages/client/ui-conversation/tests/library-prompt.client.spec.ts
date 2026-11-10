import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@mammoth-ai/cordis'
import type { DraftSnapshot } from '../src/client/contract/draft-editor.ts'
import type { InputTriggerController } from '../src/client/contract/input.ts'
import { serializeDraftPrompt } from '../src/client/input/prompt.ts'
import { SessionInputShell } from '../src/client/input/facade.ts'

const library = { type: 'library' as const, nodeId: 'node-1', versionId: 'version-1', name: '分析.docx' }
const reference = { source: 'library', ref: 'node-1@version-1', label: library.name, appearance: 'file' as const, clipboardText: library.name }
const draft: DraftSnapshot = { text: `${library.name} 请分析`, references: [{ ...reference, offset: 0, length: library.name.length }] }

describe('structured library submission', () => {
  it('keeps a file identity separate from user text without expanding its body in the browser', async () => {
    expect(await serializeDraftPrompt(draft, async () => library)).toEqual([
      library, { type: 'text', text: ' 请分析' },
    ])
  })

  it('preserves ordinary reference serialization and text-only behavior', async () => {
    expect(await serializeDraftPrompt(draft, async () => 'ordinary reference')).toBe('ordinary reference 请分析')
    expect(serializeDraftPrompt({ text: '  原话  ', references: [] }, vi.fn())).toBe('原话')
  })

  it('preserves reference order and semantic quotes when a draft has several source types', async () => {
    const value: DraftSnapshot = {
      text: '分析.docx source 引用段落',
      references: [{ ...reference, offset: 0, length: 7 }, { source: 'reference', ref: 'source', label: 'source', clipboardText: 'source', offset: 8, length: 6 }],
      quotes: [{ offset: 15, length: 4, text: '引用段落' }],
    }
    expect(await serializeDraftPrompt(value, async source => source === 'library' ? library : '普通引用')).toEqual([
      library, { type: 'text', text: ' 普通引用\n\n> 引用段落' },
    ])
  })

  it('retains references on Host rejection and only clears the accepted retry', async () => {
    const sink = vi.fn().mockResolvedValueOnce({ kind: 'error', text: 'source unavailable' }).mockResolvedValueOnce({ kind: 'success' })
    const serializeReference = vi.fn(async () => library)
    const inputTriggers: InputTriggerController = {
      serializeReference, track: vi.fn(), lexicon: { getSnapshot: () => new Map(), subscribe: () => () => {} },
      launcher: { getSnapshot: () => null, subscribe: () => () => {} }, arbitrate: () => 'pass', onSpace: () => false,
      adjudicate: async () => undefined, resolveClaim: async () => undefined, openReference: () => false, toggleSource: () => {},
    }
    const shell = new SessionInputShell({ actx: {} as Context, inputTriggers: () => inputTriggers, defaultSink: sink,
      commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: token => token } })
    shell.appendReference(reference)
    shell.submit()
    await vi.waitFor(() => { expect(shell.snapshot.phase).toBe('plain') })
    expect(shell.snapshot.occurrences).toHaveLength(1)
    expect(sink.mock.calls[0]?.[0]).toEqual([library])
    shell.submit()
    await vi.waitFor(() => { expect(shell.snapshot.draft).toBe('') })
    expect(serializeReference).toHaveBeenCalledTimes(2)
  })

  it('replaces one source selection atomically while keeping user text, other chips and quotes', () => {
    const shell = new SessionInputShell({ actx: {} as Context, defaultSink: vi.fn(),
      commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: token => token } })
    shell.setDraft('我的问题')
    shell.appendReference(reference)
    shell.appendReference({ source: 'reference', ref: 'session-1', label: '会话', clipboardText: '@会话' })
    shell.insertQuote('引用原话')
    expect(shell.replaceReferences('library', [{ ...reference, ref: 'node-1@version-2', label: '新版.docx', clipboardText: '新版.docx' }])).toBe(true)
    expect(shell.draftSnapshot.references.map(ref => [ref.source, ref.ref])).toEqual([
      ['reference', 'session-1'], ['library', 'node-1@version-2'],
    ])
    expect(shell.draftSnapshot.text).toContain('我的问题')
    expect(shell.draftSnapshot.text).not.toContain('分析.docx')
    expect(shell.draftSnapshot.quotes?.[0]?.text).toBe('引用原话')
  })
})
