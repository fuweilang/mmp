import { expect, it, vi } from 'vitest'
import type { Context } from '@mammoth-ai/cordis'
import type { InputTriggerSource } from '../../ui-input-trigger/src/types.ts'
import { SessionInputShell } from '../../ui-conversation/src/client/input/facade.ts'
import { apply } from '../src/client/index.ts'

function fixture() {
  let source: InputTriggerSource | undefined
  const shell = new SessionInputShell({ actx: {} as Context, defaultSink: vi.fn(),
    commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: token => token } })
  apply({
    on: () => () => {},
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: () => () => {} }, effect: (fn: () => unknown) => fn(), inject: () => {},
    sessions: { binding: () => ({ ctx: {} }) }, conversation: { input: { for: () => shell } },
    get: () => ({ registerSource: (value: InputTriggerSource) => { source = value; return () => {} } }),
  } as never)
  const pick = (nodeId: string, versionId: string) => {
    const before = shell.actions.captureInsertion()
    expect(shell.insertText('@doc', before)).toBe(true)
    const span = { start: before.start, end: before.start + 4, draftRev: shell.snapshot.draftRev }
    const result = source!.onPick({ session: { sessionId: 's1' as never }, action: 'pick', via: 'menu', position: 'inline', span,
      candidate: { name: `${nodeId}@${versionId}`, value: nodeId, label: '同名.docx' } })
    if (result && typeof result === 'object') {
      if ('insert' in result) shell.insertReference(result.insert, span)
      if ('text' in result) shell.insertText(result.text, span)
    }
  }
  const pickNamed = (name: string, ref: string) => {
    const before = shell.actions.captureInsertion()
    expect(shell.insertText('@doc', before)).toBe(true)
    const span = { start: before.start, end: before.start + 4, draftRev: shell.snapshot.draftRev }
    const result = source!.onPick({ session: { sessionId: 's1' as never }, action: 'pick', via: 'menu', position: 'inline', span,
      candidate: { name, value: ref, section: 'panel', icon: 'file' } })
    if (result && typeof result === 'object' && 'insert' in result) shell.insertReference(result.insert, span)
  }
  return { shell, pick, pickNamed }
}

it('deduplicates repeated @ picks and replaces an explicitly selected newer version', () => {
  const { shell, pick } = fixture()
  shell.setDraft('请分析 ')
  pick('n1', 'v1')
  pick('n1', 'v1')
  expect(shell.snapshot.occurrences.map(ref => ref.ref)).toEqual(['n1@v1'])
  expect(shell.draftSnapshot.text).not.toContain('@doc')
  pick('n1', 'v2')
  expect(shell.snapshot.occurrences.map(ref => ref.ref)).toEqual(['n1@v2'])
  pick('n2', 'v3')
  expect(shell.snapshot.occurrences.map(ref => ref.ref)).toEqual(['n1@v2', 'n2@v3'])
  expect(shell.draftSnapshot.text).toContain('请分析')
})

it('inserts a name-only row from the ref stored in value', () => {
  const { shell, pickNamed } = fixture()
  shell.setDraft('请看 ')
  pickNamed('泡泡玛特商业模式-3页.pdf', 'd0a4c1d0@ce14')
  expect(shell.snapshot.occurrences.map(ref => ({ ref: ref.ref, label: ref.label }))).toEqual([
    { ref: 'd0a4c1d0@ce14', label: '泡泡玛特商业模式-3页.pdf' },
  ])
})

it('uses the same identity when a picker or panel reference is followed by an @ pick', () => {
  const { shell, pick } = fixture()
  shell.appendReference({ source: 'library', ref: 'n1@v1', label: '原名.docx', appearance: 'file', clipboardText: '原名.docx' })
  pick('n1', 'v1')
  expect(shell.snapshot.occurrences).toHaveLength(1)
  pick('n1', 'v2')
  expect(shell.snapshot.occurrences.map(ref => ref.ref)).toEqual(['n1@v2'])
})
