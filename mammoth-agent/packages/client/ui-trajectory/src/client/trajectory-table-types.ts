/** Types shared by the trajectory ledger shell and its split rendering modules. */

import type { CSSProperties } from 'react'
import type { JsonTreeProps } from '@mammoth-ai/mmp-client-ui-primitives'
import type { PropsRenderSlots } from '@mammoth-ai/mmp-client-ui-slots'
import type {
  AssistantRequestConfig, MessageImageLoader,
} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import type { TrajectoryTurnModel } from './layout.ts'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import type { WatchToolResult } from './watch-tool-result.ts'

/** One ledger record with its group and turn boundaries. */
interface TableRecord {
  turn: number | null
  section: number
  group: string
  groupStart: boolean
  turnStart: boolean
  cell: TrajectoryCellProps
  turnEnd: boolean
  collapsedSummary?: string
  collapsedSummaryKind?: 'turn' | 'assistant' | 'tool'
}

/** Height and identity key of one virtual row. */
interface VirtualRowStructure {
  height: number
  key: string
}

/** Inspector tab identifiers. */
type DetailTab =
  | 'system-prompt'
  | 'tools'
  | 'overview'
  | 'rendered'
  | 'raw'
  | 'source'
  | 'input'
  | 'output'
  | 'schema'
  | 'options'
  | 'usage'
  | 'timing'
  | 'diff'
/** Ledger state derived from one record. */
type RecordState = 'complete' | 'running' | 'error'

/** One inspector tab with its localized label key. */
interface DetailTabItem {
  id: DetailTab
  labelKey: TrajectoryKey
}

/** Parent assistant message and tool call of one record. */
interface ParentRecords {
  message?: TableRecord
  tool?: TableRecord
}

/** Tool call name and argument text split out of a record. */
interface ToolCallTextParts {
  program: boolean
  name: string
  args?: string
}

/** Request selected in the inspector, identified across history reloads. */
interface SelectedRequest {
  identity: string
}

/** Pointer drag state for resizing the inspector split. */
interface DetailsResizeDrag {
  pointerId: number
  startX: number
  startWidth: number
  splitWidth: number
  startToolRequestOffset: number
}

/** CSS custom properties for the tool-request column width. */
type TrajectorySplitStyle = CSSProperties & {
  '--trajectory-tool-request-width': string
}

/** CSS custom properties for one request boundary offset. */
type RequestBoundaryStyle = CSSProperties & {
  '--request-boundary-offset': string
}

/** CSS custom property for the virtual spacer height. */
type VirtualSpacerStyle = CSSProperties & {
  '--trajectory-virtual-spacer-height': string
}

/** Scroll anchor captured before one older history page is prepended. */
interface OlderLoadAnchor {
  readonly historyStartSeq: number | undefined
  readonly scrollHeight: number
  readonly scrollTop: number
}

/** Props for the trajectory ledger. */
export interface TrajectoryTableProps {
  /** Observe the selected result while the Result tab is open. */
  watchToolResult?: WatchToolResult | undefined
  /** Wrapping control shared by all JSON inspectors. */
  stringWrapping?: JsonTreeProps['stringWrapping']
  /** Trajectory locale seat. */
  t: TrajectoryTranslate
  /** Slot-backed durable image renderer shared with the Chat gallery. */
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  /** Session-bound loader for durable message image attachments. */
  loadImage: MessageImageLoader
  /** Session-global request numbers for the request groups visible in this context. */
  requestNumbers?: readonly TrajectoryRequestNumber[]
  /** Grouped records in display order. */
  turns: readonly TrajectoryTurnModel[]
  /** In-flight cells whose content replaces the matching structural record index. */
  streamingCells?: readonly TrajectoryCellProps[]
  /** Record indexes emphasized by the active timeline focus. */
  timelineFocusIndexes?: ReadonlySet<number> | null
  /** Record indexes retained by the active live search, or null without a query. */
  searchMatchIndexes?: ReadonlySet<number> | null
  /** Report the record currently selected in the local inspector. */
  onSelectedIndexChange?: (index: number | null) => void
  /** Report a direct user selection from a ledger row. */
  onRecordSelect?: (index: number) => void
  /** One externally requested record selection; a new object repeats the request. */
  recordSelection?: { readonly index: number } | null
  /** One externally requested record focus without changing inspector selection. */
  recordFocus?: { readonly index: number } | null
  /** Whether the initial history tail is still loading. */
  historyLoading?: boolean
  /** Whether one older history page request is pending anywhere. */
  olderHistoryLoading?: boolean
  /** First loaded raw event, used to preserve scroll position after prepending a page. */
  historyStartSeq?: number | undefined
  /** Whether one older history page can be requested. */
  hasOlderRecords?: boolean
  /** Load one older history page. */
  onLoadOlder?: () => Promise<boolean>
  /** Clear selection state owned by the ledger host. */
  onClearSelection?: () => void
  /** Turn ids whose rows after the first are folded into a summary. */
  collapsedTurns: ReadonlySet<number>
  /** Toggle one turn between folded and expanded. */
  onToggleTurn: (turn: number) => void
  /** Stable Assistant record ids whose tool calls are folded. */
  collapsedAssistants: ReadonlySet<string>
  /** Toggle tool calls under one assistant record. */
  onToggleAssistant: (id: string) => void
  /** Stable tool record ids whose nested calls are folded. */
  collapsedTools: ReadonlySet<string>
  /** Toggle nested calls under one tool record. */
  onToggleTool: (id: string) => void
  /** One-shot cross-view inspect: open and scroll to this call's record. */
  inspectCallId?: string | null
  /** Acknowledge a consumed (or unresolvable) inspect request. */
  onInspectApplied?: (() => void) | undefined
}

/** Request-inspector fields shared by ordinary generation and compaction. */
interface TrajectoryRequestNumberBase {
  group: string
  number: number
  status?: 'complete' | 'running' | 'error'
  startedAt?: number
  completedAt?: number | null
  error?: string
  errorCode?: string
  retry?: number
  maxRetries?: number
  retryDelayMs?: number
  resultSeq?: number
  provider?: string
  model?: string
  requestConfig?: AssistantRequestConfig
  usage?: TrajectoryUsage
  cumulativeUsage?: TrajectoryUsage
}

/** One purpose-discriminated request identity paired with its session-global number. */
export type TrajectoryRequestNumber = TrajectoryRequestNumberBase & (
  | {
    purpose?: 'assistant'
    /** Request anchor event sequence; absent for the currently streaming request. */
    seq?: number
    turn: number
    step: number
  }
  | {
    purpose: 'compaction'
    /** Request anchor event sequence and stable compaction identity. */
    seq: number
    turn: number | null
    step: 0
  }
)

/** Disjoint provider token buckets for one request or a session prefix. */
export interface TrajectoryUsage {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  reasoning?: number
}

/** Per-record text projection shared by the list and inspector. */
interface RecordPresentationValue {
  displayText: string
  listDisplayText: string
  resultText: string | undefined
  toolCallOnly: boolean
  toolCallText: ToolCallTextParts | undefined
}

/** One diff line of the system-prompt comparison. */
interface PromptDiffLine {
  kind: 'meta' | 'context' | 'added' | 'removed'
  text: string
}

/** Decoded tool schema payload. */
interface ParsedToolSchema {
  name: string
  description: string
  parameters: object
}

export type {
  DetailTab,
  DetailTabItem,
  DetailsResizeDrag,
  OlderLoadAnchor,
  ParentRecords,
  ParsedToolSchema,
  PromptDiffLine,
  RecordPresentationValue,
  RecordState,
  RequestBoundaryStyle,
  SelectedRequest,
  TableRecord,
  ToolCallTextParts,
  TrajectorySplitStyle,
  VirtualRowStructure,
  VirtualSpacerStyle,
}
