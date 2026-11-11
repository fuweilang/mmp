import { describe, expect, it } from 'vitest'
import { Session, SessionId, SessionLogOffset, SESSION_FORMAT_VERSION, KNOWN_SESSION_EVENT_TYPES } from '@mammoth-ai/mmp-session'
import type { SessionEvent, SessionHeader } from '@mammoth-ai/mmp-session'
import type { SessionFormatEvent } from '@mammoth-ai/mmp-session-format'
import { restoreReleasedV4Artifact } from '@mammoth-ai/mmp-session-format-v3-to-v4'
import { releasedV5SessionFormatCodec } from '@mammoth-ai/mmp-session-format-v4-to-v5'
import { sessionFormatCatalog } from '../src/index.ts'

const reference = { source: 'library', nodeId: 'node-1', versionId: 'version-2', name: 'Authorized.pdf', versionNo: 2, bytes: 999 }
const source = { type: 'text', text: 'UNIQUE EXACT MODEL EXCERPT WITH REAL LOCATOR', reference }
const header = { version: SESSION_FORMAT_VERSION, id: SessionId('library-reference'), createdAt: 1, isSeeded: false, delegationDepth: 0 } satisfies SessionHeader
const event: SessionFormatEvent = {
  type: 'user/message', seq: 0, time: 1, surfaceOp: 'append',
  data: { id: 'message-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'My question' }, source] },
}

describe('optional library reference persistence', () => {
  it('retains metadata and exact model input through current physical codec and Session replay', () => {
    const encodedHeader = releasedV5SessionFormatCodec.encodeHeader(header, 0)
    const row: unknown = JSON.parse(JSON.stringify(releasedV5SessionFormatCodec.encodeEvent(event)))
    const restore = sessionFormatCatalog.createRestore(encodedHeader, { recovery: 'strict', validation: 'current' })
    restore.decodeRow(row)
    const artifact = restore.finish()
    expect(artifact.events).toEqual([event])
    expect(artifact.header).toEqual(header)
    const replay = Session.fromRestore(header.id, artifact.events as SessionEvent[], header, SessionLogOffset(0), 'detached')
    expect(replay.deriveMessages()[0]?.content).toEqual([{ type: 'text', text: 'My question' }, source])
  })
  it('retains ordinary old text and accepts optional metadata through the released V4 reader', () => {
    const ordinary: SessionFormatEvent = { ...event, data: { ...event.data as object,
      content: [{ type: 'text', text: 'Plain old text' }],
    } }
    expect(restoreReleasedV4Artifact({ header: { ...header, version: 4 }, inheritedEventCount: 0, events: [ordinary] }, KNOWN_SESSION_EVENT_TYPES).events).toEqual([ordinary])
    expect(restoreReleasedV4Artifact({ header: { ...header, version: 4 }, inheritedEventCount: 0, events: [event] }, KNOWN_SESSION_EVENT_TYPES).events).toEqual([event])
  })
})
