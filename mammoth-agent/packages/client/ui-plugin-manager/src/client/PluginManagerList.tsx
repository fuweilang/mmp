import type { RenderConfig, ResolveText } from './PluginManagerPage.tsx'
import type { PackageRow, PackageView } from './manager-store.ts'
import type { RowConfigure, RowToggles } from './plugin-manager-format.tsx'
import {
  CARD_ARTWORK_SIZE, partsSummary, PHASE_KEYS, PHASE_STATES, ROW_ARTWORK_SIZE, ROW_FILTER_THRESHOLD,
} from './plugin-manager-format.tsx'
import type { Translate } from './presentation.ts'
import { managementText, rowText } from './presentation.ts'
import type { StateDotState } from '@mammoth-ai/mmp-client-ui-primitives'
import {
  Button, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconDownloadOutlineRegular, IconPlusOutlineRegular, Input,
  Menu, MenuItemButton, PluginArtworkDefault, PluginArtworkSubagent, StateDot, Switch,
  Tooltip,
} from '@mammoth-ai/mmp-client-ui-primitives'
import type { ReactNode } from 'react'
import { useState } from 'react'
import css from './PluginManagerPage.module.css'

function AddPluginMenu({ t, disabled, openInstall, renderSlot }: {
  readonly t: Translate
  readonly disabled: boolean
  readonly openInstall: () => void
  readonly renderSlot: RenderConfig
}): ReactNode {
  const [open, setOpen] = useState(false)
  const onDismiss = (): void => { setOpen(false) }
  return (
    <span className={css.addGroup} role="group" aria-label={t('addPlugin')}>
      <Tooltip label={t('addPlugin')} side="bottom" delayMs={500} focusDelayMs={500} portal disabled={disabled}>
        <Button variant="primary" size="sm" className={css.addPrimary} icon={<IconPlusOutlineRegular size={13} />}
          aria-label={t('addPlugin')} disabled={disabled} onClick={() => { onDismiss(); openInstall() }}>
          <span className={css.toolbarLabel}>{t('addPlugin')}</span>
        </Button>
      </Tooltip>
      <Menu open={open} onClose={onDismiss} align="end" portal autoFocus listClassName={css.addMenu}
        anchor={(
          <Button variant="primary" size="sm" className={css.addMore}
            disabled={disabled} aria-label={t('chooseAddMethod')} aria-haspopup="menu" aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
            onKeyDown={(event) => {
              if (!open && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
            }}>
            <IconChevronDownOutlineRegular size={12} aria-hidden="true" />
          </Button>
        )}>
        <MenuItemButton icon={<IconDownloadOutlineRegular size={14} />} onSelect={() => { onDismiss(); openInstall() }}>
          <span className={css.addMenuItem}>
            <span>{t('installExisting')}</span>
            <span className={css.addMenuDescription}>{t('installExistingDescription')}</span>
          </span>
        </MenuItemButton>
        {renderSlot('plugins.add.actions', { onDismiss })}
      </Menu>
    </span>
  )
}

/** How long the list marks a package an install just enabled. */
const HIGHLIGHT_MS = 2_400

/**
 * Whether any plugin row this bundle's patch declares is running.
 *
 * A default-hidden bundle's rows may run without the profile selecting it, for example through
 * `cordis.patch.yml`; that run state is the effective enablement the lists offer.
 * @param pkg - the bundle as the Host reports it.
 * @returns whether at least one declared row runs.
 */

function PackageArtwork({ src, row = false, size = row ? ROW_ARTWORK_SIZE : CARD_ARTWORK_SIZE }: {
  readonly src: string | undefined
  readonly row?: boolean
  readonly size?: number
}): ReactNode {
  const [failedSource, setFailedSource] = useState<string>()
  const Fallback = row ? PluginArtworkSubagent : PluginArtworkDefault
  return src === undefined || src === failedSource
    ? <Fallback size={size} />
    : <img className={css.packageImage} src={src} width={size} height={size} alt="" onError={() => { setFailedSource(src) }} />
}

/** A row's switch: locked, saying why, when the Host refuses to address the row through the profile patch. */
function RowSwitch({ row, title, t, busy, onChange }: {
  readonly row: PackageRow
  readonly title: string
  readonly t: Translate
  readonly busy: boolean
  readonly onChange: (enabled: boolean) => void
}): ReactNode {
  const locked = row.readOnlyReason !== undefined || row.entryId === undefined
  return (
    <Switch
      checked={row.enabled}
      label={t('partToggle', { name: title })}
      disabled={busy || locked}
      {...row.readOnlyReason === undefined ? {} : { title: managementText({ code: row.readOnlyReason }, t) }}
      onChange={onChange}
    />
  )
}

/** What a row's state line says: off, or the phase its fiber is in. */
function rowStateText(row: PackageRow, t: Translate): string {
  if (!row.enabled) return t('partOff')
  return row.phase === null ? t('rowStateIdle') : t(PHASE_KEYS[row.phase])
}

/** The dot beside a row: its fiber phase, or idle. */
function rowDotState(row: PackageRow): StateDotState {
  if (!row.enabled || row.phase === null) return 'idle'
  return PHASE_STATES[row.phase]
}

/** A Host metadata diagnostic does not change the package's management permissions. */
function MetadataError({ error, t }: { readonly error: string | undefined; readonly t: Translate }): ReactNode {
  return error === undefined ? null : <p className={css.reason} role="status" data-package-meta-error>{t('metadataError', { error })}</p>
}

/** A failed component keeps its current Host diagnostic beside its controls. */
function RuntimeError({ error, t }: { readonly error: string | undefined; readonly t: Translate }): ReactNode {
  return error === undefined ? null : <p className={css.reason} role="status" data-plugin-runtime-error>{t('reasonLabel')}: {error}</p>
}

/**
 * A pack's rows as a list in the order the pack declares them: a state dot,
 * the row id, one line saying its state, a configure control for a row that
 * registered a page, and, when the pack is on, a switch. A pack like base
 * carries close to a hundred rows, so a long list gets a filter.
 */
function RowsSection({ rows, t, resolveText, toggle, configure }: {
  readonly rows: readonly PackageRow[]
  readonly t: Translate
  readonly resolveText: ResolveText
  readonly toggle?: RowToggles | undefined
  readonly configure?: RowConfigure | undefined
}): ReactNode {
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()
  const localized = rows.map(row => ({ row, ...rowText(row, resolveText) }))
  const shown = query === '' ? localized : localized.filter(({ row, title, description }) =>
    [title, description, row.rowId, row.moduleName].some(value => value?.toLowerCase().includes(query)))
  return (
    <section className={css.detailSection} data-plugin-rows>
      <div className={css.sectionHead}>
        <h4 className={css.sectionTitle}>{t('partsLabel')}</h4>
        {rows.length === 0 ? null : <span className={css.sectionCount}>{partsSummary(rows, t)}</span>}
      </div>
      {rows.length === 0 ? <p className={css.status}>{t('partsEmpty')}</p> : null}
      {rows.length > ROW_FILTER_THRESHOLD
        ? (
          <Input
            type="search"
            className={css.partsFilter as string}
            placeholder={t('partsFilter')}
            aria-label={t('partsFilter')}
            value={filter}
            onChange={(event) => { setFilter(event.target.value) }}
          />
        )
        : null}
      {rows.length > 0 && shown.length === 0 ? <p className={css.status}>{t('partsFilterEmpty')}</p> : null}
      {shown.length === 0
        ? null
        : (
          <ul className={css.rows}>
            {shown.map(({ row, title, description }) => (
              <li
                key={row.rowId}
                className={css.row}
                data-plugin-row={row.entryId ?? row.rowId}
                {...row.phase === 'failed' ? { 'data-state': 'failed' } : row.enabled ? {} : { 'data-state': 'off' }}
              >
                <div className={css.rowLine}>
                  <span className={css.rowIcon} aria-hidden="true"><PackageArtwork key={row.meta?.icon} src={row.meta?.icon} row /></span>
                  <div className={css.rowMain}>
                    {configure?.has(row) === true
                      ? (
                        <button type="button" className={css.rowOpen} aria-label={t('configureRow', { name: title })} onClick={() => { configure.open(row) }}>
                          <span className={css.rowId}>{title}</span>
                          <IconChevronRightOutlineRegular className={css.rowOpenIcon} aria-hidden="true" />
                        </button>
                      )
                      : <span className={css.rowId}>{title}</span>}
                    {description === undefined ? null : <span className={css.rowModule}>{description}</span>}
                    {title === row.rowId ? null : <code className={css.rowModule}>{row.rowId}</code>}
                    {title === row.moduleName ? null : <code className={css.rowModule}>{row.moduleName}</code>}
                  </div>
                  <span className={css.rowState}>
                    <StateDot state={rowDotState(row)} />
                    {rowStateText(row, t)}
                  </span>
                  {toggle === undefined
                    ? null
                    : <RowSwitch
                      row={row} title={title} t={t} busy={toggle.busy(row)}
                      onChange={(enabled) => { toggle.onSetEnabled(row, enabled) }}
                    />}
                </div>
                <MetadataError error={row.meta?.error} t={t} />
                <RuntimeError error={row.diagnostic} t={t} />
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

/** Declared install source and versions; unavailable files retain their recorded dependency spec. */
function SourceSection({ pkg, t }: { readonly pkg: PackageView; readonly t: Translate }): ReactNode {
  if (pkg.source === undefined && !pkg.installed && pkg.availability === 'installation' && !pkg.optional) return null
  return (
    <section className={css.detailSection} data-plugin-source>
      <h4 className={css.sectionTitle}>{t('sourceTitle')}</h4>
      <dl className={css.facts}>
        <div>
          <dt>{t('sourceSpec')}</dt>
          <dd>{pkg.source !== undefined ? <code>{pkg.source}</code> : pkg.availability === 'missing'
            ? t(pkg.installed ? 'statusMissingFiles' : 'sourceNotInstalled') : t('sourceBuiltIn')}</dd>
        </div>
        {pkg.version === undefined
          ? null
          : (
            <div>
              <dt>{t('sourceVersion')}</dt>
              <dd>{pkg.version}</dd>
            </div>
          )}
        {pkg.installTarget === undefined ? null : (
          <>
            <div>
              <dt>{t('sourceTargetSpec')}</dt>
              <dd><code>{pkg.installTarget.spec}</code></dd>
            </div>
            <div>
              <dt>{t('sourceTargetVersion')}</dt>
              <dd>{pkg.installTarget.version}</dd>
            </div>
          </>
        )}
      </dl>
    </section>
  )
}

/**
 * A bundle's enable switch on its card and its page: locked, saying why, for
 * one the Host protects; off and locked for one it cannot read.
 */
function EnableSwitch({ pkg, title, t, busy, onSetEnabled }: {
  readonly pkg: PackageView
  readonly title: string
  readonly t: Translate
  readonly busy: boolean
  readonly onSetEnabled: (enabled: boolean) => void
}): ReactNode {
  return (
    <span className={css.bundleToggle}>
      <span className={css.toggleProgress} role="status">
        <span className={css.progressAnnouncement}>{busy ? t('applyingChange', { name: title }) : ''}</span>
        {busy ? <StateDot state="ongoing" /> : null}
      </span>
      <Switch
        checked={pkg.enabled}
        label={t('enableToggle', { name: title })}
        disabled={busy || pkg.readOnlyReason !== undefined || (!pkg.enabled && pkg.error !== undefined
          && (pkg.error.code === 'unsupported-platform' || !(pkg.availability === 'missing' && pkg.installTarget !== undefined)))}
        {...pkg.readOnlyReason === undefined ? {} : { title: managementText({ code: pkg.readOnlyReason }, t) }}
        onChange={onSetEnabled}
      />
    </span>
  )
}

/** The status one card carries: running, off, or a problem the Host reported. */

export {
  AddPluginMenu,
  EnableSwitch,
  HIGHLIGHT_MS,
  MetadataError,
  PackageArtwork,
  RowSwitch,
  RowsSection,
  RuntimeError,
  SourceSection,
  rowDotState,
  rowStateText,
}
