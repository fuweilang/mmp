// @vitest-environment jsdom
/** Selected recharge amount uses the pressed state the theme-blue fill keys off. */
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { BillingSnapshot, GroundBillingApi } from '../src/client/ground-billing.ts'
import { RechargeDialog } from '../src/client/RechargeDialog.tsx'

afterEach(cleanup)

const billing: BillingSnapshot = {
  enabled: true, balanceCoins: 1_000_000, canRecharge: true,
  hasConsoleAccess: true, isPlatformAdmin: false, aiCoinsPerYuan: 10_000, open: true,
}

function mount() {
  const api = {
    channels: vi.fn(async () => ({ mockEnabled: false, wechatConfigured: true, alipayConfigured: true })),
    wallet: vi.fn(), create: vi.fn(), payQr: vi.fn(), status: vi.fn(), cancel: vi.fn(),
    consoleLink: vi.fn(), me: vi.fn(),
  } satisfies GroundBillingApi
  const props = {
    useBilling: <T,>(select: (state: BillingSnapshot) => T) => select(billing),
    api, close: vi.fn(), paid: vi.fn(async () => undefined),
  } as ComponentProps<typeof RechargeDialog>
  render(<RechargeDialog {...props} />)
}

it('paints the chosen amount and clears it when a custom amount is typed', async () => {
  await act(async () => { mount() })
  const yuan100 = screen.getByRole('button', { name: '¥100' })
  const yuan500 = screen.getByRole('button', { name: '¥500' })
  expect(yuan100.getAttribute('aria-pressed')).toBe('true')
  expect(yuan100.getAttribute('data-selected')).toBe('true')
  expect(yuan500.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(yuan500)
  expect(yuan500.getAttribute('data-selected')).toBe('true')
  expect(yuan100.getAttribute('data-selected')).toBe('false')
  fireEvent.change(screen.getByPlaceholderText('自定义金额，上限 100,000.00'), { target: { value: '80' } })
  expect(yuan500.getAttribute('data-selected')).toBe('false')
  expect(screen.getByText('应付 ¥80.00，到账 80万 AI币')).toBeTruthy()
})
