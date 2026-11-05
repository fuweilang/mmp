/** Keeps Electron's private Platform credentials bound to the active account provider. */
import type { Context } from '@mammoth-ai/cordis'
import type { PlatformSession } from '@mammoth-ai/mmp-deepseek-account'

/**
 * Publish account sessions for each provider lifetime, clearing them on removal or stream termination.
 * @param ctx - Host context owning the account dependency subscription.
 * @param publish - Synchronous private IPC delivery; never forwards credentials to the renderer.
 */
export function installPlatformSessionPublisher(ctx: Context, publish: (session: PlatformSession | null) => void): void {
  ctx.inject(['deepseekAccount'], (accountCtx) => {
    const account = accountCtx.deepseekAccount
    accountCtx.effect(() => {
      const lifetime = new AbortController()
      let signedIn = false
      let needsIdentity = false
      let refreshing: Promise<void> | undefined
      const refresh = (): Promise<void> => refreshing ??= (async () => {
        try {
          if (signedIn) {
            // Restored credentials have no cached profile yet. Resolve the verified
            // account ID before the shell opens any persistent account data.
            try {
              await account.getProfile({ version: process.env.MMP_CLIENT_VERSION ?? 'desktop', locale: 'zh-CN',
                timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 })
            } catch { /* A transient profile failure can be retried without signing out. */ }
          }
          if (lifetime.signal.aborted) return
          const session = await account.getPlatformSession()
          const current = await account.getState()
          // Committing the credential precedes flushing /oauth/callback. The
          // succeeded notification will retry after the browser response finishes.
          if (current.attempt?.phase === 'committing') return
          if (!lifetime.signal.aborted) {
            needsIdentity = signedIn && session?.userId == null
            publish(session)
          }
        } catch {
          needsIdentity = signedIn
          if (!lifetime.signal.aborted) publish(null)
        }
      })().finally(() => { refreshing = undefined })
      const retry = setInterval(() => {
        if (needsIdentity && !lifetime.signal.aborted) void refresh()
      }, 5000)
      retry.unref()
      const updates = (async () => {
        try {
          for await (const state of account.watch(lifetime.signal, true)) {
            if (lifetime.signal.aborted) break
            signedIn = state.status === 'credential-stored'
            await refresh()
          }
        } catch {
          if (!lifetime.signal.aborted) accountCtx.logger('desktop-platform').warn('Account session subscription failed')
        } finally {
          if (!lifetime.signal.aborted) publish(null)
        }
      })()
      return async () => {
        lifetime.abort()
        clearInterval(retry)
        publish(null)
        await updates
        await refreshing
      }
    })
  })
}
