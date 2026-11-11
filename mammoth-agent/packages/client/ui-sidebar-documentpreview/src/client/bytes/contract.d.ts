/** Complete, authorized document bytes supplied by any root-scoped caller. */
import type { FactoryComponentPropsOf, PropsLocale } from '@mammoth-ai/mmp-client-ui-slots';
import type { ExcelLimits } from '../excel/model.ts';
/** Borrowed read-only bytes; the caller owns authorization, version selection, and download actions. */
export interface BytesPreviewOwner {
    readonly name: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
    /** Actual response MIME; converted Office bytes must carry application/pdf. */
    readonly mimeType: string;
    /** Missing conversion fonts; absence means no font warning. */
    readonly missingFonts?: readonly string[];
}
/** Locale callbacks and parser limits supplied by this plugin's registration. */
export interface BytesPreviewInjected {
    readonly limits: ExcelLimits;
    readonly tPdf: PropsLocale<'sidebarPdf'>['t'];
    readonly tExcel: PropsLocale<'sidebarExcel'>['t'];
    readonly tMarkdown: PropsLocale<'documentMarkdown'>['t'];
    readonly tCode: PropsLocale<'sidebarCodePreview'>['t'];
    readonly tOffice: PropsLocale<'sidebarOffice'>['t'];
    readonly tImage: PropsLocale<'sidebarImage'>['t'];
}
declare module '@mammoth-ai/mmp-client-ui-slots' {
    interface SlotFactoryMap {
        /** Format-aware complete bytes, without Session or tab ownership. */
        'document.preview.bytes': {
            scope: 'root';
            props: BytesPreviewOwner;
            locale: 'sidebarDocumentPreview';
            inject: BytesPreviewInjected;
        };
    }
}
/** Framework-derived standalone preview inputs. */
export type BytesPreviewProps = FactoryComponentPropsOf<'document.preview.bytes'>;
//# sourceMappingURL=contract.d.ts.map