/**
 * Production client composition without the page: mount the Loader over a
 * module system, activate the foreground rows, and audit those rows.
 * Rows outside that set keep loading after the promise resolves.
 * `AppWebEntry` and the whole-client test carrier both call it.
 * @module @mammoth-ai/mmp-client-web/src/boot-client
 */
import type { Context } from '@mammoth-ai/cordis'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import type { BootManifest, ClientModuleLoader } from '@mammoth-ai/mmp-client-modules/client'
import { STATE_LABELS } from './loader-status.ts'

/** Entry state label as the boot page renders it. */
export type EntryStateLabel = (typeof STATE_LABELS)[keyof typeof STATE_LABELS] | 'loading' | 'failed'

/** Inputs of {@link bootClient}. */
export interface ClientBootOptions {
  /** Fresh root Context that will own the plugin tree. */
  readonly ctx: Context
  /** Module system installed as `loader.internal`. */
  readonly modules: ClientModuleLoader
  /** Parsed manifest whose `plugins` rows become Loader entries (entry name = row id). */
  readonly manifest: BootManifest
  /** Package ids that must be active before the shell mounts. Omit to wait for every row. */
  readonly foreground?: ReadonlySet<string>
  /** Per-entry state reporting (the boot page); omitted when no one renders progress. */
  readonly onEntryState?: (name: string, state: EntryStateLabel) => void
}

/**
 * Compose the client: `ctx.plugin(Loader)`, `loader.internal = modules`, one
 * `loader.create({ name })` per foreground row, `loader.await()`, then
 * {@link assertEntriesActive}. The other rows are created after this promise resolves.
 * A row whose module cannot be imported is marked
 * failed; the Loader logs its import error, the module system records it, and
 * the audit rejects startup with that error text per entry.
 * @param options - context, module system, manifest, optional progress sink.
 * @returns resolves after the foreground entries are active; rejects with the audit report otherwise.
 */
export async function bootClient(options: ClientBootOptions): Promise<void> {
  const { ctx, manifest, onEntryState, foreground } = options
  await ctx.plugin(Loader)
  const loader = ctx.loader
  loader.internal = options.modules as never

  ctx.on('internal/status', (fiber) => {
    const entry = fiber.entry
    if (entry === undefined || entry.fiber === undefined) return
    onEntryState?.(entry.options.name, STATE_LABELS[entry.fiber.state])
  })

  const rows = manifest.plugins.map(row => row.id)
  for (const name of rows) {
    if (foreground !== undefined && !foreground.has(name)) continue
    onEntryState?.(name, 'loading')
  }
  await options.modules.entries.start(loader, manifest, foreground)
  for (const entry of loader.entries()) {
    if (foreground !== undefined && !foreground.has(entry.options.name)) continue
    if (entry.fiber === undefined) onEntryState?.(entry.options.name, 'failed')
  }

  await loader.await()
  assertEntriesActive(ctx, options.modules, foreground)
}

/**
 * Reject entries that failed import/apply or still wait on missing services.
 * @param ctx - root Context carrying the Loader.
 * @param modules - the module system whose recorded import failures name why an entry
 *   has no fiber; a row with no record points at the console.
 * @throws {Error} listing every non-active entry with its reason.
 */
export function assertEntriesActive(
  ctx: Context,
  modules: Pick<ClientModuleLoader, 'importError'>,
  foreground?: ReadonlySet<string>,
): void {
  const failures: string[] = []
  for (const entry of ctx.loader.entries()) {
    const name = entry.options.name
    if (foreground !== undefined && !foreground.has(name)) continue
    if (entry.fiber === undefined) {
      const importError = modules.importError(name)
      failures.push(importError === undefined
        ? `${name}: import failed (see console for the import error)`
        : `${name}: import failed: ${importError.message}`)
      continue
    }
    const state = STATE_LABELS[entry.fiber.state]
    if (state === 'active') continue
    if (state === 'pending') {
      const missing = Object.keys(entry.fiber.inject).filter(service => ctx.get(service) === undefined)
      failures.push(`${name}: pending (waiting for service${missing.length === 1 ? '' : 's'}: ${missing.join(', ') || 'unknown'})`)
    } else {
      failures.push(`${name}: ${state}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`web boot: ${String(failures.length)} entr${failures.length === 1 ? 'y' : 'ies'} did not activate\n${failures.join('\n')}`)
  }
}
