/** Reusable user contents inside a caller-owned message row. */
import { Fragment, useState } from 'react'
import type { FactoryComponentPropsOf } from '@mammoth-ai/mmp-client-ui-slots'
import { fileExtension, FileTypeIcon, fileSizeText, JsonBlock, UserMessageBubble } from '@mammoth-ai/mmp-client-ui-primitives'
import css from './MessageItem.module.css'

const EMPTY_LABELS: readonly string[] = []

/**
 * Render prepared text, ordered attachments, and references without message chrome.
 * The caller owns row identity, pending/echo state, time, and message actions.
 * @param props - prepared content, facts, authorized image loader, and framework Factory/locale seats.
 * @returns the content stack using the existing user-message layout.
 */
export function UserContent({
  content, loadImage, facts, interactive = false, ellipsis = false, renderSlot, renderFactorySlot, t, openLibraryReference,
}:
FactoryComponentPropsOf<'conversation.chat.user.content'>) {
  const { text, attachments, extraBlocks, referenceLabels = EMPTY_LABELS } = content
  const [expanded, setExpanded] = useState(false)
  const libraryCount = attachments.filter(attachment => attachment.type === 'library').length
  let libraryIndex = 0
  const visibleAttachments = attachments.filter(attachment => attachment.type !== 'library' || ++libraryIndex <= 4 || expanded)
  const compactImages = attachments.length > 1
  const truncated = (total: number): string => t('json.truncated', { total })
  const showBubble = text !== '' || extraBlocks.length > 0
  return (
    <div className={css.userStack}>
      {attachments.length > 0 && (
        <div className={css.attachmentRow} data-message-attachments>
          {visibleAttachments.map((attachment, index) => {
            if (attachment.type === 'image') return (
              <Fragment key={`image:${index}`}>
                {renderSlot('conversation.chat.user.images', {
                  images: [attachment.image], loadImage, align: 'end', compact: compactImages,
                })}
              </Fragment>
            )
            const file = attachment.type === 'library' ? attachment.reference : attachment.file
            const extension = fileExtension(file.name).toUpperCase().slice(0, 8)
            const size = file.bytes === undefined ? '' : fileSizeText(file.bytes)
            const metadata = attachment.type === 'library'
              ? [t('message.librarySource'), extension, size].filter(Boolean).join(' · ')
              : [extension, size].filter(Boolean).join(' ')
            const body = <>
              <FileTypeIcon path={file.name} className={css.fileIcon} />
              <span className={css.fileContent}>
                <span className={css.fileName}>{file.name}</span>
                <span className={css.fileMeta}>{metadata}</span>
              </span>
            </>
            if (attachment.type === 'library') {
              const reference = attachment.reference
              const key = `library:${reference.nodeId}:${reference.versionId}:${index}`
              if (interactive && openLibraryReference !== undefined) return (
                <button key={key} type="button" className={`${css.fileCard} ${css.libraryCard}`} title={file.name}
                  aria-label={file.name} onClick={() => { openLibraryReference(reference) }}>{body}</button>
              )
              return <span key={key} className={css.fileCard} title={file.name}>{body}</span>
            }
            return <span key={`file:${index}`} className={css.fileCard} title={file.name}>{body}</span>
          })}
          {libraryCount > 4 && !expanded && <button type="button" className={css.expandFiles}
            onClick={() => { setExpanded(true) }}>{t('message.expandFiles', { count: libraryCount })}</button>}
        </div>
      )}
      {showBubble && <UserMessageBubble data-message-bubble="" data-text-interaction-source="">
        {renderFactorySlot('conversation.user.text', { text, facts, interactive, ellipsis })}
        {extraBlocks.map((block, index) => (
          <JsonBlock key={index} label={t('message.extraBlock')} payload={block} truncatedLabel={truncated} />
        ))}
      </UserMessageBubble>}
      {referenceLabels.length > 0 && (
        <div className={css.referenceSummary}>
          {t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) })}
        </div>
      )}
    </div>
  )
}
