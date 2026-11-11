/** Strict adjacent migration, identity preservation and native target reopening. */
import { describe, expect, it } from 'vitest'
import { createSessionFormatCatalogWithChildren, sessionFormatCatalog } from '@mammoth-ai/mmp-session-format-catalog'
import type { SessionFormatEvent } from '@mammoth-ai/mmp-session-format'

function restore(version: number, events: readonly SessionFormatEvent[], seeded = false) {
  const header = { type: 'session', version, id: 'migration', createdAt: 1, delegationDepth: 0,
    ...(version >= 2 ? { isSeeded: seeded } : seeded ? { seedLength: 1 } : {}) }
  const reader = createSessionFormatCatalogWithChildren([]).createRestore(header, { recovery: 'strict', validation: 'current' })
  for (const event of events) reader.decodeRow(event)
  return reader.finish()
}
const fact: SessionFormatEvent = { type: 'feedback/record', seq: 0, time: 2, data: { text: 'retained' } }

describe('V4 to V5 identity conversion', () => {
  it.each([0, 1, 2, 3, 4, 5])('strictly restores generation %s and reopens native five', (version) => {
    const artifact = restore(version, [fact])
    expect(artifact.header.version).toBe(5)
    const reader = sessionFormatCatalog.createRestore(sessionFormatCatalog.encodeCurrentHeader(artifact.header, artifact.inheritedEventCount), { recovery: 'strict', validation: 'current' })
    for (const event of artifact.events) reader.decodeRow(sessionFormatCatalog.encodeCurrentEvent(event))
    expect(reader.finish()).toEqual(artifact)
  })
  it.each([0, 1, 2, 3, 4, 5])('preserves seeded inherited cuts through generation %s', (version) => {
    const seed: SessionFormatEvent = { type: 'session/end-seed', seq: 1, time: 3, data: version >= 2 ? { inherited: true } : {} }
    expect(restore(version, [fact, seed], true).inheritedEventCount).toBe(1)
  })
  it('preserves RAG evidence, source spellings, optional references and plugin records exactly', () => {
    const events: SessionFormatEvent[] = [
      { type: 'official-agent/knowledge', seq: 0, time: 1, data: { evidence: [{ nodeId: 'node', versionId: 'version', text: 'exact' }] } },
      ...['dsh-session-title-llm', 'mmp-session-title-llm'].map((kind, index) => ({ type: 'user/message', seq: index + 1, time: 2, surfaceOp: 'append', data: { id: `message-${index}`, role: 'user', source: { kind, opaque: { retained: true } }, content: [{ type: 'text', text: 'exact', reference: { source: 'library', nodeId: 'node', versionId: 'version' } }] } })),
      { type: 'plugin:custom', seq: 3, time: 3, ignorable: true, data: { opaque: ['retained'] } },
    ]
    expect(restore(4, events).events).toEqual(events)
  })
  it('refuses unknown required source records and target-generation claims', () => {
    expect(() => restore(4, [{ ...fact, type: 'future/required' }])).toThrow(/unknown required/)
    expect(() => restore(4, [fact, { type: 'session-log-deepseek/delivery-accepted', seq: 1, time: 3, data: { sessionFormatVersion: 5, sessionId: 'migration', throughSeq: 0 } }])).toThrow(/claims target/)
  })
  it('validates V5 delivery ownership while retaining V4 historical delivery coordinates', () => {
    const marker = { type: 'session-log-deepseek/delivery-accepted', seq: 1, time: 3, data: { sessionFormatVersion: 5, sessionId: 'foreign', throughSeq: 0 } }
    expect(() => restore(5, [fact, marker])).toThrow(/wrong Session/)
    expect(() => restore(4, [fact, { ...marker, data: { ...marker.data, sessionFormatVersion: 4 } }])).toThrow(/wrong Session/)
    const old = { ...marker, data: { ...marker.data, sessionFormatVersion: 4, sessionId: 'migration' } }
    expect(restore(4, [fact, old]).events).toEqual([fact, old])
  })
})
