/** Account-owned data homes; legacy shared data is never adopted implicitly. */
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { PlatformSession } from '@mammoth-ai/mmp-deepseek-account'

/** Resolve an account directory only from the provider's verified profile identity. */
export function accountDataHome(baseHome: string, session: PlatformSession | null, anonymousHome: string): string {
  if (session?.userId == null) return anonymousHome
  let tenantId: string | null = null
  // Ground grants carry the current enterprise. The provider verified this grant
  // with /auth/me before publishing its profile ID; decoding here is not authentication.
  if (session.token.split('.').length === 3) {
    const claims: unknown = JSON.parse(Buffer.from(session.token.split('.')[1]!, 'base64url').toString('utf8'))
    if (typeof claims !== 'object' || claims === null || !('sub' in claims) || claims.sub !== session.userId
      || ('tenantId' in claims && claims.tenantId !== null && typeof claims.tenantId !== 'string')) {
      throw new Error('Desktop account identity does not match its grant')
    }
    tenantId = 'tenantId' in claims && typeof claims.tenantId === 'string' ? claims.tenantId : null
  }
  const key = createHash('sha256').update(JSON.stringify([session.origin, tenantId, session.userId])).digest('hex')
  return join(baseHome, 'desktop-accounts', key)
}

/** Serialize whole-Host replacement; failed or obsolete transitions never reveal a workspace. */
export class DesktopAccountData {
  readonly anonymousHome: string
  home: string
  private applied: string
  private desired: string
  private pending: Promise<void> | undefined
  constructor(private readonly baseHome: string, private readonly hooks: {
    block(): void
    restart(): Promise<void>
    resume(): Promise<void>
    failed(error: unknown): void
  }) {
    this.anonymousHome = join(baseHome, 'desktop-signed-out', randomUUID())
    this.home = this.applied = this.desired = this.anonymousHome
  }
  get switching(): boolean { return this.pending !== undefined }
  get settled(): boolean { return this.applied === this.desired }
  /** Wait until the applied home matches the desired one, including a switch that starts while waiting. */
  async whenSettled(): Promise<void> {
    while (this.pending !== undefined) await this.pending
  }
  get anonymous(): boolean { return this.home === this.anonymousHome }
  update(session: PlatformSession | null): void {
    let desired: string
    try { desired = accountDataHome(this.baseHome, session, this.anonymousHome) }
    catch (error) { this.hooks.block(); this.hooks.failed(error); return }
    if (desired === this.desired && (this.pending !== undefined || this.applied === desired)) return
    this.desired = desired
    this.hooks.block()
    this.pending ??= Promise.resolve().then(async () => {
      do {
        while (this.applied !== this.desired) {
          this.home = this.desired
          await this.hooks.restart()
          this.applied = this.home
        }
        await this.hooks.resume()
      } while (this.applied !== this.desired)
    }).catch(error => { this.hooks.failed(error) }).finally(() => { this.pending = undefined })
  }
}
