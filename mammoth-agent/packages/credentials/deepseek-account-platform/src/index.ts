/** Platform PKCE account provider; browser approval never bypasses local cancellation. */
import { installGroundHistory } from './ground-history.ts'
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type {} from '@mammoth-ai/mmp-host-webserver'
import { arch, platform, release } from 'node:os'
import { promises as streamPromises } from 'node:stream'
import { Context, Service } from '@mammoth-ai/cordis'
import Schema from '@mammoth-ai/schemastery'
import { z } from 'zod'
import { DeepSeekAccount, installAccountTaskCancellation, mergePlatformCookies, platformClientHeaders, platformWireLocale, type AccountBonusBatch, type AccountBonusOrderId, type AccountClientMetadata, type AccountDetails, type AccountUserId, type AccountView, type PlatformSession, type SignInAttemptId, type SignInAttemptView } from '@mammoth-ai/mmp-deepseek-account'
import { credentialKey } from '@mammoth-ai/mmp-credentials'
import type { AuthorizationSession } from '@mammoth-ai/mmp-authorization'
import { profile, readAccountDetail, readUnnotifiedBonuses, sendBonusNotified } from './details.ts'
import { revokeAccount, type LogoutRetryPolicy } from './logout.ts'
import { AccountUnauthorizedError, PlatformAuthError, platformHeaders, platformOrigin, browserUrl, requestPlatform, initialization, exchange, loginOrigin } from './protocol.ts'
import { createGroundWebIdentity, GroundWebIdentityConflict, groundWebTokenClaims, type GroundWebIdentity } from './web-sso.ts'
import type {} from '@mammoth-ai/mmp-client-connection'
import { installGroundBilling } from './ground-billing.ts'
import { installGroundLibrary } from './ground-library.ts'
import { installGroundLibraryPrompt } from './ground-library-prompt.ts'
import { buildAuthorizeUrl, exchangeGroundCode, fetchGroundSessionMe, fetchGroundUserinfo, groundBrowserLogoutUrl, groundOidcDoneHtml, groundOidcEndpoints, groundSessionToken, groundSessionProfile } from './ground-oidc.ts'

const KEY = credentialKey('deepseek-account-platform', 'default')
const WEB_OWNER = credentialKey('ground-web-owner', 'default')
const webOwner = z.object({ userId: z.string().min(1), tenantId: z.string().nullable() })
const DEVICE = credentialKey('deepseek-account-platform', 'device')
const grant = z.object({ version: z.literal(1), token: z.string().min(1), issuer: z.url() })
const device = z.object({ id: z.uuid() })

/** Deployment-specific platform and request deadlines. */
export interface Config {
  /** Reuse Ground browser cookies for a single-user local Web profile; Desktop stays on PKCE. */
  webSso?: boolean
  /** Browser-facing origin when the local identity router owns the public listener. */
  webSsoOrigin?: string
  /** Ground session cookie name; must match the Ground deployment. */
  groundCookieName?: string

  /** Platform origin serving auth-api and browser pages. */
  historySync?: boolean
  /** Milliseconds between incremental cloud history synchronization attempts. */
  historySyncIntervalMs?: number
  /** Maximum transcript messages sent per cloud history synchronization request. */
  historyBatchSize?: number
  /** Ground platform origin used for account and cloud service requests. */
  platformOrigin?: string
  /**
   * Authentication protocol.
   * - deepseek: DeepSeek Platform auth_init / auth_exchange (default)
   * - oidc: Ground OIDC authorize + token + userinfo (猛犸 SSO)
   */
  authMode?: 'deepseek' | 'oidc'
  /** OIDC client_id registered at Ground (default harness-desktop). */
  oidcClientId?: string
  /** Ground public API prefix for OIDC (/console/api or /middle/api). */
  oidcApiPrefix?: '/console/api' | '/middle/api'
  /** Native desktop identity for Host API and embedded Platform requests; null identifies the client as web. */
  desktopPlatform?: 'darwin' | 'win32' | null
  /** Optional frontend deployment selector for embedded Usage and Top-up pages. */
  embeddedPageDist?: string
  /** Exact HTTP(S) origin allowed to receive account tokens for inference and files. */
  inferenceOrigin?: string
  /** Allow HTTP only on loopback for the development Mock. */
  allowLoopbackHttp?: boolean
  /** Map authorization and completion pages to platformOrigin for private development proxies. */
  rewriteBrowserOrigin?: boolean
  /** Host-only headers sent exclusively to platformOrigin; account authorization cannot be overridden. */
  requestHeaders?: Record<string, string>
  /** Overrides for profile, balance and embedded Platform requests; Cookie pairs merge by name. Logout retains requestHeaders. */
  accountRequestHeaders?: Record<string, string>
  /** Deadline for each platform HTTP request. */
  requestTimeoutMs?: number
  /** Deadline for recharge-wallet queries; timeout returns a failed balance outcome. */
  balanceTimeoutMs?: number
  /** Additional logout attempts after the first request fails, at most five. */
  logoutMaxRetries?: number
  /** Delay before the first logout retry; each later delay doubles. */
  logoutRetryDelayMs?: number
  /** Upper bound for the entire local attempt, even if the server advertises a longer TTL. */
  attemptTimeoutMs?: number
}
/** Validated deployment choices. */
export const Config = Schema.object({
  historySync: Schema.boolean().default(false),
  historySyncIntervalMs: Schema.number().min(1000).max(300000).default(30000),
  historyBatchSize: Schema.number().min(1).max(100).step(1).default(100),
  webSso: Schema.boolean().default(false),
  webSsoOrigin: Schema.string().default(''),
  groundCookieName: Schema.string().default('mammothai_access_token'),
  // Mammoth local-first defaults: Ground gateway OIDC.
  platformOrigin: Schema.string().default(process.env.GROUND_PUBLIC_ORIGIN || process.env.MMP_PLATFORM_ORIGIN || 'http://127.0.0.1:5201'),
  authMode: Schema.union([Schema.const('deepseek'), Schema.const('oidc')]).default('oidc'),
  oidcClientId: Schema.string().default(process.env.MMP_OIDC_CLIENT_ID || 'harness-desktop'),
  oidcApiPrefix: Schema.union([Schema.const('/console/api'), Schema.const('/middle/api')]).default('/console/api'),
  desktopPlatform: Schema.union([Schema.const('darwin'), Schema.const('win32'), Schema.const(null)]).default(null),
  embeddedPageDist: Schema.string().default(''),
  inferenceOrigin: Schema.string().default('https://api.deepseek.com'),
  allowLoopbackHttp: Schema.boolean().default(true),
  rewriteBrowserOrigin: Schema.boolean().default(false),
  requestHeaders: Schema.dict(Schema.string().role('secret')).default({}),
  accountRequestHeaders: Schema.dict(Schema.string().role('secret')).default({}),
  requestTimeoutMs: Schema.number().min(1).max(120_000).default(30_000),
  balanceTimeoutMs: Schema.number().min(1).max(120_000).default(30_000),
  logoutMaxRetries: Schema.number().min(0).max(5).step(1).default(5),
  logoutRetryDelayMs: Schema.number().min(1).max(60_000).default(1_000),
  attemptTimeoutMs: Schema.number().min(1).max(3_600_000).default(600_000),
})

interface Attempt {
  locale: 'en_US' | 'zh_CN'
  clientHeaders: Record<string, string>
  view: SignInAttemptView
  controller: AbortController
  done: Promise<void>
  running: Promise<void>
  origin: string
  loginSource: 'web' | 'desktop'
  disposeCallback?: () => Promise<void>
  callback?: ServerResponse
  initialProfile?: { token: string; value: AccountDetails['profile'] }
  completionUrl?: string
}

/** The platform implementation owns login state and its opaque stored grant. */
export class PlatformAccount extends DeepSeekAccount {
  static inject = ['credentials', 'authorization']
  static Config = Config
  private readonly webSso: boolean
  private readonly webSsoOrigin: string
  private readonly origin: string
  private readonly authMode: 'deepseek' | 'oidc'
  private readonly oidcClientId: string
  private readonly oidcApiPrefix: '/console/api' | '/middle/api'
  private readonly embeddedPageDist: string
  private readonly inferenceOrigin: string
  private readonly rewriteBrowserOrigin: boolean
  private readonly platform: 'darwin' | 'win32' | null
  private readonly requestHeaders: Record<string, string>
  private readonly accountRequestHeaders: Record<string, string>
  private readonly requestTimeout: number
  private readonly balanceTimeout: number
  private readonly attemptTimeout: number
  private readonly logoutPolicy: LogoutRetryPolicy
  private readonly logoutLifetime = new AbortController()
  private readonly revocations = new Set<Promise<void>>()
  private attempt: Attempt | undefined
  private readonly listeners = new Set<(identityOnly: boolean) => void>()
  /**
   * Latest ready profile read and the grant token it was read with. Binding the token keeps a
   * cached identity from answering for a credential that has since changed.
   */
  private lastProfile: { readonly token: string; readonly profile: Extract<AccountDetails['profile'], { status: 'ready' }> } | undefined
  private detailsLifetime = new AbortController()
  private closed = false
  private removing: Promise<AccountView> | undefined

  /** @param ctx - Host with authorization and credentials services. @param config - deployment options. */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    installAccountTaskCancellation(ctx)
    const resolved = Config(config)
    this.webSso = resolved.webSso
    this.webSsoOrigin = resolved.webSsoOrigin
    this.embeddedPageDist = resolved.embeddedPageDist
    this.authMode = resolved.authMode
    this.oidcClientId = resolved.oidcClientId
    this.oidcApiPrefix = resolved.oidcApiPrefix
    this.origin = platformOrigin(resolved.platformOrigin, resolved.allowLoopbackHttp)
    const inference = new URL(resolved.inferenceOrigin)
    if (!['http:', 'https:'].includes(inference.protocol) || inference.username || inference.password
      || inference.pathname !== '/' || inference.search || inference.hash) {
      throw new Error('account: inferenceOrigin must be an HTTP(S) origin without credentials, path, query or fragment')
    }
    this.inferenceOrigin = inference.origin
    this.rewriteBrowserOrigin = resolved.rewriteBrowserOrigin
    this.platform = resolved.desktopPlatform
    this.requestHeaders = platformHeaders(resolved.requestHeaders)
    const accountHeaders = platformHeaders(resolved.accountRequestHeaders)
    this.accountRequestHeaders = { ...this.requestHeaders, ...accountHeaders }
    if (accountHeaders.cookie !== undefined) {
      this.accountRequestHeaders.cookie = mergePlatformCookies(this.requestHeaders.cookie ?? '', accountHeaders.cookie)
    }
    this.requestTimeout = resolved.requestTimeoutMs
    this.balanceTimeout = resolved.balanceTimeoutMs
    this.attemptTimeout = resolved.attemptTimeoutMs
    this.logoutPolicy = {
      maxRetries: resolved.logoutMaxRetries, delayMs: resolved.logoutRetryDelayMs, requestTimeoutMs: this.requestTimeout,
    }
    ctx.authorization.registerFlow({
      key: KEY, label: 'DeepSeek', methods: [{ id: 'browser', label: 'DeepSeek' }],
      run: (session) => {
        const attempt = this.attempt
        if (attempt === undefined) return Promise.reject(new PlatformAuthError('protocol'))
        attempt.running = this.run(session, attempt)
        return attempt.running
      },
    })
    if (this.authMode === 'oidc') {
      // Same-origin recharge proxy for the client RechargeDialog (Ground JWT stays on the Host).
      installGroundBilling(ctx, this.origin, () => this.groundSessionJwt(), token => this.rejectToken(token))
      installGroundLibrary(ctx, this.origin, () => this.groundSessionJwt(), token => this.rejectToken(token), this.requestTimeout)
      installGroundLibraryPrompt(ctx, this.origin, () => this.groundSessionJwt(), token => this.rejectToken(token), this.requestTimeout)
      if (resolved.historySync) installGroundHistory(ctx, { origin: this.origin, account: this,
        intervalMs: resolved.historySyncIntervalMs, batchSize: resolved.historyBatchSize, requestTimeoutMs: this.requestTimeout,
        clientKind: resolved.desktopPlatform === null ? 'web' : 'desktop' })
      if (this.webSso) ctx.inject(['connection', 'webServer'], (host) => {
        if (!/^[A-Za-z0-9_-]+$/.test(resolved.groundCookieName)) throw new Error('Invalid Ground cookie name')
        const policy = createGroundWebIdentity({ groundOrigin: this.origin, webOrigin: this.webSsoOrigin || host.webServer.getOrigin(),
          cookieName: resolved.groundCookieName, requestTimeoutMs: this.requestTimeout,
          onExpired: () => { void host.connection.invalidateBrowserSessions() },
          acceptGrant: (token, identity, value) => this.acceptWebGrant(token, identity, value) })
        host.effect(() => host.connection.installBrowserIdentity(policy), 'account: Ground Web browser identity')
        host.effect(() => () => { policy.dispose() }, 'account: Ground Web SSO lifetime')
        host.on('deepseek-account/signed-out', () => { policy.clear(); return host.connection.invalidateBrowserSessions() })
        host.effect(() => host.webServer.register({ kind: 'exact', path: '/auth/ground/logout', handler: (req, res) => {
          if (req.method !== 'GET' || req.headers['sec-fetch-site'] === 'cross-site') {
            res.writeHead(403).end(); return
          }
          res.writeHead(303, { location: policy.loginUrl, 'cache-control': 'no-store',
            'set-cookie': `${resolved.groundCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${(this.webSsoOrigin || host.webServer.getOrigin()).startsWith('https:') ? '; Secure' : ''}`,
            'referrer-policy': 'no-referrer' }).end()
        } }), 'account: Ground Web browser logout')
      })
    }
    ctx.on('credentials/record-updated', (key) => {
      if (key !== KEY) return
      this.invalidateDetails()
      this.changed()
    })
    ctx.effect(() => async () => {
      this.closed = true
      this.logoutLifetime.abort()
      this.invalidateDetails()
      const active = this.attempt
      if (active !== undefined) {
        if (active.view.phase !== 'committing') active.controller.abort()
        await active.done
      }
      await this.removing
      await Promise.all(this.revocations)
      this.changed()
    }, 'account: active attempt lifetime')
  }

  async [Service.init](): Promise<void> {
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined) return
    if (record.kind !== 'grant') throw new PlatformAuthError('storage')
    const parsed = grant.safeParse(record.payload)
    if (!parsed.success) throw new PlatformAuthError('storage')
    if (parsed.data.issuer === this.origin) return
    await this.ctx.credentials.deleteRecord(KEY)
  }

  private async acceptWebGrant(token: string, identity: GroundWebIdentity, session: Record<string, unknown>): Promise<void> {
    if (this.closed) throw new PlatformAuthError('protocol')
    if (this.removing !== undefined) throw new PlatformAuthError('expired')
    const owner = await this.ctx.credentials.readRecord(WEB_OWNER)
    const current = await this.ctx.credentials.readRecord(KEY)
    let bound: GroundWebIdentity | undefined
    if (owner !== undefined) {
      if (owner.kind !== 'grant') throw new PlatformAuthError('storage')
      bound = webOwner.parse(owner.payload)
    } else {
      if (current !== undefined) {
        if (current.kind !== 'grant') throw new PlatformAuthError('storage')
        const saved = grant.parse(current.payload)
        if (saved.issuer !== this.origin) throw new GroundWebIdentityConflict()
        const claims = groundWebTokenClaims(saved.token)
        bound = { userId: claims.userId, tenantId: claims.tenantId }
      }
    }
    if (bound !== undefined && (bound.userId !== identity.userId || bound.tenantId !== identity.tenantId)) {
      throw new GroundWebIdentityConflict()
    }
    if (owner === undefined) await this.ctx.credentials.modifyRecord(WEB_OWNER, () => Promise.resolve({ kind: 'grant', payload: identity }))
    const previous = current?.kind === 'grant' ? grant.parse(current.payload) : undefined
    const grantChanged = previous?.token !== token || previous.issuer !== this.origin
    if (grantChanged) {
      await this.ctx.credentials.modifyRecord(KEY, () => Promise.resolve({ kind: 'grant', payload: { version: 1, token, issuer: this.origin } }))
      this.invalidateDetails()
    }
    this.cacheProfile(token, { status: 'ready', value: groundSessionProfile(session) })
    // Same browser credential must not wake account watchers on every index auth; that
    // re-triggers getProfile → /api/auth/me and floods `pnpm run dev` request logs.
    if (grantChanged) this.changed()
  }

  override async getState(): Promise<AccountView> {
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record !== undefined && (record.kind !== 'grant' || !grant.safeParse(record.payload).success)) {
      throw new PlatformAuthError('storage')
    }
    const attempt = this.attempt?.view ?? null
    return {
      status: record === undefined ? 'signed-out' : 'credential-stored',
      // Credential removal can notify watchers before sign-out finishes clearing the attempt.
      attempt: record === undefined && attempt?.phase === 'succeeded' ? null : attempt,
      links: this.authMode === 'oidc'
        ? {
          usageUrl: new URL('/console', this.origin).href,
          topUpUrl: new URL('/console', this.origin).href,
          logoutUrl: this.webSso ? new URL('/auth/ground/logout', this.webSsoOrigin || this.ctx.webServer.getOrigin()).href : groundBrowserLogoutUrl(this.origin),
        }
        : { usageUrl: new URL('/usage', this.origin).href, topUpUrl: new URL('/top_up', this.origin).href },
    }
  }

  override async getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null> {
    const lifetime = this.detailsLifetime
    const stored = await this.readCurrentGrant(lifetime)
    if (stored === null || lifetime.signal.aborted) return null
    const result = await this.getDetail('profile', this.detailHeaders(client), { lifetime, stored })
    if (this.detailsLifetime !== lifetime) return null
    if (result !== null) this.cacheProfile(stored.token, result)
    if (result?.status !== 'failed') return result
    // Only this same grant's last ready read may stand in for a failed refresh.
    const cached = this.lastProfile?.token === stored.token ? this.lastProfile.profile : undefined
    return cached ?? result
  }

  override getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null> {
    return this.getDetail('balance', this.detailHeaders(client))
  }

  override async getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null> {
    const lifetime = this.detailsLifetime
    const headers = this.detailHeaders(client)
    const stored = await this.readCurrentGrant(lifetime)
    if (stored === null) return null
    const accountId = await this.currentAccountId(lifetime, stored, headers)
    if (accountId === null) return null
    try {
      if (this.authMode === 'oidc') return { accountId, bonuses: [] }
      const bonuses = await readUnnotifiedBonuses(this.origin, stored.token,
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(this.requestTimeout)]), headers)
      return { accountId, bonuses }
    } catch (error) {
      if (error instanceof AccountUnauthorizedError) {
        if (this.detailsLifetime === lifetime) await this.expireCredential(stored.token, lifetime)
        return null
      }
      throw error
    }
  }

  override async ackBonusNotified(accountId: AccountUserId, orderId: AccountBonusOrderId, client: AccountClientMetadata): Promise<boolean> {
    const lifetime = this.detailsLifetime
    const headers = this.detailHeaders(client)
    const stored = await this.readCurrentGrant(lifetime)
    if (stored === null) return false
    const current = await this.currentAccountId(lifetime, stored, headers)
    if (current === null || current !== accountId) return false
    try {
      await sendBonusNotified(this.origin, stored.token, orderId,
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(this.requestTimeout)]), headers)
      return true
    } catch (error) {
      if (error instanceof AccountUnauthorizedError) {
        if (this.detailsLifetime === lifetime) await this.expireCredential(stored.token, lifetime)
        return false
      }
      throw error
    }
  }

  /**
   * Resolve the profile identity bound to one captured grant, within that grant's credential lifetime.
   * @param lifetime - credential lifetime the grant was captured under; a change discards the result.
   * @param stored - captured grant; the identity query never re-reads a newer credential.
   * @param headers - client identity headers of the calling operation.
   * @returns the account identity, or null while signed out or after the credential changed.
   */
  private async currentAccountId(lifetime: AbortController, stored: z.infer<typeof grant>,
    headers: Record<string, string>): Promise<AccountUserId | null> {
    // A profile already read for this same captured grant names the account, so a bonus read or
    // acknowledgement reuses it instead of issuing another current query.
    if (this.lastProfile?.token === stored.token) return this.identityOf(this.lastProfile.profile)
    const details = await this.getDetail('profile', headers, { lifetime, stored })
    if (details === null) return null
    if (details.status === 'failed') {
      // The query named no identity, and the cache is empty or belongs to another grant.
      throw new PlatformAuthError('network')
    }
    this.cacheProfile(stored.token, details)
    return this.identityOf(details)
  }

  /**
   * Cache one ready profile against the grant token it was read with, so identity reuse cannot cross
   * a credential change. A stable ID that first appears or changes notifies identity-enabled watch consumers, so
   * identity consumers re-read getPlatformSession; repeated IDs stay silent.
   * @param token - grant the profile was read with.
   * @param profile - profile outcome to record when it carries account data.
   */
  private cacheProfile(token: string, profile: AccountDetails['profile']): void {
    if (profile.status !== 'ready') return
    // Identity publishers re-read the session snapshot; wake them only when the stable ID changes.
    const previous = this.lastProfile?.profile.value.id || null
    this.lastProfile = { token, profile }
    if (previous !== (profile.value.id || null)) this.changed(true)
  }

  /**
   * @param profile - ready profile projected for the UI.
   * @returns the account identity it names.
   * @throws PlatformAuthError when the profile carries no stable Platform id, which cannot isolate notices.
   */
  private identityOf(profile: Extract<AccountDetails['profile'], { status: 'ready' }>): AccountUserId {
    if (profile.value.id === null) throw new PlatformAuthError('protocol')
    return profile.value.id
  }

  private getDetail(
    field: 'profile',
    headers: Record<string, string>,
    captured?: { lifetime: AbortController; stored: z.infer<typeof grant> },
  ): Promise<AccountDetails['profile'] | null>
  private getDetail(
    field: 'balance',
    headers: Record<string, string>,
    captured?: { lifetime: AbortController; stored: z.infer<typeof grant> },
  ): Promise<AccountDetails['balance'] | null>
  private async getDetail(
    field: keyof AccountDetails,
    headers: Record<string, string>,
    captured?: { lifetime: AbortController; stored: z.infer<typeof grant> },
  ): Promise<AccountDetails[keyof AccountDetails] | null> {
    const lifetime = captured?.lifetime ?? this.detailsLifetime
    const stored = captured?.stored ?? await this.readCurrentGrant(lifetime)
    if (stored === null || lifetime.signal.aborted) return null
    if (field === 'profile' && this.attempt?.initialProfile?.token === stored.token) {
      const initial = this.attempt.initialProfile.value
      delete this.attempt.initialProfile
      return initial
    }
    try {
      if (this.authMode === 'oidc') {
        if (field === 'balance') {
          // Ground SSO has no DeepSeek wallet API; AI-coin balance is loaded via /ground-billing/wallet.
          // Return an empty ready wallet so the account UI stays silent instead of console.error'ing.
          const emptyBalance: AccountDetails['balance'] = { status: 'ready', value: [], bonusWallets: [] }
          return emptyBalance
        }
        // Grant stores Nest console_handoff_token; profile must use /api/auth/me (JwtGuard), not OIDC userinfo.
        const value = await fetchGroundSessionMe(
          this.origin,
          stored.token,
          AbortSignal.any([lifetime.signal, AbortSignal.timeout(this.requestTimeout)]),
        )
        const readyProfile: AccountDetails['profile'] = { status: 'ready', value }
        return this.detailsLifetime !== lifetime ? null : readyProfile
      }
      const details = await readAccountDetail(field, this.origin, stored.token,
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(field === 'balance' ? this.balanceTimeout : this.requestTimeout)]), headers)
      return this.detailsLifetime !== lifetime ? null : details
    } catch (error) {
      if (error instanceof PlatformAuthError && error.code === 'expired') {
        if (this.detailsLifetime === lifetime) await this.expireCredential(stored.token, lifetime)
        return null
      }
      if (this.authMode === 'oidc') {
        // Soft-fail profile/balance for SSO slice; do not clear the grant on transient Ground errors.
        if (error instanceof PlatformAuthError) {
          const failed: AccountDetails[keyof AccountDetails] = { status: 'failed' }
          return failed
        }
        throw error
      }
      // readAccountDetail exposes only authenticated credential rejection failures.
      if (this.detailsLifetime === lifetime) await this.expireCredential(stored.token, lifetime)
      return null
    }
  }

  /** Deployment account headers plus the client identity headers derived from one call's metadata. */
  private detailHeaders(client: AccountClientMetadata): Record<string, string> {
    return { ...this.accountRequestHeaders, ...platformClientHeaders(this.platform, client) }
  }

  override async rejectToken(token: string): Promise<void> {
    const lifetime = this.detailsLifetime
    const stored = await this.readCurrentGrant(lifetime)
    if (stored?.token !== token || this.detailsLifetime !== lifetime) return
    await this.expireCredential(token, lifetime)
  }

  private async expireCredential(token: string, lifetime: AbortController): Promise<void> {
    this.removing ??= (async () => {
      if (this.attempt !== undefined) await this.cancelSignIn(this.attempt.view.id)
      const record = await this.ctx.credentials.readRecord(KEY)
      if (this.closed || this.detailsLifetime !== lifetime || record?.kind !== 'grant') return this.getState()
      const current = grant.parse(record.payload)
      if (current.token !== token || current.issuer !== this.origin) return this.getState()
      await this.ctx.credentials.deleteRecord(KEY)
      this.ctx.emit('deepseek-account/session-expired')
      this.attempt = undefined
      this.ctx.emit('deepseek-account/signed-out')
      this.changed()
      return this.getState()
    })().finally(() => { this.removing = undefined })
    await this.removing
  }

  override async getDeviceIdentity(): Promise<{ deviceId?: string; userId?: AccountUserId; osVersion: string }> {
    const [record, session] = await Promise.all([
      this.ctx.credentials.readRecord(DEVICE),
      this.getPlatformSession(),
    ])
    const parsed = record?.kind === 'grant' ? device.safeParse(record.payload) : undefined
    return {
      ...parsed?.success ? { deviceId: parsed.data.id } : {},
      ...session?.userId == null ? {} : { userId: session.userId },
      osVersion: deviceOsVersion(),
    }
  }

  override async getPlatformSession(): Promise<PlatformSession | null> {
    const lifetime = this.detailsLifetime
    const stored = await this.readCurrentGrant(lifetime)
    if (stored === null || lifetime.signal.aborted) return null
    // Deployment headers only; the consuming client adds the identity of its own UI.
    const requestHeaders = { ...this.accountRequestHeaders }
    // Identity comes from the profile read for this same grant; an unknown ID requires disposable
    // browser storage. A replaced credential never publishes the account its predecessor named.
    return { origin: this.origin, token: stored.token,
      userId: this.lastProfile?.token === stored.token ? this.lastProfile.profile.value.id || null : null,
      ...(this.embeddedPageDist ? { embeddedPageDist: this.embeddedPageDist } : {}),
      requestHeaders }
  }

  private async readCurrentGrant(lifetime: AbortController): Promise<z.infer<typeof grant> | null> {
    if (this.closed) return null
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined || lifetime.signal.aborted) return null
    if (record.kind !== 'grant') throw new PlatformAuthError('storage')
    const parsed = grant.safeParse(record.payload)
    if (!parsed.success) throw new PlatformAuthError('storage')
    // A private origin override must never forward a grant issued by another environment.
    if (parsed.data.issuer !== this.origin) throw new PlatformAuthError('protocol')
    return parsed.data
  }

  /** Stored Ground session JWT for the billing proxy; undefined when signed out or mid sign-out. */
  private async groundSessionJwt(): Promise<string | undefined> {
    if (this.closed || this.removing !== undefined) return undefined
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined || record.kind !== 'grant') return undefined
    const result = grant.safeParse(record.payload)
    if (!result.success || result.data.issuer !== this.origin) return undefined
    return result.data.token
  }

  override async resolveToken(url: string): Promise<string | undefined> {
    if (this.closed || this.removing !== undefined) return undefined
    const destination = new URL(url)
    if (destination.origin !== this.inferenceOrigin || destination.username || destination.password) return undefined
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined) return undefined
    if (record.kind !== 'grant') throw new PlatformAuthError('storage')
    const result = grant.safeParse(record.payload)
    if (!result.success) throw new PlatformAuthError('storage')
    // Development grants cannot authenticate production model or file requests.
    const issuer = new URL(result.data.issuer)
    if (result.data.token.startsWith('dsh_mock_')) return undefined
    if (this.inferenceOrigin === 'https://api.deepseek.com') {
      if (['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)) return undefined
    } else if (issuer.origin !== this.origin) return undefined
    return result.data.token
  }

  override async startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<AccountView> {
    if (this.webSso) throw new PlatformAuthError('protocol')
    if (this.removing !== undefined) await this.removing
    const origin = loginOrigin(callbackOrigin)
    if (this.closed) throw new PlatformAuthError('protocol')
    if (this.attempt !== undefined && ['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(this.attempt.view.phase)) {
      return this.getState()
    }
    const previous = this.attempt
    if (previous !== undefined) {
      await previous.done
      // Disposal can close the provider while the previous attempt settles.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.closed) throw new PlatformAuthError('protocol')
      if (this.attempt !== previous) return this.getState()
    }
    const attempt: Attempt = {
      origin, loginSource,
      locale: platformWireLocale(client.locale),
      clientHeaders: platformClientHeaders(this.platform, client),
      view: { id: randomUUID() as SignInAttemptId, phase: 'initializing' },
      controller: new AbortController(), done: Promise.resolve(), running: Promise.resolve(),
    }
    this.attempt = attempt
    attempt.done = this.ctx.authorization.begin({
      key: KEY, signal: attempt.controller.signal,
      interaction: { notify: () => undefined, prompt: () => Promise.reject(new PlatformAuthError('protocol')) },
    }).then((outcome) => {
      this.update(attempt, { phase: outcome.status === 'authorized' ? 'succeeded' : 'cancelled' })
      // OIDC already wrote the local done HTML and cleared callback; DeepSeek keeps callback for 302.
      const res = attempt.callback
      if (res === undefined || res.writableEnded) return
      if (outcome.status === 'authorized' && attempt.completionUrl !== undefined) {
        res.writeHead(302, { location: attempt.completionUrl, 'cache-control': 'no-store' }).end()
      } else {
        res.writeHead(204, { 'cache-control': 'no-store' }).end()
      }
    }).catch((error: unknown) => {
      const code = error instanceof PlatformAuthError ? error.code : 'protocol'
      console.error('[deepseek-account] sign-in failed', { errorCode: code })
      this.update(attempt, { phase: code === 'expired' ? 'expired' : 'failed', errorCode: code })
      this.finishFailedCallback(attempt)
    }).then(async () => {
      // begin() may report cancellation before the HTTP work observes its signal.
      await attempt.running.catch(() => undefined)
      if (attempt.callback !== undefined) {
        await streamPromises.finished(attempt.callback, { cleanup: true }).catch(() => undefined)
      }
      await attempt.disposeCallback?.()
    })
    this.changed()
    return this.getState()
  }

  override async cancelSignIn(id: SignInAttemptId): Promise<AccountView> {
    const attempt = this.attempt
    if (attempt?.view.id === id) {
      if (attempt.view.phase !== 'committing') {
        attempt.controller.abort()
        this.ctx.authorization.cancel(KEY)
      }
      await attempt.done
    }
    return this.getState()
  }

  override signOut(client: AccountClientMetadata): Promise<AccountView> {
    this.removing ??= (async () => {
      if (this.closed) throw new PlatformAuthError('protocol')
      if (this.attempt !== undefined) await this.cancelSignIn(this.attempt.view.id)
      const record = await this.ctx.credentials.readRecord(KEY)
      if (record !== undefined) {
        if (record.kind !== 'grant') throw new PlatformAuthError('storage')
        const parsed = grant.safeParse(record.payload)
        if (!parsed.success) throw new PlatformAuthError('storage')
        if (parsed.data.issuer !== this.origin) throw new PlatformAuthError('protocol')
        await this.ctx.credentials.deleteRecord(KEY)
        this.revoke(parsed.data.token, platformClientHeaders(this.platform, client))
      }
      this.attempt = undefined
      this.ctx.emit('deepseek-account/signed-out')
      this.changed()
      return this.getState()
    })().finally(() => { this.removing = undefined })
    return this.removing
  }

  override async *watch(signal: AbortSignal, includeIdentityChanges = false): AsyncIterable<AccountView> {
    let dirty = true
    let wake: (() => void) | undefined
    const wakeUp = (): void => { dirty = true; wake?.() }
    const changed = (identityOnly: boolean): void => { if (!identityOnly || includeIdentityChanges) wakeUp() }
    this.listeners.add(changed)
    signal.addEventListener('abort', wakeUp, { once: true })
    try {
      while (!this.closed && !signal.aborted) {
        if (dirty) { dirty = false; yield await this.getState(); continue }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      this.listeners.delete(changed)
      signal.removeEventListener('abort', wakeUp)
    }
  }

  private revoke(token: string, headers: Record<string, string>): void {
    if (this.closed) return
    // Ground SSO: browser session is cleared by UI opening links.logoutUrl (GET /api/auth/logout).
    // Host fetch cannot touch the system-browser cookie jar used by OIDC authorize.
    if (this.authMode === 'oidc') return
    const revocation = revokeAccount(this.origin, token, this.logoutPolicy,
      this.logoutLifetime.signal, { ...this.requestHeaders, ...headers }).finally(() => { this.revocations.delete(revocation) })
    this.revocations.add(revocation)
  }

  private invalidateDetails(): void {
    this.lastProfile = undefined
    this.detailsLifetime.abort()
    this.detailsLifetime = new AbortController()
  }

  private changed(identityOnly = false): void { for (const listener of this.listeners) listener(identityOnly) }

  private update(attempt: Attempt, value: Partial<SignInAttemptView>): void {
    const { authorizeUrl: _url, ...rest } = attempt.view
    attempt.view = { ...rest, ...value }
    this.changed()
  }

  private async run(session: AuthorizationSession, attempt: Attempt): Promise<void> {
    const webServer = this.ctx.get('webServer')
    if (webServer === undefined) throw new PlatformAuthError('protocol')
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    let authorizeId: string | undefined
    const code = Promise.withResolvers<string>()
    // Callback requests may precede initialization settlement; the rejection is observed immediately.
    void code.promise.catch(() => undefined)
    const deadline = new AbortController()
    let expiresAt = Date.now() + this.attemptTimeout
    const signal = AbortSignal.any([session.signal, deadline.signal])
    let timer = setTimeout(() =>{  deadline.abort() }, this.attemptTimeout)
    const abort = (): void => { code.reject(new PlatformAuthError('expired')) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      attempt.disposeCallback = this.ctx.effect(() => webServer.register({
        kind: 'exact', path: '/oauth/callback', handler: (req, res) => {
          let url: URL
          try { url = new URL(req.url ?? '/', 'http://127.0.0.1') }
          catch { res.writeHead(400, { 'cache-control': 'no-store' }).end(); return }
          const receivedCode = url.searchParams.get('code')
          const receivedState = url.searchParams.get('state') ?? ''
          const validState = Buffer.byteLength(receivedState) === Buffer.byteLength(state)
            && timingSafeEqual(Buffer.from(receivedState), Buffer.from(state))
          if (req.method !== 'GET' || url.pathname !== '/oauth/callback' || !validState || !receivedCode
            || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1) {
            res.writeHead(400, { 'cache-control': 'no-store' }).end(); return
          }
          if (signal.aborted || attempt.callback !== undefined || attempt.view.phase !== 'waiting-browser') {
            res.writeHead(410, { 'cache-control': 'no-store' }).end(); return
          }
          attempt.callback = res
          code.resolve(receivedCode)
        },
      }), 'account: browser callback')
      signal.throwIfAborted()
      const redirectUri = `${attempt.origin}/oauth/callback`
      if (this.authMode === 'oidc') {
        const endpoints = groundOidcEndpoints(this.origin, this.oidcApiPrefix)
        const nonce = randomBytes(32).toString('base64url')
        const authorizeUrl = buildAuthorizeUrl({
          authorizeEndpoint: endpoints.authorize,
          clientId: this.oidcClientId,
          redirectUri,
          state,
          nonce,
          codeChallenge: challenge,
        })
        signal.throwIfAborted()
        this.update(attempt, { phase: 'waiting-browser', authorizeUrl, expiresAt })
        const receivedCode = await code.promise
        signal.throwIfAborted()
        this.update(attempt, { phase: 'exchanging' })
        // Keep device record for parity with DeepSeek flow; Ground token exchange does not require it yet.
        await this.ctx.credentials.modifyRecord(DEVICE, current => Promise.resolve(current === undefined
          ? { kind: 'grant', payload: { id: randomUUID() } } : undefined))
        const token = await exchangeGroundCode({
          tokenEndpoint: endpoints.token,
          clientId: this.oidcClientId,
          code: receivedCode,
          redirectUri,
          codeVerifier: verifier,
          signal: AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeout)]),
        })
        if (Date.now() >= expiresAt) deadline.abort()
        signal.throwIfAborted()
        const sessionToken = groundSessionToken(token)
        try {
          // Prefer /api/auth/me with the durable Nest JWT (same token chat/models use).
          const claims = await fetchGroundSessionMe(
            this.origin,
            sessionToken,
            AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeout)]),
          )
          attempt.initialProfile = { token: sessionToken, value: { status: 'ready', value: claims } }
        } catch {
          try {
            const claims = await fetchGroundUserinfo(
              endpoints.userinfo,
              token.access_token,
              AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeout)]),
            )
            attempt.initialProfile = { token: sessionToken, value: { status: 'ready', value: claims } }
          } catch {
            // Optional profile enrichment must not discard a valid authorization.
          }
        }
        this.update(attempt, { phase: 'committing' })
        clearTimeout(timer)
        // Persist Nest console_handoff_token (7d). OIDC access_token is a ~5m id_token rejected by JwtGuard.
        try { await session.commit({ kind: 'grant', payload: { version: 1, token: sessionToken, issuer: this.origin } }) }
        catch { throw new PlatformAuthError('storage') }
        // After local grant is durable, finish the browser on this same callback response.
        // (A second /oauth/done hop would race route disposal — DeepSeek uses an external completion URL.)
        delete attempt.completionUrl
        const successHtml = groundOidcDoneHtml(attempt.locale, attempt.loginSource)
        const originalCallback = attempt.callback
        if (originalCallback !== undefined) {
          delete attempt.callback
          // The Web callback returns to its own origin. Desktop renders a confirmation.
          originalCallback.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",
            'referrer-policy': 'no-referrer',
          }).end(successHtml)
          // Account-scoped Desktop may replace this Host immediately after success.
          // Finish the browser response before publishing that transition.
          await streamPromises.finished(originalCallback, { cleanup: true }).catch(() => undefined)
        }
      } else {
      const init = initialization.safeParse(await this.request('auth_init', {
        code_challenge: challenge, code_challenge_method: 'S256', state, redirect_uri: redirectUri, locale: attempt.locale,
        login_source: attempt.loginSource,
      }, signal, attempt.clientHeaders), { reportInput: true })
      if (!init.success) this.rejectPayload('auth_init', init.error)
      const authorizeUrl = browserUrl(init.data.authorize_url, this.origin, '/mmp/authorize', this.rewriteBrowserOrigin)
      authorizeId = init.data.authorize_id
      signal.throwIfAborted()
      const now = Date.now()
      expiresAt = Math.min(expiresAt, now + init.data.expires_in * 1000)
      const remaining = expiresAt - now
      if (remaining <= 0) { deadline.abort(); signal.throwIfAborted() }
      clearTimeout(timer)
      timer = setTimeout(() =>{  deadline.abort() }, remaining)
      this.update(attempt, { phase: 'waiting-browser', authorizeUrl, expiresAt })
      const receivedCode = await code.promise
      signal.throwIfAborted()
      this.update(attempt, { phase: 'exchanging' })
      const deviceRecord = await this.ctx.credentials.modifyRecord(DEVICE, current => Promise.resolve(current === undefined
        ? { kind: 'grant', payload: { id: randomUUID() } } : undefined))
      if (deviceRecord?.kind !== 'grant') throw new PlatformAuthError('storage')
      const identity = device.parse(deviceRecord.payload)
      const result = exchange.safeParse(await this.request('auth_exchange', {
        code: receivedCode, code_verifier: verifier, redirect_uri: redirectUri,
        device_id: identity.id, device_model: `${platform()}-${arch()}`, os_version: deviceOsVersion(),
      }, signal, attempt.clientHeaders), { reportInput: true })
      if (!result.success) this.rejectPayload('auth_exchange', result.error)
      const completionUrl = new URL(browserUrl(result.data.authorized_url, this.origin, '/mmp/authorized', this.rewriteBrowserOrigin))
      completionUrl.searchParams.set('login_source', attempt.loginSource)
      attempt.completionUrl = completionUrl.href
      if (Date.now() >= expiresAt) deadline.abort()
      signal.throwIfAborted()
      if (result.data.user != null) {
        try { attempt.initialProfile = { token: result.data.token, value: { status: 'ready', value: profile(result.data.user) } } }
        catch {
          // Invalid optional user data falls back to current without discarding a valid authorization.
        }
      }
      this.update(attempt, { phase: 'committing' })
      clearTimeout(timer)
      try { await session.commit({ kind: 'grant', payload: { version: 1, token: result.data.token, issuer: this.origin } }) }
      catch { throw new PlatformAuthError('storage') }
      }
    } catch (error) {
      if (deadline.signal.aborted) throw new PlatformAuthError('expired')
      throw error
    } finally {
      if (signal.aborted && authorizeId !== undefined) this.cancelRequest(authorizeId, verifier, attempt.clientHeaders)
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      // begin() settles the browser response and removes only this attempt’s route.
    }
  }

  private rejectPayload(stage: string, error: z.ZodError): never {
    console.error('[deepseek-account] payload rejected', {
      stage, issues: error.issues.map(issue => ({
        path: issue.path, code: issue.code,
        receivedType: issue.input === null ? 'null' : Array.isArray(issue.input) ? 'array' : typeof issue.input,
      })),
    })
    throw new PlatformAuthError('protocol')
  }

  private cancelRequest(authorizeId: string, verifier: string, headers: Record<string, string>): void {
    if (this.closed) return
    const cancellation = this.request('auth_cancel', { authorize_id: authorizeId, code_verifier: verifier },
      this.logoutLifetime.signal, headers).then(() => undefined, () => {
      // Remote cancellation failures never reverse local cancellation or expose verifier diagnostics.
    }).finally(() => { this.revocations.delete(cancellation) })
    this.revocations.add(cancellation)
  }

  private request(method: string, body: unknown, signal: AbortSignal, headers: Record<string, string>): Promise<unknown> {
    return requestPlatform(this.origin, method, body,
      AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeout)]), { ...this.requestHeaders, ...headers })
  }

  private finishFailedCallback(attempt: Attempt): void {
    if (attempt.loginSource === 'web') {
      const nonce = randomBytes(16).toString('base64url')
      const message = attempt.locale === 'zh_CN' ? '登录失败，请关闭此标签页并在原页面重试。'
        : 'Sign-in failed. Close this tab and try again in the original tab.'
      attempt.callback?.writeHead(200, {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
        'referrer-policy': 'no-referrer',
      }).end(`<!doctype html><html lang="${attempt.locale === 'zh_CN' ? 'zh-CN' : 'en'}"><meta charset="utf-8"><title>${message}</title>`
        + `<body><p>${message}</p><script nonce="${nonce}">window.close()</script></body></html>`)
    } else {
      // Native account subscribers focus the login window; retain the browser’s Platform document.
      attempt.callback?.writeHead(204, { 'cache-control': 'no-store' }).end()
    }
  }
}
export default PlatformAccount

/** OS identification shared by login and credential-free identity reads. */
function deviceOsVersion(): string {
  return `${platform()} ${release()}`
}
