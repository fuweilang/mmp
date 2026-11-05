import { describe, expect, it } from 'vitest'
import { createBillingStore, openEnterpriseConsole, formatCoins, GroundBillingError, validateAmount, type GroundBillingApi } from '../src/client/ground-billing.ts'
import { encodeQr } from '../src/client/qr.ts'

const api = (wallet: GroundBillingApi['wallet']): GroundBillingApi => ({
  wallet, channels: () => Promise.reject(new Error('x')), create: () => Promise.reject(new Error('x')),
  payQr: () => Promise.reject(new Error('x')), status: () => Promise.reject(new Error('x')), cancel: () => Promise.reject(new Error('x')),
  consoleLink: () => Promise.reject(new Error('x')),
  me: () => Promise.reject(new Error('x')),
})

describe('ground billing', () => {
  it('opens the enterprise console with the one-time link', async () => {
    const opened: string[] = []
    const link = await openEnterpriseConsole({ consoleLink: () => Promise.resolve({ url: 'http://g/login?sso=t&next=%2Fadmin', admin: true }) }, url => { opened.push(url) })
    expect(link.admin).toBe(true)
    expect(opened).toEqual(['http://g/login?sso=t&next=%2Fadmin'])
  })

  it('formats coins in Chinese units', () => {
    expect(formatCoins(null)).toBe('--')
    expect(formatCoins(1234)).toBe('1,234')
    expect(formatCoins(5_000_000)).toBe('500万')
    expect(formatCoins(500_000_000)).toBe('5亿')
  })
  it('validates recharge amounts', () => {
    expect(validateAmount('100')).toBeUndefined()
    expect(validateAmount('0.01')).toBeUndefined()
    expect(validateAmount('0')).toBeDefined()
    expect(validateAmount('1.234')).toBeDefined()
    expect(validateAmount('100001')).toBeDefined()
  })
  it('enables on a wallet read and disables when the Host has no proxy', async () => {
    const ok = createBillingStore(api(() => Promise.resolve({
      skipped: false, balanceCoins: 42, canRecharge: true, hasConsoleAccess: true, isPlatformAdmin: false,
      config: { sellPriceMultiplier: 1, aiCoinsPerYuan: 50000 },
    })))
    await ok.refresh()
    expect(ok.observable.getSnapshot()).toMatchObject({
      enabled: true, balanceCoins: 42, canRecharge: true, hasConsoleAccess: true, isPlatformAdmin: false, aiCoinsPerYuan: 50000,
    })
    await ok.open()
    expect(ok.observable.getSnapshot().open).toBe(true)
    const missing = createBillingStore(api(() => Promise.reject(new GroundBillingError('nf', 404))))
    await missing.refresh()
    expect(missing.observable.getSnapshot().enabled).toBe(false)
  })
  it('blocks open when canRecharge is false', async () => {
    const denied = createBillingStore(api(() => Promise.resolve({
      skipped: false, balanceCoins: 1, canRecharge: false, hasConsoleAccess: false, isPlatformAdmin: false,
      config: { sellPriceMultiplier: 1, aiCoinsPerYuan: 50000 },
    })))
    await denied.refresh()
    await denied.open()
    expect(denied.observable.getSnapshot()).toMatchObject({
      enabled: true, canRecharge: false, hasConsoleAccess: false, isPlatformAdmin: false, open: false,
    })
  })
  it('keeps console entry flags for platform admin without tenant', async () => {
    const admin = createBillingStore(api(() => Promise.resolve({
      skipped: true, reason: 'platform_admin_no_tenant', balanceCoins: null,
      canRecharge: false, hasConsoleAccess: false, isPlatformAdmin: true,
    })))
    await admin.refresh()
    expect(admin.observable.getSnapshot()).toMatchObject({
      enabled: true, canRecharge: false, hasConsoleAccess: false, isPlatformAdmin: true,
    })
  })
  it('recovers entry permissions after a failed wallet read', async () => {
    let unavailable = true
    const store = createBillingStore(api(async () => {
      if (unavailable) throw new GroundBillingError('temporarily unavailable', 401)
      return { skipped: false, balanceCoins: 42, canRecharge: true, hasConsoleAccess: true }
    }))
    await store.refresh()
    expect(store.observable.getSnapshot().enabled).toBe(false)
    unavailable = false
    await store.refresh()
    expect(store.observable.getSnapshot()).toMatchObject({ enabled: true, canRecharge: true, hasConsoleAccess: true })
  })
  it('ignores a wallet response from the account before reset', async () => {
    let finish!: (wallet: Awaited<ReturnType<GroundBillingApi['wallet']>>) => void
    let calls = 0
    const store = createBillingStore(api(() => ++calls === 1
      ? new Promise(resolve => { finish = resolve })
      : Promise.resolve({ skipped: true, balanceCoins: null, isPlatformAdmin: true })))
    const previous = store.refresh()
    store.reset()
    await store.refresh()
    finish({ skipped: false, balanceCoins: 42, canRecharge: true, hasConsoleAccess: true })
    await previous
    expect(store.observable.getSnapshot()).toMatchObject({ enabled: true, isPlatformAdmin: true, canRecharge: false, hasConsoleAccess: false })
  })
  it('encodes a QR with finder patterns', () => {
    const m = encodeQr('weixin://wxpay/bizpayurl?pr=abc123')
    expect(m.length).toBe(29)
    expect(m[0]!.slice(0, 7).every(Boolean)).toBe(true)
  })
})

it('loads authenticated company metadata and clears it when signing out', async () => {
  const base = api(async () => ({ skipped: false, balanceCoins: 42, canRecharge: true }))
  base.me = async () => ({ user: { phone: '13812345678', isPlatformAdmin: false },
    currentTenant: { name: 'Example company' }, currentRole: 'ADMIN' })
  const store = createBillingStore(base)
  await store.refresh()
  expect(store.observable.getSnapshot().identity).toEqual({
    phone: '13812345678', company: 'Example company', role: 'ADMIN', platformAdmin: false,
  })
  store.reset()
  expect(store.observable.getSnapshot().identity).toBeUndefined()
})

it('preserves successful wallet reads when company metadata is unavailable', async () => {
  const store = createBillingStore(api(async () => ({ skipped: false, balanceCoins: 42, canRecharge: false })))
  await store.refresh()
  expect(store.observable.getSnapshot()).toMatchObject({ enabled: true, balanceCoins: 42, canRecharge: false })
  expect(store.observable.getSnapshot().identity).toBeUndefined()
})
