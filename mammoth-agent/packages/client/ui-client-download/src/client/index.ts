/** Web-only desktop-download action registered into the sidebar foot. */
import type { Context as ClientContext } from '@mammoth-ai/cordis'
import type {} from '@mammoth-ai/mmp-client-locale/client'
import type {} from '@mammoth-ai/mmp-client-ui-renderer/client'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar/client'
import { ClientDownloadButton } from './ClientDownloadButton.tsx'
import { de, en, es, fr, ja, pt, ru, zh, type ClientDownloadKey } from './locales.ts'

declare module '@mammoth-ai/mmp-client-ui-slots' {
  interface LocaleNamespaceMap { clientDownload: ClientDownloadKey }
}

/** Required services: locale dictionaries and the UI slot registry. */
export const inject = ['locale', 'slots']

/**
 * Register the download action only in a plain browser: the Desktop client
 * exposes `window.mmpDesktop`, and downloading a client inside the client is
 * meaningless.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: ClientContext): void {
  if ('mmpDesktop' in globalThis) return
  const t = ctx.locale.bind('clientDownload')
  ctx.effect(() => ctx.locale.register('clientDownload', { en, zh, ja, es, fr, de, ru, pt }), 'client-download: locale')
  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action', id: 'client-download', order: 0,
      label: () => t('action'), locale: 'clientDownload',
    }, ClientDownloadButton)),
    'client-download: sidebar action')
}
