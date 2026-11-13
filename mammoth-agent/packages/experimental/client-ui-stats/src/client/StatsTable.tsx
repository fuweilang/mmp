import type { NumericColumn } from './stats-table-columns.tsx'
import {
  ContextCell, MetricCells, metricsCells, MixBar, TimeCell, toolStat, TOTAL_COLUMNS,
} from './stats-table-columns.tsx'
import { callGroups, contextDeltas, stepGaps, stepsOf } from './stats-table-data.tsx'
import {
  STEP_GAP_MIN_MS, STEP_LIMIT, answerPreview, codeBlock, cx, eventAction,
  eventApproval, eventLabel, eventReason, eventSource, fileContentOf, imageName,
  lineDiff, prettyArguments, textLines, toneClass, totalSpan, triggerBodyOf,
  triggerLabelOf,
} from './stats-table-format.tsx'
import type { StatsTranslate } from './locales.ts'
import type { ContextMode } from './stats-aggregate.ts'
import { turnContext } from './stats-aggregate.ts'
import type {
  LoadOlderResult, StatsCall, StatsCompactionMetrics, StatsEventMetrics, StatsSnapshot, StatsStepMetrics, StatsToolCount, StatsTurnMetrics,
} from './stats-contract.ts'
import { CALL_LIMIT } from './stats-fold.ts'
import {
  DASH, formatChars, formatClock, formatDateTime, formatDateTimeMs, formatDateTimeShort, formatMs, formatStepClock, formatTokens,
} from './stats-format.ts'
import { isNumber } from './stats-usage.ts'
import type { ImageAttachmentRef } from '@mammoth-ai/mmp-attachment'
import type { ObservableSnapshot } from '@mammoth-ai/mmp-client-store'
import type { ConvViewProps } from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { MarkdownLabels } from '@mammoth-ai/mmp-client-ui-primitives'
import { HoverCard, ImageLightbox, MarkdownText } from '@mammoth-ai/mmp-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@mammoth-ai/mmp-client-ui-slots'
import type { ReactElement, ReactNode } from 'react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import css from './stats.module.css'

/**
 * Statistics table for one conversation: per-turn aggregates, expandable step
 * rows, the time-composition bars, and the per-step tool-call accordion.
 */

export interface StatsViewInjected {
  /** Snapshot sources bound by InjectFace. */
  hooks: {
    /** This target's snapshot; InjectFace exposes it as `useStats`. */
    stats: ObservableSnapshot<StatsSnapshot>
  }
  /**
   * Load one older history page into the published window.
   * @returns whether the page grew, exhausted history, or must be retried.
   */
  loadOlder: () => Promise<LoadOlderResult>
  /** Cancel a pending open-window wait when this view unmounts. */
  cancel: () => void
  /**
   * Resolve one durable prompt image through the shared Conversation image cache.
   * @param attachment - image reference the user message recorded.
   * @returns browser URL owned by the cache for the Session binding's lifetime.
   */
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
}

/** Full props of the performance conversation View. */
export type StatsViewProps =
  ConvViewProps & InjectFace<StatsViewInjected> & PropsLocale<'stats'>

/** Resolve one durable prompt image to a browser URL. */
type LoadImage = StatsViewInjected['loadImage']

/** Prompt image shown by the full-size lightbox. */
interface LightboxImage {
  readonly src: string
  readonly alt: string
}

/** Load state of one preview thumbnail. */
type ImageLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly src: string }

/** Open/closed default for turns the user never toggled explicitly. */
type ViewMode = 'newest' | 'all' | 'none'

/** Step-list presentation of one turn: newest slice or all steps, plus filters. */
export interface StepViewState {
  readonly mode?: 'tail' | 'all'
  readonly filter?: string | null
  readonly open?: Readonly<Record<number, boolean>>
  readonly raw?: Readonly<Record<string, boolean>>
  readonly wrap?: boolean
}

/** Component-local table state: turn folds and per-turn step state. */
export interface ViewState {
  readonly mode: ViewMode
  readonly openTurns: Readonly<Record<number, boolean>>
  readonly stepViews: Readonly<Record<number, StepViewState>>
  readonly showTotals: boolean
  readonly showEvents: boolean
  readonly showContextDelta: boolean
  readonly contextMode: ContextMode
}

/** Fields both row kinds expose to the numeric column helpers. */
interface MetricsValues {
  readonly context: number | null
  readonly output: number | null
  readonly cacheHit: number | null
  readonly ttft: number | null
  readonly model: number | null
  readonly tps: number | null
  readonly tool: number | null
  readonly cacheRead: number | null
  readonly cacheWrite: number | null
  /** Weighted prompt denominator of a turn's cache rate; step rows use `context`. */
  readonly cacheContext?: number | null
  readonly ttftPending?: number
  readonly modelPending?: number
  readonly toolPending?: number
}

/** Fields the scope markers read from a turn or step row. */
interface ScopeState {
  readonly running: boolean
  readonly interrupted: boolean
  readonly aborted: boolean
  readonly retries: number
  readonly cacheHit: number | null
}

/** Fields the time-composition bar reads from a turn or step row. */
interface TimeState {
  readonly running: boolean
  readonly startTime: number | null
  readonly wall: number | null
  readonly ttft: number | null
  readonly model: number | null
  readonly tool: number | null
  /** Non-overlapping union of the paired tool calls; the bar prefers it over `tool`. */
  readonly toolWall: number | null
}

/** Text and tooltip of one numeric cell. */
interface CellText {
  readonly text: string
  readonly title: string
}

/** One numeric cell with its column name. */
interface MetricCell extends CellText {
  readonly name: NumericColumn
}

/** One rendered code line: diff sign plus the line text. */
interface CodeLine {
  readonly sign: ' ' | '+' | '−'
  readonly text: string
}

/** File body unwrapped from a `read` tool result. */
interface FileContent {
  readonly path: string | null
  readonly body: string
}

/** A tool-name plus target group shown in the step's did column. */
interface CallGroup {
  readonly key: string
  readonly name: string | null
  readonly hint: string | null
  readonly calls: readonly StatsCall[]
}

/** Table state shared by one turn's rendered rows. */
interface TurnRowsOptions {
  readonly turn: StatsTurnMetrics
  readonly t: StatsTranslate
  readonly loadImage: LoadImage
  readonly now: number
  readonly open: boolean
  readonly state: StepViewState
  readonly turnScale: number
  readonly contextMode: ContextMode
  readonly showEvents: boolean
  readonly showContextDelta: boolean
  readonly contextDelta: number | null
  readonly onToggle: () => void
  readonly onToggleDetail: (stepNumber: number) => void
  readonly onControl: (patch: Partial<StepViewState>) => void
}

/** Row state of one turn's step rows (no turn header fields). */
interface StepRowsOptions {
  readonly turn: StatsTurnMetrics
  readonly t: StatsTranslate
  readonly now: number
  readonly state: StepViewState
  readonly showEvents: boolean
  readonly showContextDelta: boolean
  readonly onToggleDetail: (stepNumber: number) => void
  readonly onControl: (patch: Partial<StepViewState>) => void
}

/** Props of one tool-call block inside the step accordion. */
interface CallBlockProps {
  readonly call: StatsCall
  readonly t: StatsTranslate
  readonly wrap: boolean
  readonly raw: boolean
  readonly onToggleRaw: () => void
}

/** Props of the clipboard button; it renders only where the host exposes the Clipboard API. */
interface CopyButtonProps {
  readonly clipboard: Clipboard
  readonly clipboardValue: string
  readonly t: StatsTranslate
}

/** Props of one numeric cell group (context excluded by the caller). */
interface MetricCellsProps {
  readonly cells: readonly MetricCell[]
  readonly className: string | undefined
}

/** Props of the context column cell. */
interface ContextCellProps {
  readonly value: number | null
  readonly className: string | undefined
  readonly delta?: number | null
}

/** Props of the time-composition cell. */
interface TimeCellProps {
  readonly value: TimeState
  readonly scale: number
  readonly gap: number | undefined
  readonly className: string | undefined
  readonly trackClass: string | undefined
  readonly now: number
  readonly t: StatsTranslate
}

/** Props of the pagination/expand footer button. */
interface TableButtonProps {
  readonly caption: string
  readonly enabled: boolean
  readonly onClick: () => void
}

/** Props of the prompt column cell. */
interface PromptCellProps {
  readonly turn: StatsTurnMetrics
  readonly t: StatsTranslate
  readonly className: string | undefined
  readonly loadImage: LoadImage
}

/** Props of one preview thumbnail inside the image popover. */
interface PromptImageThumbProps {
  readonly attachment: ImageAttachmentRef
  readonly index: number
  readonly count: number
  readonly loadImage: LoadImage
  readonly t: StatsTranslate
  readonly onOpen: (image: LightboxImage) => void
}

/** Props of the image-count pill and its hover/focus preview. */
interface ImagePromptPillProps {
  readonly first: ImageAttachmentRef
  readonly images: readonly ImageAttachmentRef[]
  readonly loadImage: LoadImage
  readonly t: StatsTranslate
}

/** Empty per-turn step state, shared so unexpanded turns allocate nothing. */

function callBody(call: StatsCall, t: StatsTranslate, wrap: boolean, raw: boolean): ReactNode {
  if (raw && call.args !== null) {
    return (
      <Fragment>
        <div className={css.blockSub}>{t('detail.args')}</div>
        {codeBlock(textLines(prettyArguments(call.args)), t, true)}
      </Fragment>
    )
  }
  const edited = call.name === 'edit' || call.name === 'write' || call.name === 'apply_patch'
  if (edited) {
    const rows = lineDiff(call.before, call.after)
    if (rows.length > 0) {
      return (
        <Fragment>
          <div className={css.blockSub}>{t('detail.diff')}</div>
          {codeBlock(rows, t, wrap)}
        </Fragment>
      )
    }
  }
  const file = call.name === 'read' ? fileContentOf(call.text) : null
  if (file !== null) {
    const lines: readonly CodeLine[] = file.body.split('\n').map(line => ({
      sign: ' ' as const,
      text: line.replace(/^\s*\d+:\s?/, ''),
    }))
    return (
      <Fragment>
        <div className={css.blockSub}>
          {file.path ?? t('detail.file')}
          {` · ${t('detail.lines', { lines: formatTokens(lines.length) })}`}
        </div>
        {codeBlock(lines, t, wrap)}
      </Fragment>
    )
  }
  if (call.text === null) return <div className={css.blockEmpty}>{t('detail.emptyBody')}</div>
  return (
    <Fragment>
      {call.truncated ? (
        <div className={css.blockSub}>
          {t('detail.truncated', { chars: formatTokens(call.text.length) })}
        </div>
      ) : null}
      {codeBlock(textLines(call.text), t, wrap)}
    </Fragment>
  )
}

/** Clipboard button: copies the displayed body and reports the outcome for a moment. */
function CopyButton({ clipboard, clipboardValue, t }: CopyButtonProps): ReactElement {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (status === 'idle') return undefined
    const timer = setTimeout(() => { setStatus('idle') }, COPY_FEEDBACK_MS)
    return () => { clearTimeout(timer) }
  }, [status])
  const label = status === 'copied'
    ? t('detail.copied')
    : status === 'failed' ? t('detail.copyFailed') : t('detail.copy')
  return (
    <button
      type="button"
      className={css.copy}
      title={t('detail.copy.title')}
      onClick={() => {
        try {
          void clipboard.writeText(clipboardValue).then(
            () => { setStatus('copied') },
            () => { setStatus('failed') },
          )
        } catch {
          // A synchronous refusal (missing writer, blocked frame) is a failed copy, not a silent one.
          setStatus('failed')
        }
      }}
    >
      {label}
    </button>
  )
}

/**
 * Host Clipboard API, or undefined where the app cannot copy.
 * lib.dom declares the member non-optional, but insecure contexts and jsdom omit it.
 * @returns the clipboard, or undefined when the host exposes none.
 */
function clipboardOf(): Clipboard | undefined {
  return navigator.clipboard
}

/** One tool call's accordion block: head metadata plus the selected body. */
function CallBlock({ call, t, wrap, raw, onToggleRaw }: CallBlockProps): ReactElement {
  const meta: string[] = []
  if (isNumber(call.chars)) meta.push(t('detail.chars', { chars: formatTokens(call.chars) }))
  if (isNumber(call.lines)) meta.push(t('detail.lines', { lines: formatTokens(call.lines) }))
  if (isNumber(call.ms)) meta.push(formatMs(call.ms))
  const fallback = [call.before ?? '', call.after ?? ''].filter(part => part !== '').join('\n')
  // Copy exactly what the body shows: the pretty raw arguments while that view
  // is active, otherwise the result text or the before/after fallback.
  const clipboardValue = raw && call.args !== null ? prettyArguments(call.args) : call.text ?? fallback
  const clipboard = clipboardOf()
  return (
    <div className={css.block}>
      <div className={css.blockHead}>
        <span className={cx(css.toolName, toneClass(call.name))}>{call.name ?? '?'}</span>
        {call.hint === null ? null : <span className={css.blockHint}>{` ${call.hint}`}</span>}
        {meta.length === 0 ? null : <span className={css.blockMeta}>{` · ${meta.join(' · ')}`}</span>}
        {call.error ? (
          <span className={css.failPill} title={t('tool.failed.title', { count: 1 })}>
            {t('tool.failed', { count: 1 })}
          </span>
        ) : null}
        {call.args === null ? null : (
          <button
            type="button"
            className={raw ? css.chipOn : css.chip}
            title={t('detail.raw.title')}
            aria-pressed={raw}
            onClick={(event) => {
              event.stopPropagation()
              onToggleRaw()
            }}
          >
            {'{}'}
          </button>
        )}
        {clipboardValue === '' || clipboard === undefined
          ? null
          : <CopyButton clipboard={clipboard} clipboardValue={clipboardValue} t={t} />}
      </div>
      {callBody(call, t, wrap, raw)}
    </div>
  )
}

/** Scope markers: running/interrupted/unsettled, retries, and cache misses. */
function scopeMarkers(value: ScopeState, t: StatsTranslate): ReactNode {
  return (
    <Fragment>
      {value.running ? <span className={css.stateRunning}>{t('state.running')}</span> : null}
      {!value.running && value.interrupted
        ? <span className={css.stateWarn}>{t('state.interrupted')}</span>
        : null}
      {!value.running && !value.interrupted && value.aborted
        ? (
          <span className={css.stateMuted} title={t('state.aborted.title')}>
            {t('state.aborted')}
          </span>
        )
        : null}
      {value.retries > 0
        ? <span className={css.stateWarn}>{t('did.retry', { count: value.retries })}</span>
        : null}
      {isNumber(value.cacheHit) && value.cacheHit < 0.5
        ? (
          <span className={css.stateWarn} title={t('state.cacheMiss.title')}>
            {t('state.cacheMiss')}
          </span>
        )
        : null}
    </Fragment>
  )
}

/** Tool pill with its tone dot and call count. */
function ToolPill({ item, t }: { readonly item: StatsToolCount; readonly t: StatsTranslate }): ReactElement {
  return (
    <span className={css.pill} title={t('did.title', { calls: item.count, tools: item.name })}>
      <span className={cx(css.dot, toneClass(item.name))} />
      {`${item.name} ×${item.count}`}
    </span>
  )
}

/** Turn tool composition bar: one growing segment per tool, ordered by count. */

function PromptImageThumb({
  attachment, index, count, loadImage, t, onOpen,
}: PromptImageThumbProps): ReactElement {
  const [image, setImage] = useState<ImageLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    void loadImage(attachment).then(
      (src) => { if (live) setImage({ status: 'ready', src }) },
      () => { if (live) setImage({ status: 'failed' }) },
    )
    return () => { live = false }
  }, [attachment, loadImage, attempt])
  if (image.status === 'ready') {
    const name = imageName(attachment, index, count, t)
    return (
      <button
        type="button"
        className={css.imageThumb}
        aria-label={t('imagePreview.open', { index, count })}
        title={t('imagePreview.open', { index, count })}
        onClick={(event) => {
          // A portalled preview click still bubbles through the row that toggles the turn.
          event.stopPropagation()
          onOpen({ src: image.src, alt: name })
        }}
      >
        <img src={image.src} alt={name} />
      </button>
    )
  }
  return (
    <span className={css.imageThumbStatus} data-state={image.status}>
      <span>{image.status === 'loading' ? t('imagePreview.loading') : t('imagePreview.failed')}</span>
      {image.status === 'failed' ? (
        <button
          type="button"
          className={css.chip}
          onClick={(event) => {
            event.stopPropagation()
            setImage({ status: 'loading' })
            setAttempt(value => value + 1)
          }}
        >
          {t('imagePreview.retry')}
        </button>
      ) : null}
    </span>
  )
}

/**
 * Image-count pill for one turn's prompt: hovering or focusing it previews the
 * images, and clicking it loads the first one full size. URLs come from the
 * shared Conversation image cache, which owns their lifetime per Session.
 */
function ImagePromptPill({ first, images, loadImage, t }: ImagePromptPillProps): ReactElement {
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const count = images.length
  const closeLightbox = useCallback(() => { setLightbox(null) }, [])
  const label = status === 'idle'
    ? t('turn.images', { count })
    : status === 'loading' ? t('imagePreview.loading') : t('imagePreview.failed')
  const preview = (
    <div
      className={css.imagePreview}
      role="group"
      aria-label={t('imagePreview.dialog')}
      data-single={count === 1 || undefined}
    >
      {images.map((attachment, offset) => (
        <PromptImageThumb
          key={`${attachment.attachmentId}:${offset}`}
          attachment={attachment}
          index={offset + 1}
          count={count}
          loadImage={loadImage}
          t={t}
          onOpen={setLightbox}
        />
      ))}
    </div>
  )
  return (
    <Fragment>
      <HoverCard
        inline
        openDelayMs={IMAGE_PREVIEW_DELAY_MS}
        anchor={(
          <button
            type="button"
            className={cx(css.triggerPill, css.imagePill)}
            data-state={status}
            title={t('imagePreview.hint')}
            onClick={(event) => {
              // The row toggles its steps on click; the pill opens the image instead.
              event.stopPropagation()
              setStatus('loading')
              void loadImage(first).then(
                (src) => {
                  setStatus('idle')
                  setLightbox({ src, alt: imageName(first, 1, count, t) })
                },
                () => { setStatus('failed') },
              )
            }}
          >
            {label}
          </button>
        )}
        content={preview}
      />
      {lightbox === null ? null : (
        <span onClick={(event) => { event.stopPropagation() }}>
          <ImageLightbox
            src={lightbox.src}
            alt={lightbox.alt}
            labels={{ dialog: t('imagePreview.dialog'), close: t('imagePreview.close') }}
            onClose={closeLightbox}
          />
        </span>
      )}
    </Fragment>
  )
}

/** Prompt column: the turn's user question, clipped with the full text in the title. */
function PromptCell({ turn, t, className, loadImage }: PromptCellProps): ReactElement {
  const images = turn.promptImages
  const first = images[0]
  const pill = first === undefined
    ? null
    : <ImagePromptPill first={first} images={images} loadImage={loadImage} t={t} />
  const source = turn.promptSource
  if (source !== null && source !== 'user') {
    // Automated turns show the wake tag, the named sender when known, and the
    // body with its transport framing removed.
    const raw = turn.prompt ?? ''
    const base = triggerLabelOf(raw, source, t)
    const sender = turn.promptSender
    const label = sender === null ? base : `${base} · ${sender}`
    const text = triggerBodyOf(raw)
    return (
      <td className={className} title={raw === '' ? label : raw}>
        <span className={css.promptClip}>
          <span className={css.triggerPill}>{label}</span>
          {pill}
          {text === '' ? null : <span className={css.promptText}>{text}</span>}
        </span>
      </td>
    )
  }
  if (turn.prompt === null || turn.prompt === '') {
    // An image-only prompt still says how many images opened the turn.
    if (first === undefined) return <td className={className} />
    return (
      <td className={className} title={t('turn.images', { count: images.length })}>
        {pill}
      </td>
    )
  }
  return (
    <td className={className} title={turn.prompt}>
      <span className={css.promptText}>{turn.prompt}</span>
      {pill}
    </td>
  )
}


function stepDidCell(step: StatsStepMetrics, t: StatsTranslate): ReactElement {
  const nodes: ReactNode[] = []
  if (step.toolErrors > 0) {
    nodes.push(
      <span key="failed" className={css.failPill} title={t('tool.failed.title', { count: step.toolErrors })}>
        {t('tool.failed', { count: step.toolErrors })}
      </span>,
    )
  }
  if (step.tools.length === 0) {
    const label = step.running ? t('did.working') : step.aborted ? t('did.aborted') : t('did.answer')
    nodes.push(<span key="text">{label}</span>)
    nodes.push(<Fragment key="answer">{answerPreview(step.answer)}</Fragment>)
    return (
      <td className={css.stepDid}>
        <span className={css.didClip}>{nodes}</span>
      </td>
    )
  }
  const groups = callGroups(step.calls)
  const shown = groups.slice(0, 3)
  let shownCalls = 0
  shown.forEach((group, index) => {
    shownCalls += group.calls.length
    if (index > 0) nodes.push(<span key={`sep:${group.key}`} className={css.didSep}>·</span>)
    nodes.push(
      <span key={`name:${group.key}`} className={cx(css.toolName, toneClass(group.name))}>
        {group.name ?? '?'}
      </span>,
    )
    if (group.calls.length > 1) {
      nodes.push(<span key={`count:${group.key}`} className={css.countBadge}>{`×${group.calls.length}`}</span>)
    }
    if (group.hint !== null) {
      nodes.push(<span key={`hint:${group.key}`} className={css.didHint}>{` ${group.hint}`}</span>)
    }
    if (group.name !== null) {
      nodes.push(<Fragment key={`stat:${group.key}`}>{toolStat(group.name, group.calls, t)}</Fragment>)
    }
  })
  const totalCalls = step.tools.reduce((sum, item) => sum + item.count, 0)
  if (totalCalls > shownCalls) {
    nodes.push(
      <span key="more" className={css.didHint}>
        {` ${t('did.rest', { count: totalCalls - shownCalls })}`}
      </span>,
    )
  }
  return (
    <td className={css.stepDid}>
      <span className={css.didClip}>{nodes}</span>
    </td>
  )
}

/** Turn did column: tool pills, composition bar, and total tool output. */
function turnDidCell(turn: StatsTurnMetrics, t: StatsTranslate): ReactElement {
  if (turn.tools.length === 0) {
    const label = turn.running ? t('did.working') : turn.aborted ? t('did.aborted') : t('did.answer')
    return (
      <td className={css.turnDid} title={turn.answer ?? undefined}>
        <span className={css.didClip}>
          {label}
          {answerPreview(turn.answer)}
        </span>
      </td>
    )
  }
  const totalCalls = turn.tools.reduce((sum, item) => sum + item.count, 0)
  const shown = turn.tools.slice(0, 3)
  const title = t('did.title', {
    calls: totalCalls,
    tools: turn.tools.map(item => `${item.name} ×${item.count}`).join(' · '),
  })
  return (
    <td className={css.turnDid} title={title}>
      <div className={css.pills}>
        {turn.toolErrors > 0 ? (
          <span className={css.failPill} title={t('tool.failed.title', { count: turn.toolErrors })}>
            {t('tool.failed', { count: turn.toolErrors })}
          </span>
        ) : null}
        {shown.map(item => <ToolPill key={item.name} item={item} t={t} />)}
        {turn.tools.length > shown.length ? (
          <span className={cx(css.pill, css.pillMuted)}>
            {t('did.more', { count: turn.tools.length - shown.length })}
          </span>
        ) : null}
        {turn.toolOutput > 0 ? (
          <span className={cx(css.pill, css.pillMuted)} title={t('did.total', { chars: formatTokens(turn.toolOutput) })}>
            {t('did.output', { chars: formatChars(turn.toolOutput) })}
          </span>
        ) : null}
      </div>
      <MixBar tools={turn.tools} />
    </td>
  )
}

/** One step's detail row: every listed call as an accordion block. */
/** Full model answer rendered with the shared Chat Markdown primitive. */
function AnswerBody({ text, t }: { readonly text: string; readonly t: StatsTranslate }): ReactElement {
  const labels = useMemo<MarkdownLabels>(() => ({
    code: {
      copyLabel: t('detail.copy'),
      copiedLabel: t('detail.copied'),
      toolbarLabels: {
        codeLabel: t('detail.code.title'),
        wrapLabel: t('detail.code.wrap'),
        unwrapLabel: t('detail.code.unwrap'),
      },
    },
    footnotes: t('detail.footnotes'),
  }), [t])
  return <div className={css.answerBody}><MarkdownText text={text} labels={labels} variant="compact" /></div>
}

function stepDetailRow(
  step: StatsStepMetrics,
  t: StatsTranslate,
  state: StepViewState,
  onControl: (patch: Partial<StepViewState>) => void,
): ReactElement {
  const calls = step.calls
  const total = calls.reduce((sum, call) => sum + (isNumber(call.chars) ? call.chars : 0), 0)
  const wrap = state.wrap ?? false
  const raw = state.raw ?? {}
  const allCalls = step.tools.length > 0
    ? step.tools.reduce((sum, item) => sum + item.count, 0)
    : calls.length
  const hidden = Math.max(0, allCalls - calls.length)
  const answerBody = step.answerBody ?? null
  const hasCalls = calls.length > 0 || hidden > 0
  return (
    <tr key={`detail:${step.turn}:${step.step}`}>
      <td colSpan={TOTAL_COLUMNS} className={css.detailCell}>
        {answerBody === null
          ? null
          : (
            <section className={css.answerSection}>
              <div className={css.detailHead}>
                <span className={css.detailTitle}>{t('detail.answer')}</span>
                <span className={css.blockMeta}>
                  {` · ${t('detail.chars', { chars: formatTokens(answerBody.length) })}`}
                </span>
              </div>
              <AnswerBody text={answerBody} t={t} />
              {step.answerTruncated
                ? <div className={css.blockEmpty}>{t('detail.answer.truncated')}</div>
                : null}
            </section>
          )}
        {hasCalls
          ? (
            <>
              <div className={css.detailHead}>
                <span className={css.detailTitle}>{t('detail.calls', { count: allCalls })}</span>
                {total > 0
                  ? <span className={css.blockMeta}>{` · ${t('detail.chars', { chars: formatTokens(total) })}`}</span>
                  : null}
                <span className={css.detailActions}>
                  <button
                    type="button"
                    className={wrap ? css.chipOn : css.chip}
                    title={t('detail.wrap.title')}
                    aria-pressed={wrap}
                    onClick={() => { onControl({ wrap: !wrap }) }}
                  >
                    {t('detail.wrap')}
                  </button>
                </span>
              </div>
              {calls.map(call => (
                <CallBlock
                  key={call.callId}
                  call={call}
                  t={t}
                  wrap={wrap}
                  raw={raw[call.callId] === true}
                  onToggleRaw={() => { onControl({ raw: { ...raw, [call.callId]: raw[call.callId] !== true } }) }}
                />
              ))}
              {hidden > 0
                ? <div className={css.blockEmpty}>{t('detail.hidden', { count: hidden, limit: CALL_LIMIT })}</div>
                : null}
            </>
          )
          : null}
      </td>
    </tr>
  )
}

/** Step-list controls of a long turn: tool filters and tail/all switching. */
function moreRows(
  turn: StatsTurnMetrics,
  t: StatsTranslate,
  state: StepViewState,
  onControl: (patch: Partial<StepViewState>) => void,
): ReactNode {
  const total = turn.steps.length
  const filter = state.filter ?? null
  if (total <= STEP_LIMIT && filter === null) return null
  const { pool, shown } = stepsOf(turn, state)
  const parts: ReactNode[] = [
    <span key="total" className={css.moreText}>{t('steps.total', { total })}</span>,
  ]
  turn.tools.forEach((item) => {
    parts.push(
      <button
        key={`tool:${item.name}`}
        type="button"
        className={filter === item.name ? css.chipOn : css.chip}
        title={t('steps.filter', { tool: item.name })}
        aria-pressed={filter === item.name}
        onClick={() => { onControl({ filter: filter === item.name ? null : item.name }) }}
      >
        <span className={cx(css.dot, toneClass(item.name))} />
        {`${item.name} ×${item.count}`}
      </button>,
    )
  })
  if (filter !== null) {
    parts.push(
      <span key="matched" className={css.moreText}>
        {t('steps.matched', { count: pool.length, tool: filter })}
      </span>,
    )
    parts.push(
      <button key="clear" type="button" className={css.button} onClick={() => { onControl({ filter: null }) }}>
        {t('steps.clear')}
      </button>,
    )
  }
  if (state.mode === 'all' && pool.length > STEP_LIMIT) {
    parts.push(
      <button key="tail" type="button" className={css.button} onClick={() => { onControl({ mode: 'tail' }) }}>
        {t('steps.tail', { limit: STEP_LIMIT })}
      </button>,
    )
  } else if (shown.length < pool.length) {
    parts.push(
      <button key="all" type="button" className={css.button} onClick={() => { onControl({ mode: 'all' }) }}>
        {t('steps.all', { total: pool.length })}
      </button>,
    )
  }
  return (
    <tr key={`more:${turn.turn}`}>
      <td colSpan={TOTAL_COLUMNS} className={css.moreCell}>{parts}</td>
    </tr>
  )
}

/** Localized label of one non-step event kind. */

function eventDetail(event: StatsEventMetrics, t: StatsTranslate): string {
  switch (event.kind) {
    case 'request-header': {
      const detail = t('event.header.detail', {
        reason: eventReason(event.reason, t),
        tools: String(event.toolCount ?? 0),
      })
      return event.series ? `${detail} · ${t('event.series')}` : detail
    }
    case 'system-prompt':
      return t('event.system.detail', {
        action: eventAction(event.surfaceOp, t),
        chars: formatChars(event.chars),
      })
    case 'tool-set': {
      const parts: string[] = []
      if (event.added.length > 0) parts.push(t('event.tools.added', { tools: event.added.join(', ') }))
      if (event.removed.length > 0) parts.push(t('event.tools.removed', { tools: event.removed.join(', ') }))
      return parts.join(' · ')
    }
    case 'context-prune':
      return t('event.prune.detail', { tokens: formatTokens(event.shadowedTokens) })
    case 'request-context':
      return t('event.context.detail', {
        provider: event.provider ?? '',
        model: event.model ?? '',
        mode: event.status ?? '',
      })
    case 'model-retry':
      return t('event.retry.detail', {
        retry: String(event.retry ?? 0),
        delay: formatMs(event.delayMs),
      })
    case 'model-attempt':
      return t('event.attempt.detail')
    case 'context-refresh':
      return t('event.refresh.detail', {
        source: eventSource(event.status, t),
        chars: formatChars(event.chars),
      })
    case 'approval':
      return t('event.approval.detail', {
        status: eventApproval(event.status, t),
        tool: event.label ?? '',
      })
  }
}

/** One synthetic non-step event row. */
function eventRow(event: StatsEventMetrics, t: StatsTranslate): ReactElement {
  const metrics: MetricsValues = {
    context: null,
    output: null,
    cacheHit: null,
    ttft: null,
    model: null,
    tps: null,
    tool: null,
    cacheRead: null,
    cacheWrite: null,
  }
  const detail = eventDetail(event, t)
  const side = event.provider !== null && event.model !== null
    ? `${event.provider} / ${event.model}`
    : event.kind === 'system-prompt'
      ? eventAction(event.surfaceOp, t)
      : event.kind === 'tool-set'
        ? t('event.tool-set')
        : event.kind === 'context-refresh'
          ? eventSource(event.status, t)
          : event.kind === 'approval' ? eventApproval(event.status, t) : ''
  const title = event.error === null ? t('event.title') : `${t('event.title')}\n${event.error}`
  return (
    <tr className={css.eventRow} title={title}>
      <td className={css.stepCell}>
        <span className={css.rowTagWhen}>
          <span className={css.compactionTag}>{eventLabel(event.kind, t)}</span>
          <span className={css.stepClock}>{formatClock(event.time)}</span>
        </span>
      </td>
      <td className={css.promptCell}><span className={css.stepWhen}>{side}</span></td>
      <td className={css.stepDid}>{detail}</td>
      <ContextCell value={null} className={css.stepMetric} />
      <MetricCells cells={metricsCells(metrics, t)} className={css.stepMetric} />
      <td className={css.stepMetric} title={t('event.title')}>{DASH}</td>
    </tr>
  )
}

/**
 * One synthetic compaction row: the summary model call's cost, shown between
 * the steps it ran between but excluded from the turn's step totals.
 * @param compaction - folded compaction metrics.
 * @param t - dictionary.
 * @param now - current time for a running row.
 * @param scale - step bar scale, widened to this call's wall.
 * @returns the row.
 */
function compactionRow(
  compaction: StatsCompactionMetrics,
  t: StatsTranslate,
  now: number,
  scale: number,
): ReactElement {
  const metrics: MetricsValues = {
    context: compaction.context,
    output: compaction.output,
    cacheHit: compaction.cacheHit,
    ttft: null,
    model: null,
    tps: null,
    tool: null,
    cacheRead: compaction.cacheRead,
    cacheWrite: compaction.cacheWrite,
  }
  const cells = metricsCells(metrics, t)
  const value: TimeState = {
    running: compaction.running,
    startTime: compaction.startTime,
    wall: compaction.wall,
    ttft: null,
    model: null,
    tool: null,
    toolWall: null,
  }
  const range = `${formatClock(compaction.startTime)}${compaction.endTime === null ? '' : `–${formatClock(compaction.endTime)}`}`
  const parts: string[] = []
  if (compaction.shadowedTokens !== null) {
    parts.push(t('compaction.shadowed', { tokens: formatTokens(compaction.shadowedTokens) }))
  }
  if (compaction.summaryChars !== null) {
    parts.push(t('compaction.summary', { chars: formatChars(compaction.summaryChars) }))
  }
  if (parts.length === 0) parts.push(t('compaction.running'))
  const model = compaction.provider !== null && compaction.model !== null
    ? `${compaction.provider} / ${compaction.model}`
    : t('compaction.running')
  return (
    <tr className={css.compactionRow} title={t('compaction.title')}>
      <td className={css.stepCell}>
        <span className={css.rowTagWhen}>
          <span className={css.compactionTag}>{t('compaction.label')}</span>
          <span className={css.stepClock}>{range}</span>
        </span>
      </td>
      <td className={cx(css.promptCell, css.stepWhen)} title={model}>{model}</td>
      <td className={css.stepDid}>{parts.join(' · ')}</td>
      <ContextCell value={compaction.context} className={css.stepMetric} />
      <MetricCells cells={cells} className={css.stepMetric} />
      <TimeCell
        value={value}
        scale={Math.max(scale, compaction.wall ?? 0)}
        gap={undefined}
        className={css.stepMetric}
        trackClass={css.barStep}
        now={now}
        t={t}
      />
    </tr>
  )
}

/** Rendered rows of one turn: header, step-list controls, and step rows. */
function stepRows(options: StepRowsOptions): ReactNode[] {
  const { turn, t, now, state, showEvents, showContextDelta, onToggleDetail, onControl } = options
  const gaps = stepGaps(turn)
  const deltas = showContextDelta ? contextDeltas(turn) : null
  const open = state.open ?? {}
  // Steps compare only with steps of the same turn.
  const stepScale = turn.steps.reduce((max, step) => {
    const span = totalSpan(step, now)
    return span !== null && span > max ? span : max
  }, 0)
  const { shown } = stepsOf(turn, state)
  const compactions = showEvents ? turn.compactions : []
  const events = showEvents ? turn.events : []
  let nextCompaction = 0
  let nextEvent = 0
  const rows: ReactNode[] = []
  const emitCompactionsUntil = (startTime: number | null): void => {
    while (nextCompaction < compactions.length) {
      const compaction = compactions[nextCompaction]
      if (compaction === undefined || compaction.startTime > (startTime ?? Number.POSITIVE_INFINITY)) break
      rows.push(compactionRow(compaction, t, now, stepScale))
      nextCompaction += 1
    }
  }
  const emitEventsUntil = (startTime: number | null): void => {
    while (nextEvent < events.length) {
      const event = events[nextEvent]
      if (event === undefined || event.time > (startTime ?? Number.POSITIVE_INFINITY)) break
      rows.push(eventRow(event, t))
      nextEvent += 1
    }
  }
  for (const step of shown) {
    emitCompactionsUntil(step.startTime)
    emitEventsUntil(step.startTime)
    const cells = metricsCells(step, t)
    const gap = gaps.get(step.step)
    const visibleGap = gap !== undefined && gap >= STEP_GAP_MIN_MS ? gap : undefined
    const expanded = open[step.step] === true
    const hasAnswer = step.answerBody !== null
    const hasDetail = step.calls.length > 0 || hasAnswer
    const rowClass: (string | undefined)[] = []
    if (hasDetail) rowClass.push(css.stepRowClickable)
    if (step.toolErrors > 0) rowClass.push(css.stepRowError)
    rows.push(
      <tr
        key={`step:${turn.turn}:${step.step}`}
        className={cx(...rowClass)}
        onClick={hasDetail ? () => { onToggleDetail(step.step) } : undefined}
        title={hasDetail ? t('detail.title') : undefined}
      >
        <td className={css.stepCell}>
          {hasDetail
            ? (
              <button
                type="button"
                className={css.rowToggle}
                aria-expanded={expanded}
                aria-label={t('step.toggle.aria', { step: step.step })}
                title={t('detail.title')}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleDetail(step.step)
                }}
              >
                {t('step.label', { step: step.step })}
              </button>
            )
            : t('step.label', { step: step.step })}
          {scopeMarkers(step, t)}
          {isNumber(step.startTime)
            ? null
            : (
              <span className={css.partialHint} title={t('step.partial.title')}>
                {` · ${t('step.partial')}`}
              </span>
            )}
          {hasDetail ? (
            <span className={css.detailHint}>
              {` · ${expanded ? t('detail.hide') : t('detail.show')}`}
            </span>
          ) : null}
        </td>
        <td
          className={css.promptCell}
          title={isNumber(step.startTime)
            ? [
              t('step.started.title', { time: formatDateTimeMs(step.startTime) }),
              ...visibleGap === undefined ? [] : [t('bar.gap', { value: formatMs(visibleGap) })],
            ].join('\n')
            : undefined}
        >
          <span className={css.stepWhen}>
            {isNumber(step.startTime)
              ? (
                <>
                  <span className={css.stepClock}>{formatStepClock(step.startTime)}</span>
                  {visibleGap === undefined
                    ? null
                    : (
                      <span className={css.stepGap}>
                        {t('bar.gap', { value: formatMs(visibleGap) })}
                      </span>
                    )}
                </>
              )
              : null}
          </span>
        </td>
        {stepDidCell(step, t)}
        <ContextCell
          value={step.context}
          className={css.stepMetric}
          delta={deltas === null ? null : deltas.get(step.step) ?? null}
        />
        <MetricCells cells={cells} className={css.stepMetric} />
        <TimeCell
          value={step}
          scale={stepScale}
          gap={gaps.get(step.step)}
          className={css.stepMetric}
          trackClass={css.barStep}
          now={now}
          t={t}
        />
      </tr>,
    )
    if (expanded) rows.push(stepDetailRow(step, t, state, onControl))
  }
  emitCompactionsUntil(null)
  emitEventsUntil(null)
  return rows
}

/** All rows of one turn: the clickable header, then the expanded body. */
export function turnRows(options: TurnRowsOptions): ReactNode[] {
  const {
    turn, t, loadImage, now, open, state, turnScale, contextMode, showEvents, showContextDelta,
    contextDelta, onToggle, onToggleDetail, onControl,
  } = options
  const cells = metricsCells(turn, t)
  const rows: ReactNode[] = [
    <tr
      key={`turn:${turn.turn}`}
      data-turn={turn.turn}
      className={css.turnRow}
      onClick={onToggle}
      title={t('turn.toggle.title')}
    >
      <td className={css.turnCell}>
        <button
          type="button"
          className={css.rowToggle}
          aria-expanded={open}
          aria-label={t('turn.toggle.aria', { turn: turn.turn })}
          title={t('turn.toggle.title')}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          {t('turn.label', { turn: turn.turn })}
        </button>
        {isNumber(turn.startTime) ? (
          <span
            className={css.turnClock}
            title={t('turn.started', { time: formatDateTime(turn.startTime) })}
          >
            {` · ${formatDateTimeShort(turn.startTime)}`}
          </span>
        ) : null}
        {scopeMarkers(turn, t)}
      </td>
      <PromptCell turn={turn} t={t} className={css.promptCellTurn} loadImage={loadImage} />
      {turnDidCell(turn, t)}
      <ContextCell value={turnContext(turn, contextMode)} className={css.turnMetric} delta={contextDelta} />
      <MetricCells cells={cells} className={css.turnMetric} />
      <TimeCell
        value={turn}
        scale={turnScale}
        gap={undefined}
        className={css.turnMetric}
        trackClass={css.barTurn}
        now={now}
        t={t}
      />
    </tr>,
  ]
  if (!open) return rows
  const controls = moreRows(turn, t, state, onControl)
  if (controls !== null) rows.push(controls)
  rows.push(...stepRows({ turn, t, now, state, showEvents, showContextDelta, onToggleDetail, onControl }))
  return rows
}

/** Footer button that switches between enabled and disabled styling. */
export function TableButton({ caption, enabled, onClick }: TableButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={enabled ? css.button : css.buttonOff}
      disabled={!enabled}
      onClick={enabled ? onClick : undefined}
    >
      {caption}
    </button>
  )
}

/** Distance from the scroll top, in pixels, that requests one older history page. */
export const LOAD_OLDER_THRESHOLD = 64
/** How long the clipboard button reports its outcome, in milliseconds. */
const COPY_FEEDBACK_MS = 1_200
/** Hover dwell before the prompt image preview opens. */
const IMAGE_PREVIEW_DELAY_MS = 200

export {
  AnswerBody,
  CallBlock,
  CallBlockProps,
  CallGroup,
  CellText,
  CodeLine,
  ContextCellProps,
  CopyButton,
  CopyButtonProps,
  FileContent,
  ImageLoad,
  ImagePromptPill,
  ImagePromptPillProps,
  LightboxImage,
  LoadImage,
  MetricCell,
  MetricCellsProps,
  MetricsValues,
  PromptCell,
  PromptCellProps,
  PromptImageThumb,
  PromptImageThumbProps,
  ScopeState,
  StepRowsOptions,
  TableButtonProps,
  TimeCellProps,
  TimeState,
  ToolPill,
  TurnRowsOptions,
  ViewMode,
  callBody,
  clipboardOf,
  compactionRow,
  eventDetail,
  eventRow,
  moreRows,
  scopeMarkers,
  stepDetailRow,
  stepDidCell,
  stepRows,
  turnDidCell,
}

export {
  COLUMNS,
  ContextCell,
  MetricCells,
  TotalsRow,
  metricsCells,
} from './stats-table-columns.tsx'
export {
  EMPTY_STEP_VIEW,
  createViewState,
} from './stats-table-data.tsx'
export {
  defaultTurnOpen,
  isTimeRunning,
  totalSpan,
} from './stats-table-format.tsx'
