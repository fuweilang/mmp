/** Accepted history retains its original wire values and fingerprint domain across package renames. */

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadPersistenceHistory } from './persistence-changes.ts'
import { loadPersistenceFinalization } from './persistence-finalization.ts'
import { restoreReleasedV4Artifact } from '../packages/session/session-format-v3-to-v4/src/index.ts'

const checkout = fileURLToPath(new URL('..', import.meta.url))

describe('committed persistence history integrity', () => {
  it('validates every retained schema without changing its accepted root digests', () => {
    const history = loadPersistenceHistory(checkout)
    const baseline = history.entries.find(entry => entry.record.id === '2026-09-16-session-format-v4')
    expect(baseline?.snapshot.roots.find(root => root.key === 'event:agent/inbox/spliced')?.digest)
      .toBe('1506a9b8224986c83015ae99d2cb5ede705538c58c063d6a48ef6d761a31ba6c')
  })

  it('matches the retained finalization hashes using their original fingerprint domain', () => {
    const history = loadPersistenceHistory(checkout)
    const finalization = loadPersistenceFinalization(checkout, history)
    expect(finalization?.version).toBe(4)
    expect(finalization?.acceptedRecords.has('2026-09-16-session-format-v4')).toBe(true)
  })

  it.each(['dsh-session-title-llm', 'mmp-session-title-llm', 'official-expert-evidence-retired'])(
    'the retained V4 reader preserves %s attribution and optional source-display metadata', (kind) => {
      const artifact = {
        header: { version: 4, id: 'preserved-attribution', createdAt: 0, isSeeded: false, delegationDepth: 0 },
        inheritedEventCount: 0,
        events: [{
          type: 'user/message', seq: 0, time: 0, surfaceOp: 'append',
          data: { id: 'message-1', role: 'user', source: { kind, form: 'snapshot', sections: [] },
            content: [{ type: 'text', text: 'Exact visible text', reference: { nodeId: 'file-1', versionId: 'version-1', name: 'source.txt' } }] },
        }],
      }
      expect(restoreReleasedV4Artifact(artifact, new Set(['user/message']))).toBe(artifact)
      expect(artifact.events[0]?.data.content[0]?.text).toBe('Exact visible text')
      expect(artifact.events[0]?.data.source.kind).toBe(kind)
      expect(artifact.events[0]?.data.content[0]?.reference.versionId).toBe('version-1')
    },
  )
})
