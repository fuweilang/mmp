import { jsx as _jsx } from "react/jsx-runtime";
/** Standalone format routing; heavyweight PDF and workbook engines remain lazy. */
import { lazy, Suspense, useMemo } from 'react';
import { CodeBlock, MarkdownText, languageForPath } from '@mammoth-ai/mmp-client-ui-primitives';
import { bytesFormat } from "./format.js";
import { LoadingIndicator } from "../LoadingIndicator.js";
import { BytesMedia } from "./BytesMedia.js";
import { BytesPdf } from "./BytesPdf.js";
import { createBasicHtmlDocument } from "../html/basic-document.js";
import css from './BytesPreview.module.css';
const Excel = lazy(async () => ({ default: (await import("../excel/excel.js")).ExcelBody }));
/**
 * Render complete, authorized bytes using package-owned format viewers.
 * @param props - filename, actual response MIME, borrowed bytes, limits, and localized copy.
 * @returns formatted document or a truthful unsupported state; never decodes unknown binary content.
 */
export function BytesPreview(props) {
    const { name, bytes, mimeType, t } = props;
    const format = bytesFormat(name, mimeType);
    const loading = _jsx(LoadingIndicator, { label: t('loading') });
    let body;
    switch (format.kind) {
        case 'pdf':
            body = _jsx(BytesPdf, { bytes: bytes, tPdf: props.tPdf });
            break;
        case 'excel':
            body = _jsx(Suspense, { fallback: loading, children: _jsx(Excel, { content: { kind: 'bytes', data: bytes }, format: format.format, limits: props.limits, t: props.tExcel, loading: loading }) });
            break;
        case 'image':
        case 'audio':
        case 'video':
            body = _jsx(BytesMedia, { name: name, bytes: bytes, kind: format.kind, mimeType: format.mimeType, tImage: props.tImage, t: t });
            break;
        case 'html':
            body = _jsx(BytesHtml, { name: name, bytes: bytes, t: t });
            break;
        case 'markdown':
        case 'text':
        case 'code': {
            let text;
            try {
                text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                if (text.includes('\0'))
                    return unsupported(t);
            }
            catch {
                return unsupported(t);
            }
            if (format.kind === 'markdown') {
                body = _jsx(MarkdownText, { text: text, streaming: false, labels: {
                        code: { copyLabel: props.tMarkdown('code.copy'), copiedLabel: props.tMarkdown('code.copied'), toolbarLabels: {
                                codeLabel: props.tMarkdown('codeBlock.title'), wrapLabel: props.tMarkdown('codeBlock.wrap'), unwrapLabel: props.tMarkdown('codeBlock.unwrap'),
                            } }, footnotes: props.tMarkdown('footnotes'),
                    } });
            }
            else if (format.kind === 'code') {
                body = _jsx(CodeBlock, { code: text, lang: languageForPath(name), streaming: false, lineNumbers: true, wrap: true, copyLabel: props.tCode('copy'), copiedLabel: props.tCode('copied'), toolbarLabels: {
                        codeLabel: props.tCode('codeBlock.title'), wrapLabel: props.tCode('codeBlock.wrap'), unwrapLabel: props.tCode('codeBlock.unwrap'),
                    } });
            }
            else
                body = _jsx("pre", { className: css.text, children: text });
            break;
        }
        case 'unsupported': body = unsupported(t);
    }
    return _jsx("div", { className: css.preview, "data-document-bytes-preview": format.kind, children: body });
}
function BytesHtml({ name, bytes, t }) {
    const document = useMemo(() => {
        try {
            return createBasicHtmlDocument(bytes);
        }
        catch {
            return undefined;
        }
    }, [bytes]);
    if (document === undefined)
        return unsupported(t);
    return _jsx("iframe", { title: name, sandbox: "", referrerPolicy: "no-referrer", srcDoc: document, className: css.html });
}
function unsupported(t) { return _jsx("p", { role: "alert", children: t('unsupportedFile') }); }
//# sourceMappingURL=BytesPreview.js.map