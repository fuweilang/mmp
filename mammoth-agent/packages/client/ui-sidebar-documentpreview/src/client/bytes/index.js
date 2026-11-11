import { BytesPreview } from "./BytesPreview.js";
/** @param ctx - root slot/locale owner. @param limits - resolved spreadsheet parser limits. */
export function apply(ctx, limits) {
    ctx.effect(() => ctx.slots.registerFactory({
        name: 'document.preview.bytes', scope: 'root', locale: 'sidebarDocumentPreview',
        inject: () => ({
            limits, tPdf: ctx.locale.bind('sidebarPdf'), tExcel: ctx.locale.bind('sidebarExcel'),
            tMarkdown: ctx.locale.bind('documentMarkdown'), tCode: ctx.locale.bind('sidebarCodePreview'),
            tOffice: ctx.locale.bind('sidebarOffice'), tImage: ctx.locale.bind('sidebarImage'),
        }),
    }, BytesPreview), 'ui-sidebar-documentpreview: complete bytes factory');
}
//# sourceMappingURL=index.js.map