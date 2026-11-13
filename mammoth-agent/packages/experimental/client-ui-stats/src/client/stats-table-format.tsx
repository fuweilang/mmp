import type { CodeLine, FileContent, TimeState, ViewMode } from './StatsTable.tsx'
import type { StatsTranslate } from './locales.ts'
import type { StatsEventKind, StatsEventMetrics } from './stats-contract.ts'
import { formatTokens } from './stats-format.ts'
import { isNumber } from './stats-usage.ts'
import type { ImageAttachmentRef } from '@mammoth-ai/mmp-attachment'
import type { ReactElement, ReactNode } from 'react'
import css from './stats.module.css'

const TOOL_TONES: Readonly<Record<string, number>> = {
  read: 0,
  glob: 1,
  grep: 1,
  edit: 2,
  write: 2,
  apply_patch: 2,
  pwsh: 4,
  shell: 4,
  bash: 4,
  web_fetch: 5,
  web_search: 5,
  ask_user_question: 3,
  todo_write: 7,
  subagent: 5,
  subagent_fork: 5,
}

/** Tone classes, one per palette index; each sets `--stats-tool-color`. */
const TONE_CLASSES: readonly (string | undefined)[] = [
  css.tone0, css.tone1, css.tone2, css.tone3,
  css.tone4, css.tone5, css.tone6, css.tone7,
]

/**
 * Join CSS module classes into one `className`, dropping absent entries: the
 * module's index-signature declaration types every lookup as possibly absent
 * under `noUncheckedIndexedAccess`.
 * @param names - class names in declaration order.
 * @returns the space-joined class list.
 */
function cx(...names: readonly (string | undefined)[]): string {
  return names.filter((name): name is string => name !== undefined).join(' ')
}

/** Business face injected by the browser plugin. */

function toneIndex(name: string | null): number {
  if (name === null) return 7
  const fixed = TOOL_TONES[name]
  if (fixed !== undefined) return fixed
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 9973
  }
  return hash % TONE_CLASSES.length
}

/** CSS class carrying the tool tone for one call name. */
function toneClass(name: string | null): string | undefined {
  return TONE_CLASSES[toneIndex(name)]
}

/** Whether a row is running with no measured wall time yet. */
export function isTimeRunning(value: TimeState): boolean {
  return value.running && !isNumber(value.wall) && isNumber(value.startTime)
}

/** Measured span; a running row falls back to the elapsed time at `now`. */
export function totalSpan(value: TimeState, now: number): number | null {
  if (isNumber(value.wall)) return value.wall
  if (isNumber(value.startTime) && value.running) return Math.max(0, now - value.startTime)
  return null
}

/** Default fold state of a turn the user never toggled. */
export function defaultTurnOpen(mode: ViewMode, turnNumber: number, latestTurn: number | null): boolean {
  if (mode === 'all') return true
  if (mode === 'none') return false
  return turnNumber === latestTurn
}

/** Fresh table state: follow the newest turn's open default. */

function at(lines: readonly string[], index: number): string {
  return lines[index] as string
}

/** Split a text block into lines; an empty string has no lines. */
function splitLines(text: string): readonly string[] {
  return text === '' ? [] : text.split('\n')
}

/** Map a plain text block to code lines. */
function textLines(text: string): readonly CodeLine[] {
  return splitLines(text).map(line => ({ sign: ' ', text: line }))
}

/**
 * Readable argument body: parse and indent JSON by two spaces, or keep the
 * text verbatim when the model produced arguments this build cannot parse.
 * @param args - raw tool arguments as recorded.
 * @returns the body the raw view displays and copies.
 */
function prettyArguments(args: string): string {
  try {
    const parsed: unknown = JSON.parse(args)
    return JSON.stringify(parsed, null, 2)
  } catch {
    // Model-produced arguments are not always JSON; show them verbatim.
    return args
  }
}

/**
 * Line-level diff: removal/addition rows for the parts that differ, common
 * lines kept in place. Above the size cap the two sides are shown whole.
 */
function lineDiff(before: string | null, after: string | null): readonly CodeLine[] {
  const left = splitLines(before ?? '')
  const right = splitLines(after ?? '')
  if (left.length > DIFF_LINE_LIMIT || right.length > DIFF_LINE_LIMIT) {
    return [
      ...left.map(text => ({ sign: '−' as const, text })),
      ...right.map(text => ({ sign: '+' as const, text })),
    ]
  }
  const width = right.length + 1
  // LCS lengths for cells with row and column at least 1; the implicit zero row
  // and column are served by the missing-key fallback, never stored.
  const table = new Map<number, number>()
  let previousRow = 0
  for (let row = 1; row <= left.length; row += 1) {
    let leftCell = 0
    for (let column = 1; column <= right.length; column += 1) {
      const up = table.get(previousRow + column) ?? 0
      const diagonal = table.get(previousRow + column - 1) ?? 0
      const value = at(left, row - 1) === at(right, column - 1)
        ? diagonal + 1
        : Math.max(up, leftCell)
      table.set(row * width + column, value)
      leftCell = value
    }
    previousRow = row * width
  }
  const rows: CodeLine[] = []
  let row = left.length
  let column = right.length
  while (row > 0 && column > 0) {
    const leftLine = at(left, row - 1)
    const rightLine = at(right, column - 1)
    if (leftLine === rightLine) {
      rows.push({ sign: ' ', text: leftLine })
      row -= 1
      column -= 1
    } else if ((table.get((row - 1) * width + column) ?? 0) >= (table.get(row * width + column - 1) ?? 0)) {
      rows.push({ sign: '−', text: leftLine })
      row -= 1
    } else {
      rows.push({ sign: '+', text: rightLine })
      column -= 1
    }
  }
  while (row > 0) {
    rows.push({ sign: '−', text: at(left, row - 1) })
    row -= 1
  }
  while (column > 0) {
    rows.push({ sign: '+', text: at(right, column - 1) })
    column -= 1
  }
  return rows.reverse()
}

/** Unwrap the `<path>`/`<content>` envelope a `read` result carries. */
function fileContentOf(text: string | null): FileContent | null {
  if (text === null) return null
  const open = text.indexOf('<content>')
  const close = text.lastIndexOf('</content>')
  if (open < 0 || close < 0 || close < open) return null
  const pathMatch = /<path>([\s\S]*?)<\/path>/.exec(text)
  const body = text.slice(open + '<content>'.length, close).replace(/^\n/, '')
  let path: string | null = null
  if (pathMatch !== null) {
    /* v8 ignore next -- a matched `<path>` group is non-optional in the regexp, so the fallback is unreachable. */
    path = (pathMatch[1] ?? '').trim()
  }
  return { path, body }
}

/** CSS class of one code line by its diff sign. */
function lineClass(sign: CodeLine['sign']): string | undefined {
  if (sign === '+') return css.diffAdd
  if (sign === '−') return css.diffDel
  return css.codeLine
}

/** Code block: monospaced lines, capped at CODE_LINE_LIMIT rows. */
function codeBlock(lines: readonly CodeLine[], t: StatsTranslate, wrap: boolean): ReactElement {
  const shown = lines.length > CODE_LINE_LIMIT ? lines.slice(0, CODE_LINE_LIMIT) : lines
  return (
    <pre className={wrap ? cx(css.code, css.codeWrap) : css.code}>
      {shown.map((line, index) => (
        <span key={index} className={lineClass(line.sign)}>
          {line.sign === ' ' ? line.text : `${line.sign} ${line.text}`}
        </span>
      ))}
      {shown.length < lines.length ? (
        <span className={css.blockEmpty}>
          {t('detail.lineCap', { shown: formatTokens(shown.length), total: formatTokens(lines.length) })}
        </span>
      ) : null}
    </pre>
  )
}

/** Body of one tool call: raw arguments, a line diff, a file, or result text. */

function imageName(attachment: ImageAttachmentRef, index: number, count: number, t: StatsTranslate): string {
  return attachment.name ?? t('imagePreview.alt', { index, count })
}

/** One prompt-image thumbnail: loads while the preview is open and opens the full image on click. */

const TEAM_FRAME = /^Team message from /u
const AGENT_FRAME = /^Agent \S+ sent a message:/u
const SUBAGENT_FRAME = /^Background subagent \S+ finished/u

/** Label of the concrete wake frame, falling back to the producer source kind. */
function triggerLabelOf(text: string, source: string, t: StatsTranslate): string {
  if (TEAM_FRAME.test(text)) return t('trigger.team-message')
  if (source === 'subagent-settled' && SUBAGENT_FRAME.test(text)) return t('trigger.subagent-settled')
  if (source === 'agent-message' && AGENT_FRAME.test(text)) return t('trigger.agent-message')
  return triggerLabel(source, t)
}

/** Remove the transport framing so only the message body is previewed. */
function triggerBodyOf(text: string): string {
  return text
    .replace(/^Team message from [^:]+:\s*/u, '')
    .replace(/^Agent \S+ sent a message:\s*/u, '')
    .replace(/^Background subagent \S+ finished\s*/u, '')
}

/** Localized label for one automated turn trigger. */
function triggerLabel(source: string, t: StatsTranslate): string {
  switch (source) {
    case 'agent-message': return t('trigger.agent-message')
    case 'team-message': return t('trigger.team-message')
    case 'subagent-settled': return t('trigger.subagent-settled')
    case 'schedule': return t('trigger.schedule')
    case 'webhook': return t('trigger.webhook')
    case 'tool-jobs': return t('trigger.tool-jobs')
    case 'cordis-host-runner': return t('trigger.cordis-host-runner')
    case 'goal': return t('trigger.goal')
    case 'runtime-context':
    case 'time-context': return t('trigger.context')
    default: return t('trigger.other')
  }
}

/** Step did column: tool calls grouped by name and target, with output sizes. */
/** One-line answer preview appended beside the answer label. */
function answerPreview(answer: string | null): ReactNode {
  if (answer === null) return null
  const line = answer.split('\n').find(part => part.trim() !== '') ?? ''
  if (line.trim() === '') return null
  return <span className={css.answerPreview} title={answer}>{` · ${line.trim()}`}</span>
}


function eventLabel(kind: StatsEventKind, t: StatsTranslate): string {
  switch (kind) {
    case 'request-header': return t('event.request-header')
    case 'system-prompt': return t('event.system-prompt')
    case 'tool-set': return t('event.tool-set')
    case 'context-prune': return t('event.context-prune')
    case 'request-context': return t('event.request-context')
    case 'model-retry': return t('event.model-retry')
    case 'model-attempt': return t('event.model-attempt')
    case 'context-refresh': return t('event.context-refresh')
    case 'approval': return t('event.approval')
    /* v8 ignore next -- StatsEventKind is exhaustive. */
    default: return ''
  }
}

/** Localized request-header reason. */
function eventReason(reason: string | null, t: StatsTranslate): string {
  switch (reason) {
    case 'initial': return t('event.reason.initial')
    case 'resume': return t('event.reason.resume')
    case 'change': return t('event.reason.change')
    case 'series': return t('event.reason.series')
    default: return reason ?? ''
  }
}

/** Localized system-message operation. */
function eventAction(action: StatsEventMetrics['surfaceOp'], t: StatsTranslate): string {
  switch (action) {
    case 'append': return t('event.system.append')
    case 'replace': return t('event.system.replace')
    case 'clear': return t('event.system.clear')
    /* v8 ignore next -- surfaceOp is null or one of the three actions. */
    default: return ''
  }
}

/** Localized Context refresh source. */
function eventSource(source: string | null, t: StatsTranslate): string {
  switch (source) {
    case 'runtime-context': return t('event.source.runtime')
    case 'time-context': return t('event.source.time')
    default: return source ?? ''
  }
}

/** Localized approval state or outcome. */
function eventApproval(status: string | null, t: StatsTranslate): string {
  switch (status) {
    case 'asked': return t('event.approval.asked')
    case 'allowed-once': return t('event.approval.allowed')
    case 'rejected': return t('event.approval.rejected')
    case 'cancelled': return t('event.approval.cancelled')
    case 'unavailable': return t('event.approval.unavailable')
    default: return status ?? ''
  }
}

/** One-line explanation of a non-step event. */

/** Steps one turn renders before the "show all" control appears. */
const STEP_LIMIT = 24
/** Ignore sub-second idles when showing the gap since the previous step. */
const STEP_GAP_MIN_MS = 1_000
/** Lines one code block renders before the line-cap notice. */
const CODE_LINE_LIMIT = 400
/** Line count above which a diff falls back to whole-side removal and addition. */
const DIFF_LINE_LIMIT = 300

export {
  AGENT_FRAME,
  STEP_GAP_MIN_MS,
  STEP_LIMIT,
  SUBAGENT_FRAME,
  TEAM_FRAME,
  TONE_CLASSES,
  TOOL_TONES,
  answerPreview,
  at,
  codeBlock,
  cx,
  eventAction,
  eventApproval,
  eventLabel,
  eventReason,
  eventSource,
  fileContentOf,
  imageName,
  lineClass,
  lineDiff,
  prettyArguments,
  splitLines,
  textLines,
  toneClass,
  toneIndex,
  triggerBodyOf,
  triggerLabel,
  triggerLabelOf,
}
