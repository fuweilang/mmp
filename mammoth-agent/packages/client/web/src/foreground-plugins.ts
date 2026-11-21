/** Packages the first screen and the welcome guide need before the boot page can leave. */
const FOREGROUND_SEEDS = [
  '@mammoth-ai/mmp-client-connection',
  '@mammoth-ai/mmp-client-locale',
  '@mammoth-ai/mmp-client-ui-layout',
  '@mammoth-ai/mmp-client-ui-renderer',
  '@mammoth-ai/mmp-client-ui-settings',
  '@mammoth-ai/mmp-client-ui-settings-account',
  '@mammoth-ai/mmp-client-ui-theme',
] as const

/** One boot row's package-name dependency edge. */
export interface ForegroundPluginRow {
  /** Entry name, the package name. */
  id: string
  /** Packages whose services this row waits for. */
  inject?: readonly string[]
}

/**
 * Packages that must be active before the shell and welcome guide mount.
 * The set is the seeds that exist in this graph, plus every package they inject.
 * An empty set means this graph has none of those packages, so boot waits for every row.
 * @param plugins - Boot roster rows.
 * @returns Package ids to activate before revealing the shell.
 */
export function foregroundPluginIds(plugins: readonly ForegroundPluginRow[]): Set<string> {
  const known = new Map(plugins.map(row => [row.id, row.inject ?? []]))
  const seen = new Set<string>()
  const stack = FOREGROUND_SEEDS.filter(id => known.has(id))
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    for (const dep of known.get(id) ?? []) {
      if (known.has(dep)) stack.push(dep)
    }
  }
  return seen
}
