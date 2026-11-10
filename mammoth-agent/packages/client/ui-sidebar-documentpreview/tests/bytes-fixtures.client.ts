/** Real localized inputs for standalone preview component integration tests. */
import { makeTranslate } from '@mammoth-ai/mmp-client-test-runtime'
import { Config } from '../src/config.ts'
import { en as common } from '../src/client/locales.ts'
import { en as pdf } from '../src/client/pdf/locales.ts'
import { en as excel } from '../src/client/excel/locales.ts'
import { en as markdown } from '../src/client/markdown/locales.ts'
import { en as code } from '../src/client/code/locales.ts'
import { en as office } from '../src/client/office/locales.ts'
import { en as image } from '../src/client/image/locales.ts'
import type { BytesPreviewProps } from '../src/client/bytes/contract.ts'

/** @param name - original filename. @param text - UTF-8 fixture content. @param mimeType - actual response MIME. @returns localized component props; unused framework seats belong to renderer tests. */
export function bytesPreviewProps(name: string, text: string, mimeType = 'application/octet-stream'): BytesPreviewProps {
  return {
    name, bytes: new TextEncoder().encode(text), mimeType, limits: Config({}).excel,
    t: makeTranslate(common), tPdf: makeTranslate(pdf), tExcel: makeTranslate(excel),
    tMarkdown: makeTranslate(markdown), tCode: makeTranslate(code), tOffice: makeTranslate(office), tImage: makeTranslate(image),
  } as BytesPreviewProps
}
