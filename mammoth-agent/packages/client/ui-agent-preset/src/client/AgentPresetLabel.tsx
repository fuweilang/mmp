/**
 * The session header does not name the agent preset.
 * The new-session screen ({@link AgentPresetSeat}) owns that choice.
 */

import type { SnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-conversation/client'
import type {} from '@mammoth-ai/mmp-agent-preset-registry/types'
import type { AgentPresetSettingsState } from './settings-store.ts'

/** Registration-side business face for the header label. */
export interface AgentPresetLabelInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>
  }
  /** Read the roster, so the label can show a name rather than an id. */
  load: () => Promise<void>
}

/** Full component props. */
export type AgentPresetLabelProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetLabelInjected>

/**
 * The header keeps this seat and renders nothing in it.
 * @param _props - composed slot props, unused while the preset name stays off the header.
 * @returns nothing.
 */
export function AgentPresetLabel(_props: AgentPresetLabelProps) {
  return null
}
