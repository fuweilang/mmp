/** PDF page presentation; binary content and tab information come from the document owner. */
import { type ComponentType, type ReactNode } from 'react';
import type { PropsLocale, PropsStore } from '@mammoth-ai/mmp-client-ui-slots';
import type { TabId } from '@mammoth-ai/mmp-client-ui-dockkit';
import type { DocumentPreviewProps } from '../document/contract.ts';
import type { PdfStore, PdfView } from './store.ts';
import type { ZoomViewportProps } from '../zoom/ZoomViewport.tsx';
import type { ZoomPreference } from '../zoom/types.ts';
/** A record's viewing preferences survive body unmounts and leave with the tab. */
export interface PdfBodyInjected {
    /**
     * Retain viewing preferences until the tab record ends.
     * @param tabId - owning tab.
     * @param signal - tab-record lifetime, not body visibility.
     */
    readonly retainTab: (tabId: TabId, signal: AbortSignal) => void;
    /** Main-bundle viewport reused by the lazy PDF body. */
    readonly ZoomViewport: ComponentType<ZoomViewportProps>;
    /** Main-bundle class implementing fit-width and fixed-size surfaces. */
    readonly zoomSurfaceClass: string;
}
/** Standard document props plus the PDF entry's locale, viewing store, and lifetime callback. */
export type PdfBodyProps = DocumentPreviewProps & PropsLocale<'sidebarPdf'> & PropsStore<PdfStore> & PdfBodyInjected;
/**
 * Present a PDF with tab-local viewing preferences and component-owned rendering resources.
 * @param props - complete bytes, framework-owned tab/store/locale seats, and main-bundle loading content.
 * @returns the PDF reader.
 */
export declare function PdfBody(props: PdfBodyProps & {
    readonly loading: ReactNode;
}): ReactNode;
/** Complete PDF input and viewing callbacks, independent from Session/tab seats. */
export type PdfReaderProps = Pick<PdfBodyProps, 't' | 'scrollportRef' | 'ZoomViewport' | 'zoomSurfaceClass'> & {
    /** Main-bundle loading presentation shared with the lazy tab wrapper. */
    readonly loading: ReactNode;
    /** Fill the library pane without paper chrome; tab readers retain their paper presentation. */
    readonly edgeToEdge?: boolean;
    readonly data: Uint8Array<ArrayBuffer> | undefined;
    /** Omit to use the mounted reader lifetime; supplied cancellation also closes all resources. */
    readonly signal?: AbortSignal;
    readonly view: PdfView;
    readonly onPage: (page: number) => void;
    readonly onZoom: (value: ZoomPreference) => void;
};
/**
 * Present borrowed PDF bytes for the supplied lifetime and viewing state.
 * @param props - complete bytes, cancellation, viewing callbacks, and localized controls.
 * @returns selectable, zoomable PDF pages with owned worker/render cleanup.
 */
export declare function PdfReader(props: PdfReaderProps): ReactNode;
//# sourceMappingURL=pdf.d.ts.map