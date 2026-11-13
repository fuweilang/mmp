/** Ledger projection, filtering, and virtual-row structure state. */

import { useRef } from 'react'
import type {
  RecordState, TrajectoryRequestNumber, TableRecord, VirtualRowStructure,
} from './trajectory-table-types.ts'
import { trajectoryRecordId } from './trajectory-record.ts'
import type { TrajectoryVirtualRow } from './trajectory-virtual-rows.ts'
import type { TrajectoryTurnModel } from './layout.ts'
import type { TrajectoryTranslate } from './locales.ts'
import { COMPACTION_INTERRUPTED_ERROR } from './copy-codes.ts'

/** Virtual-row keys and heights that keep their identity while the row content is unchanged.
 * @param rows - the virtual rows.
 * @returns the derived value.
 */
function useStableVirtualRowStructure(
  rows: readonly TrajectoryVirtualRow<TableRecord>[],
): readonly VirtualRowStructure[] {
  const cache = useRef<{
    rows: readonly TrajectoryVirtualRow<TableRecord>[]
    structure: readonly VirtualRowStructure[]
  }>({ rows: [], structure: [] })
  if (cache.current.rows === rows) return cache.current.structure
  const structure = cache.current.structure.length === rows.length
    && rows.every((row, index) => {
      const previous = cache.current.structure[index]
      return previous?.key === row.key && previous.height === row.height
    })
    ? cache.current.structure
    : rows.map(row => ({ key: row.key, height: row.height }))
  cache.current = { rows, structure }
  return structure
}


/** Lay the turn model out as ledger records with group and turn boundaries.
 * @param turns - the turn model in display order.
 * @returns the derived value.
 */
function flattenRecords(turns: readonly TrajectoryTurnModel[]): TableRecord[] {
  return turns.flatMap((turn, section) => {
    let firstInSection = true
    const records = turn.groups.flatMap((group) => {
      return group.cells.map((cell, index) => {
        const turnStart = firstInSection
          && cell.requestOnly !== true
          && cell.kind !== 'system'
          && (cell.kind !== 'compacted' || turn.turn === null)
        if (turnStart) firstInSection = false
        return {
          turn: turn.turn,
          section,
          group: group.title,
          groupStart: index === 0,
          turnStart,
          cell,
          turnEnd: false,
        }
      })
    })
    const last = records.at(-1)
    if (last !== undefined) last.turnEnd = true
    return records
  })
}

/** Keep the search-matched records and rebuild their group and turn boundaries.
 * @param records - the ledger records.
 * @param matches - record indexes retained by the active search.
 * @returns the derived value.
 */
function filterRecords(
  records: readonly TableRecord[],
  matches: ReadonlySet<number>,
): TableRecord[] {
  const filtered = records
    .filter(record =>
      record.cell.requestOnly !== true && matches.has(record.cell.index),
    )
    .map(record => ({ ...record, groupStart: false, turnStart: false, turnEnd: false }))
  const startedSections = new Set<number>()
  for (const [index, record] of filtered.entries()) {
    const previous = filtered[index - 1]
    const next = filtered[index + 1]
    record.groupStart = previous === undefined
      || previous.section !== record.section
      || previous.group !== record.group
    record.turnStart = !startedSections.has(record.section)
      && record.cell.kind !== 'system'
      && (record.cell.kind !== 'compacted' || record.turn === null)
    if (record.turnStart) startedSections.add(record.section)
    record.turnEnd = next === undefined || next.section !== record.section
  }
  return filtered
}

/** Map key joining one request group to its turn.
 * @param turn - the turn number, or null between turns.
 * @param group - the request group title.
 * @returns the derived value.
 */
function requestKey(turn: number | null, group: string): string {
  return `${turn}\u0000${group}`
}

/** Stable identity of one request, independent of its session number.
 * @param request - the request number record.
 * @returns the derived value.
 */
function requestIdentity(request: TrajectoryRequestNumber): string {
  return request.purpose === 'compaction'
    ? `compaction\u0000${request.seq}`
    : `assistant\u0000${request.turn}\u0000${request.step}`
}

/** First record index per request group.
 * @param records - the ledger records.
 * @param requestGroups - request group keys present in the session.
 * @returns the derived value.
 */
function indexRequestBoundaries(
  records: readonly TableRecord[],
  requestGroups: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const boundaries = new Map<string, number>()
  for (const record of records) {
    const key = requestKey(record.turn, record.group)
    if (!requestGroups.has(key)) continue
    if (boundaries.has(key)) continue
    if (record.cell.kind === 'user' || record.cell.kind === 'context' || record.cell.kind === 'system') continue
    boundaries.set(key, record.cell.index)
  }
  return boundaries
}

/** Localized heading for one turn section.
 * @param turn - the turn number, or null between turns.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function sectionLabel(turn: number | null, t: TrajectoryTranslate): string {
  return turn === null ? t('section.betweenTurns') : t('turn.label', { turn })
}

/** Session-global request number per request group.
 * @param sessionNumbers - session-global request numbers.
 * @returns the derived value.
 */
function indexRequestNumbers(
  sessionNumbers: readonly TrajectoryRequestNumber[] | undefined,
): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  for (const request of sessionNumbers ?? []) {
    numbers.set(requestKey(request.turn, request.group), request.number)
  }
  return numbers
}

/** Length of the request-only run that ends at each boundary record.
 * @param records - the ledger records.
 * @param requestGroups - request group keys present in the session.
 * @returns the derived value.
 */
function indexRequestBoundaryRuns(
  records: readonly TableRecord[],
  requestGroups: ReadonlySet<string>,
): ReadonlyMap<number, number> {
  const indexes = new Map<number, number>()
  let runLength = 0
  for (const record of records) {
    if (record.cell.requestOnly === true) {
      indexes.set(record.cell.index, runLength++)
      continue
    }
    if (
      runLength > 0
      && record.groupStart
      && requestGroups.has(requestKey(record.turn, record.group))
    ) {
      indexes.set(record.cell.index, runLength)
    }
    runLength = 0
  }
  return indexes
}

/** Folded summary counting the steps and tool calls of a turn.
 * @param records - the ledger records.
 * @param requestGroups - request group keys present in the session.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function summarizeTurn(
  records: readonly TableRecord[],
  requestGroups: ReadonlySet<string>,
  t: TrajectoryTranslate,
): string {
  const steps = new Set(
    records
      .map(record => requestKey(record.turn, record.group))
      .filter(key => requestGroups.has(key)),
  ).size
  const toolCalls = records.filter(record =>
    record.cell.kind === 'tool' || record.cell.kind === 'subtool',
  ).length
  return [
    t(steps === 1 ? 'summary.steps.one' : 'summary.steps.other', { count: steps }),
    t(toolCalls === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', {
      count: toolCalls,
    }),
  ].join(' · ')
}

/** Fold every record of a collapsed turn after its first content record into one summary record.
 * @param records - the ledger records.
 * @param collapsedTurns - turn numbers that are folded.
 * @param requestGroups - request group keys present in the session.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function collapseTurnRecords(
  records: readonly TableRecord[],
  collapsedTurns: ReadonlySet<number>,
  requestGroups: ReadonlySet<string>,
  t: TrajectoryTranslate,
): TableRecord[] {
  const recordsByTurn = new Map<number, TableRecord[]>()
  for (const record of records) {
    if (record.turn === null) continue
    const turnRecords = recordsByTurn.get(record.turn) ?? []
    turnRecords.push(record)
    recordsByTurn.set(record.turn, turnRecords)
  }
  return records.flatMap((record) => {
    if (record.turn === null || !collapsedTurns.has(record.turn)) return [record]
    const turnRecords = recordsByTurn.get(record.turn) ?? [record]
    if (record.cell.requestOnly === true || record.cell.kind === 'system') return [record]
    const contentRecords = turnRecords.filter(candidate =>
      candidate.cell.requestOnly !== true && candidate.cell.kind !== 'system')
    if (contentRecords.length <= 1) return [record]
    if (record.cell.index !== contentRecords[0]?.cell.index) return []
    return [
      { ...record, turnEnd: false },
      {
        ...record,
        groupStart: false,
        turnStart: false,
        turnEnd: true,
        collapsedSummary: summarizeTurn(contentRecords.slice(1), requestGroups, t),
        collapsedSummaryKind: 'turn',
      },
    ]
  })
}

/** Records of the tool calls that follow one assistant message, up to the next non-tool record.
 * @param records - the ledger records.
 * @param assistantIndex - record index of the assistant message.
 * @returns the derived value.
 */
function assistantToolCalls(
  records: readonly TableRecord[],
  assistantIndex: number,
): readonly TableRecord[] {
  const at = records.findIndex(record => record.cell.index === assistantIndex)
  if (at === -1 || records[at]?.cell.kind !== 'message') return []
  const calls: TableRecord[] = []
  for (let i = at + 1; i < records.length; i++) {
    const record = records[i]
    if (record === undefined) break
    if (record.cell.kind !== 'tool' && record.cell.kind !== 'subtool') break
    calls.push(record)
  }
  return calls
}

/** Folded summary naming the calls and their count.
 * @param records - the ledger records.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function summarizeCalls(
  records: readonly TableRecord[],
  t: TrajectoryTranslate,
): string {
  const names = [...new Set(records.map((record) => {
    const separator = record.cell.text.indexOf(' · ')
    return separator === -1 ? record.cell.text : record.cell.text.slice(0, separator)
  }).filter(name => name !== ''))]
  const count = records.length
  const summary = t(count === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', { count })
  return names.length > 0 ? `${summary} · ${names.join(', ')}` : summary
}

/** Fold the tool calls under matching assistant or tool records into one summary record.
 * @param records - the ledger records.
 * @param collapsedIds - ids of the folded assistant or tool records.
 * @param kind - the fold kind, assistant or tool.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function collapseCallRecords(
  records: readonly TableRecord[],
  collapsedIds: ReadonlySet<string>,
  kind: 'assistant' | 'tool',
  t: TrajectoryTranslate,
): TableRecord[] {
  const out: TableRecord[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === undefined) continue
    out.push(record)
    if (
      record.collapsedSummary !== undefined
      || record.cell.kind !== (kind === 'assistant' ? 'message' : 'tool')
      || !collapsedIds.has(trajectoryRecordId(record.cell))
    ) continue
    const calls: TableRecord[] = []
    for (let j = i + 1; j < records.length; j++) {
      const candidate = records[j]
      if (
        candidate === undefined
        || candidate.collapsedSummary !== undefined
        || (candidate.cell.kind !== 'tool' && candidate.cell.kind !== 'subtool')
        || (kind === 'tool' && candidate.cell.kind !== 'subtool')
      ) break
      calls.push(candidate)
    }
    if (calls.length === 0) continue
    const last = calls.at(-1)
    out[out.length - 1] = { ...record, turnEnd: false }
    out.push({
      ...record,
      groupStart: false,
      turnStart: false,
      turnEnd: last?.turnEnd ?? false,
      collapsedSummary: summarizeCalls(calls, t),
      collapsedSummaryKind: kind,
    })
    i += calls.length
  }
  return out
}

/** Ledger state of one record: complete, running, or error.
 * @param record - the value.
 * @returns the derived value.
 */
function stateOf(record: TableRecord): RecordState {
  if (record.cell.isError) return 'error'
  if (record.cell.kind === 'compacted' && record.cell.timeSeconds === null) return 'running'
  if (record.cell.assistantMetrics?.completedTime === null) return 'running'
  if (
    (record.cell.kind === 'tool' || record.cell.kind === 'subtool')
    && record.cell.outputDetail === undefined
  ) return 'running'
  return 'complete'
}

/** Localized status label for one ledger state.
 * @param state - the ledger state.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function statusLabel(state: RecordState, t: TrajectoryTranslate): string {
  if (state === 'error') return t('status.failed')
  if (state === 'running') return t('status.pending')
  return t('status.completed')
}

/** Localized failure message for one request, falling back to the recorded error.
 * @param request - the request number record.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function requestErrorMessage(
  request: Pick<TrajectoryRequestNumber, 'error' | 'errorCode'>,
  t: TrajectoryTranslate,
): string | undefined {
  if (request.errorCode === 'AUTH') return t('details.failure.auth')
  if (request.error === COMPACTION_INTERRUPTED_ERROR) return t('layout.compactionInterrupted')
  return request.error
}


export {
  assistantToolCalls,
  collapseCallRecords,
  collapseTurnRecords,
  filterRecords,
  flattenRecords,
  indexRequestBoundaries,
  indexRequestBoundaryRuns,
  indexRequestNumbers,
  requestErrorMessage,
  requestIdentity,
  requestKey,
  sectionLabel,
  stateOf,
  statusLabel,
  summarizeCalls,
  summarizeTurn,
  useStableVirtualRowStructure,
}
