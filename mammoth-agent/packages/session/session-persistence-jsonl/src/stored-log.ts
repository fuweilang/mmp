/**
 * Stored-log types and event-graph freezing for the JSONL backend: what one
 * validated generation carries, and the immutable sharing a cold read hands to
 * every concurrent reader.
 * @module @mammoth-ai/mmp-session-persistence-jsonl/stored-log
 */

import {
  SessionPersistenceRevision,
  type SessionHandleReadResult,
  type SessionPersistenceSnapshot,
} from '@mammoth-ai/mmp-session-persistence'
import type {
  SessionEvent,
  SessionHeader,
  SessionLogOffset as SessionLogOffsetType,
} from '@mammoth-ai/mmp-session'
import type { JsonlPhysicalIdentity, PreparedJsonlMigration } from './generation.ts'

/** Logical header paired with the catalog's selected physical-generation classification. */
export interface GenerationHeader {
  readonly header: SessionHeader
  readonly formatStatus: NonNullable<SessionPersistenceSnapshot['formatStatus']>
}

/** One stored event graph whose producer has established immutable sharing. */
export interface FrozenStoredEvents extends SessionHandleReadResult {
  readonly eventState: 'shared-frozen'
}

/** State shared by prepared historical and published current logs. */
export interface StoredLogBase extends FrozenStoredEvents {
  readonly meta: SessionHeader
  readonly tornTruncateTo: number | undefined
  /** Complete events recovered from the torn final frame; the write path rewrites them durably. */
  readonly recoveredTail: SessionEvent[]
  /** Exact fork-inherited prefix length stored in the header line. */
  readonly inheritedEventCount: SessionLogOffsetType
  readonly revision: SessionPersistenceRevision
}

/** A decoded current generation that is already durable. */
export interface CurrentStoredLog extends StoredLogBase {
  readonly status: 'current'
}

/** A migrated historical generation retained until an explicit write open publishes it. */
export interface PreparedStoredLog extends StoredLogBase {
  readonly status: 'prepared'
  readonly validateRelatedSources: () => Promise<void>
  readonly publication: {
    readonly source: ResolvedJsonlGeneration
    readonly value: PreparedJsonlMigration
  }
}

/** A validated logical log, either durable current state or prepared historical state. */
export type StoredLog = CurrentStoredLog | PreparedStoredLog

/**
 * Deep-freeze acyclic stored JSON; its arrays contain only indexed JSON values.
 * @param event - one decoded event graph, frozen in place.
 */
export function freezeStoredEvent(event: SessionEvent): void {
  const pending: object[] = [event]
  while (pending.length > 0) {
    // The non-empty check proves an object remains to visit.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const current = pending.pop()!
    Object.freeze(current)
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        const child: unknown = current[index]
        if (child !== null && typeof child === 'object') pending.push(child)
      }
    } else {
      for (const key in current) {
        const child = (current as Record<string, unknown>)[key]
        if (child !== null && typeof child === 'object') pending.push(child)
      }
    }
  }
}

/**
 * Establish immutable sharing for one decoded event graph and report that state.
 * @param events - the decoded events of one read; frozen in place.
 * @returns the shared-frozen read result the backend caches and reuses.
 */
export function freezeStoredEvents(events: SessionEvent[]): FrozenStoredEvents {
  for (const event of events) freezeStoredEvent(event)
  Object.freeze(events)
  return { eventState: 'shared-frozen', events }
}

/** One authoritative immutable generation selected from a Session directory. */
export interface ResolvedJsonlGeneration {
  readonly sourcePath: string
  readonly sourceVersion: number
  readonly currentPath: string
}

/** One backend-owned historical preparation shared by its current callers. */
export interface MigrationPreparation {
  readonly sourcePath: string
  readonly sourceRevision: SessionPersistenceRevision
  readonly controller: AbortController
  readonly promise: Promise<PreparedStoredLog>
  settled: boolean
  waiters: number
}

/**
 * Build the stat-derived best-effort change token shared by full and lightweight reads.
 * @param identity - the physical-file identity a stable read observed.
 * @returns the revision readers compare to detect a replaced or rewritten file.
 */
export function fileRevision(identity: JsonlPhysicalIdentity): SessionPersistenceRevision {
  return SessionPersistenceRevision([
    identity.dev,
    identity.ino,
    identity.size,
    identity.mtimeNs,
    identity.ctimeNs,
  ].join(':'))
}
