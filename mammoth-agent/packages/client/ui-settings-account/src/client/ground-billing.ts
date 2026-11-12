import { useSyncExternalStore } from 'react'
/**
 * Client half of the 猛犸 Ground recharge flow. Calls the Host's same-origin
 * `ground-billing/*` proxy (see deepseek-account-platform/src/ground-billing.ts),
 * which forwards to Ground `/api/billing/*` with the stored SSO JWT.
 */

/** Ground GET billing/wallet. */
export interface GroundWallet {
  skipped: boolean
  reason?: string
  balanceCoins: number | null
  /** Ground 充值门禁：portal.console.billing / 企管 / 平台管代运营 */
  canRecharge?: boolean
  /** 是否含 portal.console.access（企业控制台入口；平台管另看 isPlatformAdmin） */
  hasConsoleAccess?: boolean
  isPlatformAdmin?: boolean
  config?: { sellPriceMultiplier?: number; tokensPerAiCoin?: number; aiCoinsPerYuan: number }
}

/** Ground GET billing/recharge/channels. */
export interface GroundPayChannels {
  mockEnabled: boolean
  wechatConfigured: boolean
  alipayConfigured: boolean
}

/** Ground recharge order row. */
export interface GroundRechargeOrder {
  id: string
  orderNo: string
  amountYuan: string
  aiCoins: number
  status: string
  channel: string
  codeUrl: string
  expireAt: string | null
  confirmedAt: string | null
}

export type GroundPayChannel = 'wechat' | 'alipay' | 'mock'

/** Error with the proxied HTTP status (404 = Host is not in Ground SSO mode). */
export class GroundBillingError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Typed proxy calls. */
export interface GroundBillingApi {
  wallet(): Promise<GroundWallet>
  channels(): Promise<GroundPayChannels>
  create(amountYuan: number, idempotencyKey: string): Promise<GroundRechargeOrder>
  payQr(orderId: string, channel: GroundPayChannel): Promise<GroundRechargeOrder>
  status(orderId: string): Promise<GroundRechargeOrder>
  cancel(orderId: string): Promise<GroundRechargeOrder>
  /** One-time Ground login link: super admin → /admin, enterprise user → /console/. */
  consoleLink(): Promise<{ url: string; admin: boolean; hasConsoleAccess?: boolean; isPlatformAdmin?: boolean }>
  /** Ground session (/api/auth/me)：含 effectivePermissions / isPlatformAdmin。 */
  me(): Promise<{
    user?: { isPlatformAdmin?: boolean; phone?: string | null }
    currentTenant?: { name?: string } | null
    currentRole?: string | null
    effectivePermissions?: string[]
  }>
}

async function call<T>(op: string, body?: unknown): Promise<T> {
  const response = await fetch(`ground-billing/${op}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json: unknown
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  if (!response.ok) {
    const raw = (json as { message?: unknown } | undefined)?.message
    const message = Array.isArray(raw) ? raw.join('；') : typeof raw === 'string' && raw ? raw : `请求失败（HTTP ${String(response.status)}）`
    throw new GroundBillingError(message, response.status)
  }
  return json as T
}

/** Default fetch-backed API. */
export const groundBillingApi: GroundBillingApi = {
  wallet: () => call('wallet'),
  channels: () => call('channels'),
  create: (amountYuan, idempotencyKey) => call('create', { amountYuan, idempotencyKey }),
  payQr: (orderId, channel) => call('payQr', { orderId, channel }),
  status: orderId => call('status', { orderId }),
  cancel: orderId => call('cancel', { orderId }),
  consoleLink: () => call('consoleLink', {}),
  me: () => call('me'),
}

async function readProxyError(response: Response): Promise<string> {
  const text = await response.text()
  let json: unknown
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  const raw = (json as { message?: unknown } | undefined)?.message
  return Array.isArray(raw) ? raw.join('；') : typeof raw === 'string' && raw ? raw : `请求失败（HTTP ${String(response.status)}）`
}

/** Upload the signed-in account picture through the Host proxy. */
export async function uploadAccountAvatar(file: File): Promise<void> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch('ground-billing/avatar', { method: 'POST', credentials: 'same-origin', body })
  if (!response.ok) throw new GroundBillingError(await readProxyError(response), response.status)
  await response.body?.cancel()
}

/** Remove the account picture so surfaces show the name initial. */
export async function resetAccountAvatar(): Promise<void> {
  const response = await fetch('ground-billing/avatar', { method: 'DELETE', credentials: 'same-origin' })
  if (!response.ok) throw new GroundBillingError(await readProxyError(response), response.status)
  await response.body?.cancel()
}

/**
 * Open Ground Admin/Console via a short-lived single-use SSO ticket. Desktop routes
 * window.open(http) through shell.openExternal (system browser); Web opens a new tab.
 * @param api - proxy calls.
 * @param open - window opener (injectable for tests).
 */
export async function openEnterpriseConsole(
  api: Pick<GroundBillingApi, 'consoleLink'> = groundBillingApi,
  open: (url: string) => void = url => { window.open(url, '_blank', 'noopener,noreferrer') },
): Promise<{ url: string; admin: boolean }> {
  const link = await api.consoleLink()
  open(link.url)
  return link
}

/** Shared recharge state observed by the launcher, settings section and dialog. */
export interface BillingSnapshot {
  /** Current company and role from the authenticated Ground session. */
  identity?: { phone: string | null; company: string | null; role: string | null; platformAdmin: boolean } | undefined
  /** Host serves the Ground billing proxy and the wallet read succeeded at least once. */
  enabled: boolean
  /** Enterprise AI coin balance; null when unknown / no tenant. */
  balanceCoins: number | null
  /** Whether the signed-in user may open recharge (Ground canRecharge). */
  canRecharge: boolean
  /** 企业控制台入口：portal.console.access（不含平台管进 Admin）。 */
  hasConsoleAccess: boolean
  /** 平台管：账号菜单显示入口并走 Admin SSO。 */
  isPlatformAdmin: boolean
  /** Coins credited per 1 CNY (Ground config, default 50000). */
  aiCoinsPerYuan: number
  /** Whether the recharge dialog is showing. */
  open: boolean
}

const DISABLED: BillingSnapshot = {
  enabled: false, balanceCoins: null, canRecharge: false,
  hasConsoleAccess: false, isPlatformAdmin: false, aiCoinsPerYuan: 50000, open: false,
}
const NOOP_SUBSCRIBE = () => () => undefined

/** React hook over an optional billing observable (absent → disabled). */
export function useBillingState(state: { getSnapshot(): BillingSnapshot; subscribe(listener: () => void): () => void } | undefined): BillingSnapshot {
  return useSyncExternalStore(state?.subscribe ?? NOOP_SUBSCRIBE, state?.getSnapshot ?? (() => DISABLED))
}

/** Format AI coins compactly in Chinese units. */
export function formatCoins(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  const abs = Math.abs(value)
  const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, '')
  if (abs >= 1e8) return `${trim(value / 1e8)}亿`
  if (abs >= 1e4) return `${trim(value / 1e4)}万`
  return Math.round(value).toLocaleString('zh-CN')
}

/** Fixed recharge amounts (CNY), same as Ground Console. */
export const FIXED_AMOUNTS = [100, 500, 2000, 5000, 10000] as const
export const RECHARGE_MAX_YUAN = 100000

/** @returns an error message, or undefined when the amount text is a valid 0 < x ≤ 100000 with ≤ 2 decimals. */
export function validateAmount(text: string): string | undefined {
  const t = text.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return '请输入大于 0 的金额，最多两位小数'
  const value = Number(t)
  if (!(value > 0)) return '请输入大于 0 的金额'
  if (value > RECHARGE_MAX_YUAN) return `单笔充值不能超过 ${RECHARGE_MAX_YUAN.toLocaleString('zh-CN')} 元`
  return undefined
}

/**
 * Observable billing store with wallet refresh and dialog open state.
 * @param api - proxy calls (injectable for tests).
 */
export function createBillingStore(api: GroundBillingApi = groundBillingApi) {
  let snapshot: BillingSnapshot = {
    enabled: false, balanceCoins: null, canRecharge: false,
    hasConsoleAccess: false, isPlatformAdmin: false, aiCoinsPerYuan: 50000, open: false,
  }
  const listeners = new Set<() => void>()
  const publish = (next: Partial<BillingSnapshot>) => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }
  let generation = 0
  let inflight: Promise<void> | undefined
  const refresh = (): Promise<void> => {
    if (inflight) return inflight
    const currentGeneration = generation
    inflight = (async () => {
      try {
        const [walletResult, meResult] = await Promise.allSettled([api.wallet(), api.me()])
        if (currentGeneration !== generation) return
        if (meResult.status === 'fulfilled') {
          const me = meResult.value
          publish({ identity: {
            phone: me.user?.phone ?? null, company: me.currentTenant?.name ?? null,
            role: me.currentRole ?? null, platformAdmin: me.user?.isPlatformAdmin === true,
          } })
        }
        if (walletResult.status === 'rejected') throw walletResult.reason
        const wallet = walletResult.value
        publish({
          enabled: true,
          balanceCoins: typeof wallet.balanceCoins === 'number' ? wallet.balanceCoins : null,
          canRecharge: wallet.isPlatformAdmin === true || wallet.skipped ? false : wallet.canRecharge === true,
          // 平台管无租户时 wallet.skipped，仍靠 isPlatformAdmin 显示 Admin 入口
          hasConsoleAccess: wallet.hasConsoleAccess === true,
          isPlatformAdmin: wallet.isPlatformAdmin === true,
          aiCoinsPerYuan: wallet.config?.aiCoinsPerYuan ?? snapshot.aiCoinsPerYuan,
        })
      } catch (error) {
        if (currentGeneration !== generation) return
        // 404/405: Host not in Ground SSO mode → hide recharge entirely. Other failures keep the last value.
        if (error instanceof GroundBillingError && (error.status === 404 || error.status === 405)) publish({ enabled: false })
        else if (error instanceof GroundBillingError && error.status === 401) {
          publish({ identity: undefined, enabled: false, balanceCoins: null, hasConsoleAccess: false, isPlatformAdmin: false, canRecharge: false })
        }
      } finally {
        if (currentGeneration === generation) inflight = undefined
      }
    })()
    return inflight
  }
  return {
    api,
    observable: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    refresh,
    open: () => refresh().then(() => { if (snapshot.canRecharge) publish({ open: true }) }),
    close: () => { publish({ open: false }) },
    reset: () => {
      generation++
      inflight = undefined
      publish({
        identity: undefined, enabled: false, balanceCoins: null, canRecharge: false,
        hasConsoleAccess: false, isPlatformAdmin: false, open: false,
      })
    },
  }
}

export type BillingStore = ReturnType<typeof createBillingStore>
