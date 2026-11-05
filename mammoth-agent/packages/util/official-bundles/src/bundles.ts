/** The bundle package names the mmp installation selects, offers, installs on demand, or retires. */

/** Installation-owned defaults used when a shipped profile is first opened. */
export interface ProfileTemplate {
  /** Ordered bundle layer list. */
  bundles: readonly string[]
}

/** The shipped profile templates auto-initialized on first use, by name. */
export const PROFILE_TEMPLATES: Record<string, ProfileTemplate> = {
  acp: {
    bundles: ['@mammoth-ai/mmp-base', '@mammoth-ai/mmp-acp-app'],
  },
  web: {
    bundles: ['@mammoth-ai/mmp-base', '@mammoth-ai/mmp-web-app'],
  },
  headless: {
    bundles: ['@mammoth-ai/mmp-base', '@mammoth-ai/mmp-headless'],
  },
  sdk: {
    bundles: ['@mammoth-ai/mmp-base', '@mammoth-ai/mmp-sdk-app'],
  },
  'sdk-minimal': {
    bundles: ['@mammoth-ai/mmp-sdk-minimal'],
  },
}

/**
 * Installation-owned bundle tuples that an earlier release wrote into a shipped profile; app-boot replaces an exact
 * match with the {@link PROFILE_TEMPLATES} entry of the same name and leaves every other list untouched.
 */
export const INSTALLATION_OWNED_PROFILE_TUPLES: Readonly<Record<string, readonly string[]>> = {
  headless: ['@mammoth-ai/mmp-base', '@mammoth-ai/mmp-web-app', '@mammoth-ai/mmp-headless'],
}

/** Bundles an earlier release shipped and the installation no longer carries; app-boot removes them from profiles. */
export const RETIRED_BUNDLES: ReadonlySet<string> = new Set([
  // The Web composition mounts Schedule itself
  // ([upgrade guide](../../../../docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.md)).
  '@mammoth-ai/mmp-experimental-schedule-bundle',
])

/** The bundle list a `mmp plugin` init uses for a name with no shipped template. */
export const DEFAULT_PROFILE_BUNDLES: readonly string[] = ['@mammoth-ai/mmp-base']

/**
 * The bundles the mmp installation ships for a person to switch on: each a
 * runtime dependency of the installation that declares `mmp.bundle.patch`,
 * an `icon`, and `./locale/*.json` display metadata, selected by no shipped
 * template, and offered switched off by the plugin manager except persistent
 * terminals, which have no page switch
 * ([rationale](../../../../.agents/notes/implemented/process/2026-09-15-shipped-optional-bundles.md),
 * [admission](../../../../.agents/notes/implemented/architecture/2026-09-21-experimental-capabilities-as-optional-bundles.md)).
 */
export const OPTIONAL_BUNDLES: readonly string[] = [
  '@mammoth-ai/mmp-personalized-recommendations',
  '@mammoth-ai/mmp-experimental-session-search',
  '@mammoth-ai/mmp-experimental-ralph-bundle',
  '@mammoth-ai/mmp-experimental-terminal-bundle',
  '@mammoth-ai/mmp-experimental-badge-skill-bundle',
  '@mammoth-ai/mmp-experimental-session-titles-bundle',
  '@mammoth-ai/mmp-experimental-agent-team-profile',
  '@mammoth-ai/mmp-experimental-voice-input-bundle',
  '@mammoth-ai/mmp-experimental-cot-translation-bundle',
  '@mammoth-ai/mmp-experimental-auto-review',
  '@mammoth-ai/mmp-experimental-inspector-profile',
  '@mammoth-ai/mmp-experimental-liveshare',
  '@mammoth-ai/mmp-experimental-plugin-market-bundle',
  '@mammoth-ai/mmp-experimental-tool-worktree',
  '@mammoth-ai/mmp-experimental-forge-bundle',
]

/** Public MMP release members available through the ordinary on-demand bundle installer. */
export const ON_DEMAND_BUNDLES: readonly string[] = [
  '@mammoth-ai/mmp-subagent-claude-code',
  '@mammoth-ai/mmp-subagent-codex',
  '@mammoth-ai/mmp-cua-bundle',
]
