import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Reusable user contents inside a caller-owned message row. */
import { Fragment, useState } from 'react';
import { fileExtension, FileTypeIcon, fileSizeText, JsonBlock, UserMessageBubble } from '@mammoth-ai/mmp-client-ui-primitives';
import css from './MessageItem.module.css';
const EMPTY_LABELS = [];
/**
 * Render prepared text, ordered attachments, and references without message chrome.
 * The caller owns row identity, pending/echo state, time, and message actions.
 * @param props - prepared content, facts, authorized image loader, and framework Factory/locale seats.
 * @returns the content stack using the existing user-message layout.
 */
export function UserContent({ content, loadImage, facts, interactive = false, ellipsis = false, requestId, skills, renderSlot, renderFactorySlot, t, openLibraryReference, }) {
    const { text, attachments, extraBlocks, referenceLabels = EMPTY_LABELS } = content;
    const showSkills = requestId !== undefined || (skills !== undefined && skills.length > 0);
    const [expanded, setExpanded] = useState(false);
    const libraryCount = attachments.filter(attachment => attachment.type === 'library').length;
    let libraryIndex = 0;
    const visibleAttachments = attachments.filter(attachment => attachment.type !== 'library' || ++libraryIndex <= 4 || expanded);
    const compactImages = attachments.length > 1;
    const truncated = (total) => t('json.truncated', { total });
    const showBubble = text !== '' || extraBlocks.length > 0;
    return (_jsxs("div", { className: css.userStack, children: [attachments.length > 0 && (_jsxs("div", { className: css.attachmentRow, "data-message-attachments": true, children: [visibleAttachments.map((attachment, index) => {
                        if (attachment.type === 'image')
                            return (_jsx(Fragment, { children: renderSlot('conversation.chat.user.images', {
                                    images: [attachment.image], loadImage, align: 'end', compact: compactImages,
                                }) }, `image:${index}`));
                        const file = attachment.type === 'library' ? attachment.reference : attachment.file;
                        const extension = fileExtension(file.name).toUpperCase().slice(0, 8);
                        const size = file.bytes === undefined ? '' : fileSizeText(file.bytes);
                        const metadata = attachment.type === 'library'
                            ? [t('message.librarySource'), extension, size].filter(Boolean).join(' · ')
                            : [extension, size].filter(Boolean).join(' ');
                        const body = _jsxs(_Fragment, { children: [_jsx(FileTypeIcon, { path: file.name, className: css.fileIcon }), _jsxs("span", { className: css.fileContent, children: [_jsx("span", { className: css.fileName, children: file.name }), _jsx("span", { className: css.fileMeta, children: metadata })] })] });
                        if (attachment.type === 'library') {
                            const reference = attachment.reference;
                            const key = `library:${reference.nodeId}:${reference.versionId}:${index}`;
                            if (interactive && openLibraryReference !== undefined)
                                return (_jsx("button", { type: "button", className: `${css.fileCard} ${css.libraryCard}`, title: file.name, "aria-label": file.name, onClick: () => { openLibraryReference(reference); }, children: body }, key));
                            return _jsx("span", { className: css.fileCard, title: file.name, children: body }, key);
                        }
                        return _jsx("span", { className: css.fileCard, title: file.name, children: body }, `file:${index}`);
                    }), libraryCount > 4 && !expanded && _jsx("button", { type: "button", className: css.expandFiles, onClick: () => { setExpanded(true); }, children: t('message.expandFiles', { count: libraryCount }) })] })), showBubble && _jsxs(UserMessageBubble, { "data-message-bubble": "", "data-text-interaction-source": "", children: [showSkills ? renderSlot('conversation.chat.user.skills', {
                        ...(requestId === undefined ? {} : { requestId }),
                        ...(skills === undefined ? {} : { skills }),
                        text,
                        renderText: (slice) => renderFactorySlot('conversation.user.text', { text: slice, facts, interactive, ellipsis }),
                    }, { fallback: renderFactorySlot('conversation.user.text', { text, facts, interactive, ellipsis }) })
                        : renderFactorySlot('conversation.user.text', { text, facts, interactive, ellipsis }), extraBlocks.map((block, index) => (_jsx(JsonBlock, { label: t('message.extraBlock'), payload: block, truncatedLabel: truncated }, index)))] }), referenceLabels.length > 0 && (_jsx("div", { className: css.referenceSummary, children: t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) }) }))] }));
}
//# sourceMappingURL=UserContent.js.map