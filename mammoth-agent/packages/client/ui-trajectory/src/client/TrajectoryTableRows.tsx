/** Row-level record presentation for the trajectory ledger. */

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  FileTypeIcon,
  fileExtension,
  fileSizeText,
  IconChevronRightOutlineRegular,
  IconCodeOutlineRegular,
  MarkdownText,
} from '@mammoth-ai/mmp-client-ui-primitives'
import type { PropsRenderSlots } from '@mammoth-ai/mmp-client-ui-slots'
import type { MessageImageLoader } from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { TrajectoryCellProps, TrajectorySourceBlock } from './trajectory-record.ts'
import type { TrajectoryTranslate } from './locales.ts'
import type { RecordPresentationValue } from './trajectory-table-types.ts'
import {
  isToolCallOnly,
  markdownLabels,
  recordDisplayText,
  recordResultText,
  toolCallTextParts,
} from './trajectory-table-format.ts'
import css from './TrajectoryTable.module.css'

function RecordPresentation({
  cell,
  children,
  t,
}: {
  cell: TrajectoryCellProps
  children: (value: RecordPresentationValue) => ReactNode
  t: TrajectoryTranslate
}) {
  const displayText = useMemo(
    () => recordDisplayText(cell, t),
    [
      cell.kind, cell.text, cell.toolName, cell.previewMarkdown,
      cell.inputDetail, cell.outputDetail, cell.thinkingDetail, t,
    ],
  )
  const resultText = useMemo(
    () => recordResultText(cell),
    [cell.result, cell.resultPreviewMarkdown],
  )
  const toolCallOnly = isToolCallOnly(cell, t)
  const toolCallText = toolCallTextParts(cell, displayText)
  const listDisplayText = toolCallOnly
    ? t('record.toolCallOnly')
    : toolCallText === undefined
      ? displayText
      : [toolCallText.name, toolCallText.args].filter(Boolean).join(' ')
  return children({
    displayText,
    listDisplayText,
    resultText,
    toolCallOnly,
    toolCallText,
  })
}

function RecordListText({
  displayText,
  toolCallOnly,
  toolCallText,
  t,
}: Pick<RecordPresentationValue, 'displayText' | 'toolCallOnly' | 'toolCallText'> & {
  t: TrajectoryTranslate
}) {
  if (toolCallOnly) {
    return <span className={css.toolCallOnly}>{t('record.toolCallOnly')}</span>
  }
  if (toolCallText === undefined) return displayText || '—'
  return (
    <>
      <span className={css.toolCallNameTypeface}>
        {toolCallText.program && <IconCodeOutlineRegular className={css.programIcon} size={12} />}
        {toolCallText.name || '—'}
      </span>
      {toolCallText.args !== undefined && (
        <span className={toolCallText.program ? css.programSummary : css.toolCallPayload}>
          {toolCallText.args}
        </span>
      )}
    </>
  )
}

function MarkdownFragment({
  text,
  rendered,
  preview,
  variant = 'body',
  t,
}: {
  text: string
  rendered: boolean
  preview: boolean
  variant?: 'body' | 'compact'
  t: TrajectoryTranslate
}) {
  const labels = useMemo(() => markdownLabels(t), [t])
  if (rendered) {
    return (
      <div className={preview ? css.markdownPreview : css.markdownPayload}>
        <MarkdownText text={text} labels={labels} variant={variant} />
      </div>
    )
  }
  return (
    <pre className={`${css.payload} ${preview ? css.payloadPreview : ''}`}>
      {text}
    </pre>
  )
}

function SourceBlocks({
  blocks,
  onOpenCall,
  t,
}: {
  blocks: readonly TrajectorySourceBlock[]
  onOpenCall: (callId: string) => void
  t: TrajectoryTranslate
}) {
  const attachments = new Map(recordAttachments(blocks, t).map(entry => [entry.index, entry]))
  return (
    <div className={css.sourceBlocks}>
      {blocks.map((block, index) => {
        const attachment = attachments.get(index)
        return attachment !== undefined ? (
          <details className={css.attachmentDisclosure} key={index}>
            <summary>
              <span className={css.sourceBlockLabel}>
                {t('block.label', { index: index + 1, type: block.type })}
              </span>
              <span className={css.attachmentName} title={attachment.name}>
                {attachment.name}
              </span>
            </summary>
            <pre className={css.sourceBlockContent}>{block.content}</pre>
          </details>
        )
          : (
            <section className={css.sourceBlock} key={index}>
              {block.callId !== undefined
                ? (
                  <button
                    type="button"
                    className={css.sourceBlockJumpTarget}
                    aria-label={t('block.openSummary', { index: index + 1 })}
                    title={t('block.openSummaryTitle')}
                    onClick={() => {
                      if (block.callId !== undefined) onOpenCall(block.callId)
                    }}
                  >
                    <span className={css.sourceBlockLabel}>
                      {t('block.label', { index: index + 1, type: block.type })}
                    </span>
                    <IconChevronRightOutlineRegular className={css.sourceBlockJumpIcon} size={12} />
                  </button>
                )
                : (
                  <div className={css.sourceBlockHeader}>
                    <span className={css.sourceBlockLabel}>
                      {t('block.label', { index: index + 1, type: block.type })}
                    </span>
                  </div>
                )}
              <pre className={css.sourceBlockContent}>{block.content}</pre>
            </section>
          )
      })}
    </div>
  )
}

function recordAttachments(
  blocks: readonly TrajectorySourceBlock[] | undefined,
  t: TrajectoryTranslate,
) {
  let imageIndex = 0
  return (blocks ?? []).flatMap((block, index) => {
    const ref = block.attachment ?? block.file
    if (ref === undefined) return []
    if (block.attachment !== undefined) imageIndex += 1
    return [{
      block,
      index,
      name: ref.name ?? t('attachment.imageName', { index: imageIndex }),
      metadata: [
        block.attachment?.mediaType ?? fileExtension(ref.name ?? '').toUpperCase(),
        fileSizeText(ref.bytes),
        ...(block.attachment === undefined ? [] : [`${block.attachment.width} × ${block.attachment.height}`]),
      ].filter(Boolean).join(' · '),
    }]
  })
}

function RecordAttachments({
  blocks,
  preview,
  renderSlot,
  loadImage,
  t,
}: {
  blocks: readonly TrajectorySourceBlock[] | undefined
  preview: boolean
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  loadImage: MessageImageLoader
  t: TrajectoryTranslate
}) {
  const attachments = recordAttachments(blocks, t)
  if (attachments.length === 0) return null
  return (
    <ul
      className={preview ? `${css.attachments} ${css.attachmentsPreview}` : css.attachments}
      aria-label={t('attachment.list')}
    >
      {attachments.map(({ block, index, name, metadata }) => (
        <li className={css.attachmentRow} key={index}>
          {block.attachment !== undefined
            ? renderSlot('conversation.trajectory.images', {
              images: [{ attachment: block.attachment, label: name }],
              align: 'start',
              thumbnail: true,
              loadImage,
            })
            : <span className={css.attachmentIcon}><FileTypeIcon path={name} /></span>}
          <div className={css.attachmentInfo}>
            <span className={css.attachmentName} title={name}>{name}</span>
            <span className={css.attachmentMetadata}>{metadata}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function AssistantToolCalls({
  blocks,
  preview,
  onOpenCall,
  t,
}: {
  blocks: readonly TrajectorySourceBlock[] | undefined
  preview: boolean
  onOpenCall: (callId: string) => void
  t: TrajectoryTranslate
}) {
  const calls = blocks?.filter(block => block.type === 'tool-call') ?? []
  if (calls.length === 0) return null
  return (
    <ul className={preview
      ? `${css.assistantToolCalls} ${css.assistantToolCallsPreview}`
      : css.assistantToolCalls}
    >
      {calls.map((call, index) => (
        <li key={call.callId ?? index}>
          <button
            type="button"
            className={css.assistantToolCallButton}
            title={t('block.openSummaryTitle')}
            onClick={() => {
              if (call.callId !== undefined) onOpenCall(call.callId)
            }}
          >
            <svg
              className={css.assistantToolCallIcon}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={css.assistantToolCallText}>
              <span className={css.assistantToolCallName}>
                {call.toolName ?? t('details.toolCall')}
              </span>
              {call.content !== '' && (
                <span className={css.assistantToolCallArgs}>{call.content}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}


export {
  AssistantToolCalls,
  MarkdownFragment,
  RecordAttachments,
  RecordListText,
  RecordPresentation,
  SourceBlocks,
}
