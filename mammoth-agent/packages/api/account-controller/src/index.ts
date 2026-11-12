/** Authenticated Remote operations for account UI consumers. */
import { Context } from '@mammoth-ai/cordis'
import { Remote, TypertRemoteService } from '@mammoth-ai/mmp-typert-protocol'
import { isRunningAccountTask } from '@mammoth-ai/mmp-deepseek-account'
import type {} from '@mammoth-ai/mmp-agent'
import type { AccountBonusBatch, AccountBonusOrderId, AccountClientMetadata, AccountDetails, AccountUserId, EnterpriseRegisterInput, PasswordSignInResult, SmsSendResult } from '@mammoth-ai/mmp-deepseek-account/types'
import type { AccountView, SignInAttemptId } from './types.ts'

/** Account commands and reconnect-safe state stream. */
export class AccountController extends TypertRemoteService {
  static inject = ['deepseekAccount', 'agents']
  /** @param ctx - Host with the account provider mounted. */
  constructor(ctx: Context) { super(ctx, 'accountController', { namespace: 'account' }) }
  /**
   * Read the safe account projection.
   * @returns current account and attempt state.
   */
  @Remote
  getState(): Promise<AccountView> { return this.ctx.deepseekAccount.getState() }
  /**
   * Query display-safe Platform profile data.
   * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
   * @returns profile outcome, or null when the account grant is absent or changed.
   */
  @Remote
  getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null> {
    return this.ctx.deepseekAccount.getProfile(client)
  }
  /**
   * Query Platform recharge-wallet balances.
   * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
   * @returns balance outcome, or null when the account grant is absent or changed.
   */
  @Remote
  getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null> {
    return this.ctx.deepseekAccount.getBalance(client)
  }
  /**
   * Query the granted bonuses Platform has not yet recorded as displayed.
   * @param client - identity of the requesting UI; its language selects the server-authored message.
   * @returns bonuses with their account, or null when the account grant is absent or changed.
   */
  @Remote
  getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null> {
    return this.ctx.deepseekAccount.getUnnotifiedBonuses(client)
  }
  /**
   * Record one displayed bonus as notified for the account it belongs to.
   * @param accountId - account the notification was read for.
   * @param orderId - granted bonus order the user saw.
   * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
   * @returns true once Platform records the acknowledgement; false when the account is absent or changed.
   */
  @Remote
  ackBonusNotified(accountId: AccountUserId, orderId: AccountBonusOrderId, client: AccountClientMetadata): Promise<boolean> {
    return this.ctx.deepseekAccount.ackBonusNotified(accountId, orderId, client)
  }
  /**
   * Begin browser sign-in.
   * @param client - identity of the requesting UI, captured by a new attempt.
   * @param callbackOrigin - browser-accessible loopback HTTP origin.
   * @param loginSource - initiating UI, used to return from a failed exchange.
   * @returns a new or already-active login attempt.
   */
  @Remote
  startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<AccountView> {
    return this.ctx.deepseekAccount.startSignIn(client, callbackOrigin, loginSource)
  }
  /**
   * Sign the desktop client in with a phone and password. Does not open a browser.
   * @param client - identity of the requesting UI.
   * @param phone - enterprise phone number.
   * @param password - account password, forwarded to Ground and not stored.
   * @returns whether the local session was stored.
   */
  @Remote
  signInWithPassword(client: AccountClientMetadata, phone: string, password: string): Promise<PasswordSignInResult> {
    return this.ctx.deepseekAccount.signInWithPassword(client, phone, password)
  }
  /**
   * Ask Ground to send a login or registration code.
   * @param phone - enterprise phone number.
   * @param scene - login or register.
   * @returns the cooldown. A local mock may include the code.
   */
  @Remote
  sendSmsCode(phone: string, scene: 'login' | 'register'): Promise<SmsSendResult> {
    return this.ctx.deepseekAccount.sendSmsCode(phone, scene)
  }
  /**
   * Sign the desktop client in with a phone and SMS code. Does not open a browser.
   * @param client - identity of the requesting UI.
   * @param phone - enterprise phone number.
   * @param smsCode - six-digit code, forwarded to Ground and not stored.
   * @returns whether the local session was stored.
   */
  @Remote
  signInWithSms(client: AccountClientMetadata, phone: string, smsCode: string): Promise<PasswordSignInResult> {
    return this.ctx.deepseekAccount.signInWithSms(client, phone, smsCode)
  }
  /**
   * Register on the desktop client without opening a browser or setting its cookie.
   * @param client - identity of the requesting UI.
   * @param input - enterprise registration fields. The password is not returned.
   * @returns whether the local grant was stored.
   */
  @Remote
  registerWithPassword(
    client: AccountClientMetadata,
    input: EnterpriseRegisterInput,
  ): Promise<PasswordSignInResult> {
    return this.ctx.deepseekAccount.registerWithPassword(client, input)
  }
  /**
   * Mark the current account's one-time welcome as seen.
   * @returns true once the account flag is stored.
   */
  @Remote
  acknowledgeWelcome(): Promise<boolean> {
    return this.ctx.deepseekAccount.acknowledgeWelcome()
  }
  /**
   * Cancel the named local attempt.
   * @param attemptId - attempt to cancel.
   * @returns settled cancellation or commit state.
   */
  @Remote
  cancelSignIn(attemptId: SignInAttemptId): Promise<AccountView> { return this.ctx.deepseekAccount.cancelSignIn(attemptId) }
  /**
   * Inspect the latest logged request providers of running tasks, including tools and retries.
   * @returns whether running work has a latest request context on the account route.
   */
  @Remote
  hasRunningAccountTasks(): boolean {
    return this.ctx.agents.list().some(isRunningAccountTask)
  }
  /**
   * Remove the local account grant and revoke it through Platform in the background, without deleting API keys.
   * @param client - identity of the requesting UI, captured for the background revocation retries.
   * @returns state after removing the local account grant.
   */
  @Remote
  signOut(client: AccountClientMetadata): Promise<AccountView> { return this.ctx.deepseekAccount.signOut(client) }
  /**
   * Subscribe to credential expiry without replaying prior notifications.
   * @param signal - stream lifetime.
   * @returns notifications emitted while subscribed.
   */
  @Remote({ mode: 'stream' })
  async *watchExpiry(signal: AbortSignal): AsyncIterable<'session-expired'> {
    let pending = 0
    let wake: (() => void) | undefined
    const stop = this.ctx.on('deepseek-account/session-expired', () => { pending++; wake?.() })
    const abort = (): void => { wake?.() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        if (pending > 0) { pending--; yield 'session-expired'; continue }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      stop()
      signal.removeEventListener('abort', abort)
    }
  }
  /**
   * Stream the safe account projection.
   * @param signal - stream lifetime.
   * @returns initial snapshot and subsequent changes.
   */
  @Remote({ mode: 'stream' })
  watch(signal: AbortSignal): AsyncIterable<AccountView> { return this.ctx.deepseekAccount.watch(signal) }
}
export default AccountController
