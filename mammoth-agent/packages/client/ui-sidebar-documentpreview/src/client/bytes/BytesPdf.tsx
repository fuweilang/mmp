/** PDF instance viewing state and cancellation owned by one standalone body. */
import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import type { PdfView } from '../pdf/store.ts'
import type { ZoomPreference } from '../zoom/types.ts'
import { ZoomViewport, zoomSurfaceClass } from '../zoom/ZoomViewport.tsx'
import type { BytesPreviewProps } from './contract.ts'

const PdfReader = lazy(async () => ({ default: (await import('../pdf/pdf.tsx')).PdfReader }))
const INITIAL_VIEW: PdfView = { page: 1 }
const scrollportRef = (): void => {}

/** @param props - borrowed PDF data and localized controls. @returns standalone reader without synthetic framework seats. */
export function BytesPdf({ bytes, tPdf }: Pick<BytesPreviewProps, 'bytes' | 'tPdf'>): ReactNode {
  const [state, setState] = useState({ bytes, view: INITIAL_VIEW })
  const view = state.bytes === bytes ? state.view : INITIAL_VIEW
  const onPage = useCallback((page: number): void => {
    setState(previous => ({ bytes, view: { ...(previous.bytes === bytes ? previous.view : INITIAL_VIEW), page } }))
  }, [bytes])
  const onZoom = useCallback((zoom: ZoomPreference): void => {
    setState(previous => ({ bytes, view: { ...(previous.bytes === bytes ? previous.view : INITIAL_VIEW), zoom } }))
  }, [bytes])
  const loading = <LoadingIndicator label={tPdf('loading')} />
  return <Suspense fallback={loading}><PdfReader edgeToEdge data={bytes} view={view} onPage={onPage} onZoom={onZoom}
    t={tPdf} ZoomViewport={ZoomViewport} zoomSurfaceClass={zoomSurfaceClass} scrollportRef={scrollportRef} loading={loading} /></Suspense>
}
