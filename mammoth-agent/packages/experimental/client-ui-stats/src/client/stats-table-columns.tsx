import type {
  CellText, ContextCellProps, MetricCell, MetricCellsProps, MetricsValues, TimeCellProps, TimeState,
} from './StatsTable.tsx'
import { cx, isTimeRunning, toneClass, totalSpan } from './stats-table-format.tsx'
import type { StatsTranslate } from './locales.ts'
import type { StatsTotals } from './stats-aggregate.ts'
import type { StatsCall, StatsToolCount } from './stats-contract.ts'
import {
  barShare, DASH, formatChars, formatClock, formatMs, formatPercent, formatTokens, formatTokensDelta, formatTokensShort, formatTps,
} from './stats-format.ts'
import { isNumber } from './stats-usage.ts'
import type { ReactElement, ReactNode } from 'react'
import { Fragment } from 'react'
import css from './stats.module.css'

export const COLUMNS = ['context', 'output', 'cache', 'ttft', 'model', 'tps', 'tool'] as const

/** One numeric column name. */
type NumericColumn = typeof COLUMNS[number]

/** Column count of the scope, prompt, did, numeric, and time columns. */
const TOTAL_COLUMNS = COLUMNS.length + 4

/** Fixed palette indexes for tools that keep one tone across sessions. */

function MixBar({ tools }: { readonly tools: readonly StatsToolCount[] }): ReactElement {
  return (
    <div className={css.mix}>
      {tools.map(item => (
        <span
          key={item.name}
          className={cx(css.mixSegment, toneClass(item.name))}
          style={{ flexGrow: item.count }}
        />
      ))}
    </div>
  )
}

/** Tool output summary shown after a call group in the did column. */
function toolStat(name: string, calls: readonly StatsCall[], t: StatsTranslate): ReactNode {
  if (name === 'read') {
    const lines = calls.reduce((sum, call) => sum + (isNumber(call.lines) ? call.lines : 0), 0)
    if (lines <= 0) return null
    return <span className={css.didStat}>{` ${t('did.lines', { lines: formatTokens(lines) })}`}</span>
  }
  if (name === 'edit' || name === 'write' || name === 'apply_patch') {
    const added = calls.reduce((sum, call) => sum + (isNumber(call.added) ? call.added : 0), 0)
    const removed = calls.reduce((sum, call) => sum + (isNumber(call.removed) ? call.removed : 0), 0)
    if (added === 0 && removed === 0) return null
    return (
      <span className={css.didStat}>
        {' '}
        {added > 0 ? (
          <span className={css.added}>
            {`+${formatTokens(added)}${removed > 0 ? '' : ` ${t('did.lines.unit')}`}`}
          </span>
        ) : null}
        {added > 0 && removed > 0 ? ' ' : null}
        {removed > 0 ? (
          <span className={css.removed}>
            {`−${formatTokens(removed)}${added > 0 ? '' : ` ${t('did.lines.unit')}`}`}
          </span>
        ) : null}
      </span>
    )
  }
  const chars = calls.reduce((sum, call) => sum + (isNumber(call.chars) ? call.chars : 0), 0)
  return chars > 0
    ? <span className={css.didStat}>{` ${t('did.chars', { chars: formatChars(chars) })}`}</span>
    : null
}

/** Group calls by tool name and target so `×2` means one target twice. */

function metricCell(
  value: number | null,
  format: (input: number | null) => string,
  t: StatsTranslate,
  pending: number | undefined,
): CellText {
  if (!isNumber(value)) return { text: DASH, title: t('unknown') }
  const text = format(value)
  if (pending === undefined || pending <= 0) return { text, title: '' }
  return { text: `≥ ${text}`, title: t('partial', { count: pending }) }
}

/** Reading of one numeric column; turn and step rows share it. */
const COLUMN_READ: Readonly<Record<NumericColumn, (value: MetricsValues) => number | null>> = {
  context: value => value.context,
  output: value => value.output,
  cache: value => value.cacheHit,
  ttft: value => value.ttft,
  model: value => value.model,
  tps: value => value.tps,
  tool: value => value.tool,
}

/** Formatting of one numeric column. */
const COLUMN_FORMAT: Readonly<Record<NumericColumn, (value: number | null) => string>> = {
  context: formatTokensShort,
  output: formatTokensShort,
  cache: formatPercent,
  ttft: formatMs,
  model: formatMs,
  tps: formatTps,
  tool: formatMs,
}

/** Unsettled calls that make a measured duration a lower bound. */
const COLUMN_PARTIAL: Readonly<
  Partial<Record<NumericColumn, (value: MetricsValues) => number | undefined>>
> = {
  ttft: value => value.ttftPending,
  model: value => value.modelPending,
  tool: value => value.toolPending,
}

/** Source breakdown of a cell that has one, replacing the formula tooltip. */
const COLUMN_DETAIL: Readonly<
  Partial<Record<NumericColumn, (value: MetricsValues, t: StatsTranslate) => string>>
> = {
  cache: (value, t) => {
    if (!isNumber(value.cacheHit)) return ''
    // A row without a recorded breakdown keeps the column's formula explanation.
    if (!isNumber(value.cacheRead) && !isNumber(value.cacheWrite)) return t('column.cache.title')
    const read = value.cacheRead ?? 0
    const write = value.cacheWrite ?? 0
    const context = isNumber(value.cacheContext)
      ? value.cacheContext
      : isNumber(value.context) ? value.context : read + write
    const input = Math.max(0, context - read - write)
    return t('cache.detail', {
      read: formatTokens(read),
      input: formatTokens(input),
      write: formatTokens(write),
    })
  },
}

/** All numeric cells of one row, in table order. */
function metricsCells(value: MetricsValues, t: StatsTranslate): readonly MetricCell[] {
  return COLUMNS.map((name) => {
    const partial = COLUMN_PARTIAL[name]
    const cell = metricCell(
      COLUMN_READ[name](value),
      COLUMN_FORMAT[name],
      t,
      partial === undefined ? undefined : partial(value),
    )
    const detail = COLUMN_DETAIL[name]
    if (detail === undefined) return { name, ...cell }
    const title = detail(value, t)
    return { name, text: cell.text, title: title === '' ? cell.title : title }
  })
}

/** Numeric cells after the context column. */
function MetricCells({ cells, className }: MetricCellsProps): ReactElement {
  return (
    <Fragment>
      {cells.slice(1).map(cell => (
        <td key={cell.name} className={className} title={cell.title === '' ? undefined : cell.title}>
          {cell.text}
        </td>
      ))}
    </Fragment>
  )
}

/** Context column: the last measured prompt size of the row. */
function ContextCell({ value, className, delta = null }: ContextCellProps): ReactElement {
  return (
    <td className={className}>
      <span className={css.num}>{formatTokensShort(value)}</span>
      {isNumber(delta) && delta !== 0
        ? (
          <span className={cx(css.numDelta, delta > 0 ? css.deltaUp : css.deltaDown)}>
            {formatTokensDelta(delta)}
          </span>
        )
        : null}
    </td>
  )
}

/** Time-composition cell: four stacked segments plus the measured total. */
function TimeCell({ value, scale, gap, className, trackClass, now, t }: TimeCellProps): ReactElement {
  const total = totalSpan(value, now)
  if (total === null || total <= 0) {
    return (
      <td className={className} title={t('unknown')}>
        <span className={css.timeValue}>{DASH}</span>
      </td>
    )
  }
  const running = isTimeRunning(value)
  const ttft = isNumber(value.ttft) ? Math.min(value.ttft, total) : 0
  const model = isNumber(value.model) ? Math.min(value.model, total) : ttft
  // The bar shows the non-overlapping tool span, not the sum the tool column shows.
  const toolSpan = isNumber(value.toolWall) ? value.toolWall : value.tool
  const tool = isNumber(toolSpan) ? Math.min(toolSpan, total) : 0
  const decode = Math.max(0, model - ttft)
  const rest = Math.max(0, total - model - tool)
  const share = barShare(total, scale)
  const segments: ReactNode[] = []
  if (ttft > 0) {
    segments.push(<span key="ttft" className={cx(css.barSegment, css.barTtft)} style={{ flexGrow: ttft }} />)
  }
  if (decode > 0) {
    segments.push(<span key="decode" className={cx(css.barSegment, css.barDecode)} style={{ flexGrow: decode }} />)
  }
  if (tool > 0) {
    segments.push(<span key="tool" className={cx(css.barSegment, css.barTool)} style={{ flexGrow: tool }} />)
  }
  if (rest > 0) {
    segments.push(<span key="rest" className={cx(css.barSegment, css.barRest)} style={{ flexGrow: rest }} />)
  }
  const parts = [
    t('bar.ttft', { value: formatMs(ttft) }),
    t('bar.gen', { value: formatMs(decode) }),
    t('bar.tool', { value: formatMs(tool) }),
    t('bar.rest', { value: formatMs(rest) }),
    t('bar.wall', { value: formatMs(total) }),
  ]
  if (isNumber(value.startTime)) {
    parts.unshift(t('bar.start', { clock: formatClock(value.startTime) }))
  }
  if (gap !== undefined && gap > 0) parts.push(t('bar.gap', { value: formatMs(gap) }))
  if (running) parts.push(t('bar.running'))
  return (
    <td className={className} title={parts.join(' · ')}>
      <div className={css.timeWrap}>
        <div className={trackClass}>
          <div className={css.barFill} style={{ width: `${Math.round(share * 100)}%` }}>
            {segments}
          </div>
        </div>
        <span className={running ? css.timeRunning : css.timeValue}>
          {running ? `≥ ${formatMs(total)}` : formatMs(total)}
        </span>
      </div>
    </td>
  )
}

/** Props of the totals row. */
interface TotalsRowProps {
  readonly totals: StatsTotals
  readonly full: boolean
  readonly t: StatsTranslate
  readonly now: number
}

/** Bottom row summing the turns loaded in the current window. */
export function TotalsRow({ totals, full, t, now }: TotalsRowProps): ReactElement {
  const cells = metricsCells(totals, t)
  const value: TimeState = {
    running: false,
    startTime: null,
    wall: totals.wall,
    ttft: totals.ttft,
    model: totals.model,
    tool: totals.tool,
    toolWall: totals.toolWall,
  }
  return (
    <tr className={css.totalsRow} title={full ? t('totals.full.title') : t('totals.window.title')}>
      <td colSpan={2} className={css.totalsLabel}>
        <span className={css.totalsTitle}>{full ? t('totals.full') : t('totals.window')}</span>
        <span className={css.totalsMeta}>{` · ${t('summary', { turns: totals.turnCount, steps: totals.stepCount })}`}</span>
      </td>
      <td className={css.turnMetric} />
      <ContextCell value={totals.context} className={css.turnMetric} />
      <MetricCells cells={cells} className={css.turnMetric} />
      <TimeCell
        value={value}
        scale={totals.wall ?? 0}
        gap={undefined}
        className={css.turnMetric}
        trackClass={css.barTurn}
        now={now}
        t={t}
      />
    </tr>
  )
}

/** Display name of one prompt image: its recorded name, otherwise its position. */

export {
  COLUMN_DETAIL,
  COLUMN_FORMAT,
  COLUMN_PARTIAL,
  COLUMN_READ,
  ContextCell,
  MetricCells,
  MixBar,
  NumericColumn,
  TOTAL_COLUMNS,
  TimeCell,
  TotalsRowProps,
  metricCell,
  metricsCells,
  toolStat,
}
