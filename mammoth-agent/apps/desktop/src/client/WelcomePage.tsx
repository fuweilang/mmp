/** Desktop welcome presentation; account and credential operations stay in the preload. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Toast } from '@mammoth-ai/mmp-client-ui-primitives/src/Toast.tsx'
import { StateDot } from '@mammoth-ai/mmp-client-ui-primitives/src/StateDot.tsx'
import type { AccountView } from '@mammoth-ai/mmp-deepseek-account/types'
import type { WelcomeApi } from '../welcome-api.ts'

type Page = 'entry' | 'key' | 'account' | 'login'

/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * Clearing the account attempt returns the sign-in status page to the initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export function Welcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [expiryNotice, setExpiryNotice] = useState(false)
  const [page, setPage] = useState<Page>('login')
  const pageRef = useRef<Page>('login')
  const visiblePage = useRef<Page>('login')
  const [phone, setPhone] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [authMode, setAuthMode] = useState<'password' | 'register'>('password')
  const [name, setName] = useState('')
  const [enterpriseName, setEnterpriseName] = useState('')
  const [slug, setSlug] = useState('')
  const [agree, setAgree] = useState(true)
  const phoneInput = useRef<HTMLInputElement>(null)
  const [attempt, setAttempt] = useState<AccountView['attempt']>(null)
  const attemptRef = useRef<AccountView['attempt']>(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ status: 'idle' | 'busy' | 'copied' | 'failed' }>({ status: 'idle' })
  const copyState = copyFeedback.status
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const revision = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const keyButton = useRef<HTMLButtonElement>(null)
  const focusEntry = useRef(false)

  function navigate(next: Page) {
    pageRef.current = next
    setPage(next)
  }
  function showAccount(state: AccountView) {
    if (pageRef.current === 'key' || (state.attempt === null && (pageRef.current === 'entry' || pageRef.current === 'login'))) return
    attemptRef.current = state.attempt
    setAttempt(state.attempt)
    setStarting(false)
    setCopyFeedback({ status: 'idle' })
    navigate(state.attempt === null || state.attempt.phase === 'cancelled' ? 'login' : 'account')
  }

  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    const takeNotice = (): void => {
      void api.takeNotice().then((notice) => {
        if (mounted.current && notice === 'session-expired') setExpiryNotice(true)
      }).catch((_closedChannel: unknown) => {
        // A closed Welcome IPC channel must not interrupt the sign-in page.
      })
    }
    takeNotice()
    const stop = api.onAccountState((state) => {
      revision.current++
      takeNotice()
      showAccount(state)
    })
    return () => { mounted.current = false; stop() }
  }, [api, m.welcomeTitle])

  useEffect(() => {
    if ((page === 'entry' || page === 'login') && visiblePage.current !== page) void api.analytics?.('auth_page_view', {})
    visiblePage.current = page
    if (page === 'key') input.current?.focus()
    else if ((page === 'entry' || page === 'login') && focusEntry.current) {
      focusEntry.current = false
      keyButton.current?.focus()
    } else if (page === 'login') phoneInput.current?.focus()
  }, [page, api])

  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'failed') return
    const timer = setTimeout(() => { setCopyFeedback({ status: 'idle' }) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copyFeedback])

  async function saveKey(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    void api.analytics?.('api_key_save_click', {})
    const value = draft.trim()
    if (!/^[\x21-\x7e]+$/.test(value) || /^[A-Z][A-Z0-9_]*=[^=]/.test(value)
      || ((value.startsWith('"') || value.startsWith("'") || value.charCodeAt(0) === 96) && value.at(-1) === value[0])) {
      setError(value === '' ? m.welcomeKeyBlank : m.welcomeKeyInvalid)
      input.current?.focus()
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api.saveApiKey(value)
      if (!mounted.current) return
      if (result.ok) setDraft('')
      else setError(m.welcomeKeyFailed)
    } catch {
      if (mounted.current) setError(m.welcomeKeyFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function skip() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await api.skip()
      if (mounted.current) setDraft('')
    } catch {
      if (mounted.current) setError(m.welcomeContinueFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function cleanText(value: string, max: number) {
    return value.replace(/[\u0000-\u001f]/g, '').slice(0, max)
  }
  async function submitPassword(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    void api.analytics?.('auth_page_click', { button_name: 'sign_in' })
    if (authMode === 'register') {
      if (name.trim() === '') { setLoginError(m.welcomeNameRequired); return }
      if (!/^1\d{10}$/.test(phone)) { setLoginError(m.welcomePhoneInvalid); phoneInput.current?.focus(); return }
      if (enterpriseName.trim() === '') { setLoginError(m.welcomeEnterpriseRequired); return }
      if (slug.trim() === '') { setLoginError(m.welcomeSlugRequired); return }
      if (loginPassword === '') { setLoginError(m.welcomeLoginFailed); return }
      if (!agree) return
      busyRef.current = true
      setBusy(true)
      setLoginError('')
      try {
        const result = await api.registerWithPassword({
          name: name.trim(), phone, password: loginPassword, enterpriseName: enterpriseName.trim(), slug: slug.trim(),
        })
        if (!mounted.current) return
        if (!result.ok) setLoginError(result.message || m.welcomeRegisterFailed)
        else setLoginPassword('')
      } catch {
        if (mounted.current) setLoginError(m.welcomeRegisterFailed)
      } finally {
        busyRef.current = false
        if (mounted.current) setBusy(false)
      }
      return
    }
    if (!/^1\d{10}$/.test(phone)) { setLoginError(m.welcomePhoneInvalid); phoneInput.current?.focus(); return }
    if (loginPassword === '') { setLoginError(m.welcomeLoginFailed); return }
    busyRef.current = true
    setBusy(true)
    setLoginError('')
    try {
      const result = await api.signInWithPassword(phone, loginPassword)
      if (!mounted.current) return
      if (!result.ok) setLoginError(result.reason === 'credentials' ? m.welcomeLoginFailed : result.message || m.welcomeLoginUnavailable)
      else setLoginPassword('')
    } catch {
      if (mounted.current) setLoginError(m.welcomeLoginUnavailable)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function start() {
    navigate('account')
    setStarting(true)
    setAttempt(null)
    attemptRef.current = null
    const current = ++revision.current
    try {
      const state = await api.startSignIn()
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      if (mounted.current && revision.current === current) setStarting(false)
    }
  }
  async function cancel() {
    if (cancelling || attemptRef.current === null) return
    setCancelling(true)
    const current = ++revision.current
    try {
      const state = await api.cancelSignIn(attemptRef.current.id)
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      // The current attempt remains visible so cancellation can be retried.
    } finally {
      if (mounted.current) setCancelling(false)
    }
  }
  async function copyLink() {
    const current = attemptRef.current
    if (current?.phase !== 'waiting-browser' || (copyState === 'busy' || copyState === 'copied')) return
    setCopyFeedback({ status: 'busy' })
    try {
      await api.copySignInLink(current.id)
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'copied' })
    } catch {
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'failed' })
    }
  }

  const phase = starting ? 'initializing' : attempt?.phase ?? 'failed'
  const waiting = phase === 'waiting-browser'
  const failed = phase === 'expired' || phase === 'failed'
  const title = phase === 'initializing' ? m.welcomeAuthStarting
    : waiting ? m.welcomeAuthWaiting : phase === 'expired' ? m.welcomeAuthExpired
      : phase === 'failed' ? m.welcomeAuthFailed : m.welcomeAuthExchanging
  const heading = page === 'entry' ? 'welcome-heading' : page === 'login' ? 'login-title' : page === 'key' ? 'key-title' : 'auth-status'

  return <>
    {expiryNotice && <Toast text={m.welcomeSessionExpired} onDone={() => { setExpiryNotice(false) }} />}
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome" aria-labelledby={heading}>
      <img className="brand" src="assets/welcome-brand.svg" alt={m.welcomeBrand} width="472" height="40" />
      <div id="tagline" className="tagline" hidden={page !== 'entry'}>
        <h1 id="welcome-heading"><span>{m.welcomeTaglineBefore}</span><em>{m.welcomeTaglineBrand}</em><span>{m.welcomeTaglineAfter}</span></h1>
        <p id="welcome-description">{m.welcomeDescription}</p>
      </div>
      <form id="login-form" className={`login-card${authMode === 'register' ? ' login-card--register' : ''}`} hidden={page !== 'login'} noValidate onSubmit={(event) => { void submitPassword(event) }} aria-busy={busy}>
        <header className="login-head">
          <h1 id="login-title">{m.welcomeLoginTitle}</h1>
          <p id="login-subtitle">{authMode === 'register' ? m.welcomeRegisterSubtitle : m.welcomeLoginSubtitle}</p>
        </header>
        <div className="mode-switch" role="tablist">
          <button type="button" role="tab" aria-selected={authMode === 'password'} onClick={() => { setAuthMode('password'); setLoginError('') }}>{m.welcomeLoginTab}</button>
          <button type="button" role="tab" aria-selected={authMode === 'register'} onClick={() => { setAuthMode('register'); setLoginError('') }}>{m.welcomeRegisterTab}</button>
        </div>
        <label className="login-field" hidden={authMode !== 'register'}>
          <span>{m.welcomeName}</span>
          <input id="register-name" name="name" autoComplete="name" maxLength={40} value={name} disabled={busy}
            placeholder={m.welcomeNamePlaceholder}
            onChange={(event) => { setName(cleanText(event.target.value, 40)); setLoginError('') }} />
        </label>
        <label className="login-field">
          <span>{m.welcomePhone}</span>
          <input ref={phoneInput} id="login-phone" name="phone" inputMode="numeric" autoComplete="username" maxLength={11} required
            placeholder={m.welcomePhonePlaceholder} value={phone} disabled={busy}
            onChange={(event) => { setPhone(event.target.value.replace(/\D/g, '').slice(0, 11)); setLoginError('') }} />
        </label>
        <label className="login-field" hidden={authMode !== 'register'}>
          <span>{m.welcomeEnterprise}</span>
          <input id="register-enterprise" name="enterprise" maxLength={80} value={enterpriseName} disabled={busy}
            placeholder={m.welcomeEnterprisePlaceholder}
            onChange={(event) => { setEnterpriseName(cleanText(event.target.value, 80)); setLoginError('') }} />
        </label>
        <label className="login-field" hidden={authMode !== 'register'}>
          <span>{m.welcomeSlug}</span>
          <input id="register-slug" name="slug" maxLength={40} value={slug} disabled={busy}
            placeholder={m.welcomeSlugPlaceholder}
            onChange={(event) => { setSlug(cleanText(event.target.value, 40)); setLoginError('') }} />
        </label>
        <label className="login-field">
          <span>{authMode === 'register' ? m.welcomeSetPassword : m.welcomePassword}</span>
          <input id="login-password" name="password" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required
            placeholder={authMode === 'register' ? m.welcomeSetPasswordPlaceholder : m.welcomePasswordPlaceholder} value={loginPassword} disabled={busy}
            onChange={(event) => { setLoginPassword(event.target.value); setLoginError('') }} />
        </label>
        <label className="login-agreement" hidden={authMode !== 'register'}>
          <input id="register-agree" type="checkbox" checked={agree} disabled={busy} onChange={(event) => { setAgree(event.target.checked) }} />
          <span>{m.welcomeAgreement}</span>
        </label>
        <p id="login-error" className="login-error" role="alert" hidden={loginError === ''}>{loginError}</p>
        <button id="sign-in" className="primary" type="submit" hidden={authMode !== 'password'} disabled={busy || phone === '' || loginPassword === ''}>{m.welcomeSignIn}</button>
        <button id="register" className="primary" type="submit" hidden={authMode !== 'register'} disabled={busy || !agree || name.trim() === '' || phone === '' || enterpriseName.trim() === '' || slug.trim() === '' || loginPassword === ''}>{m.welcomeRegisterSubmit}</button>
      </form>
      <form id="key-form" className="key-form" hidden={page !== 'key'} noValidate onSubmit={(event) => { void saveKey(event) }} aria-busy={busy}>
        <header className="key-heading"><h1 id="key-title">{m.welcomeKeyTitle}</h1><p id="key-description">{m.welcomeKeyDescription}</p></header>
        <div className="key-field">
          <label className="visually-hidden" htmlFor="key-input">{m.welcomeKeyPlaceholder}</label>
          <input ref={input} id="key-input" type="password" autoComplete="new-password" autoCapitalize="off" spellCheck={false} required
            aria-describedby="key-description key-error" aria-invalid={error !== ''} placeholder={m.welcomeKeyPlaceholder}
            value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value); setError('') }} />
          <p id="key-error" className="key-error" role="alert" hidden={error === ''}>{error}</p>
        </div>
      </form>
      <section id="auth-page" className={`key-heading ${waiting ? 'auth-waiting' : phase === 'expired' ? 'auth-expired' : ''}`}
        hidden={page !== 'account'} aria-live="polite">
        <h1 id="auth-status">{title}</h1>
        <p id="auth-description" hidden={!waiting && phase !== 'expired'}>{waiting ? m.welcomeAuthWaitingDescription : m.welcomeAuthExpiredDescription}</p>
        <button id="auth-copy" className="copy-link" type="button" hidden={!waiting} disabled={!waiting || (copyState === 'busy' || copyState === 'copied')} onClick={() => { void copyLink() }}>
          {copyState === 'copied' ? m.welcomeAuthCopied : copyState === 'failed' ? m.welcomeAuthCopyFailed : m.welcomeAuthCopyLink}
        </button>
      </section>
      <div id="auth-actions" className="actions" hidden={page !== 'account'}>
        <button id="auth-loading" className="primary" type="button" hidden={failed} disabled aria-label={m.welcomeAuthExchanging}>
          <StateDot state="ongoing" size={16} className="welcome-loading" />
        </button>
        <button id="auth-retry" className="primary" type="button" hidden={!failed} onClick={() => {
          void api.analytics?.('auth_page_click', { button_name: 'sign_in' })
          setStarting(false)
          setAttempt(null)
          attemptRef.current = null
          navigate('login')
        }}>{m.welcomeAuthRetry}</button>
        <button id="auth-api-key" className="secondary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
        <button id="auth-cancel" className="secondary" type="button" hidden={failed}
          disabled={cancelling || phase === 'committing' || phase === 'succeeded' || (phase === 'initializing' && !attempt?.id)}
          onClick={() => { void cancel() }}>{m.welcomeAuthCancel}</button>
      </div>
      <div id="entry-actions" className="actions" hidden={page !== 'entry'}>
        <button id="entry-sign-in" className="primary" type="button" onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start() }}>{m.welcomeSignIn}</button>
        <button ref={keyButton} id="api-key" className="secondary" type="button" hidden style={{ display: 'none' }} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
      </div>
      <div id="key-actions" className="actions" hidden={page !== 'key'}>
        <button id="save-key" className="primary" type="submit" form="key-form" disabled={busy || draft.trim() === ''}>{m.welcomeKeySave}</button>
        <button id="skip-key" className="secondary" type="button" disabled={busy} onClick={() => { void skip() }}>{m.welcomeKeyLater}</button>
        <button id="back-to-login" className="back" type="button" disabled={busy} onClick={() => {
          if (busyRef.current) return
          setDraft(''); setError(''); focusEntry.current = true; navigate('login')
        }}>{m.welcomeKeyBack}</button>
      </div>
    </main>
  </>
}
