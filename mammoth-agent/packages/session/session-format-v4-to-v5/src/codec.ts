/** V5 framing with required-event refusal before any recoverable suffix is discarded. */
import { KNOWN_SESSION_EVENT_TYPES } from '@mammoth-ai/mmp-session'
import { releasedV4SessionFormatCodec, assertV4RowAdmission } from '@mammoth-ai/mmp-session-format-v3-to-v4'
import { SessionFormatError, SessionFormatUnsupportedMigrationError, isSessionFormatJsonObject } from '@mammoth-ai/mmp-session-format'
import type { SessionFormatCodec, SessionFormatCurrentEncoder } from '@mammoth-ai/mmp-session-format'
import { RELEASED_V4_EVENT_TYPES } from './source-event-types.ts'
import { v4HeaderView } from './validation.ts'

/**
 * Refuse unknown required physical events before tail recovery.
 * @param row - parsed physical row.
 * @param knownEventTypes - installed event names.
 */
function admitRow(row: unknown, version: number, knownEventTypes?: ReadonlySet<string>): void {
  if (isSessionFormatJsonObject(row) && typeof row['type'] === 'string'
    && !(knownEventTypes ?? KNOWN_SESSION_EVENT_TYPES).has(row['type']) && row['ignorable'] !== true) {
    throw new SessionFormatUnsupportedMigrationError(`format v${version} contains event type ${JSON.stringify(row['type'])} (seq ${String(row['seq'])}) unknown to this harness and not marked ignorable (unknown required event)`)
  }
  assertV4RowAdmission(row, knownEventTypes)
}

/**
 * Refuse unknown required V5 rows before recovery.
 * @param row - parsed row.
 * @param knownEventTypes - installed names.
 */
export function assertV5RowAdmission(row: unknown, knownEventTypes?: ReadonlySet<string>): void {
  admitRow(row, 5, knownEventTypes)
}

function physicalV4(value: unknown) {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 5) throw new SessionFormatError('expected format v5 physical header')
  return { ...value, version: 4 }
}

/** Native V5 physical codec; all event bodies retain the established V4 representation. */
export const releasedV5SessionFormatCodec = Object.freeze({
  version: 5,
  decodeHeader(value) { return { ...releasedV4SessionFormatCodec.decodeHeader(physicalV4(value)), version: 5 } },
  createDecoder(value, recovery) {
    const decoder = releasedV4SessionFormatCodec.createDecoder(physicalV4(value), recovery)
    return { ...decoder, header: { ...decoder.header, version: 5 }, decodeRow(row, context) {
      assertV5RowAdmission(row)
      decoder.decodeRow(row, context)
    } }
  },
  encodeHeader(header, cut) { return { ...releasedV4SessionFormatCodec.encodeHeader(v4HeaderView(header), cut), version: 5 } },
  encodeEvent(event) { return releasedV4SessionFormatCodec.encodeEvent(event) },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)


/**
 * Apply outgoing V4 admission before historical tail suppression.
 * @param row - parsed physical row.
 */
export function assertV4MigrationRowAdmission(row: unknown): void {
  admitRow(row, 4, RELEASED_V4_EVENT_TYPES)
}
