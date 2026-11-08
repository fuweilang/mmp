const TERMINAL_PRESET_SELECTION_VISIBLE = false
/**
 * Agent-preset surface plugin, browser half — three surfaces over one roster:
 * a chip on the new-session screen for the session about to start, a
 * read-only label in the session header, and a settings section that lists
 * the roster (selection, the new-task default, a read-only view of each
 * declared composition, and the way into Creator mode).
 *
 * A running session keeps the composition it began with (the host switches a
 * session's preset only before its first turn). New sessions default to
 * Standard mode (`standard` composition with tools). Ordinary Ground users see
 * Standard / Dialogue / Minimal on the hero and do not get the Settings →
 * Agent presets section; platform admins see every built-in mode and the
 * settings section. Native desktop (no Ground session) keeps the full DSH
 * roster. There is no Auto-mode router and no boot-time chat→standard rewrite.
 */

// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type { SessionBinding } from '@mammoth-ai/mmp-api-session-controller/client'
import { WeakMapWithValues } from '@mammoth-ai/mmp-util-values'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@mammoth-ai/mmp-client-locale/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (the settings invalidation rides the allowlist) into this program.
import type {} from '@mammoth-ai/mmp-api-remotes/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@mammoth-ai/mmp-client-ui-settings/client'
import type {} from '@mammoth-ai/mmp-client-ui-renderer/client'
// Type-only: pulls the Workspace UI navigation service merge (ctx.uiWorkspace).
import type {} from '@mammoth-ai/mmp-client-ui-workspace/client'
import type {} from '@mammoth-ai/mmp-client-ui-plugin-manager/client'
import type { Context as ClientContext } from '@mammoth-ai/cordis'
import { AgentPresetLabel } from './AgentPresetLabel.tsx'
import { CreatePluginMenuItem } from './CreatePluginMenuItem.tsx'
import type { AgentPresetLabelInjected } from './AgentPresetLabel.tsx'
import { AgentPresetSection } from './AgentPresetSection.tsx'
import type { AgentPresetSectionInjected } from './AgentPresetSection.tsx'
import { AgentPresetSeatController, type AgentPresetStage } from './seat-store.ts'
import { AgentPresetSectionController } from './section-store.ts'
import { en, ja, es, fr, de, ru, pt, zh, type AgentPresetSettingsKey } from './locales.ts'
import { AGENT_PRESET_SETTINGS_NS, AgentPresetSettingsController, isOrdinaryHiddenBuiltIn } from './settings-store.ts'
import {
  canManageAgentPresetSettings,
  readPresetRoleAccess,
  type PresetRoleAccess,
} from './role-access.ts'

declare module '@mammoth-ai/mmp-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent-preset surface copy. */
    'settings.agentPreset': AgentPresetSettingsKey
  }
}

export type { AgentPresetLabelInjected, AgentPresetLabelProps } from './AgentPresetLabel.tsx'
export type { AgentPresetSeatInjected, AgentPresetSeatProps } from './AgentPresetSeat.tsx'
export type { AgentPresetSectionInjected, AgentPresetSectionProps } from './AgentPresetSection.tsx'
export type { AgentPresetSeatState } from './seat-store.ts'
export type { AgentPresetSectionState, PresetView } from './section-store.ts'
export type { AgentPresetOption, AgentPresetSettingsState } from './settings-store.ts'
export { AGENT_PRESET_SETTINGS_NS, writeDefaultPreset } from './settings-store.ts'

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'sessions', 'locale', 'remote', 'remote.agentPresets', 'remote.settings', 'configForms',
]

/**
 * Mount the roster surfaces: hero chip, session-header label, settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const toolsSettings = ctx.configForms.get<{ enabled: boolean }>('ui-settings')
  const presetSettings = ctx.configForms.get(AGENT_PRESET_SETTINGS_NS)
  let active = true
  // Host preferences start at false before their first accepted document.
  const codingToolsDisabled = (): boolean => active && toolsSettings.getSnapshot().value?.enabled === false
  const controller = new AgentPresetSettingsController(ctx)
  const staged: AgentPresetStage = { id: undefined, introduce: false }
  const seats = new WeakMapWithValues<SessionBinding, AgentPresetSeatController>()
  const boundSeatDisposers = new Set<() => Promise<void>>()
  ctx.effect(() => async () => {
    await Promise.all([...boundSeatDisposers].map(dispose => dispose()))
  }, 'ui-agent-preset: bound selections')
  const unboundSeat = new AgentPresetSeatController(ctx, () => undefined, staged)
  const seatFor = (binding: SessionBinding): AgentPresetSeatController => {
    const existing = seats.get(binding)
    if (existing !== undefined) return existing
    const seat = new AgentPresetSeatController(ctx, () => {
      if (ctx.sessions.binding(binding.sessionId) !== binding) return undefined
      const summary = ctx.sessions.list.getSnapshot().byId[binding.sessionId]
      return summary !== undefined
        && (ctx.sessions.retainInfo(binding.sessionId).getSnapshot().retainedBy.mainView ?? 0) > 0
        ? summary
        : undefined
    }, staged)
    seats.set(binding, seat)
    const dispose = binding.ctx.effect(() => {
      const stop = ctx.sessions.list.subscribe(() => { void seat.apply() })
      return () => {
        stop()
        seats.delete(binding)
        boundSeatDisposers.delete(dispose)
      }
    }, 'ui-agent-preset: Provider binding')
    boundSeatDisposers.add(dispose)
    return seat
  }
  const section = new AgentPresetSectionController(ctx)
  // Ground `/me` via same-origin billing proxy; native/desktop stays full-roster DSH.
  let presetRoleAccessSnapshot: PresetRoleAccess = { kind: 'pending' }
  const presetRoleListeners = new Set<() => void>()
  const presetRoleAccess={ getSnapshot:()=>presetRoleAccessSnapshot, subscribe:(listener:()=>void)=>{presetRoleListeners.add(listener);return()=>{presetRoleListeners.delete(listener)}} }

  const publishPresetRoleAccess = (next: PresetRoleAccess): void => {
    presetRoleAccessSnapshot = next
    for (const listener of presetRoleListeners) listener()
  }
  void readPresetRoleAccess().then((access) => {
    publishPresetRoleAccess(access)
    // Blank new-task only: drop ordinary-hidden staged picks to standard.
    if (access.kind === 'ground' && !access.isPlatformAdmin) {
      const syncHidden = (seat: AgentPresetSeatController): void => {
        const current = seat.store.getSnapshot().current
        if (!current || !isOrdinaryHiddenBuiltIn({ id: current })) return
        void seat.select('standard')
      }
      syncHidden(unboundSeat)
      for (const seat of seats.values) syncHidden(seat)
    }
  })

  // Turning Developer tools off clears the shared stage before any apply can compose it.
  const developerTools = ctx.configForms.developerTools.enabled
  ctx.effect(() => developerTools.subscribe(() => {
    if (developerTools.getSnapshot()) return
    staged.id = undefined
    staged.introduce = false
    void unboundSeat.apply()
    for (const seat of seats.values) void seat.apply()
  }), 'ui-agent-preset: Developer tools gate')
  const mainBlank = () => Object.values(ctx.sessions.list.getSnapshot().byId)
    .find((session) => {
      /* v8 ignore next -- retained source counts omit zero-valued entries. */
      return session.blank && (session.retainedBy.mainView ?? 0) > 0
    })
  const mainBlankSeat = (): AgentPresetSeatController | undefined => {
    const summary = mainBlank()
    const binding = summary === undefined ? undefined : ctx.sessions.binding(summary.id)
    return binding === undefined ? undefined : seatFor(binding)
  }

  ctx.effect(() => ctx.locale.register('settings.agentPreset', { zh, en, ja, es, fr, de, ru, pt }), 'ui-agent-preset: settings row dictionaries')

  ctx.effect(() => {
    let requested = 0
    let pending: Promise<void> | undefined
    // Settings invalidations may land while a correction is waiting on a
    // person's selection. Recheck once that work settles using the latest values.
    const reconcile = (): void => {
      requested++
      pending ??= Promise.resolve().then(async () => {
        try {
          for (;;) {
            const revision = requested
            await section.reconcileCodingTools(codingToolsDisabled)
            if (!active || requested === revision) return
          }
        } finally { pending = undefined }
      })
    }
    // The roster reflects live declarations and the default is a settings field, so
    // both an external settings edit and a reconnect can move this row.
    const refresh = (): void => {
      void controller.load()
      // The section reads the same roster and marks the same default, so a
      // change made from either surface converges both.
      if (section.store.getSnapshot().status !== 'idle') void section.load()
      void unboundSeat.load()
      for (const seat of seats.values) void seat.load()
      reconcile()
    }
    const disposers = [
      toolsSettings.subscribe(reconcile),
      presetSettings.subscribe(reconcile),
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns !== AGENT_PRESET_SETTINGS_NS) return
        refresh()
      }),
      ctx.on('connection/reset', refresh),
    ]
    reconcile()
    return async () => {
      active = false
      for (const dispose of disposers) dispose()
      await pending
    }
  }, 'ui-agent-preset: settings refresh')

  // The settings section's conversational authoring entry: stage the
  // self-referential preset and land a new session on it. Bound inside the
  // conversation scope below (the seat and the session flow live there) and
  // unbound with it, so the section's face reads the current binding per
  // render and simply hides the button while no flow exists.
  let creatorDraft: (() => void) | undefined
  ctx.inject(['slots', 'conversation', 'sessions', 'uiWorkspace'], (scope: ClientContext) => {

    const labelInjected = (): AgentPresetLabelInjected => ({
      hooks: { agentPresets: controller.store },
      load: () => controller.load(),
    })

    const startCreatorDraft = () => {
      // The Host composes the reused draft or new Session; the stage only drives the chip's display and introduction.
      // Navigation opens another blank when the main blank lists a different preset, so that blank is not staged.
      const listed = mainBlank()?.projectionValues?.agentPreset
      if (typeof listed !== 'string' || listed === 'cordis') (mainBlankSeat() ?? unboundSeat).stage('cordis', true)
      scope.uiWorkspace.startSession(undefined, { clearPreviousDraft: false, agentPreset: 'cordis' })
    }

    scope.effect(() => {
      creatorDraft = startCreatorDraft
      // t166: no new-task mode picker. Existing task projections/modes stay intact.
      const chip = () => {}
      const label = scope.slots.register({
        name: 'conversation.session.header.actions',
        id: 'agent-preset',
        // Static session context occupies the header's leading negative-order band.
        order: -10,
        locale: 'settings.agentPreset',
        inject: labelInjected,
      }, AgentPresetLabel)
      return () => {
        creatorDraft = undefined
        chip()
        label()
      }
    }, 'ui-agent-preset: new-session chip and header label')

    // t174: presentation only, keep native authoring machinery dormant.
    if (TERMINAL_PRESET_SELECTION_VISIBLE) scope.slots.inject('plugins.add.actions', () => scope.slots.register({
      name: 'plugins.add.actions', id: 'create-plugin', locale: 'settings.agentPreset',
      inject: () => ({ hooks: { agentPresets: controller.store }, load: () => controller.load(), startCreatorDraft }),
    }, CreatePluginMenuItem))
  })

  /** Capture the exact blank Session one Settings action may update. */
  const captureBlankSessionSync = (): ((id: string) => Promise<string | undefined>) => {
    const summary = Object.values(ctx.sessions.list.getSnapshot().byId)
      .find(session => session.blank && (session.retainedBy.mainView ?? 0) > 0)
    const binding = summary === undefined ? undefined : ctx.sessions.binding(summary.id)
    const seat = binding === undefined ? undefined : seatFor(binding)
    const sessionId = seat?.blankSessionId()
    return async (id: string) => {
      if (seat === undefined || sessionId === undefined || binding === undefined
        || seats.get(binding) !== seat) return undefined
      return await seat.syncBlankSession(sessionId, id)
    }
  }

  const sectionInjected = (): AgentPresetSectionInjected => ({
    hooks: { agentPresetSection: section.store, developerTools: ctx.configForms.developerTools.enabled },
    load: () => section.load(),
    view: (id: string) => section.view(id),
    closeView: () => { section.closeView() },
    ...creatorDraft === undefined ? {} : { startCreatorDraft: creatorDraft },
    makeDefault: (id: string) => section.makeDefault(id, captureBlankSessionSync()),
  })

  // t174: hide the selection panel, do not change native preset definitions.
  if (TERMINAL_PRESET_SELECTION_VISIBLE) ctx.effect(() => {
    let dispose: (() => void) | undefined
    const sync = (): void => {
      dispose?.(); dispose = undefined
      if (!canManageAgentPresetSettings(presetRoleAccess.getSnapshot())) return
      dispose = ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'agent-presets', order: 20,
        label: () => ctx.locale.bind('settings.agentPreset')('nav'), locale: 'settings.agentPreset', inject: sectionInjected,
      }, AgentPresetSection))
    }
    sync(); const stop = presetRoleAccess.subscribe(sync)
    return () => { stop(); dispose?.() }
  }, 'ui-agent-preset: hidden terminal selection section')
}

