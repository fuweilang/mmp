/** Locale-backed formatting and projection helpers for the trajectory ledger. */

import type { JsonTreeLabels, MarkdownLabels } from '@mammoth-ai/mmp-client-ui-primitives'
import { structuredPatch } from 'diff'
import type { AssistantMetricDetail, TrajectoryCellProps } from './trajectory-record.ts'
import type { TrajectoryTranslate } from './locales.ts'
import { codeProgram, PTC_TOOL_NAME } from './code-program.ts'
import { trajectoryPreviewText } from './trajectory-preview.ts'
import type {
  ParsedToolSchema, PromptDiffLine, ToolCallTextParts,
} from './trajectory-table-types.ts'

/** Minimum inspector split width in pixels. */
const DETAILS_MIN_WIDTH = 320
/** Maximum inspector split width in pixels. */
const DETAILS_MAX_WIDTH = 720
/** Minimum ledger width in pixels that the inspector must leave. */
const TABLE_MIN_WIDTH = 280
/** Keyboard resize step for the inspector split in pixels. */
const DETAILS_RESIZE_STEP = 16
/** Share of the split width the tool-request column uses while resizing. */
const TOOL_REQUEST_SHARE = 0.58
/** Minimum tool-request column width in pixels. */
const TOOL_REQUEST_MIN_WIDTH = 180
/** Maximum tool-request column width in pixels. */
const TOOL_REQUEST_MAX_WIDTH = 480
/** Share of the split width the tool-request column starts at. */
const DEFAULT_TOOL_REQUEST_SHARE = 0.36
/** Offset subtracted from the default tool-request width. */
const DEFAULT_TOOL_REQUEST_OFFSET = 56

/** JSON tree copy labels for the active locale.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function jsonTreeLabels(t: TrajectoryTranslate): JsonTreeLabels {
  return {
    copyValue: t('copy.value'),
    copyJson: t('copy.json'),
    copyPath: t('copy.path'),
    copyPrettyJson: t('copy.prettyJson'),
    copyCompactJson: t('copy.compactJson'),
    copied: t('copied'),
    copyFailed: t('copy.failed'),
    collapseNode: t('collapse'),
    expandNode: t('expand'),
    copyButtonTitle: action => t('copy.optionsHint', { action }),
  }
}

/** Markdown copy and footnote labels for the active locale.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function markdownLabels(t: TrajectoryTranslate): MarkdownLabels {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }
}


/** Clamp the inspector split width so the table keeps its minimum width.
 * @param width - the requested width in pixels.
 * @param splitWidth - the split container width in pixels.
 * @returns the derived value.
 */
function clampDetailsWidth(width: number, splitWidth: number): number {
  const maxWidth = Math.max(
    DETAILS_MIN_WIDTH,
    Math.min(DETAILS_MAX_WIDTH, splitWidth - TABLE_MIN_WIDTH),
  )
  return Math.round(Math.min(Math.max(width, DETAILS_MIN_WIDTH), maxWidth))
}

/** Remembered tool-request column width for a split at the given width.
 * @param splitWidth - the split container width in pixels.
 * @returns the derived value.
 */
function defaultToolRequestWidth(splitWidth: number): number {
  return Math.min(
    Math.max(
      splitWidth * DEFAULT_TOOL_REQUEST_SHARE - DEFAULT_TOOL_REQUEST_OFFSET,
      TOOL_REQUEST_MIN_WIDTH,
    ),
    TOOL_REQUEST_MAX_WIDTH,
  )
}

/** Localized duration for a millisecond span.
 * @param milliseconds - the span in milliseconds.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function formatDurationMs(milliseconds: number, t: TrajectoryTranslate): string {
  if (milliseconds < 1_000) return t('unit.milliseconds', { value: Math.round(milliseconds) })
  return t('unit.seconds', {
    value: (milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 2 : 1),
  })
}

/** Localized local time with milliseconds for one start timestamp.
 * @param timestamp - the start timestamp, or null when unavailable.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function formatStartedAt(timestamp: number | null, t: TrajectoryTranslate): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return t('timing.notAvailable')
  const date = new Date(timestamp)
  const two = (value: number) => String(value).padStart(2, '0')
  const three = (value: number) => String(value).padStart(3, '0')
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${three(date.getMilliseconds())}`
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
  return `${day} ${time}`
}

/**
 * Whether a click lands on an active text selection and should keep it.
 * @param target - the click target node.
 * @returns whether the click intersects the current selection.
 */
function clickSelectsText(target: Node): boolean {
  const selection = window.getSelection()
  return selection !== null
    && !selection.isCollapsed
    && selection.rangeCount > 0
    && selection.getRangeAt(0).intersectsNode(target)
}


/** Localized total span of one assistant metric block.
 * @param metrics - the assistant metric block.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function totalTime(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.timingRecorded) return t('timing.notRecorded')
  if (metrics.stepStartTime === null) return t('timing.stepStartUnavailable')
  if (metrics.completedTime === null) return t('status.pending')
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.stepStartTime), t)
}

/** Localized time to first token for one assistant metric block.
 * @param metrics - the assistant metric block.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function ttft(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.timingRecorded) return t('timing.notRecorded')
  if (metrics.stepStartTime === null) return t('timing.stepStartUnavailable')
  if (metrics.firstTokenTime === null) return t('timing.firstTokenUnavailable')
  return formatDurationMs(Math.max(0, metrics.firstTokenTime - metrics.stepStartTime), t)
}

/** Localized generation span between the first token and completion.
 * @param metrics - the assistant metric block.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function generationTime(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.timingRecorded || metrics.firstTokenTime === null) return t('timing.firstTokenUnavailable')
  if (metrics.completedTime === null) return t('status.pending')
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.firstTokenTime), t)
}

/** Localized output-token throughput for one assistant metric block.
 * @param metrics - the assistant metric block.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function throughput(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.usageProvided) return t('timing.usageUnavailable')
  if (metrics.outputTokens === null) return t('timing.outputTokensUnavailable')
  if (!metrics.timingRecorded || metrics.firstTokenTime === null) return t('timing.firstTokenUnavailable')
  if (metrics.completedTime === null) return t('status.pending')
  const generationSeconds = (metrics.completedTime - metrics.firstTokenTime) / 1_000
  if (generationSeconds <= 0) return t('timing.durationTooShort')
  return t('unit.tokensPerSecond', {
    value: (metrics.outputTokens / generationSeconds).toFixed(1),
  })
}


/** Localized label for one message source record.
 * @param source - the recorded message source.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function messageSourceLabel(source: unknown, t: TrajectoryTranslate): string {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return t('source.unknown')
  }
  const properties = source as Record<string, unknown>
  const kind = properties.kind
  if (kind === 'user') return t('source.user')
  if (kind === 'goal') {
    const round = properties.round
    return typeof round === 'number' && round > 0
      ? t('source.goalRound', { round })
      : t('source.goal')
  }
  if (typeof kind !== 'string' || kind === '') return t('source.unknown')
  return `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)}`
}


/** Display text for one record: program description, Markdown preview, or raw text.
 * @param cell - the record cell.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function recordDisplayText(cell: TrajectoryCellProps, t: TrajectoryTranslate): string {
  if (isToolCallOnly(cell, t)) return ''
  const program = codeProgram(cell)
  if (program !== undefined) return `${PTC_TOOL_NAME} · ${program.description.replace(/\s+/g, ' ')}`
  if (cell.previewMarkdown !== undefined) {
    const preview = trajectoryPreviewText(cell.previewMarkdown)
    if (cell.text === '') return preview
    return preview === '' ? cell.text : `${cell.text} · ${preview}`
  }
  if (cell.text !== '') return cell.text
  const markdown = cell.kind === 'user' || cell.kind === 'context'
    ? cell.inputDetail
    : cell.kind === 'message'
      ? cell.outputDetail ?? cell.thinkingDetail
      : undefined
  return markdown === undefined ? '' : trajectoryPreviewText(markdown)
}

/** Result text for one record, preferring the Markdown preview.
 * @param cell - the record cell.
 * @returns the derived value.
 */
function recordResultText(cell: TrajectoryCellProps): string | undefined {
  return cell.resultPreviewMarkdown === undefined
    ? cell.result
    : trajectoryPreviewText(cell.resultPreviewMarkdown)
}

/** Split one tool record text into its call name and argument text.
 * @param cell - the record cell.
 * @param text - the record text.
 * @returns the derived value.
 */
function toolCallTextParts(
  cell: TrajectoryCellProps,
  text: string,
): ToolCallTextParts | undefined {
  if (cell.kind !== 'tool' && cell.kind !== 'subtool') return undefined
  const program = cell.toolName === PTC_TOOL_NAME
  const separator = text.indexOf(' · ')
  if (separator === -1) return { name: text, program }
  return {
    program,
    name: text.slice(0, separator),
    args: text.slice(separator + 3),
  }
}

/** Whether a message record carries only the tool-call placeholder text.
 * @param cell - the record cell.
 * @param t - the trajectory translate seat.
 * @returns the derived value.
 */
function isToolCallOnly(cell: TrajectoryCellProps, t: TrajectoryTranslate): boolean {
  return cell.kind === 'message'
    && !cell.outputDetail
    && !cell.thinkingDetail
    && cell.text === t('layout.toolCallOnly')
}



/** Line diff between the previous and current system prompt.
 * @param before - the previous prompt.
 * @param after - the current prompt.
 * @returns the derived value.
 */
function promptDiffLines(before: string, after: string): readonly PromptDiffLine[] {
  const patch = structuredPatch('', '', before, after, undefined, undefined, { context: 3 })
  return patch.hunks.flatMap((hunk, hunkIndex) => [
    ...(hunkIndex === 0 ? [] : [{ kind: 'meta' as const, text: '' }]),
    {
      kind: 'meta' as const,
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    },
    ...hunk.lines.flatMap((line): PromptDiffLine[] => {
      if (line.startsWith('\\')) return []
      if (line.startsWith('+')) return [{ kind: 'added', text: line }]
      if (line.startsWith('-')) return [{ kind: 'removed', text: line }]
      return [{ kind: 'context', text: line }]
    }),
  ])
}


/** Parse one tool schema payload into its name, description, and parameters.
 * @param value - the raw text to parse.
 * @returns the derived value.
 */
function parseToolSchema(value: string): ParsedToolSchema | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const schema = parsed as Record<string, unknown>
    if (
      typeof schema.name !== 'string'
      || typeof schema.description !== 'string'
      || typeof schema.parameters !== 'object'
      || schema.parameters === null
      || Array.isArray(schema.parameters)
    ) return undefined
    return {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    }
  } catch {
    return undefined
  }
}

/** Parse one JSON object value, or undefined when the text is not one.
 * @param value - the raw text to parse.
 * @returns the derived value.
 */
function parseJsonContainer(value: string): object | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}


export {
  clickSelectsText,
  clampDetailsWidth,
  DEFAULT_TOOL_REQUEST_OFFSET,
  DEFAULT_TOOL_REQUEST_SHARE,
  defaultToolRequestWidth,
  DETAILS_MAX_WIDTH,
  DETAILS_MIN_WIDTH,
  DETAILS_RESIZE_STEP,
  formatDurationMs,
  formatStartedAt,
  generationTime,
  isToolCallOnly,
  jsonTreeLabels,
  markdownLabels,
  messageSourceLabel,
  parseJsonContainer,
  parseToolSchema,
  promptDiffLines,
  recordDisplayText,
  recordResultText,
  TABLE_MIN_WIDTH,
  throughput,
  TOOL_REQUEST_MAX_WIDTH,
  TOOL_REQUEST_MIN_WIDTH,
  TOOL_REQUEST_SHARE,
  toolCallTextParts,
  totalTime,
  ttft,
}
