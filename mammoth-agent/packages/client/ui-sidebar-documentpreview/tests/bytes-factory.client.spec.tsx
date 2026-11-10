// @vitest-environment jsdom
/** The registered root Factory renders real content without minting a Session or tab. */
import { afterEach, expect, it } from 'vitest'
import { SlotTestRuntime } from '@mammoth-ai/mmp-client-test-runtime'
import { LocaleRuntime } from '@mammoth-ai/mmp-client-locale/client'
import type { PropsRenderFactories } from '@mammoth-ai/mmp-client-ui-slots'
import { Config } from '../src/config.ts'
import { apply } from '../src/client/bytes/index.tsx'
import { en } from '../src/client/locales.ts'
import { en as markdown } from '../src/client/markdown/locales.ts'

let runtime: SlotTestRuntime | undefined
afterEach(async () => { await runtime?.dispose(); runtime = undefined })

const bytes = new TextEncoder().encode('# Standalone document\n\n- Actual list')
function Frame({ renderFactorySlot }: PropsRenderFactories) {
  return renderFactorySlot('document.preview.bytes', { name: 'document.md', bytes, mimeType: 'text/markdown' })
}

it('mounts localized document content at root and removes the Factory with its plugin', async () => {
  const rt = await SlotTestRuntime.create()
  runtime = rt
  const locale = new LocaleRuntime(rt.ctx)
  rt.ctx.provide('locale', locale)
  rt.slots.installLocale(locale)
  locale.register('sidebarDocumentPreview', { en, zh: en })
  locale.register('documentMarkdown', { en: markdown, zh: markdown })
  await rt.root.declare({}, Frame)
  const feature = await rt.mount({ inject: ['slots', 'locale'], apply: ctx => { apply(ctx, Config({}).excel) } })
  const view = rt.renderRoot()
  expect(await view.findByRole('heading', { name: 'Standalone document' })).toBeDefined()
  expect(view.getByRole('listitem').textContent).toBe('Actual list')
  expect(rt.factoryOf('document.preview.bytes')).toMatchObject({ name: 'document.preview.bytes', scope: 'root', locale: 'sidebarDocumentPreview' })
  await feature.dispose()
  expect(() => rt.factoryOf('document.preview.bytes')).toThrow('no definition')
  expect(view.queryByRole('heading')).toBeNull()
})
