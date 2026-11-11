import { jsx as _jsx } from "react/jsx-runtime";
/** PDF instance viewing state and cancellation owned by one standalone body. */
import { lazy, Suspense, useCallback, useState } from 'react';
import { LoadingIndicator } from "../LoadingIndicator.js";
import { ZoomViewport, zoomSurfaceClass } from "../zoom/ZoomViewport.js";
const PdfReader = lazy(async () => ({ default: (await import("../pdf/pdf.js")).PdfReader }));
const INITIAL_VIEW = { page: 1 };
const scrollportRef = () => { };
/** @param props - borrowed PDF data and localized controls. @returns standalone reader without synthetic framework seats. */
export function BytesPdf({ bytes, tPdf }) {
    const [state, setState] = useState({ bytes, view: INITIAL_VIEW });
    const view = state.bytes === bytes ? state.view : INITIAL_VIEW;
    const onPage = useCallback((page) => {
        setState(previous => ({ bytes, view: { ...(previous.bytes === bytes ? previous.view : INITIAL_VIEW), page } }));
    }, [bytes]);
    const onZoom = useCallback((zoom) => {
        setState(previous => ({ bytes, view: { ...(previous.bytes === bytes ? previous.view : INITIAL_VIEW), zoom } }));
    }, [bytes]);
    const loading = _jsx(LoadingIndicator, { label: tPdf('loading') });
    return _jsx(Suspense, { fallback: loading, children: _jsx(PdfReader, { edgeToEdge: true, data: bytes, view: view, onPage: onPage, onZoom: onZoom, t: tPdf, ZoomViewport: ZoomViewport, zoomSurfaceClass: zoomSurfaceClass, scrollportRef: scrollportRef, loading: loading }) });
}
//# sourceMappingURL=BytesPdf.js.map