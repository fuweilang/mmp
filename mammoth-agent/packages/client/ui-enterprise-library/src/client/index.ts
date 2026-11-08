/** Browser library panel, composer chips, and the + / @ pickers. */
import type {} from '@mammoth-ai/mmp-client-ui-workspace/client'
import type {} from '@mammoth-ai/mmp-client-ui-session/client'
import type {} from '@mammoth-ai/mmp-api-session-controller/client'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { Context as ClientContext } from '@mammoth-ai/cordis'
import type {} from '@mammoth-ai/mmp-client-locale/client'
import type {} from '@mammoth-ai/mmp-client-ui-commands/client'
import type {} from '@mammoth-ai/mmp-client-ui-input-trigger/client'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import type {} from '@mammoth-ai/mmp-client-ui-renderer/client'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar/client'
import { IconPaperclipOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { HostObservable } from '@mammoth-ai/mmp-client-ui-slots'
import type { MainPanelId } from '@mammoth-ai/mmp-client-ui-layout/client'
import type { CommandUiContract } from '@mammoth-ai/mmp-client-ui-commands/client'
import type { InputTriggerServiceContract, InputTriggerSource } from '@mammoth-ai/mmp-client-ui-input-trigger/client'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import { fetchLibraryItems, fetchLibrarySource, libraryRequest } from './api.ts'
import { LibraryIcon } from './LibraryIcon.tsx'
import { LibraryPanel, type LibrarySourceRequest } from './LibraryPanel.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type LibraryKey } from './locales.ts'
import {
  attachLibraryReference, choiceBlock, libraryRef, librarySourceText, parseLibraryRef, type LibraryChoice,
} from './selection.ts'

declare module '@mammoth-ai/mmp-client-ui-slots' {
  interface LocaleNamespaceMap { enterpriseLibrary: LibraryKey }
}

const PANEL_ID = 'library' as MainPanelId

/** Required browser services. */
export const inject = ['locale', 'slots', 'commandUi', 'inputTriggers', 'layout', 'sessions', 'conversation', 'uiSession', 'uiWorkspace']

/**
 * Register the library panel, the composer chips, the + command, and the @ source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'enterprise-library: dictionaries')
  const t = ctx.locale.bind(NS)
  const origin = ''
  let requestedSource: LibrarySourceRequest | null = null
  const sourceListeners = new Set<() => void>()
  const publishSource = (next: LibrarySourceRequest | null) => { requestedSource = next; for (const listener of sourceListeners) listener() }
  const sourceRequests: HostObservable<LibrarySourceRequest | null> = {
    getSnapshot: () => requestedSource,
    subscribe: listener => { sourceListeners.add(listener); return () => { sourceListeners.delete(listener) } },
  }
  ctx.effect(() => () => { sourceListeners.clear(); requestedSource = null }, 'enterprise-library: source lifetime')
  const attach = (sessionId: SessionId, item: LibraryChoice): { sent: false; attached: boolean } => {
    const binding = ctx.sessions.binding(sessionId)
    if (!binding) throw new Error(t('sessionUnavailable'))
    const input = ctx.conversation.input.for(binding.ctx)
    if (item.versionId && input.state.getSnapshot().occurrences.some(ref => ref.source === 'library' && ref.ref === libraryRef({ nodeId: item.nodeId, versionId: item.versionId! }))) return { sent: false, attached: true }
    const result = attachLibraryReference(input, item)
    if (!result.attached) throw new Error(t('attachFailed'))
    // Receipt follows a real successful draft insertion, not candidate selection/search.
    void libraryRequest(origin, 'used', 'POST', { nodeId: item.nodeId, versionId: item.versionId }, fetch).catch(() => undefined)
    return result
  }
  let attachmentQueue: Promise<void> = Promise.resolve()
  const attachMany = (items: readonly LibraryChoice[]): Promise<void> => {
    const next = attachmentQueue.catch(() => undefined).then(async () => {
      const current = ctx.uiSession.adapter.current.getSnapshot().props.sessionId
      let id = typeof current === 'string' && current ? current as SessionId : undefined
      if (!id) {
        const workspaceId = ctx.uiWorkspace.workspaceForNewSession()
        if (!workspaceId) throw new Error(t('workspaceRequired'))
        id = await ctx.sessions.create({ workspaceId, agentPreset: 'standard' })
      }
      const reference = ctx.sessions.retain(id, { source: 'controllerOperation' })
      try {
        await reference.ready
        for (const item of items) attach(id, item)
        ctx.uiWorkspace.openSession(id)
        ctx.layout.selectPanel(null)
      } finally { reference.release() }
    })
    attachmentQueue = next
    return next
  }
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      origin,
      hooks: { sourceRequest: sourceRequests },
      clearSourceRequest: () => { publishSource(null) },
      fetchImpl: fetch,
      onUse: (item: LibraryChoice) => attachMany([item]),
      onUseMany: attachMany,
    }),
  }, LibraryPanel)), 'enterprise-library: panel')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 15,
    locale: NS,
    label: () => t('panel'),
  }, LibraryIcon)), 'enterprise-library: icon')
  ctx.inject(['commandUi'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    const choices = new Map<string, LibraryChoice>()
    scope.effect(() => command.register({
      name: 'library',
      label: () => t('command'),
      description: () => t('commandDescription'),
      icon: IconPaperclipOutlineRegular,
      available: () => true,
      ui: {
        kind: 'popupSelect',
        multiple: true,
        confirmLabel: t('selected'),
        cancelLabel: t('cancel'),
        presentation: 'file-picker',
        searchLabels: () => ({ placeholder: t('searchPlaceholder'), empty: t('empty'), noResults: t('noResults') }),
        options: async (_session, signal) => {
          const items = await fetchLibraryItems(origin, 'mine', '', fetch, signal, undefined, true)
          const shared = await fetchLibraryItems(origin, 'shared', '', fetch, signal, undefined, true)
          if (signal.aborted) return []
          choices.clear()
          for (const item of [...items, ...shared]) choices.set(item.versionId ? libraryRef({ nodeId: item.nodeId, versionId: item.versionId }) : item.nodeId, item)
          return [...choices.entries()].map(([id, item]) => {
            const block = choiceBlock(item)
            const option: { id: string; label: string; detail?: string; badge?: string; disabled?: boolean } = {
              id,
              label: item.name,
            }
            if (block.disabled) {
              option.disabled = true
              option.detail = item.parseReason ?? t('unready')
              option.badge = t('unready')
            }
            return option
          })
        },
        onSelect: (option, session) => {
          const item = choices.get(option.id)
          if (!item || choiceBlock(item).disabled) return
          attach(session.sessionId, item)
        },
      },
    }), 'enterprise-library: command')
  })
  const source: InputTriggerSource = {
    trigger: '@',
    name: 'library',
    order: 20,
    async candidates(_session, { query, signal }) {
      const lists = await Promise.all(['mine', 'shared'].map(view => fetchLibraryItems(origin, view as 'mine' | 'shared', query, fetch, signal, undefined, true)))
      const items = lists.flat()
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
    openReference(_session, reference) {
      const parsed = parseLibraryRef(reference.ref)
      if (!parsed) return false
      publishSource(parsed)
      ctx.layout.selectPanel(PANEL_ID)
      return true
    },
    codec: {
      clipboardText: ref => parseLibraryRef(ref)?.versionId ?? ref,
      serialize: async (ref, signal) => {
        const parsed = parseLibraryRef(ref)
        if (!parsed) throw new Error('library reference is not a real version')
        const opened = await fetchLibrarySource(origin, parsed.nodeId, parsed.versionId, fetch, signal, 'prepare')
        if (!opened.quote || !opened.locator) throw new Error('library source has no stored excerpt')
        return librarySourceText({
          nodeId: parsed.nodeId,
          name: opened.name,
          versionId: opened.versionId,
          locator: opened.locator,
          quote: opened.quote,
          truncated: opened.truncated,
          truncationNote: opened.truncationNote,
        })
      },
    },
  }
  const triggers = ctx.get('inputTriggers') as InputTriggerServiceContract | undefined
  if (triggers) ctx.effect(() => triggers.registerSource(source), 'enterprise-library: mention')
}
