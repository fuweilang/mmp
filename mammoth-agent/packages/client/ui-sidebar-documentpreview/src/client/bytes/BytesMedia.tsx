/** Object URLs belong to the mounted image/player and leave on replacement. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ZoomViewport, zoomSurfaceClass } from '../zoom/ZoomViewport.tsx'
import type { ZoomLabels, ZoomPreference } from '../zoom/types.ts'
import type { BytesPreviewProps } from './contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import css from './BytesPreview.module.css'

type Props = Pick<BytesPreviewProps, 'name' | 'bytes' | 'mimeType' | 'tImage' | 't'> & { readonly kind: 'image' | 'audio' | 'video' }
const scrollportRef = (): void => {}

/** @param props - admitted image or media bytes and localized failure controls. @returns an image viewport or native player. */
export function BytesMedia(props: Props): ReactNode {
  const { bytes, mimeType, kind, name, tImage, t } = props
  const [source, setSource] = useState<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; signal: AbortSignal; url?: string }>()
  const [failure, setFailure] = useState<string>()
  useEffect(() => {
    const lifetime = new AbortController()
    let url: string
    try { url = URL.createObjectURL(new Blob([bytes], { type: mimeType })) }
    catch { setSource({ bytes, mimeType, signal: lifetime.signal }); return () => { lifetime.abort() } }
    setSource({ bytes, mimeType, url, signal: lifetime.signal })
    return () => { lifetime.abort(); URL.revokeObjectURL(url) }
  }, [bytes, mimeType])
  if (source?.bytes !== bytes || source.mimeType !== mimeType) return <LoadingIndicator label={t('loading')} />
  if (source.url === undefined || failure === source.url) return <p role="alert">{kind === 'image' ? tImage('failed') : t('unsupportedFile')}</p>
  const failed = (): void => { setFailure(source.url) }
  if (kind === 'image') return <Image key={source.url} url={source.url} name={name} tImage={tImage} signal={source.signal} onError={failed} />
  return kind === 'audio'
    ? <audio className={css.media} controls src={source.url} aria-label={name} onError={failed} />
    : <video className={css.media} controls src={source.url} aria-label={name} onError={failed} />
}

function Image({ url, name, tImage: t, onError, signal }: Pick<Props, 'name' | 'tImage'> & { readonly url: string; readonly onError: () => void; readonly signal: AbortSignal }): ReactNode {
  const [preference, setPreference] = useState<ZoomPreference>({ kind: 'fit-width' })
  const [width, setWidth] = useState<number>()
  const labels: ZoomLabels = {
    controls: t('zoomControls'), menu: t('zoomMenu'), out: t('zoomOut'), into: t('zoomIn'),
    fitWidth: t('zoomFitWidth'), value: percent => t('zoomValue', { percent }),
  }
  return <ZoomViewport preference={preference} intrinsicWidth={width} labels={labels} signal={signal}
    scrollportRef={scrollportRef} onPreference={setPreference}>
    <div className={`${css.image} ${zoomSurfaceClass}`} data-document-zoom-surface style={{ '--document-zoom-width': `${width ?? 0}px` } as CSSProperties}>
      <img src={url} alt={name} onLoad={event => { setWidth(event.currentTarget.naturalWidth) }} onError={onError} />
    </div>
  </ZoomViewport>
}
