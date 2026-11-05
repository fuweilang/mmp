/**
 * 猛犸 Ground chat gateway: OpenAI-compatible provider authenticated by SSO grant.
 * @module @mammoth-ai/mmp-llm-ground
 */
import type {} from '@mammoth-ai/cordis-plugin-loader'
import type { Context } from '@mammoth-ai/cordis'
import type {} from '@mammoth-ai/mmp-deepseek-account'
import { Config, resolveGroundOrigin } from './config.ts'
import { LlmError } from '@mammoth-ai/mmp-llm'
import { GroundLlmAdapter } from './adapter.ts'

export { Config } from './config.ts'
export const name = 'llm-ground'
export const inject = ['llm']

const LOG = '[llm-ground]'

export function apply(ctx: Context, config: Config): void {
  const originRaw = process.env.GROUND_PUBLIC_ORIGIN
    || process.env.MMP_PLATFORM_ORIGIN
    || config.groundOrigin
  const origin = resolveGroundOrigin(originRaw)
  const providerId = config.providerId.trim() || 'mammoth-ground'
  const displayName = config.displayName.trim() || '猛犸云端'

  const adapter = new GroundLlmAdapter({
    providerId,
    displayName,
    origin,
    account: () => ctx.get('deepseekAccount'),
  })

  // Cloud route only: do not register as configurable (no BYOK / settings key form).
  ctx.llm.registerAdapter([providerId], adapter)
  ctx.effect(() => {
    const interval = config.catalogPollIntervalMs ?? 15000
    if (interval === 0) return () => {}
    const abort = new AbortController()
    let pending: Promise<void> | undefined
    const timer = setInterval(() => {
      if (pending !== undefined) return
      pending = adapter.observeCatalog(abort.signal).then(changed => {
        if (changed && !abort.signal.aborted) ctx.emit('llm/models-updated', providerId)
      }).catch((error: unknown) => {
        if (abort.signal.aborted || (error instanceof LlmError && ['ACCOUNT_SIGN_IN_REQUIRED','ACCOUNT_TOKEN_INVALID'].includes(error.code))) return
        ctx.logger.warn('Ground model availability refresh failed; the cloud gateway still verifies every request.')
      }).finally(() => { pending = undefined })
    }, interval)
    timer.unref()
    return async () => { clearInterval(timer); abort.abort(); await pending }
  })
  console.info(LOG, `registered provider=${providerId} origin=${origin}`)
}
