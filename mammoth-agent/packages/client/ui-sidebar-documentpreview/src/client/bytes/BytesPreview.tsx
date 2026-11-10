/** Standalone format routing; heavyweight PDF and workbook engines remain lazy. */
import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { CodeBlock, MarkdownText, languageForPath } from '@mammoth-ai/mmp-client-ui-primitives'
import { bytesFormat } from './format.ts'
import type { BytesPreviewProps } from './contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import { BytesMedia } from './BytesMedia.tsx'
import { BytesPdf } from './BytesPdf.tsx'
import { createBasicHtmlDocument } from '../html/basic-document.ts'
import css from './BytesPreview.module.css'

const Excel = lazy(async () => ({ default: (await import('../excel/excel.tsx')).ExcelBody }))

/**
 * Render complete, authorized bytes using package-owned format viewers.
 * @param props - filename, actual response MIME, borrowed bytes, limits, and localized copy.
 * @returns formatted document or a truthful unsupported state; never decodes unknown binary content.
 */
export function BytesPreview(props: BytesPreviewProps): ReactNode {
  const { name, bytes, mimeType, t } = props
  const format = bytesFormat(name, mimeType)
  const loading = <LoadingIndicator label={t('loading')} />
  let body: ReactNode
  switch (format.kind) {
    case 'pdf': body = <BytesPdf bytes={bytes} tPdf={props.tPdf} />; break
    case 'excel': body = <Suspense fallback={loading}><Excel content={{ kind: 'bytes', data: bytes }} format={format.format} limits={props.limits} t={props.tExcel} loading={loading} /></Suspense>; break
    case 'image': case 'audio': case 'video': body = <BytesMedia name={name} bytes={bytes} kind={format.kind} mimeType={format.mimeType} tImage={props.tImage} t={t} />; break
    case 'html': body = <BytesHtml name={name} bytes={bytes} t={t} />; break
    case 'markdown': case 'text': case 'code': {
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (text.includes('\0')) return unsupported(t) }
      catch { return unsupported(t) }
      if (format.kind === 'markdown') {
        body = <MarkdownText text={text} streaming={false} labels={{
          code: { copyLabel: props.tMarkdown('code.copy'), copiedLabel: props.tMarkdown('code.copied'), toolbarLabels: {
            codeLabel: props.tMarkdown('codeBlock.title'), wrapLabel: props.tMarkdown('codeBlock.wrap'), unwrapLabel: props.tMarkdown('codeBlock.unwrap'),
          } }, footnotes: props.tMarkdown('footnotes'),
        }} />
      } else if (format.kind === 'code') {
        body = <CodeBlock code={text} lang={languageForPath(name)} streaming={false} lineNumbers wrap
          copyLabel={props.tCode('copy')} copiedLabel={props.tCode('copied')} toolbarLabels={{
            codeLabel: props.tCode('codeBlock.title'), wrapLabel: props.tCode('codeBlock.wrap'), unwrapLabel: props.tCode('codeBlock.unwrap'),
          }} />
      } else body = <pre className={css.text}>{text}</pre>
      break
    }
    case 'unsupported': body = unsupported(t)
  }
  return <div className={css.preview} data-document-bytes-preview={format.kind}>
    {body}
  </div>
}

function BytesHtml({ name, bytes, t }: Pick<BytesPreviewProps, 'name' | 'bytes' | 't'>): ReactNode {
  const document = useMemo(() => {
    try { return createBasicHtmlDocument(bytes) }
    catch { return undefined }
  }, [bytes])
  if (document === undefined) return unsupported(t)
  return <iframe title={name} sandbox="" referrerPolicy="no-referrer" srcDoc={document} className={css.html} />
}

function unsupported(t: BytesPreviewProps['t']): ReactNode { return <p role="alert">{t('unsupportedFile')}</p> }
