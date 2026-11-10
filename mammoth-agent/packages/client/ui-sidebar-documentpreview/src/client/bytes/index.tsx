/** Root-scoped standalone byte preview registration. */
import type { Context } from '@mammoth-ai/cordis'
import type { Config } from '../../config.ts'
import { BytesPreview } from './BytesPreview.tsx'

/** @param ctx - root slot/locale owner. @param limits - resolved spreadsheet parser limits. */
export function apply(ctx: Context, limits: Config['excel']): void {
  ctx.effect(() => ctx.slots.registerFactory({
    name: 'document.preview.bytes', scope: 'root', locale: 'sidebarDocumentPreview',
    inject: () => ({
      limits, tPdf: ctx.locale.bind('sidebarPdf'), tExcel: ctx.locale.bind('sidebarExcel'),
      tMarkdown: ctx.locale.bind('documentMarkdown'), tCode: ctx.locale.bind('sidebarCodePreview'),
      tOffice: ctx.locale.bind('sidebarOffice'), tImage: ctx.locale.bind('sidebarImage'),
    }),
  }, BytesPreview), 'ui-sidebar-documentpreview: complete bytes factory')
}
