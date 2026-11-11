import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useEffect, useMemo, useState } from 'react';
import { userContentText } from '@mammoth-ai/mmp-llm/user-content';
import { userMessageContent } from "./user-message-content.js";
import { JsonBlock, StateDot, TextShimmer } from '@mammoth-ai/mmp-client-ui-primitives';
import { CompactionItem } from "./CompactionItem.js";
import { ContextInjectionRow } from "./ContextInjectionRow.js";
import { MessageIconActions } from "./MessageIconActions.js";
import css from './MessageItem.module.css';
const EMPTY_TEXT_FACTS = {};
function retrySeconds(milliseconds) {
    return Math.max(1, Math.ceil(milliseconds / 1_000));
}
function failureMessage(message, code, t) {
    if (code === 'ACCOUNT_SIGNED_OUT')
        return t('message.failure.accountSignedOut');
    if (code === 'INTERRUPTED')
        return t('message.failure.interrupted');
    if (code === 'ACCOUNT_SIGN_IN_REQUIRED')
        return t('message.failure.accountSignInRequired');
    if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA')
        return t('message.failure.quota');
    return code === 'AUTH' ? t('message.failure.auth') : message;
}
function ModelRetryItem({ node, active, t }) {
    // Anchor the host-scheduled delay to this browser's first render of the
    // retry node. Host event time and Date.now() may belong to different clocks.
    const deadline = useMemo(() => Date.now() + node.delayMs, [node.delayMs, node.seq]);
    const scheduledSeconds = retrySeconds(node.delayMs);
    const maximum = node.mode === 'normal' ? node.maxRetries : '∞';
    const [countdown, setCountdown] = useState(() => ({
        deadline,
        seconds: retrySeconds(deadline - Date.now()),
    }));
    const remainingSeconds = countdown.deadline === deadline
        ? countdown.seconds
        : retrySeconds(deadline - Date.now());
    useEffect(() => {
        if (!active)
            return;
        const updateCountdown = () => {
            const next = retrySeconds(deadline - Date.now());
            setCountdown(current => (current.deadline === deadline && current.seconds === next
                ? current
                : { deadline, seconds: next }));
            return next;
        };
        if (updateCountdown() === 1)
            return;
        const timer = window.setInterval(() => {
            if (updateCountdown() === 1)
                window.clearInterval(timer);
        }, 250);
        return () => { window.clearInterval(timer); };
    }, [active, deadline]);
    const label = active
        ? t('message.retry.active')
        : node.retryState === 'cancelled'
            ? t('message.retry.cancelled')
            : node.retryState === 'started'
                ? t('message.retry.started')
                : t('message.retry.scheduled');
    const seconds = active ? remainingSeconds : scheduledSeconds;
    return (_jsxs("details", { className: css.retryRow, "data-active": active || undefined, children: [_jsx("summary", { className: css.retrySummary, children: _jsx("span", { className: css.retryText, role: "status", children: _jsx(TextShimmer, { active: active, children: t('message.retry.status', { label, retry: node.retry, maximum, seconds }) }) }) }), _jsxs("div", { className: css.retryDetails, children: [_jsxs("div", { children: [_jsx("span", { className: css.retryDetailLabel, children: t('message.retry.delay') }), t('duration.milliseconds', { milliseconds: Math.round(node.delayMs) })] }), _jsxs("div", { children: [_jsx("span", { className: css.retryDetailLabel, children: t('message.retry.failure') }), failureMessage(node.failure.message, node.failure.code, t)] })] })] }));
}
/** Persistent, turn-positioned feedback for a terminal failure. */
function TurnErrorItem({ node, t }) {
    return (_jsxs("div", { className: css.turnErrorRow, role: "status", children: [_jsx(StateDot, { state: "error", className: css.turnErrorDot }), _jsxs("div", { className: css.turnErrorCopy, children: [_jsx("span", { className: css.turnErrorTitle, children: node.code === 'ACCOUNT_SIGNED_OUT' || node.code === 'INTERRUPTED' ? t('message.taskStopped') : t('message.turnError') }), _jsx("span", { className: css.turnErrorMessage, children: failureMessage(node.message, node.code, t) })] }), node.code !== undefined && node.code !== 'INTERRUPTED' && _jsx("code", { className: css.turnErrorCode, children: node.code })] }));
}
/** Persistent, turn-positioned notice for a turn ended at the output-token cap. */
function TurnMaxTokensItem({ t }) {
    return (_jsxs("div", { className: css.turnErrorRow, role: "status", children: [_jsx(StateDot, { state: "warning", className: css.turnErrorDot }), _jsxs("div", { className: css.turnErrorCopy, children: [_jsx("span", { className: css.maxTokensTitle, children: t('message.maxTokens') }), _jsx("span", { className: css.turnErrorMessage, children: t('message.maxTokens.hint') })] })] }));
}
/** Pending and local-echo rows carry no durable source for the seat to elect. */
const UNDECORATED_ROW = { kind: 'user', data: { source: null } };
/** Occupant used by rows that do not own the message-source seat. */
const NO_MESSAGE_SOURCE = () => null;
/** Prompt request id echoed on a durable user source. */
function requestIdOf(source) {
    if (typeof source !== 'object' || source === null || !('rpcId' in source))
        return undefined;
    return typeof source.rpcId === 'string' && source.rpcId !== '' ? source.rpcId : undefined;
}
/** Right-aligned bubble shared by user and steering rows. */
function UserStyleBubble({ node, renderSlotChain, content, loadImage, renderFactorySlot, actions, pending = false, echo = false, batchStart = false, referenceLabels, skillNames, previewAttachments, facts: inputFacts = EMPTY_TEXT_FACTS, interactive = false, requestId, sentSkills, }) {
    const parts = useMemo(() => userMessageContent(content), [content]);
    const prepared = useMemo(() => ({
        text: parts.text,
        attachments: previewAttachments ?? parts.attachments,
        extraBlocks: parts.extraBlocks,
        ...(referenceLabels === undefined ? {} : { referenceLabels }),
    }), [parts, previewAttachments, referenceLabels]);
    const facts = useMemo(() => ({
        ...inputFacts,
        ...(referenceLabels === undefined ? {} : { sessionLabels: referenceLabels }),
        ...(skillNames === undefined ? {} : { skillNames }),
    }), [inputFacts, referenceLabels, skillNames]);
    return (_jsxs("div", { className: css.userRow, "data-pending-steering": pending || undefined, "data-submission-echo": echo || undefined, "data-chat-steering-batch": batchStart ? 'start' : undefined, children: [renderSlotChain('conversation.chat.user.before', { source: node.data.source, kind: node.kind }, { fallback: null }), renderFactorySlot('conversation.chat.user.content', {
                content: prepared,
                loadImage,
                facts,
                interactive,
                ...(requestId === undefined ? {} : { requestId }),
                ...(sentSkills === undefined ? {} : { skills: sentSkills }),
            }), actions?.(userContentText(content))] }));
}
/**
 * Render one Host-authoritative pending steering item with the same visual
 * language as its eventual durable transcript node.
 * @param props - pending content, authorized image loader, and Factory/locale seats.
 * @returns the pending steering bubble.
 */
export function PendingSteeringBubble({ content, loadImage, renderFactorySlot, t }) {
    return (_jsx(UserStyleBubble, { node: UNDECORATED_ROW, renderSlotChain: NO_MESSAGE_SOURCE, content: content, renderFactorySlot: renderFactorySlot, loadImage: loadImage, pending: true, actions: text => (_jsx(MessageIconActions, { text: text, clock: "start", className: css.actions, t: t })) }));
}
/**
 * Render one local transcript or steering submission echo with the same
 * visual language and surface marker as the Host occurrence that replaces
 * it: draft text plus object-URL previews, visible from the submit click
 * until the durable `user/message` or steering occurrence renders.
 * @param props - the pending submission, authorized image loader, and render seats.
 * @returns the echoed user bubble.
 */
export function PendingSubmissionBubble({ submission, loadImage, renderFactorySlot, t }) {
    const content = useMemo(() => [
        ...(submission.libraryReferences ?? []).map(reference => ({ type: 'text', text: '', reference })),
        ...(submission.text === '' ? [] : [{ type: 'text', text: submission.text }]),
    ], [submission.text, submission.libraryReferences]);
    const previewAttachments = useMemo(() => [...submission.attachments.map(attachment => attachment.type === 'image'
            ? {
                type: 'image',
                image: {
                    preview: {
                        url: attachment.value.previewUrl,
                        ...(attachment.value.name === undefined ? {} : { name: attachment.value.name }),
                        ...(attachment.value.width === undefined ? {} : { width: attachment.value.width }),
                        ...(attachment.value.height === undefined ? {} : { height: attachment.value.height }),
                    },
                },
            }
            : { type: 'file', file: attachment.value }),
        ...(submission.libraryReferences ?? []).map(reference => ({ type: 'library', reference }))], [submission.attachments, submission.libraryReferences]);
    return (_jsx(UserStyleBubble, { node: UNDECORATED_ROW, renderSlotChain: NO_MESSAGE_SOURCE, content: content, previewAttachments: previewAttachments, renderFactorySlot: renderFactorySlot, loadImage: loadImage, requestId: submission.requestId, ...submission.sentSkills === undefined ? {} : { sentSkills: submission.sentSkills }, pending: submission.placement === 'steering', echo: true, actions: text => (_jsx(MessageIconActions, { text: text, time: submission.time, clock: "start", className: css.actions, t: t })) }));
}
/**
 * Official user and admitted-steering keyed Chat renderer.
 *
 * Renders the durable-message chain seat directly above the bubble. The seat is
 * declared by the `user` registration alone, so a steering row renders the same
 * bubble without asking for it.
 */
export const UserMessageNodeView = memo(function UserMessageNodeView({ node, renderFactorySlot, loadImage, renderSlotChain, t, }) {
    const data = node.data;
    const requestId = requestIdOf(data.source);
    return (_jsx(UserStyleBubble, { node: node, renderSlotChain: renderSlotChain, content: data.content, interactive: true, renderFactorySlot: renderFactorySlot, loadImage: loadImage, batchStart: node.kind === 'steering' && node.data.batchStart === true, ...data.referenceLabels === undefined ? {} : { referenceLabels: data.referenceLabels }, ...data.skillNames === undefined ? {} : { skillNames: data.skillNames }, ...requestId === undefined ? {} : { requestId }, actions: text => (_jsx(MessageIconActions, { text: text, time: data.time, clock: "start", className: css.actions, t: t })) }));
});
/** Injected-context keyed Chat renderer. */
export const ContextMessageNodeView = memo(function ContextMessageNodeView({ node, t }) {
    const data = node.data;
    return (_jsx(ContextInjectionRow, { content: data.content, source: data.source, producer: data.producer, form: data.form, t: t }));
});
/** Automatic compaction keyed Chat renderer. */
export const CompactionNodeView = memo(function CompactionNodeView({ node, t }) {
    return _jsx(CompactionItem, { node: node.data, t: t });
});
/** Correlated retry-chain keyed Chat renderer. */
export const RetryNodeView = memo(function RetryNodeView({ node, t }) {
    const data = node.data;
    return _jsx(ModelRetryItem, { node: data.current, active: data.current.retryState === 'scheduled', t: t });
});
/** Terminal turn-error keyed Chat renderer. */
export const TurnErrorNodeView = memo(function TurnErrorNodeView({ node, t }) {
    return _jsx(TurnErrorItem, { node: node.data, t: t });
});
/** Max-tokens turn-end notice keyed Chat renderer. */
export const TurnMaxTokensNodeView = memo(function TurnMaxTokensNodeView({ t }) {
    return _jsx(TurnMaxTokensItem, { t: t });
});
/** Explicit unknown-surface keyed Chat renderer. */
export const UnknownNodeView = memo(function UnknownNodeView({ node, t }) {
    const data = node.data;
    return (_jsx("div", { className: css.contextRow, children: _jsx(JsonBlock, { label: t('message.unknownSurface', { type: data.type }), payload: data.data, truncatedLabel: total => t('json.truncated', { total }) }) }));
});
//# sourceMappingURL=MessageItem.js.map