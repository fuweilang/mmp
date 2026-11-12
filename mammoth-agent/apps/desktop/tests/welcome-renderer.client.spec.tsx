// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Welcome } from '../src/client/WelcomePage.tsx'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { AccountView, PasswordSignInResult, SmsSendResult } from '@mammoth-ai/mmp-deepseek-account/types'
import type { WelcomeSaveResult, WelcomeNotice } from '../src/welcome-api.ts'

const html = readFileSync(join(import.meta.dirname, '../renderer/welcome.html'), 'utf8')
afterEach(cleanup)

function mount(language = 'zh-CN', takeNotice = vi.fn<() => Promise<WelcomeNotice | undefined>>().mockResolvedValue(undefined)) {
  cleanup()
  const stopAccount = vi.fn()
  const api = {
    takeNotice,
    analytics: vi.fn(async (_event: string, _attributes: object) => {}),
    analyticsEnabled: async () => true,
    onAccountState: vi.fn((_listener: (state: AccountView) => void) => stopAccount),
    startSignIn: vi.fn(async (): Promise<AccountView> => ({ links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null })),
    signInWithPassword: vi.fn<(phone: string, password: string) => Promise<PasswordSignInResult>>(async () => ({ ok: true })),
    sendSmsCode: vi.fn<(phone: string, scene: 'login' | 'register') => Promise<SmsSendResult>>(async () => ({ ok: true, retryAfterSeconds: 60, mockCode: '123456' })),
    signInWithSms: vi.fn<(phone: string, smsCode: string) => Promise<PasswordSignInResult>>(async () => ({ ok: true })),
    registerWithPassword: vi.fn<(input: { name: string; phone: string; password: string; enterpriseName: string; slug: string; smsCode: string }) => Promise<PasswordSignInResult>>(async () => ({ ok: true })),
    cancelSignIn: vi.fn(async (): Promise<AccountView> => ({ links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null })),
    copySignInLink: vi.fn(async () => undefined),
    ...resolveDesktopLocale(language),
    saveApiKey: vi.fn<(value: string) => Promise<WelcomeSaveResult>>().mockResolvedValue({ ok: true }),
    skip: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
  const mounted = render(<Welcome api={api} />)
  const input = document.querySelector<HTMLInputElement>('#key-input')!
  const button = (id: string) => document.querySelector<HTMLButtonElement>(id)!
  const enterKey = (value: string) => {
    fireEvent.change(input, { target: { value } })
  }
  const submit = () => fireEvent.submit(document.querySelector('#key-form')!)
  const copy = () => {
    const heading = document.querySelector('main')!.getAttribute('aria-labelledby')!
    return [
      document.title, document.querySelector('img')!.alt, document.getElementById(heading)!.textContent,
      ...heading === 'welcome-heading' ? [document.querySelector('#welcome-description')!.textContent] : [],
      ...heading === 'key-title' ? [document.querySelector('#key-description')!.textContent, `${input.placeholder} [password]`] : [],
      ...[...document.querySelectorAll('button')].filter(item => item.closest('[hidden]') === null)
        .map(item => `${item.textContent || item.getAttribute('aria-label')}${item.disabled ? ' [disabled]' : ''}`),
      '',
    ].join('\n')
  }
  return { document, api, input, button, enterKey, submit, copy, unmount: mounted.unmount, stopAccount }
}

describe('desktop welcome presentation', () => {
  it.each(['zh-CN', 'en'])('renders the %s entry and API-key step', async (language) => {
    const view = mount(language)
    expect(view.document.documentElement.lang).toBe(language)
    expect(view.document.querySelector('img')!.getAttribute('src')).toBe('assets/welcome-brand.svg')
    await expect(view.copy()).toMatchFileSnapshot(`./expected/welcome/${language}.expected.txt`)
    fireEvent.click(view.button('#api-key'))
    expect(view.document.activeElement).toBe(view.input)
    expect(view.input.type).toBe('password')
    await expect(view.copy()).toMatchFileSnapshot(`./expected/welcome/${language}-api-key.expected.txt`)
  })

  it('sends one trimmed key, prevents competing actions, and clears it after saving', async () => {
    const view = mount()
    const saved = Promise.withResolvers<WelcomeSaveResult>()
    view.api.saveApiKey.mockReturnValue(saved.promise)
    fireEvent.click(view.button('#api-key'))
    view.enterKey('  sk-desktop-example  ')
    view.submit()
    view.submit()
    fireEvent.click(view.button('#skip-key'))
    fireEvent.click(view.button('#back-to-login'))
    expect(view.api.saveApiKey).toHaveBeenCalledExactlyOnceWith('sk-desktop-example')
    expect(view.api.skip).not.toHaveBeenCalled()
    expect(view.button('#save-key').disabled).toBe(true)
    expect(view.button('#save-key').textContent).toBe(view.api.messages.welcomeKeySave)
    expect(view.button('#back-to-login').disabled).toBe(true)
    expect(view.document.querySelector<HTMLElement>('#key-form')!.hidden).toBe(false)
    saved.resolve({ ok: true })
    await vi.waitFor(() => { expect(view.input.value).toBe('') })
    expect(view.document.body.textContent).not.toContain('sk-desktop-example')
  })

  it.each(['', 'bad key', '密钥', 'DEEPSEEK_API_KEY=sk-example', '"sk-example"', '`sk-example`'])(
    'rejects invalid input before sending it: %s', (value) => {
      const view = mount()
      fireEvent.click(view.button('#api-key'))
      view.enterKey(value)
      view.submit()
      expect(view.api.saveApiKey).not.toHaveBeenCalled()
      expect(view.document.querySelector<HTMLElement>('#key-error')!.hidden).toBe(false)
      expect(view.input.getAttribute('aria-invalid')).toBe('true')
    },
  )

  it('retains an unsaved draft and allows retry after a refused save', async () => {
    const view = mount()
    view.api.saveApiKey.mockResolvedValue({ ok: false })
    fireEvent.click(view.button('#api-key'))
    view.enterKey('sk-retry')
    view.submit()
    await vi.waitFor(() => { expect(view.button('#save-key').disabled).toBe(false) })
    expect(view.input.value).toBe('sk-retry')
    expect(view.document.querySelector('#key-error')!.textContent).toBe(view.api.messages.welcomeKeyFailed)
    view.api.saveApiKey.mockResolvedValue({ ok: true })
    view.submit()
    await vi.waitFor(() => { expect(view.input.value).toBe('') })
  })

  it('skips without saving and starts a fresh renderer at the entry again', async () => {
    const view = mount()
    const skipped = Promise.withResolvers<undefined>()
    view.api.skip.mockReturnValue(skipped.promise)
    fireEvent.click(view.button('#api-key'))
    view.enterKey('sk-not-saved')
    fireEvent.click(view.button('#skip-key'))
    try {
      expect(view.button('#save-key').textContent).toBe(view.api.messages.welcomeKeySave)
      expect(view.button('#skip-key').textContent).toBe(view.api.messages.welcomeKeyLater)
      expect(view.button('#save-key').disabled).toBe(true)
      expect(view.button('#skip-key').disabled).toBe(true)
      expect(view.button('#back-to-login').disabled).toBe(true)
      fireEvent.click(view.button('#skip-key'))
      view.submit()
      expect(view.api.skip).toHaveBeenCalledOnce()
      expect(view.api.saveApiKey).not.toHaveBeenCalled()
    } finally {
      skipped.resolve(undefined)
    }
    await vi.waitFor(() => { expect(view.input.value).toBe('') })
    expect(view.api.skip).toHaveBeenCalledOnce()
    expect(view.api.saveApiKey).not.toHaveBeenCalled()
    expect(mount().document.querySelector<HTMLElement>('#key-form')!.hidden).toBe(true)
  })

  it('returns to the entry without saving and clears the draft and validation error', () => {
    const view = mount()
    fireEvent.click(view.button('#api-key'))
    view.enterKey('invalid key')
    view.submit()
    fireEvent.click(view.button('#back-to-login'))
    expect(view.document.querySelector<HTMLElement>('#key-form')!.hidden).toBe(true)
    expect(view.document.activeElement).toBe(view.button('#api-key'))
    expect(view.input.value).toBe('')
    expect(view.api.saveApiKey).not.toHaveBeenCalled()
    expect(view.api.skip).not.toHaveBeenCalled()
    fireEvent.click(view.button('#api-key'))
    expect(view.input.value).toBe('')
    expect(view.document.querySelector<HTMLElement>('#key-error')!.hidden).toBe(true)
    expect(view.button('#save-key').disabled).toBe(true)
  })

  it('keeps visible copy in the shell dictionaries and denies network access', () => {
    expect([...html.matchAll(/>([^<]*\p{L}[^<]*)</gu)]).toEqual([])
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("form-action 'none'")
  })
})

it.each(['zh-CN', 'en'])('renders %s timeout with manual retry and API-key alternative', async (language) => {
  const view = mount(language)
  const receive = (state: AccountView) => { act(() => { view.api.onAccountState.mock.calls[0]![0](state) }) }
  receive({ status: 'signed-out', links: { usageUrl: '', topUpUrl: '' }, attempt: { id: 'expired' as NonNullable<AccountView['attempt']>['id'], phase: 'expired' } })
  expect(view.button('#auth-retry').hidden).toBe(false)
  expect(view.button('#auth-api-key').hidden).toBe(false)
  expect(view.api.startSignIn).not.toHaveBeenCalled()
  await expect(view.copy() + view.document.querySelector('#auth-description')!.textContent + '\n').toMatchFileSnapshot(`./expected/welcome/${language}-timeout.expected.txt`)
  fireEvent.click(view.button('#auth-api-key'))
  expect(view.document.querySelector('#auth-page')!.hasAttribute('hidden')).toBe(true)
  expect(view.document.querySelector('#key-form')!.hasAttribute('hidden')).toBe(false)
})

it.each(['zh-CN', 'en'])('renders %s browser fallback and copies only the active login link', async (language) => {
  const view = mount(language)
  const receive = (state: AccountView) => { act(() => { view.api.onAccountState.mock.calls[0]![0](state) }) }
  const waiting: AccountView = { status: 'signed-out', links: { usageUrl: '', topUpUrl: '' },
    attempt: { id: 'waiting' as NonNullable<AccountView['attempt']>['id'], phase: 'waiting-browser', authorizeUrl: 'https://example.test/login' } }
  receive(waiting)
  await expect(view.copy() + view.document.querySelector('#auth-description')!.textContent + '\n')
    .toMatchFileSnapshot(`./expected/welcome/${language}-waiting.expected.txt`)
  fireEvent.click(view.button('#auth-copy'))
  await vi.waitFor(() => { expect(view.button('#auth-copy').textContent).toBe(view.api.messages.welcomeAuthCopied) })
  expect(view.api.copySignInLink).toHaveBeenCalledWith('waiting')
  await vi.waitFor(() => { expect(view.button('#auth-copy').disabled).toBe(false) }, { timeout: 3000 })
  view.api.copySignInLink.mockRejectedValueOnce(new Error('clipboard unavailable'))
  fireEvent.click(view.button('#auth-copy'))
  await vi.waitFor(() => { expect(view.button('#auth-copy').textContent).toBe(view.api.messages.welcomeAuthCopyFailed) })
  expect(view.button('#auth-cancel').disabled).toBe(false)
  receive({ ...waiting, attempt: { ...waiting.attempt!, phase: 'exchanging' } })
  expect(view.button('#auth-copy').hidden).toBe(true)
  expect(view.button('#auth-loading').hidden).toBe(false)
  receive({ ...waiting, attempt: { ...waiting.attempt!, phase: 'cancelled' } })
  expect(view.document.querySelector('main')!.classList.contains('waiting-page')).toBe(false)
})

it('submits the phone and password once and stays on the login page when the password is wrong', async () => {
  const view = mount()
  fireEvent.change(view.document.querySelector('#login-phone')!, { target: { value: '13800138000' } })
  fireEvent.change(view.document.querySelector('#login-password')!, { target: { value: 'secret' } })
  view.api.signInWithPassword.mockResolvedValueOnce({ ok: false, reason: 'credentials' })
  fireEvent.submit(view.document.querySelector('#login-form')!)
  await vi.waitFor(() => { expect(view.document.querySelector('#login-error')!.textContent).toBe(view.api.messages.welcomeLoginFailed) })
  expect(view.api.signInWithPassword).toHaveBeenCalledExactlyOnceWith('13800138000', 'secret')
  expect(view.api.startSignIn).not.toHaveBeenCalled()
  expect(view.document.querySelector<HTMLElement>('#login-form')!.hidden).toBe(false)
})

it('localizes every SMS send failure without server copy', async () => {
  const view = mount('en')
  fireEvent.click(view.document.querySelector('#tab-sms')!)
  fireEvent.change(view.document.querySelector('#login-phone')!, { target: { value: '13800138000' } })
  const error = () => view.document.querySelector('#login-error')!.textContent
  view.api.sendSmsCode.mockResolvedValueOnce({ ok: false, reason: 'unavailable', code: 'SMS_UNAVAILABLE' })
  fireEvent.click(view.button('#sms-send'))
  await vi.waitFor(() => { expect(error()).toBe(view.api.messages.welcomeSmsUnavailable) })
  view.api.sendSmsCode.mockResolvedValueOnce({ ok: false, reason: 'rejected', code: 'SMS_RATE_LIMITED' })
  fireEvent.click(view.button('#sms-send'))
  await vi.waitFor(() => { expect(error()).toBe(view.api.messages.welcomeSmsRateLimited) })
  // An absent or unrecognized code falls back to generic localized copy, never a server message.
  view.api.sendSmsCode.mockResolvedValueOnce({ ok: false, reason: 'rejected' })
  fireEvent.click(view.button('#sms-send'))
  await vi.waitFor(() => { expect(error()).toBe(view.api.messages.welcomeSmsFailed) })
  view.api.sendSmsCode.mockResolvedValueOnce({ ok: false, reason: 'invalid', code: 'SMS_INVALID' })
  fireEvent.click(view.button('#sms-send'))
  await vi.waitFor(() => { expect(error()).toBe(view.api.messages.welcomePhoneInvalid) })
})

it('localizes the old-client registration code without retrying', async () => {
  const view = mount('ja')
  fireEvent.click(view.document.querySelector('#tab-register')!)
  fireEvent.change(view.document.querySelector('#register-name')!, { target: { value: '山田' } })
  fireEvent.change(view.document.querySelector('#login-phone')!, { target: { value: '13800138000' } })
  fireEvent.change(view.document.querySelector('#register-enterprise')!, { target: { value: 'Acme' } })
  fireEvent.change(view.document.querySelector('#register-slug')!, { target: { value: 'acme' } })
  fireEvent.change(view.document.querySelector('#login-password')!, { target: { value: 'secret' } })
  fireEvent.change(view.document.querySelector('#sms-code')!, { target: { value: '123456' } })
  view.api.registerWithPassword.mockResolvedValueOnce({ ok: false, reason: 'forbidden', code: 'CLIENT_TOO_OLD' })
  fireEvent.submit(view.document.querySelector('#login-form')!)
  const error = () => view.document.querySelector('#login-error')!.textContent
  await vi.waitFor(() => { expect(error()).toBe(view.api.messages.welcomeClientTooOld) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  expect(error()).toBe(view.api.messages.welcomeClientTooOld)
  expect(view.api.registerWithPassword).toHaveBeenCalledOnce()
  expect(view.api.signInWithPassword).not.toHaveBeenCalled()
})

it('registers an enterprise in the client without opening a browser', async () => {
  const view = mount()
  fireEvent.click(view.document.querySelector('#tab-register')!)
  fireEvent.change(view.document.querySelector('#register-name')!, { target: { value: '张三' } })
  fireEvent.change(view.document.querySelector('#login-phone')!, { target: { value: '13800138000' } })
  fireEvent.change(view.document.querySelector('#register-enterprise')!, { target: { value: '小米' } })
  fireEvent.change(view.document.querySelector('#register-slug')!, { target: { value: 'xiaomi' } })
  fireEvent.change(view.document.querySelector('#login-password')!, { target: { value: 'secret' } })
  fireEvent.change(view.document.querySelector('#sms-code')!, { target: { value: '123456' } })
  fireEvent.submit(view.document.querySelector('#login-form')!)
  await vi.waitFor(() => { expect(view.api.registerWithPassword).toHaveBeenCalledOnce() })
  expect(view.api.registerWithPassword).toHaveBeenCalledWith({
    name: '张三', phone: '13800138000', password: 'secret', enterpriseName: '小米', slug: 'xiaomi', smsCode: '123456',
  })
  expect(view.api.signInWithPassword).not.toHaveBeenCalled()
  expect(view.api.startSignIn).not.toHaveBeenCalled()
})

it('does not restore a copied-link status after leaving the waiting phase', async () => {
  const view = mount()
  const copied = Promise.withResolvers<undefined>()
  view.api.copySignInLink.mockReturnValueOnce(copied.promise)
  const waiting: AccountView = { status: 'signed-out', links: { usageUrl: '', topUpUrl: '' },
    attempt: { id: 'attempt' as NonNullable<AccountView['attempt']>['id'], phase: 'waiting-browser' } }
  act(() => { view.api.onAccountState.mock.calls[0]![0](waiting) })
  fireEvent.click(view.button('#auth-copy'))
  expect(view.button('#auth-copy').disabled).toBe(true)
  act(() => { view.api.onAccountState.mock.calls[0]![0]({ ...waiting, attempt: { ...waiting.attempt!, phase: 'exchanging' } }) })
  await act(async () => { copied.resolve(undefined); await copied.promise })
  expect(view.button('#auth-copy').hidden).toBe(true)
  expect(view.button('#auth-copy').textContent).toBe(view.api.messages.welcomeAuthCopyLink)
})

it('keeps the key draft while account notifications arrive and releases the subscription on unmount', () => {
  const view = mount()
  fireEvent.click(view.button('#api-key'))
  view.enterKey('sk-draft')
  act(() => { view.api.onAccountState.mock.calls[0]![0]({ status: 'signed-out', links: { usageUrl: '', topUpUrl: '' },
    attempt: { id: 'expired' as NonNullable<AccountView['attempt']>['id'], phase: 'expired' } }) })
  expect(view.document.querySelector<HTMLElement>('#key-form')!.hidden).toBe(false)
  expect(view.input.value).toBe('sk-draft')
  view.unmount()
  expect(view.stopAccount).toHaveBeenCalledOnce()
})

it.each(['copied', 'failed'] as const)('restores the copy action after %s feedback and cleans up on unmount', async (result) => {
  vi.useFakeTimers()
  try {
    const view = mount('en')
    if (result === 'failed') view.api.copySignInLink.mockRejectedValue(new Error('clipboard unavailable'))
    const waiting: AccountView = { status: 'signed-out', links: { usageUrl: '', topUpUrl: '' },
      attempt: { id: 'waiting' as NonNullable<AccountView['attempt']>['id'], phase: 'waiting-browser' } }
    act(() => { view.api.onAccountState.mock.calls[0]![0](waiting) })
    const feedback = result === 'copied' ? view.api.messages.welcomeAuthCopied : view.api.messages.welcomeAuthCopyFailed
    const copy = async () => { await act(async () => { fireEvent.click(view.button('#auth-copy')) }) }
    await copy()
    expect(view.button('#auth-copy').textContent).toBe(feedback)
    expect(view.button('#auth-copy').disabled).toBe(result === 'copied')
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    await copy()
    expect(view.api.copySignInLink).toHaveBeenCalledTimes(result === 'copied' ? 1 : 2)
    await act(async () => { await vi.advanceTimersByTimeAsync(result === 'copied' ? 499 : 1999) })
    expect(view.button('#auth-copy').textContent).toBe(feedback)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(view.button('#auth-copy').textContent).toBe(view.api.messages.welcomeAuthCopyLink)
    expect(view.button('#auth-copy').disabled).toBe(false)
    await copy()
    expect(view.api.copySignInLink).toHaveBeenCalledTimes(result === 'copied' ? 2 : 3)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    cleanup()
    vi.useRealTimers()
  }
})

it.each(['zh-CN', 'en'])('keeps the expiry notice visible after returning to Welcome: %s', async (language) => {
  vi.useFakeTimers()
  try {
    const takeNotice = vi.fn<() => Promise<WelcomeNotice | undefined>>().mockResolvedValue(undefined).mockResolvedValueOnce('session-expired')
    const view = mount(language, takeNotice)
    await act(async () => {})
    const publish = view.api.onAccountState.mock.calls[0]![0]
    const expired: AccountView = { status: 'signed-out', attempt: null,
      links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' } }
    await act(async () => { publish(expired) })
    const notice = screen.getByRole('alert')
    expect(notice.textContent).toBe(view.api.messages.welcomeSessionExpired)
    await expect(`${notice.textContent}\n`).toMatchFileSnapshot(`./expected/welcome/${language}-expired.expected.txt`)
    expect(view.button('#sign-in').closest('[hidden]')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { publish(expired) })
    expect(screen.queryByRole('alert')).toBeNull()
    view.unmount()
    mount(language, takeNotice)
    await act(async () => {})
    expect(screen.queryByRole('alert')).toBeNull()
  } finally { cleanup(); vi.useRealTimers() }
})

it('does not infer a notification from a retained expired account snapshot', async () => {
  const view = mount()
  await act(async () => {
    view.api.onAccountState.mock.calls[0]![0]({ status: 'signed-out', attempt: null,
      links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' } })
  })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('keeps the entry usable when notification IPC fails', async () => {
  const view = mount('en', vi.fn<() => Promise<WelcomeNotice | undefined>>().mockRejectedValue(new Error('closed')))
  await act(async () => {})
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(view.button('#api-key'))
  expect(view.input.closest('[hidden]')).toBeNull()
})

it('ignores a notification received after its renderer unmounts', async () => {
  const pending = Promise.withResolvers<WelcomeNotice | undefined>()
  const view = mount('en', vi.fn<() => Promise<WelcomeNotice | undefined>>().mockReturnValue(pending.promise))
  view.unmount()
  mount('en')
  await act(async () => { pending.resolve('session-expired') })
  expect(screen.queryByRole('alert')).toBeNull()
})


it.each(['zh-CN', 'en'])('returns from completed sign-in to the initial page after sign-out: %s', async (language) => {
  const view = mount(language)
  const publish = view.api.onAccountState.mock.calls[0]![0]
  const links = { usageUrl: 'https://example.test/usage', topUpUrl: 'https://example.test/top_up' }
  act(() => { publish({ status: 'credential-stored', links,
    attempt: { id: 'completed' as NonNullable<AccountView['attempt']>['id'], phase: 'succeeded' } }) })
  expect(view.document.querySelector<HTMLElement>('#auth-page')!.hidden).toBe(false)
  act(() => { publish({ status: 'signed-out', links, attempt: null }) })
  expect(view.button('#sign-in').closest('[hidden]')).toBeNull()
  expect(view.document.querySelector<HTMLElement>('#auth-page')!.hidden).toBe(true)
  await expect(view.copy()).toMatchFileSnapshot(`./expected/welcome/${language}.expected.txt`)
})

it('reports each return to the welcome entry once, including account cancellation', async () => {
  const view = mount()
  expect(view.api.analytics).not.toHaveBeenCalled()
  fireEvent.click(view.button('#api-key'))
  fireEvent.click(view.button('#back-to-login'))
  expect(view.api.analytics.mock.calls.map(([action]) => action)).toEqual(['auth_page_click', 'auth_page_view'])
  fireEvent.change(view.document.querySelector('#login-phone')!, { target: { value: '13800138000' } })
  fireEvent.change(view.document.querySelector('#login-password')!, { target: { value: 'secret' } })
  fireEvent.click(view.button('#sign-in'))
  expect(view.api.analytics.mock.calls.map(([action]) => action)).toEqual(['auth_page_click', 'auth_page_view', 'auth_page_click'])
  expect(view.api.startSignIn).not.toHaveBeenCalled()
  expect(view.api.signInWithPassword).toHaveBeenCalledExactlyOnceWith('13800138000', 'secret')
})
