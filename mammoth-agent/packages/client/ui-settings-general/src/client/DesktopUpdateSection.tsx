/** One version page shared by Settings and the account launcher. */
import type { ObservableSnapshot } from '@mammoth-ai/mmp-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type { DesktopUpdateView } from '../types.ts'
import { updateCopy } from './DesktopUpdateIndicator.tsx'
import css from './DesktopUpdateSection.module.css'

/** Native commands and the single framework-observed update source. */
export interface DesktopUpdateSectionInjected {
  hooks: { desktopUpdate: ObservableSnapshot<DesktopUpdateView> }
  runUpdate(action: 'check' | 'download' | 'install'): void
}

/**
 * Render native update status without subscribing to any bridge in the component.
 * @param props Shared observable hook, explicit gestures, close callback, localized text.
 * @returns Desktop-only version section.
 */
export function DesktopUpdateSection({ useDesktopUpdate, runUpdate, close, t }:
  PropsRuntime<'settings.section'> & PropsLocale<'settings'> & InjectFace<DesktopUpdateSectionInjected>) {
  const view = useDesktopUpdate(value => value)
  if (!view.managed) return null
  return <DesktopUpdateContent view={view} runUpdate={runUpdate} close={close} t={t} />
}

/**
 * Present state only: mounting this face never checks, downloads, or installs.
 * @param props Current shared state, user gestures and localized copy.
 * @returns Version metadata, accessible progress, and separate stage controls.
 */
export function DesktopUpdateContent({ view, runUpdate, close, t }: {
  view: DesktopUpdateView
  runUpdate(action: 'check' | 'download' | 'install'): void
  close(): void
  t: PropsLocale<'settings'>['t']
}) {
  const state = view.presentation
  const phase = view.opening && view.operation === 'check' ? 'checking' : state?.phase ?? 'idle'
  const unsupported = state?.supported === false
  const busy = view.opening || ['checking', 'downloading', 'verifying', 'installing'].includes(phase)
  const failure = state?.failure ?? 'check'
  const installRetry = phase === 'error' && !failure.startsWith('check') && !failure.startsWith('download')
  const canInstall = phase === 'ready' || installRetry
  const canDownload = phase === 'available' || (phase === 'error' && failure.startsWith('download'))
  const label = unsupported ? t('desktop.update.unsupported')
    : view.failed ? t('desktop.update.actionFailed')
      : phase === 'idle' ? t(state?.checked ? 'desktop.update.latest' : 'desktop.update.notChecked')
        : phase === 'checking' ? t('desktop.update.checking')
          : phase === 'verifying' ? t('desktop.update.verifying')
            : phase === 'installing' ? t('desktop.update.installing')
              : updateCopy({ ...state, phase }, t).detail
  return <section className={css.section} aria-label={t('desktop.update.nav')}>
    <h2>{t('desktop.update.nav')}</h2>
    <dl className={css.versions}>
      <dt>{t('desktop.update.current')}</dt><dd>{state?.currentVersion ?? t('desktop.update.unknown')}</dd>
      {state?.version && <><dt>{t('desktop.update.target')}</dt><dd>{state.version}</dd></>}
    </dl>
    <p role={view.failed || phase === 'error' ? 'alert' : 'status'} aria-live="polite">{label}</p>
    {phase === 'downloading' && <progress max={100} value={state?.percent ?? 0} aria-label={t('desktop.update.download')} />}
    {state?.version && <div><h3>{t('desktop.update.notes')}</h3>
      <p className={css.notes}>{state.releaseNotes || t('desktop.update.noNotes')}</p></div>}
    <div className={css.actions}>
      {!unsupported && <button type="button" disabled={busy} onClick={() => { runUpdate('check') }}>{t('desktop.update.check')}</button>}
      {!unsupported && canDownload && <button type="button" disabled={busy} onClick={() => { runUpdate('download') }}>
        {t(phase === 'error' ? 'desktop.update.retry' : 'desktop.update.download')}</button>}
      {!unsupported && canInstall && <>
        <button type="button" disabled={busy} onClick={() => { runUpdate('install') }}>{t('desktop.update.ready')}</button>
        <button type="button" disabled={busy} onClick={close}>{t('desktop.update.later')}</button>
      </>}
    </div>
    <p className={css.hint}>{t('desktop.update.quiet')}</p>
    <p className={css.hint}>{t('desktop.update.safety')}</p>
  </section>
}
