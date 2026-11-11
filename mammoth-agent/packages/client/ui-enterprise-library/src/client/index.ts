/** Browser library panel, composer chips, and the + / @ pickers. */
import type {} from '@mammoth-ai/mmp-client-ui-workspace/client'
import type {} from '@mammoth-ai/mmp-client-ui-session/client'
import type {} from '@mammoth-ai/mmp-api-session-controller/client'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
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
import type { InputTriggerSource } from '@mammoth-ai/mmp-client-ui-input-trigger/client'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import { fetchLibraryItems, libraryRequest } from './api.ts'
import { parseLibraryCitationLink } from './citation-link.ts'
import { LibraryIcon } from './LibraryIcon.tsx'
import { createLibraryNavigationMeasurement } from './useLibrarySidebarResize.ts'
import { LibraryPanel, type LibrarySourceRequest } from './LibraryPanel.tsx'
import { LibraryPickerOverlay, type LibraryPickerRequest } from './LibraryPickerOverlay.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type LibraryKey } from './locales.ts'
import {
  attachLibraryReference, choiceBlock, libraryRef, parseLibraryRef, type LibraryChoice,
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
  const navigationMeasurement = createLibraryNavigationMeasurement()
  ctx.effect(() => () => { navigationMeasurement.dispose() }, 'enterprise-library: directory measurement')
  let requestedSource: LibrarySourceRequest | null = null
  const sourceListeners = new Set<() => void>()
  const publishSource = (next: LibrarySourceRequest | null) => {
    requestedSource = next
    for (const listener of sourceListeners) listener()
  }
  const sourceRequests: HostObservable<LibrarySourceRequest | null> = {
    getSnapshot: () => requestedSource,
    subscribe: (listener) => { sourceListeners.add(listener); return () => { sourceListeners.delete(listener) } },
  }
  ctx.effect(() => () => { sourceListeners.clear(); requestedSource = null }, 'enterprise-library: source lifetime')
  let requestedPicker: LibraryPickerRequest | null = null
  const pickerListeners = new Set<() => void>()
  const publishPicker = (next: LibraryPickerRequest | null) => {
    requestedPicker = next
    for (const listener of pickerListeners) listener()
  }
  const pickerRequests: HostObservable<LibraryPickerRequest | null> = {
    getSnapshot: () => requestedPicker,
    subscribe: (listener) => { pickerListeners.add(listener); return () => { pickerListeners.delete(listener) } },
  }
  ctx.effect(() => () => { pickerListeners.clear(); requestedPicker = null }, 'enterprise-library: picker lifetime')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'enterprise-library.picker', locale: NS,
    inject: () => ({
      origin, fetchImpl: fetch, hooks: { pickerRequest: pickerRequests },
      onClose: () => { publishPicker(null) },
      onConfirm: async (items: readonly LibraryChoice[]) => {
        const request = requestedPicker
        if (request === null) throw new Error(t('sessionUnavailable'))
        const retained = ctx.sessions.retain(request.sessionId, { source: 'controllerOperation' })
        try {
          await retained.ready
          const binding = ctx.sessions.binding(request.sessionId)
          if (!binding || requestedPicker !== request) throw new Error(t('sessionUnavailable'))
          const references = items.map((item) => {
            if (item.kind !== 'FILE' || item.versionId === null || item.parseStatus !== 'READY') throw new Error(t('attachFailed'))
            return { source: 'library', ref: libraryRef({ nodeId: item.nodeId, versionId: item.versionId }),
              label: item.name, appearance: 'file' as const, clipboardText: item.name }
          })
          const input = ctx.conversation.input.for(binding.ctx)
          if (!input.replaceReferences('library', references)) throw new Error(t('attachFailed'))
          for (const item of items) void libraryRequest(origin, 'used', 'POST', { nodeId: item.nodeId, versionId: item.versionId }, fetch).catch(() => undefined)
          ctx.uiWorkspace.openSession(request.sessionId)
          input.focus()
        } finally { retained.release() }
      },
    }),
  }, LibraryPickerOverlay)), 'enterprise-library: picker')
  ctx.on('chat/resolve-application-link', (_sessionId, href) => {
    const target = parseLibraryCitationLink(href, document.baseURI)
    if (!target) return undefined
    return () => { publishSource(target); ctx.layout.selectPanel(PANEL_ID) }
  })
  const attach = (sessionId: SessionId, item: LibraryChoice): { sent: false; attached: boolean } => {
    const binding = ctx.sessions.binding(sessionId)
    if (!binding) throw new Error(t('sessionUnavailable'))
    const input = ctx.conversation.input.for(binding.ctx)
    const selectedRef = item.versionId === null ? null : libraryRef({ nodeId: item.nodeId, versionId: item.versionId })
    if (selectedRef && input.state.getSnapshot().occurrences.some(ref => ref.source === 'library' && ref.ref === selectedRef)) {
      return { sent: false, attached: true }
    }
    const existing = input.state.getSnapshot().occurrences.filter(ref => ref.source === 'library')
    const replacesVersion = existing.some(ref => parseLibraryRef(ref.ref)?.nodeId === item.nodeId)
    const result = replacesVersion && !choiceBlock(item).disabled && item.versionId !== null
      ? { sent: false as const, attached: input.replaceReferences('library', [
        ...existing.filter(ref => parseLibraryRef(ref.ref)?.nodeId !== item.nodeId).map(ref => ({
          source: 'library', ref: ref.ref, label: ref.label, clipboardText: ref.clipboardText, appearance: 'file' as const,
        })),
        { source: 'library', ref: libraryRef({ nodeId: item.nodeId, versionId: item.versionId }), label: item.name,
          clipboardText: item.name, appearance: 'file' as const },
      ]) }
      : attachLibraryReference(input, item)
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
      hooks: { sourceRequest: sourceRequests, navigationWidth: navigationMeasurement.source },
      setNavigationElement: navigationMeasurement.attach,
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
    scope.effect(() => command.register({
      name: 'library',
      label: () => t('command'),
      description: () => t('commandDescription'),
      icon: IconPaperclipOutlineRegular,
      available: () => true,
      ui: {
        kind: 'action', preserveDraftOnMenu: true,
        run: (session) => {
          const binding = ctx.sessions.binding(session.sessionId)
          if (!binding) return
          const input = ctx.conversation.input.for(binding.ctx)
          const initialSelected = input.state.getSnapshot().occurrences.flatMap((reference) => {
            const parsed = reference.source === 'library' ? parseLibraryRef(reference.ref) : null
            return parsed === null ? [] : [{ ...parsed, versionNo: null, name: reference.label,
              kind: 'FILE' as const, parseStatus: 'READY', parseReason: null }]
          })
          publishPicker({ sessionId: session.sessionId, initialSelected })
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
      return items.flatMap((item) => {
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
      const insert = {
        source: 'library',
        ref: libraryRef({ nodeId: parsed.nodeId, versionId: parsed.versionId }),
        label: pick.candidate.label ?? pick.candidate.name,
        appearance: 'file' as const,
        clipboardText: pick.candidate.label ?? pick.candidate.name,
      }
      const binding = ctx.sessions.binding(pick.session.sessionId)
      if (!binding) return undefined
      const input = ctx.conversation.input.for(binding.ctx)
      const existing = input.state.getSnapshot().occurrences.filter(ref => ref.source === 'library')
      if (existing.some(ref => ref.ref === insert.ref)) return { text: '' }
      if (!existing.some(ref => parseLibraryRef(ref.ref)?.nodeId === parsed.nodeId)) return { insert }
      if (!input.insertReference(insert, pick.span)) return undefined
      input.replaceReferences('library', [
        ...existing.filter(ref => parseLibraryRef(ref.ref)?.nodeId !== parsed.nodeId).map(ref => ({
          source: 'library', ref: ref.ref, label: ref.label, clipboardText: ref.clipboardText, appearance: 'file' as const,
        })), insert,
      ])
      return 'handled'
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
      serialize: (ref, signal) => {
        signal.throwIfAborted()
        const parsed = parseLibraryRef(ref)
        if (!parsed) throw new Error('library reference is not a real version')
        return Promise.resolve({ type: 'library' as const, ...parsed, name: parsed.nodeId })
      },
    },
  }
  const triggers = ctx.get('inputTriggers')
  if (triggers) ctx.effect(() => triggers.registerSource(source), 'enterprise-library: mention')
}
