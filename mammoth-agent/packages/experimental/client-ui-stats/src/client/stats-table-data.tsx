import type { CallGroup, StepViewState, ViewState } from './StatsTable.tsx'
import type { StatsCall, StatsStepMetrics, StatsTurnMetrics } from './stats-contract.ts'
import { isNumber } from './stats-usage.ts'
import { STEP_LIMIT } from './stats-table-format.tsx'

export const EMPTY_STEP_VIEW: StepViewState = {}

/** Index of the tool tone for one call name; unknown names hash to a stable tone. */

export function createViewState(): ViewState {
  return { mode: 'newest', openTurns: {}, stepViews: {}, showTotals: false, showEvents: false, showContextDelta: false, contextMode: 'latest' }
}

/** Read an array element whose index the surrounding bounds already prove. */

function callGroups(calls: readonly StatsCall[]): readonly CallGroup[] {
  const groups = new Map<string, { key: string; name: string | null; hint: string | null; calls: StatsCall[] }>()
  for (const call of calls) {
    const key = `${call.name ?? ''}\u0000${call.hint ?? ''}`
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, { key, name: call.name, hint: call.hint, calls: [call] })
    } else {
      group.calls.push(call)
    }
  }
  return [...groups.values()]
}

/** Gap between one step's start and the previous step's end. */
function stepGaps(turn: StatsTurnMetrics): ReadonlyMap<number, number> {
  const gaps = new Map<number, number>()
  let previousEnd: number | null = null
  for (const step of turn.steps) {
    const startTime = step.startTime
    if (isNumber(previousEnd) && isNumber(startTime) && startTime > previousEnd) {
      gaps.set(step.step, startTime - previousEnd)
    }
    if (isNumber(step.endTime)) previousEnd = step.endTime
  }
  return gaps
}

/** Context change of each step against the previous measured step in its turn. */
function contextDeltas(turn: StatsTurnMetrics): ReadonlyMap<number, number> {
  const deltas = new Map<number, number>()
  let previous: number | null = null
  for (const step of turn.steps) {
    if (!isNumber(step.context)) continue
    if (isNumber(previous) && step.context !== previous) deltas.set(step.step, step.context - previous)
    previous = step.context
  }
  return deltas
}

/** Step slice shown for one turn: filtered pool, then the newest STEP_LIMIT. */
function stepsOf(
  turn: StatsTurnMetrics,
  state: StepViewState,
): { readonly pool: readonly StatsStepMetrics[]; readonly shown: readonly StatsStepMetrics[] } {
  const filter = state.filter ?? null
  const pool = filter === null
    ? turn.steps
    : turn.steps.filter(step => step.tools.some(item => item.name === filter))
  const shown = state.mode === 'all' ? pool : pool.slice(-STEP_LIMIT)
  return { pool, shown }
}

/** One table cell holding a formatted number plus the tooltip for its source. */

export { callGroups, contextDeltas, stepGaps, stepsOf }
