import { submitExpertPreviewInput } from './expert-preview-admission.ts'
import { resolvePreviewWorkspace } from './expert-preview-workspace.ts'
import { CompactExpertPreview, CompactExpertMessages } from './CompactExpertPreview.tsx'
import { ExpertPreviewEntry, isEmbeddedExpertPreview, parseExpertPreview } from './ExpertPreviewEntry.tsx'
import { installExpertPreviewBridge, type PreviewProfile } from './expert-preview-bridge.ts'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import { installTaskCatalog } from './task-catalog.tsx'
/** Shared Mac/Web official expert + skill gallery (expert plaza). */
import type { Context as ClientContext } from '@mammoth-ai/cordis'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import type { MainPanelId } from '@mammoth-ai/mmp-client-ui-layout/client'
import type {} from '@mammoth-ai/mmp-client-locale/client'
import type {} from '@mammoth-ai/mmp-client-ui-renderer/client'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar/client'
import type {} from '@mammoth-ai/mmp-client-ui-workspace/client'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type {} from '@mammoth-ai/mmp-client-ui-chat/client'
import type {} from '@mammoth-ai/mmp-api-remotes/client'
import type {} from '@mammoth-ai/mmp-official-agent-gallery/types'
import { createElement } from 'react'
import { IconUsersOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import { GalleryPage, type GalleryFace } from './GalleryPage.tsx'
import { GallerySourceLabel } from './GallerySourceLabel.tsx'
import { AnswerExpert } from './AnswerExpert.tsx'
import { SentSkillChips } from './SentSkillChips.tsx'
import { zh, en, ja, es, fr, de, ru, pt, type OfficialAgentGalleryLocaleKey } from './locales.ts'

declare module '@mammoth-ai/mmp-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Official expert plaza copy. */
    officialAgentGallery: OfficialAgentGalleryLocaleKey
  }
}

declare module '@mammoth-ai/mmp-api-session-controller/client' {
  interface SessionReferenceSourceMap { officialExpertPreview: unknown }
}

const NS = 'officialAgentGallery'
const PANEL_ID = 'official-agents' as MainPanelId

/**
 * Open the new task, then put the chosen example into its empty composer.
 * A new task has no user text yet, so an existing saved draft is replaced.
 * @returns draftFailed when the sentence cannot be written after the task exists.
 */
function placeStarterDraft(ctx: ClientContext, sessionId: SessionId, draft: string | undefined): 'draftFailed' | undefined {
  ctx.uiWorkspace.openSession(sessionId)
  if (!draft) return
  const binding = ctx.sessions.binding(sessionId)
  if (binding === undefined) return 'draftFailed'
  const placed = ctx.conversation.input.requestDraftInitialization(binding, { prompt: draft, whenDraftExists: 'replace' })
  return placed === 'applied' ? undefined : 'draftFailed'
}

export const inject = ['slots', 'locale', 'remote', 'remote.officialAgentGallery', 'uiWorkspace', 'sessions', 'conversation']

/** Register one shared expert plaza for both desktop and browser shells. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'official-agent-gallery: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.inject(['sessions','conversation'], scope=>{installTaskCatalog(scope)})
  const preview=typeof window==='undefined'?null:parseExpertPreview(window.location.search)
  const embeddedPreview = typeof window !== 'undefined' && isEmbeddedExpertPreview(window.location.search)
  if (preview) {
    const previewProfile=createSnapshotStore<PreviewProfile>({ name:'',avatarUrl:null })
    let sessionId: SessionId | undefined
    // Browser viewing state survives a plugin rebuild, scoped to this immutable preview.
    const pageState: unknown = window.history.state
    const retained: unknown = embeddedPreview && pageState !== null && typeof pageState === 'object'
      && 'expertPreviewSession' in pageState ? pageState.expertPreviewSession : undefined
    let createdSessionId: SessionId | undefined = retained !== null && typeof retained === 'object'
      && 'agentId' in retained && retained.agentId === preview.agentId
      && 'previewId' in retained && retained.previewId === preview.previewId
      && 'sessionId' in retained && typeof retained.sessionId === 'string' && retained.sessionId.trim()
      ? SessionId(retained.sessionId) : undefined
    let sessionReference: ReturnType<typeof ctx.sessions.retain> | undefined
    let launching: Promise<string | undefined> | undefined
    let active = true
    let bridge: ReturnType<typeof installExpertPreviewBridge> | undefined
    let stopState: (() => void) | undefined
    const admission = new AbortController()
    ctx.effect(() => {
      bridge = installExpertPreviewBridge({
        onProfile: (profile) => { previewProfile.set(profile) },
        frame: window, target: preview, message: key => t(embeddedPreview && key === 'previewSubmitFailed' ? 'previewAdmissionFailed' : key),
        input: () => {
          const binding = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId)
          if (binding === undefined) return
          const input = ctx.conversation.input.for(binding.ctx)
          return {
            initialize: text => ctx.conversation.input.requestDraftInitialization(binding, { prompt: text, whenDraftExists: 'keep' }),
            submit: () => embeddedPreview ? submitExpertPreviewInput(input, admission.signal) : input.submit('queue', 'click'),
            cancel: async () => {
              const result=await binding.session.cancel()
              if(!result.ok) throw new Error(`Preview cancellation failed: ${result.error.code}`)
            },
          }
        },
      })
      return () => { active = false; admission.abort(); stopState?.(); sessionReference?.release(); bridge?.dispose() }
    }, 'official-agent-gallery: preview handoff')
    ctx.inject(['layout', 'workspaces'], scope => {
      const key = 'official-expert-preview' as MainPanelId
      const launch = async () => {
        if (sessionId !== undefined || !active) return
        if (launching !== undefined) return launching
        launching = (async () => {
          const workspaceId = await resolvePreviewWorkspace(ctx.uiWorkspace.workspaceForNewSession(), scope.workspaces, admission.signal)
          if (!active) return
          if (workspaceId === undefined) return 'workspaceRequired'
          if (createdSessionId === undefined) {
            const result = await ctx.remote.officialAgentGallery.createPreview({ ...preview, workspaceId })
            if (!result.ok) return 'previewUnavailable'
            createdSessionId = result.value
            if (embeddedPreview) window.history.replaceState({ ...window.history.state,
              expertPreviewSession: { ...preview, sessionId: createdSessionId },
            }, '', window.location.href)
          }
          // The live catalog often announces creation before the RPC settles; avoid another full list fetch.
          if (!ctx.sessions.list.getSnapshot().byId[createdSessionId]) await ctx.sessions.refresh()
          if (!active) return
          sessionId = createdSessionId
          // Rebuilt plugins must recapture the dedicated preview instead of mounting the home shell.
          if (!embeddedPreview) {
            const url = new URL(window.location.href)
            url.searchParams.delete('expertPreview')
            url.searchParams.delete('expertId')
            url.searchParams.delete('expertEmbed')
            window.history.replaceState(null, '', url)
          }
          if (embeddedPreview) sessionReference = ctx.sessions.retain(sessionId, { source: 'officialExpertPreview' })
          else { ctx.uiWorkspace.openSession(sessionId); scope.layout.selectPanel(null) }
          bridge?.start()
          const binding = ctx.sessions.binding(sessionId)
          if (embeddedPreview && binding) {
            const report = () => bridge?.state(binding.session.getSnapshot().running)
            stopState = binding.session.subscribe(report)
            report()
          }
          return undefined
        })().finally(() => { launching = undefined })
        return launching
      }
      scope.slots.inject('main', () => {
        const dispose = ctx.slots.register({ name: 'main', key, locale: NS, inject: () => ({ target: preview, launch }) }, ExpertPreviewEntry)
        if (sessionId === undefined && !embeddedPreview) scope.layout.selectPanel(key)
        return dispose
      })
      if (embeddedPreview) {
        scope.slots.inject('rootframe', () => scope.slots.register({
          name: 'rootframe', locale: NS,
          children: { 'official.expert.preview.session': { kind: 'single', scope: 'session' } },
          inject: () => ({ target: preview, launch, getSession: () => sessionReference, reportUnavailable: () => bridge?.unavailable() }),
        }, CompactExpertPreview))
        scope.slots.inject('official.expert.preview.session', () => scope.slots.register({
          name: 'official.expert.preview.session', locale: NS,
          inject: () => ({ hooks:{ previewProfile }, chatText: ctx.locale.bind('chat'), reportContent: (hasMessages: boolean, userCount: number) => bridge?.content(hasMessages, userCount), openSource: async (id: SessionId, recordId: string, label: string) => {
            const result = await ctx.remote.officialAgentGallery.openKnowledgeSource(id, recordId, label)
            if (!result.ok) throw new Error(result.error.message)
            return result.value
          } }),
        }, CompactExpertMessages))
      }
    })
  }
  const face: GalleryFace = {
    preferences: async(kind,view)=>{const result=await ctx.remote.officialAgentGallery.preferences(kind,view);if(!result.ok)throw new Error(result.error.message);return result.value},
    favourite: async(kind,id,value)=>{const result=await ctx.remote.officialAgentGallery.favourite(kind,id,value);if(!result.ok)throw new Error(result.error.message)},
    catalogDetail: async (kind,id)=>{const result=await ctx.remote.officialAgentGallery.catalogDetail(kind,id);if(!result.ok)throw new Error(result.error.message);return result.value;},
    pageExperts: async query => {
      const result=await ctx.remote.officialAgentGallery.pageExperts(query)
      if(!result.ok)throw new Error(result.error.message)
      return result.value
    },
    openExperts: async query => {
      const result=await ctx.remote.officialAgentGallery.openExperts(query)
      if(!result.ok)throw new Error(result.error.message)
      return result.value
    },
    pageSkills: async query => {
      const result=await ctx.remote.officialAgentGallery.pageSkills(query)
      if(!result.ok)throw new Error(result.error.message)
      return result.value
    },
    openSkills: async query => {
      const result=await ctx.remote.officialAgentGallery.openSkills(query)
      if(!result.ok)throw new Error(result.error.message)
      return result.value
    },
    expertFacets: async () => {
      const result=await ctx.remote.officialAgentGallery.expertFacets()
      if(!result.ok)throw new Error(result.error.message)
      return result.value
    },
    skillFacets: async () => {
      const result=await ctx.remote.officialAgentGallery.skillFacets()
      if(!result.ok)throw new Error(result.error.message)
      return result.value
    },
    startAgent: async (agentId, draft) => {
      const workspaceId = ctx.uiWorkspace.workspaceForNewSession()
      if (workspaceId === undefined) return 'workspaceRequired'
      const result = await ctx.remote.officialAgentGallery.create({
        agentId, workspaceId,
        // Starter text is NEVER sent to the Host as openingQuestion.
      })
      if (!result.ok) {
        const message = result.error.message
        if (/GALLERY_EXECUTION_UNAVAILABLE/.test(message)) return 'executionUnavailable'
        if (/OFFICIAL_AGENT_NOT_GRANTED|未开通|not enabled|unavailable for the current enterprise/i.test(message)) {
          return 'notGranted'
        }
        return 'startFailed'
      }
      return placeStarterDraft(ctx, result.value, draft)
    },
    /**
     * Task 4: Ground validates skill → Host creates a NEW standard Session with
     * frozen sessionSource (summary_only). Never mutates the current open session
     * and never injects SKILL.md into the transcript.
     */
    requestSkill: async (skillId,draft) => {
      const workspaceId = ctx.uiWorkspace.workspaceForNewSession()
      if (workspaceId === undefined) return 'workspaceRequired'
      const result = await ctx.remote.officialAgentGallery.createSkill({
        skillId,
        workspaceId,
      })
      if (!result.ok) return /GALLERY_EXECUTION_UNAVAILABLE/.test(result.error.message)?'executionUnavailable':'startFailed'
      return placeStarterDraft(ctx, result.value, draft)
    },
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: () => face,
  }, GalleryPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('title'),
  }, GalleryIcon))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'official-gallery-input-source',
    order: -9,
    locale: NS,
    inject: () => ({
      download: async (sessionId: string, id: string) => {
        const result = await ctx.remote.officialAgentGallery.downloadArtifact(sessionId as Parameters<typeof ctx.remote.officialAgentGallery.downloadArtifact>[0], id)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
    }),
  }, GallerySourceLabel))
  ctx.slots.inject('conversation.chat.user.skills', () => ctx.slots.register({
    name: 'conversation.chat.user.skills',
  }, SentSkillChips))
  ctx.slots.inject('conversation.chat.assistant.expert', () => ctx.slots.register({
    name: 'conversation.chat.assistant.expert',
    inject: () => ({
      loadCard: async (agentId: string) => {
        const result = await ctx.remote.officialAgentGallery.expertCard(agentId)
        if (!result.ok) return undefined
        return { key: result.value.key, avatarUrl: result.value.avatarUrl }
      },
    }),
  }, AnswerExpert))
}

/** Decorative sidebar glyph; the row owns its localized navigation label. */
function GalleryIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return createElement(IconUsersOutlineRegular, { size })
}
