import type { PluginManagerLocaleKey } from './locales.ts'
import type { PackageRow, PackageView } from './manager-store.ts'
import type { Translate } from './presentation.ts'
import type { IconProps, StateDotState } from '@mammoth-ai/mmp-client-ui-primitives'
import {
  PluginArtworkDefault, PluginArtworkLoop, PluginArtworkSearch, PluginArtworkSubagent, PluginArtworkTerminal,
} from '@mammoth-ai/mmp-client-ui-primitives'
import { EXTENSION_BUNDLES, MORE_BUNDLES } from '@mammoth-ai/mmp-official-bundles'
import type { ReactNode } from 'react'

type RowPhase = NonNullable<PackageRow['phase']>

/** The primary action installs; the adjacent menu offers every add-plugin path. */

function rowsRunning(pkg: PackageView): boolean {
  return pkg.rows.some(row => row.enabled)
}

/**
 * Whether the main list shows an official optional bundle: any bundle outside `MORE_BUNDLES`, and any held-back one the profile enabled.
 * @param pkg - the official bundle as the Host reports it.
 * @returns whether the main list shows it.
 */
function pinnedToMainList(pkg: PackageView): boolean {
  return !MORE_BUNDLES.includes(pkg.name) || pkg.enabled
}

/**
 * Where an optional bundle sits on both lists: the `EXTENSION_BUNDLES` in their order, then the bundles neither list
 * ranks, then the held-back ones in theirs, so Codex and Claude Code stay last on the More list.
 * @param name - the bundle's package name.
 * @returns the rank; bundles of equal rank keep the order the Host reported.
 */
function optionalBundleRank(name: string): number {
  const ranked = EXTENSION_BUNDLES.indexOf(name)
  if (ranked >= 0) return ranked
  const heldBack = MORE_BUNDLES.indexOf(name)
  return heldBack < 0 ? EXTENSION_BUNDLES.length : EXTENSION_BUNDLES.length + 1 + heldBack
}

/**
 * Order the official optional bundles as both lists show them, so a bundle the profile picks from the More list
 * keeps its place among the neighbours the main list already holds.
 * @param packages - the official bundles the Host offers.
 * @returns the bundles in display order.
 */
function orderOptionalBundles(packages: readonly PackageView[]): PackageView[] {
  return [...packages].sort((a, b) => optionalBundleRank(a.name) - optionalBundleRank(b.name))
}

/** How long a toast holds: long enough to read a failure that names what broke. */
function toastHoldMs(text: string): number {
  return Math.min(8_000, Math.max(3_000, text.length * 80))
}

const PHASE_KEYS = {
  pending: 'rowPhasePending',
  loading: 'rowPhaseLoading',
  active: 'rowPhaseActive',
  failed: 'rowPhaseFailed',
  unloading: 'rowPhaseUnloading',
} satisfies Record<RowPhase, PluginManagerLocaleKey>

/** Status dot naming a root-fiber phase; loading and unloading are live transitions. */
const PHASE_STATES = {
  pending: 'idle',
  loading: 'ongoing',
  active: 'done',
  failed: 'error',
  unloading: 'ongoing',
} satisfies Record<RowPhase, StateDotState>

/** The count line over a pack's components: the total, then only the states that occur. */
function partsSummary(rows: readonly PackageRow[], t: Translate): string {
  const failed = rows.filter(row => row.phase === 'failed').length
  const off = rows.filter(row => !row.enabled).length
  const running = rows.filter(row => row.enabled && row.phase === 'active').length
  return [
    t('partsCountTotal', { count: String(rows.length) }),
    ...running > 0 ? [t('partsCountRunning', { count: String(running) })] : [],
    ...off > 0 ? [t('partsCountOff', { count: String(off) })] : [],
    ...failed > 0 ? [t('partsCountFailed', { count: String(failed) })] : [],
  ].join(' · ')
}

/** Switching for a pack's rows: which rows have a write in flight, and the write. */
interface RowToggles {
  readonly busy: (row: PackageRow) => boolean
  readonly onSetEnabled: (row: PackageRow, enabled: boolean) => void
}

/** Configuration for a pack's rows: which rows registered a page of their own, and opening it. */
interface RowConfigure {
  readonly has: (row: PackageRow) => boolean
  readonly open: (row: PackageRow) => void
}

/** Rows beyond this count get a filter box above the list. */
const ROW_FILTER_THRESHOLD = 10

/** The size the 36-viewBox plugin artwork renders at inside a card's 48px frame. */
const CARD_ARTWORK_SIZE = 36

/** The size the artwork renders at inside a row's 40px frame. */
const ROW_ARTWORK_SIZE = 30

/** The artwork of the official plugins that registered their configuration, by registration id. */
const ITEM_ARTWORK = new Map<string, (props: IconProps) => ReactNode>([
  ['shell', PluginArtworkTerminal],
  ['agent-loop', PluginArtworkLoop],
  ['subagent', PluginArtworkSubagent],
  ['web-search', PluginArtworkSearch],
])

/** An official plugin's card and page artwork; plugins without their own get the default. */
function itemArtwork(id: string): ReactNode {
  const Artwork = ITEM_ARTWORK.get(id) ?? PluginArtworkDefault
  return <Artwork size={CARD_ARTWORK_SIZE} />
}

/** Manifest images remain isolated from the page DOM; a failed decode keeps the position's default artwork. */

export {
  CARD_ARTWORK_SIZE,
  ITEM_ARTWORK,
  PHASE_KEYS,
  PHASE_STATES,
  ROW_ARTWORK_SIZE,
  ROW_FILTER_THRESHOLD,
  RowConfigure,
  RowPhase,
  RowToggles,
  itemArtwork,
  optionalBundleRank,
  orderOptionalBundles,
  partsSummary,
  pinnedToMainList,
  rowsRunning,
  toastHoldMs,
}
