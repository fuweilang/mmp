/** Account authorization dialog; errors allow retry after cancelling any active attempt. */
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, IconCloseOutlineRegular, IconLoadingOutlineRegular, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { SignInAttemptId } from '@mammoth-ai/mmp-deepseek-account/types'
import type { AccountKey } from './locales.ts'
import { authorizeUrlWithTheme } from './authorize-url.ts'
import css from './SignInDialog.module.css'

/** @param props - safe account state, localized copy, and user actions. @returns login dialog. */
export function SignInDialog({ account, colorScheme, start, cancel, submitPassword, close, useApiKey, t }: {
  account: AccountSnapshot
  /** Resolved scheme of the active application theme; the copied link carries it. */
  colorScheme: 'light' | 'dark'
  start: () => Promise<void>
  cancel: (id: SignInAttemptId) => Promise<void>
  /** Desktop password login. When set, this dialog does not open a browser. */
  submitPassword?: (phone: string, password: string) => Promise<void>
  close: () => void
  useApiKey: () => void
  t: (key: AccountKey) => string
}) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copyResult, setCopyResult] = useState<{ messageKey: 'copiedLink' | 'copyFailed' } | null>(null)
  const attempt = account.view?.attempt
  useEffect(() => { setCopyResult(null) }, [attempt?.id, attempt?.authorizeUrl])
  useEffect(() => {
    if (copyResult === null) return
    const timer = setTimeout(() => { setCopyResult(null) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copyResult])
  const authorizeUrl = attempt?.authorizeUrl
  const phase = attempt?.phase
  const active = busy || phase === 'initializing' || phase === 'waiting-browser' || phase === 'exchanging' || phase === 'committing'
  const expired = phase === 'expired'
  const localFailure = failed || account.loginFailed || account.failed
  const error = localFailure || phase === 'failed'
  const failureKey = !localFailure
    && phase === 'failed' && attempt?.errorCode === 'no-response' ? 'noResponse' : 'failed'
  const waiting = active && !error
  const committing = phase === 'committing'
  useEffect(() => { if (account.view?.status === 'credential-stored') close() }, [account.view?.status, close])
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailed(false)
    try { await action() } catch { setFailed(true) } finally { setBusy(false) }
  }
  const dismiss = () => {
    if (committing || busy) return
    if (active && attempt) void run(async () => { await cancel(attempt.id); close() })
    else close()
  }
  const retry = async () => {
    if (active && attempt) await cancel(attempt.id)
    await start()
  }
  const copyLink = async (authorizeUrl: string) => {
    try {
      await navigator.clipboard.writeText(authorizeUrlWithTheme(authorizeUrl, colorScheme))
      setCopyResult({ messageKey: 'copiedLink' })
    } catch { setCopyResult({ messageKey: 'copyFailed' }) }
  }
  const title = error ? t('failureTitle') : active ? t('browserTitle') : expired ? t('timeoutTitle') : t('loginTitle')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (submitPassword === undefined || busy) return
    if (!/^1\d{10}$/.test(phone)) { setFormError(t('phoneInvalid')); return }
    if (password === '') { setFormError(t('credentialsFailed')); return }
    void run(async () => {
      try {
        await submitPassword(phone, password)
        setPassword('')
        setFormError('')
      } catch (caught) {
        const key = caught instanceof Error ? caught.message : ''
        setFormError(t(key === 'clientTooOld' || key === 'credentialsFailed' ? key : 'loginUnavailable'))
      }
    })
  }
  if (submitPassword !== undefined) return <Modal open headless title={t('loginTitle')} onClose={dismiss} className={css.dialog as string}>
    <form className={css.content} onSubmit={submit}>
      <div className={css.header}>
        <h2 className={css.title}>{t('loginTitle')}</h2>
        <button type="button" className={css.close} aria-label={t('close')} onClick={dismiss}>
          <IconCloseOutlineRegular size={14} />
        </button>
      </div>
      <p className={css.description}>{t('loginSubtitle')}</p>
      <label className={css.field}><span>{t('phone')}</span>
        <input id="account-phone" name="phone" autoComplete="username" inputMode="numeric" maxLength={11} value={phone} disabled={busy}
          placeholder={t('phonePlaceholder')} onChange={(event) => { setPhone(event.target.value.replace(/\D/g, '').slice(0, 11)); setFormError('') }} />
      </label>
      <label className={css.field}><span>{t('password')}</span>
        <input id="account-password" name="password" type="password" autoComplete="current-password" value={password} disabled={busy}
          placeholder={t('passwordPlaceholder')} onChange={(event) => { setPassword(event.target.value); setFormError('') }} />
      </label>
      <p className={css.formError} role="alert" hidden={formError === ''}>{formError}</p>
      <div className={css.actions}>
        <Button variant="primary" className={css.primaryButton} type="submit" disabled={busy || phone === '' || password === ''}>
          {busy ? <IconLoadingOutlineRegular className={css.spinner} /> : t('signIn')}
        </Button>
      </div>
    </form>
  </Modal>
  return <Modal open headless title={title} onClose={dismiss} className={css.dialog as string}>
    <div className={css.content}>
      <div className={css.header}>
        <h2 className={css.title}>{title}</h2>
        <button type="button" className={css.close} aria-label={t('close')} onClick={dismiss}>
          <IconCloseOutlineRegular size={14} />
        </button>
      </div>
      {waiting ? <p className={css.description}>
        {t('browserPrompt')}<button type="button" className={css.link} disabled={!authorizeUrl}
          onClick={authorizeUrl ? () => { void copyLink(authorizeUrl) } : undefined}>
          {t(copyResult?.messageKey ?? 'copyLink')}
        </button>{t('browserDescription')}
      </p> : <p className={css.description}>
        {error ? t(failureKey) : expired ? t('timeoutDescription') : t('loginDescription')}
      </p>}
    </div>
    <div className={css.actions}>
      <Button variant="outline" className={css.secondaryButton} disabled={committing || busy}
        hidden={!active} style={active ? undefined : { display: 'none' }} onClick={active ? dismiss : useApiKey}>{t(active ? 'cancel' : 'addApiKey')}</Button>
      <Button variant="primary" className={css.primaryButton} disabled={busy || committing || waiting || account.view === undefined}
        aria-label={waiting ? t('waiting') : undefined} onClick={() => { void run(retry) }}>
        {waiting ? <IconLoadingOutlineRegular className={css.spinner} /> : t(expired || error ? 'retry' : 'signIn')}
      </Button>
    </div>
  </Modal>
}
