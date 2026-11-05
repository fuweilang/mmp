// @vitest-environment jsdom
/** Component specs for the Web-only desktop-download action. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientDownloadButton, type ClientDownloadButtonProps } from '../src/client/ClientDownloadButton.tsx'
import { zh, type ClientDownloadKey } from '../src/client/locales.ts'
import { apply } from '../src/client/index.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const t = (key: ClientDownloadKey, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), zh[key])

// Framework standard seats are unused by this component; tests cast an empty object.
const standard = {} as Omit<ClientDownloadButtonProps, 'wide' | 't'>

function renderAction(wide = true) {
  return render(<ClientDownloadButton {...standard} wide={wide} t={t as ClientDownloadButtonProps['t']} />)
}

describe('ClientDownloadButton', () => {
  it('renders a labeled footer action and opens the dialog with three platform options', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: zh.action }))
    expect(screen.getByRole('dialog', { name: zh.dialogTitle })).toBeTruthy()
    expect(screen.getByText(zh.optionMacArm)).toBeTruthy()
    expect(screen.getByText(zh.optionMacIntel)).toBeTruthy()
    expect(screen.getByText(zh.optionWindows)).toBeTruthy()
  })

  it('hides the label in the collapsed rail but keeps the icon button', () => {
    renderAction(false)
    const button = screen.getByRole('button', { name: zh.action })
    expect(button.textContent).toBe('')
  })

  it('marks Windows as the current system only when the OS is Windows', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'platform')
    Object.defineProperty(window.navigator, 'platform', { value: 'Win32', configurable: true })
    try {
      renderAction()
      fireEvent.click(screen.getByRole('button', { name: zh.action }))
      expect(screen.getByText(zh.currentSystem)).toBeTruthy()
    } finally {
      if (original) Object.defineProperty(window.navigator, 'platform', original)
    }
  })

  it('shows no current-system badge on a Mac', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'platform')
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
    try {
      renderAction()
      fireEvent.click(screen.getByRole('button', { name: zh.action }))
      expect(screen.queryByText(zh.currentSystem)).toBeNull()
    } finally {
      if (original) Object.defineProperty(window.navigator, 'platform', original)
    }
  })

  it('starts only a published platform download and offers retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ product: 'mammoth-agent', schema_version: 2, platforms: { 'darwin-arm64': { shell: { version: '1.2.3' } } } })))
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: zh.action }))
    await waitFor(() => expect(screen.getByText(zh.optionMacArm).closest('li')?.getAttribute('aria-disabled')).toBe('false'))
    expect(screen.getByText(zh.optionWindows).closest('li')?.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByText(zh.optionMacArm))
    expect(screen.getByText(zh.started)).toBeTruthy()
    fireEvent.click(screen.getByText(zh.retry))
    expect(screen.getByText(zh.started)).toBeTruthy()
  })
})

describe('apply', () => {
  it('registers nothing inside the Desktop client', () => {
    const register = vi.fn()
    const ctx = {
      locale: { register },
      slots: { inject: vi.fn() },
      effect: (fn: () => unknown) => fn(),
    }
    const marker = globalThis as typeof globalThis & { mmpDesktop?: unknown }
    marker.mmpDesktop = { protocolVersion: 1 }
    try {
      apply(ctx as never)
      expect(register).not.toHaveBeenCalled()
      expect(ctx.slots.inject).not.toHaveBeenCalled()
    } finally {
      delete marker.mmpDesktop
    }
  })

  it('registers the locale dictionaries and the sidebar footer action in a browser', () => {
    const localeRegister = vi.fn(() => () => {})
    const slotRegister = vi.fn(() => () => {})
    const ctx = {
      locale: { register: localeRegister, bind: () => t },
      slots: {
        inject: vi.fn((_slot: string, fn: () => unknown) => { fn(); return () => {} }),
        register: slotRegister,
      },
      effect: (fn: () => unknown) => fn(),
    }
    apply(ctx as never)
    expect(localeRegister).toHaveBeenCalledWith('clientDownload', expect.objectContaining({ zh, en: expect.anything() }))
    expect(ctx.slots.inject).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(slotRegister).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sidebar.footer.action', locale: 'clientDownload' }),
      expect.any(Function),
    )
  })
})
