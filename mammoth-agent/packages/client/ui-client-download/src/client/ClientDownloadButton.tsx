/** Sidebar footer actions for opening or downloading the desktop app (Web only). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconCheckOutlineMedium, IconDownloadOutlineMedium, IconWarningOutlineMedium, Modal, Toast } from '@mammoth-ai/mmp-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import {
  CLIENT_PLATFORM_OPTIONS, clientDownloadUrl, clientLaunchUrl, detectClientOs, fetchClientDownloadInfo,
  type ClientDownloadInfo, type ClientPlatform,
} from './download.ts'
import css from './ClientDownloadButton.module.css'

/** Platform glyphs drawn inline so the dialog stays self-contained. */
function PlatformGlyph({ id }: { id: ClientPlatform }) {
  if (id === 'mac-arm64') {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  }
  if (id === 'mac-x64') {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <rect x="10" y="10" width="4" height="4" rx="1" />
        <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" />
      </g>
    </svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M3 5.6 10.6 4.5v6.9H3V5.6Zm0 12.8 7.6 1.1v-6.9H3v5.8ZM11.6 4.4 21 3.1v8.3h-9.4V4.4Zm0 8.4H21v8.3l-9.4-1.3v-7Z" />
  </svg>
}

export type ClientDownloadButtonProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<'clientDownload'> & InjectFace<Record<never, never>>

/**
 * Download action for the hosted Web build. The Desktop client already IS the
 * client, so the registration (not this component) skips Desktop.
 * @param props - sidebar column state plus the localized seat.
 * @returns footer action card and its dialog.
 */
export function ClientDownloadButton({ wide, t }: ClientDownloadButtonProps) {
  const [launchHint, setLaunchHint] = useState(false)
  const cancelLaunchCheck = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => { cancelLaunchCheck.current?.() }, [])

  const [open, setOpen] = useState(false)
  const [started, setStarted] = useState<ClientPlatform | null>(null)
  const [info, setInfo] = useState<ClientDownloadInfo | null>(null)
  // Only Windows gets a "current system" badge: it has one installer, while
  // the browser cannot tell Apple silicon from Intel.
  const currentOptionId = useMemo<ClientPlatform | null>(() => detectClientOs() === 'win' ? 'win' : null, [])

  useEffect(() => {
    if (!open || info !== null) return
    let cancelled = false
    void fetchClientDownloadInfo().then(next => { if (!cancelled) setInfo(next) })
    return () => { cancelled = true }
  }, [open, info])

  const meta = info === null ? '' : [
    info.version ? t('versionLine', { version: info.version }) : '',
    info.date,
    info.sizeMb === null ? '' : t('sizeLine', { sizeMb: info.sizeMb }),
  ].filter(Boolean).join(' · ')

  const openDownloads = () => {
    cancelLaunchCheck.current?.()
    setLaunchHint(false)
    setOpen(true)
  }

  const watchLaunch = () => {
    cancelLaunchCheck.current?.()
    setLaunchHint(false)

    const stop = () => {
      window.clearTimeout(timer)
      window.removeEventListener('blur', stop)
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      cancelLaunchCheck.current = undefined
    }
    const onVisibilityChange = () => {
      if (document.hidden) stop()
    }
    const timer = window.setTimeout(() => {
      stop()
      if (!document.hidden && document.hasFocus()) setLaunchHint(true)
    }, 1800)
    cancelLaunchCheck.current = stop
    window.addEventListener('blur', stop)
    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  const download = (platform: ClientPlatform) => {
    if (!info?.availablePlatforms.includes(platform)) return
    setStarted(platform)
    window.location.assign(clientDownloadUrl(platform, info?.files?.[platform]))
  }

  return <>
    <div className={css.actions} data-wide={wide}>
      <button type="button" className={css.primary} title={t('getApp')}
        aria-label={t('getApp')} onClick={openDownloads}>
        <span className={css.primaryIcon} aria-hidden="true"><IconDownloadOutlineMedium size={16} /></span>
        {wide ? <span className={css.primaryLabel}>{t('getApp')}</span> : null}
      </button>
      <a href={clientLaunchUrl(window.location.hostname)} className={css.open}
        title={t('openClient')} aria-label={t('openClient')} onClick={watchLaunch}>
        {wide ? <>
          <span className={css.openLabel}>{t('openInstalled')}</span>
          <span className={css.openArrow} aria-hidden="true">↗</span>
        </> : null}
      </a>
    </div>
    {launchHint ? <Toast text={t('launchHint')} icon={<IconWarningOutlineMedium size={16} />} holdMs={6500}
      actions={[{ label: t('action'), prefix: ' ', onClick: openDownloads }]} onDone={() => setLaunchHint(false)} /> : null}
    <Modal open={open} title={t('dialogTitle')} closeLabel={t('close')}
      {...(css.dialog ? { className: css.dialog } : {})}
      onClose={() => { setOpen(false); setStarted(null) }}>
      <p className={css.tip}>{t('tip')}</p>
      {meta ? <p className={css.meta}>{meta}</p> : null}
      <ul className={css.optionList}>
        {CLIENT_PLATFORM_OPTIONS.map(option => (
          <li key={option.id} className={css.option} aria-disabled={!info?.availablePlatforms.includes(option.id)} onClick={() => download(option.id)}>
            <span className={css.optionIcon}><PlatformGlyph id={option.id} /></span>
            <span className={css.optionText}>
              <span className={css.optionTitle}>
                {t(option.titleKey)}
                {option.id === currentOptionId
                  ? <span className={css.optionBadge}>{t('currentSystem')}</span> : null}
              </span>
              <span className={css.optionSub}>{t(option.subKey)}</span>
            </span>
            <span className={css.optionAction}>
              {!info?.availablePlatforms.includes(option.id) ? t('unavailable') : started === option.id
                ? <>
                  <IconCheckOutlineMedium size={14} />
                  {t('started')}
                  <button type="button" className={css.retry}
                    onClick={event => { event.stopPropagation(); download(option.id) }}>
                    {t('retry')}
                  </button>
                </>
                : <>
                  <IconDownloadOutlineMedium size={14} />
                  {t('download')}
                </>}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  </>
}
