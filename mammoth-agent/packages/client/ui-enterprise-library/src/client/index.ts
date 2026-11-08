/** Browser library panel, composer chips, and the + / @ pickers. */
import type { Context as ClientContext } from '@mammoth-ai/cordis'
import type {} from '@mammoth-ai/mmp-client-locale/client'
import type {} from '@mammoth-ai/mmp-client-ui-commands/client'
import type {} from '@mammoth-ai/mmp-client-ui-input-trigger/client'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import type {} from '@mammoth-ai/mmp-client-ui-renderer/client'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar/client'
import { IconPaperclipOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { MainPanelId } from '@mammoth-ai/mmp-client-ui-layout/client'
import type { CommandUiContract } from '@mammoth-ai/mmp-client-ui-commands/client'
import type { InputTriggerServiceContract, InputTriggerSource } from '@mammoth-ai/mmp-client-ui-input-trigger/client'
import { fetchLibraryItems, fetchLibrarySource } from './api.ts'
import { LibraryChips } from './LibraryChips.tsx'
import { LibraryIcon } from './LibraryIcon.tsx'
import { LibraryPanel } from './LibraryPanel.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type LibraryKey } from './locales.ts'
import { choiceBlock, libraryRef, librarySourceText, parseLibraryRef, type LibraryChoice } from './selection.ts'
import { createChipStore } from './store.ts'

declare module '@mammoth-ai/mmp-client-ui-slots' {
  interface LocaleNamespaceMap { enterpriseLibrary: LibraryKey }
}

const PANEL_ID = 'library' as MainPanelId

/** Required browser services. */
export const inject = ['locale', 'slots', 'commandUi', 'inputTriggers', 'layout']

function originFromEnv(env: Record<string, string | undefined>, fallback: string): string {
  const configured = env.MMP_GROUND_ORIGIN?.trim()
  return (configured || fallback).replace(/\/$/, '')
}

/**
 * Register the library panel, the composer chips, the + command, and the @ source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'enterprise-library: dictionaries')
  const t = ctx.locale.bind(NS)
  const chips = createChipStore()
  const origin = originFromEnv(process.env, '')
  const use = (sessionId: string, item: LibraryChoice): { sent: false } => chips.add(sessionId, item)
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      origin,
      fetchImpl: fetch,
      onUse: (item: LibraryChoice) => { use('panel', item) },
    }),
  }, LibraryPanel)), 'enterprise-library: panel')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 15,
    locale: NS,
    label: () => t('panel'),
  }, LibraryIcon)), 'enterprise-library: icon')
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'enterprise-library',
    order: 5,
    locale: NS,
    inject: () => ({ chips }),
  }, LibraryChips)), 'enterprise-library: chips')
  ctx.inject(['commandUi'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    scope.effect(() => command.register({
      name: 'library',
      label: () => t('command'),
      description: () => t('commandDescription'),
      icon: IconPaperclipOutlineRegular,
      available: () => true,
      ui: {
        kind: 'popupSelect',
        searchLabels: () => ({ placeholder: t('searchPlaceholder'), empty: t('empty'), noResults: t('noResults') }),
        options: async (_session, signal) => {
          const items = await fetchLibraryItems(origin, 'mine', '', fetch, signal)
          const shared = await fetchLibraryItems(origin, 'shared', '', fetch, signal)
          return [...items, ...shared].map(item => {
            const block = choiceBlock(item)
            const option: { id: string; label: string; detail?: string; badge?: string } = {
              id: item.versionId ? libraryRef({ nodeId: item.nodeId, versionId: item.versionId }) : item.nodeId,
              label: item.name,
            }
            if (block.disabled) {
              option.detail = item.parseReason ?? t('unready')
              option.badge = t('unready')
            }
            return option
          })
        },
        onSelect: (option, session) => {
          const parsed = parseLibraryRef(option.id)
          if (!parsed) return
          const item: LibraryChoice = {
            nodeId: parsed.nodeId,
            versionId: parsed.versionId,
            versionNo: 1,
            name: option.label,
            kind: 'FILE',
            parseStatus: option.badge ? 'DOWNLOAD_ONLY' : 'READY',
            parseReason: option.detail ?? null,
          }
          use(session.sessionId, item)
        },
      },
    }), 'enterprise-library: command')
  })
  const source: InputTriggerSource = {
    trigger: '@',
    name: 'library',
    order: 20,
    async candidates(_session, { query, signal }) {
      const items = await fetchLibraryItems(origin, 'mine', query, fetch, signal)
      return items.flatMap(item => {
        if (choiceBlock(item).disabled || item.versionId == null) return []
        return [{
          name: libraryRef({ nodeId: item.nodeId, versionId: item.versionId }),
          label: item.name,
          icon: 'file' as const,
          value: item.nodeId,
        }]
      })
    },
    onPick(pick) {
      if (pick.action === 'drill') return undefined
      const value = typeof pick.candidate.value === 'string' ? pick.candidate.value : pick.candidate.name
      const parsed = parseLibraryRef(pick.candidate.name) ?? { nodeId: value, versionId: pick.candidate.name }
      return {
        insert: {
          source: 'library',
          ref: libraryRef({ nodeId: parsed.nodeId, versionId: parsed.versionId }),
          label: pick.candidate.label ?? pick.candidate.name,
          appearance: 'file' as const,
          clipboardText: pick.candidate.label ?? pick.candidate.name,
        },
      }
    },
    codec: {
      clipboardText: ref => parseLibraryRef(ref)?.versionId ?? ref,
      serialize: async (ref, signal) => {
        const parsed = parseLibraryRef(ref)
        if (!parsed) throw new Error('library reference is not a real version')
        const opened = await fetchLibrarySource(origin, parsed.nodeId, parsed.versionId, fetch, signal)
        if (!opened.quote || !opened.locator) throw new Error('library source has no stored excerpt')
        return librarySourceText({
          name: opened.name,
          versionId: opened.versionId,
          locator: opened.locator,
          quote: opened.quote,
        })
      },
    },
  }
  const triggers = ctx.get('inputTriggers') as InputTriggerServiceContract | undefined
  if (triggers) ctx.effect(() => triggers.registerSource(source), 'enterprise-library: mention')
}
