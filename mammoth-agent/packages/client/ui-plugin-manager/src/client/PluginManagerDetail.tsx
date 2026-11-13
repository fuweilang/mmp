import {
  EnableSwitch, MetadataError, PackageArtwork, RowsSection, RuntimeError, SourceSection,
} from './PluginManagerList.tsx'
import type { RenderConfig, ResolveText } from './PluginManagerPage.tsx'
import type { OfficialItem } from './config-ledger.ts'
import { rowConfigKey } from './config-ledger.ts'
import type { PackageRow, PackageView, PluginManagerState, VersionCheck } from './manager-store.ts'
import { updateCandidate } from './manager-store.ts'
import type { RowConfigure } from './plugin-manager-format.tsx'
import { CARD_ARTWORK_SIZE, itemArtwork } from './plugin-manager-format.tsx'
import type { Translate } from './presentation.ts'
import { managementText, packageText, rowText } from './presentation.ts'
import type { ConfigPageForm, PluginPackageRef, PluginRowRef, PluginsSubject } from './slot-contract.ts'
import { VersionSection } from './versions.tsx'
import {
  Button, IconChevronDownOutlineRegular, IconRefreshOutlineRegular, IconTrashOutlineRegular, Modal, Tag,
} from '@mammoth-ai/mmp-client-ui-primitives'
import type { ReactNode } from 'react'
import { useId } from 'react'
import css from './PluginManagerPage.module.css'

function packageStatus(pkg: PackageView): 'running' | 'disabled' | 'problem' {
  if (pkg.error !== undefined || (pkg.enabled && pkg.rows.some(row => row.phase === 'failed'))) return 'problem'
  return pkg.enabled ? 'running' : 'disabled'
}

/** The head every card shares: the artwork, the name that opens the page beside its tags, its one-liner, and what sits at the end. */
function CardHead({ title, t, onOpen, icon, tags, description, end }: {
  readonly title: string
  readonly t: Translate
  readonly onOpen: () => void
  readonly icon: ReactNode
  readonly tags?: ReactNode
  readonly description: ReactNode
  readonly end?: ReactNode
}): ReactNode {
  const descriptionId = useId()
  return (
    <div className={css.cardHead}>
      <span className={css.cardIcon} aria-hidden="true">{icon}</span>
      <div className={css.cardMain}>
        <div className={css.titleRow}>
          <button type="button" className={`${css.cardTitle} ${css.cardOpen}`} aria-label={t('openDetail', { name: title })} aria-describedby={description === undefined ? undefined : descriptionId} onClick={onOpen}>{title}</button>
          {tags}
        </div>
        {description === undefined ? null : <span className={css.cardDesc} id={descriptionId}>{description}</span>}
      </div>
      {end === undefined ? null : <div className={css.cardEnd}>{end}</div>}
    </div>
  )
}

/** First-read placeholders share the core configuration group's card and text-line layout. */
function ListSkeleton({ label }: { readonly label: string }): ReactNode {
  return (
    <section className={css.group} role="status" aria-label={label} data-plugin-loading>
      <div className={css.groupHead} aria-hidden="true">
        <span className={`${css.groupTitle} ${css.skeletonText} ${css.skeletonHeading}`}>
          <span className={`${css.skeletonFill} ${css.skeletonBar}`} />
        </span>
      </div>
      <ul className={css.cards} aria-hidden="true">
        {[0, 1, 2, 3].map(index => (
          <li key={index} className={css.card}>
            <div className={css.cardHead}>
              <span className={`${css.cardIcon} ${css.skeletonFill} ${css.skeletonIcon}`} />
              <div className={css.cardMain}>
                <div className={css.titleRow}>
                  <span className={`${css.cardTitle} ${css.skeletonText} ${css.skeletonTitle}`}>
                    <span className={`${css.skeletonFill} ${css.skeletonBar}`} />
                  </span>
                </div>
                <span className={`${css.cardDesc} ${css.skeletonText} ${css.skeletonDescription}`}>
                  <span className={`${css.skeletonFill} ${css.skeletonBar}`} />
                </span>
              </div>
              <div className={`${css.cardEnd} ${css.skeletonActions}`} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The top every page shares: the crumb that leads back, then the icon with the page's actions at its right. */
function DetailTop({ crumbLabel, crumbText, onBack, icon, actions }: {
  readonly crumbLabel: string
  readonly crumbText: string
  readonly onBack: () => void
  readonly icon: ReactNode
  readonly actions?: ReactNode
}): ReactNode {
  return (
    <div className={css.detailTop} data-window-drag>
      <button type="button" className={css.crumb} aria-label={crumbLabel} onClick={onBack}>
        <IconChevronDownOutlineRegular className={css.crumbIcon} aria-hidden="true" />
        <span>{crumbText}</span>
      </button>
      <div className={css.detailHead}>
        <span className={css.cardIcon} aria-hidden="true">{icon}</span>
        {actions}
      </div>
    </div>
  )
}

/** The registry version a finished version check offers for a package, when it offers one. */
function versionUpdate(check: VersionCheck | undefined): string | undefined {
  return check?.phase === 'done' ? updateCandidate(check.list)?.version : undefined
}

/** The list toolbar's sentence about the last update check of every updatable package. */
function updatesNote(packages: readonly PackageView[], versions: PluginManagerState['versions'], t: Translate): { text: string; tone?: 'info' | 'error' } | undefined {
  const checks = packages.filter(pkg => pkg.updatable).map(pkg => versions[pkg.name])
  if (checks.length === 0 || checks.some(check => check === undefined || check.phase === 'checking')) return undefined
  const available = checks.filter(check => versionUpdate(check) !== undefined).length
  if (available > 0) return { text: t('updatesAvailable', { count: String(available) }), tone: 'info' }
  if (checks.some(check => check?.phase === 'done' && check.list.status === 'refused')) return { text: t('updatesFailed'), tone: 'error' }
  return { text: t('updatesNone') }
}

function updateAvailable(pkg: PackageView): boolean {
  const target = pkg.installTarget
  // An update removes the installed package first, so a package that cannot be removed offers none.
  if (!pkg.installed || !pkg.removable || pkg.availability === 'installation' || target === undefined) return false
  return pkg.version !== target.version
    || ((target.spec.startsWith('link:') || pkg.source?.startsWith('link:') === true) && pkg.source !== target.spec)
}

/** One package as a card that opens its page: its name, its one-liner, its tags, and its bundle switch. */
function PackageCard({ pkg, t, resolveText, busy, highlighted, newer, onOpen, onSetEnabled }: {
  readonly pkg: PackageView
  /** The newer registry version a version check offers. */
  readonly newer: string | undefined
  readonly t: Translate
  readonly resolveText: ResolveText
  readonly busy: boolean
  readonly highlighted: boolean
  readonly onOpen: () => void
  readonly onSetEnabled: (enabled: boolean) => void
}): ReactNode {
  const { title, description, beta } = packageText(pkg, resolveText)
  const status = packageStatus(pkg)
  return (
    <li
      className={`${css.card} ${css.cardLink}`}
      data-plugin-package={pkg.name}
      data-plugin-status={status}
      {...highlighted ? { 'data-plugin-highlight': '' } : {}}
    >
      <CardHead
        title={title}
        t={t}
        onOpen={onOpen}
        icon={<PackageArtwork key={pkg.meta?.icon} src={pkg.meta?.icon} />}
        tags={(
          <>
            {beta ? <Tag className={css.statusTag} tone="info">{t('statusBeta')}</Tag> : null}
            {status === 'problem' ? <Tag className={css.statusTag} tone="danger">{t('statusProblem')}</Tag> : null}
            {pkg.availability === 'missing' ? <Tag className={css.statusTag}>{t(pkg.installed ? 'statusMissingFiles' : 'statusNotInstalled')}</Tag> : null}
            {updateAvailable(pkg) || newer !== undefined ? <Tag className={css.statusTag} tone="info">{t('statusUpdateAvailable')}</Tag> : null}
          </>
        )}
        description={description}
        end={<EnableSwitch pkg={pkg} title={title} t={t} busy={busy} onSetEnabled={onSetEnabled} />}
      />
      <MetadataError error={pkg.meta?.error} t={t} />
      {pkg.error?.code === 'unsupported-platform' && <p className={css.reason} role="status">{managementText(pkg.error, t)}</p>}
    </li>
  )
}

/**
 * One official plugin as a card that opens its page: its icon, its title from
 * the registration, and the one-liner the entry renders in its summary view.
 */
function ItemCard({ item, t, onOpen, renderSlot }: {
  readonly item: OfficialItem
  readonly t: Translate
  readonly onOpen: () => void
  readonly renderSlot: RenderConfig
}): ReactNode {
  return (
    <li className={`${css.card} ${css.cardLink}`} data-plugin-item={item.id}>
      <CardHead title={item.label} t={t} onOpen={onOpen} icon={itemArtwork(item.id)} description={renderSlot('plugins.item', { view: 'summary' }, { only: item.id })} />
    </li>
  )
}

/** One row as the detail slots see it. */
function rowRef(row: PackageRow): PluginRowRef {
  return { rowId: row.rowId, moduleName: row.moduleName, enabled: row.enabled }
}

/** One bundle as the detail slots see it. */
function packageRef(pkg: PackageView): PluginPackageRef {
  return {
    name: pkg.name,
    ...pkg.version === undefined ? {} : { version: pkg.version },
    installed: pkg.installed,
    availability: pkg.availability,
    official: pkg.official,
    enabled: pkg.enabled,
    rows: pkg.rows.map(rowRef),
  }
}

/**
 * An official plugin's page: the crumb back to the cards, its icon with the
 * contributed actions, its title with the contributed badges over its
 * one-liner, the form the entry renders, and the contributed sections.
 */
function ItemDetail({ item, t, onBack, renderSlot, form }: {
  readonly item: OfficialItem
  readonly t: Translate
  readonly onBack: () => void
  readonly renderSlot: RenderConfig
  readonly form: ConfigPageForm | undefined
}): ReactNode {
  const subject: PluginsSubject = { kind: 'item', id: item.id }
  return (
    <div className={css.detail} data-plugin-item-detail={item.id}>
      <DetailTop
        crumbLabel={t('backToList')}
        crumbText={t('crumbRoot')}
        onBack={onBack}
        icon={itemArtwork(item.id)}
        actions={<div className={css.detailActions}>{renderSlot('plugins.detail.actions', { subject })}</div>}
      />
      <div className={css.detailMain}>
        <div className={css.titleRow}>
          <h3 className={css.detailTitle}>{item.label}</h3>
          {renderSlot('plugins.detail.badge', { subject })}
        </div>
        <p className={css.detailDesc}>{renderSlot('plugins.item', { view: 'summary' }, { only: item.id })}</p>
      </div>
      <div className={css.detailSections}>
        <section className={css.detailSection} data-plugin-config>
          {renderSlot('plugins.item', { view: 'page', form }, { only: item.id })}
        </section>
        {renderSlot('plugins.detail.section', { subject })}
      </div>
    </div>
  )
}

/**
 * A row's configuration page keeps its technical identity beside local package
 * text and the form supplied by its configuration entry.
 */
function RowDetail({ pkg, row, t, resolveText, onBack, renderSlot, form }: {
  readonly pkg: PackageView
  readonly row: PackageRow
  readonly t: Translate
  readonly resolveText: ResolveText
  readonly onBack: () => void
  readonly renderSlot: RenderConfig
  readonly form: ConfigPageForm | undefined
}): ReactNode {
  const { title } = packageText(pkg, resolveText)
  const { title: rowTitle, description } = rowText(row, resolveText)
  const key = rowConfigKey(pkg.name, row.rowId)
  const subject: PluginsSubject = { kind: 'row', pkg: packageRef(pkg), row: rowRef(row) }
  return (
    <div className={css.detail} data-plugin-row-detail={key}>
      <DetailTop
        crumbLabel={t('backToPackage', { name: title })}
        crumbText={title}
        onBack={onBack}
        icon={<PackageArtwork key={row.meta?.icon} src={row.meta?.icon} row size={CARD_ARTWORK_SIZE} />}
        actions={<div className={css.detailActions}>{renderSlot('plugins.detail.actions', { subject })}</div>}
      />
      <div className={css.detailMain}>
        <div className={css.titleRow}>
          <h3 className={css.detailTitle}>{rowTitle}</h3>
          {renderSlot('plugins.detail.badge', { subject })}
        </div>
        {rowTitle === row.rowId ? null : <p className={css.detailName}><code>{row.rowId}</code></p>}
        <p className={css.detailName}><code>{row.moduleName}</code></p>
        <p className={css.detailDesc}>{description ?? renderSlot('plugins.row.config', { view: 'summary' }, { entryKey: key })}</p>
      </div>
      <MetadataError error={row.meta?.error} t={t} />
      <RuntimeError error={row.diagnostic} t={t} />
      <div className={css.detailSections} data-plugin-config>
        {renderSlot('plugins.row.config', { view: 'page', form }, { entryKey: key })}
        {renderSlot('plugins.detail.section', { subject })}
      </div>
    </div>
  )
}

/**
 * One package's page: the crumb back to the list; its icon with its switch
 * and, for a package the profile installed or a selection the Host can remove, uninstall; its title beside its
 * version tag, its beta tag, and its problem tag; the package name the title
 * stands for; its one-liner; the Host's problem when it reports one; the
 * configuration the bundle registered for itself; its rows with their switches
 * and configure controls; and where it comes from.
 */
function PackageDetail({
  pkg, t, resolveText, busy, rowBusy, configured, configure, renderSlot, inMore, versions, detail,
  onBack, onSetEnabled, onUninstall, onUpdate, onSetRowEnabled, onEnsureVersions, onCheckVersions, onUpdateVersion,
}: {
  readonly pkg: PackageView
  /** The package's version check, when one started. */
  readonly versions: VersionCheck | undefined
  /** The bundle's detail document section, shown first among the page's sections. */
  readonly detail: ReactNode
  readonly t: Translate
  readonly resolveText: ResolveText
  readonly busy: boolean
  /** Whether a row has a write in flight. */
  readonly rowBusy: (row: PackageRow) => boolean
  /** Whether the bundle registered a configuration of its own. */
  readonly configured: boolean
  readonly configure: RowConfigure
  readonly renderSlot: RenderConfig
  readonly inMore: boolean
  readonly onBack: () => void
  readonly onSetEnabled: (enabled: boolean) => void
  readonly onUninstall: () => void
  readonly onUpdate: () => void
  readonly onSetRowEnabled: (row: PackageRow, enabled: boolean) => void
  /** Check a package's versions unless a check already started. */
  readonly onEnsureVersions: (packageName: string) => void
  readonly onCheckVersions: () => void
  /** Ask before installing one listed newer version. */
  readonly onUpdateVersion: (version: string) => void
}): ReactNode {
  const { title, description, beta } = packageText(pkg, resolveText)
  const newer = versionUpdate(versions)
  const status = packageStatus(pkg)
  const subject: PluginsSubject = { kind: 'bundle', pkg: packageRef(pkg) }
  return (
    <div className={css.detail} data-plugin-detail={pkg.name}>
      <DetailTop
        crumbLabel={inMore ? t('backToPackage', { name: t('moreTitle') }) : t('backToList')}
        crumbText={t(inMore ? 'moreTitle' : 'crumbRoot')}
        onBack={onBack}
        icon={<PackageArtwork key={pkg.meta?.icon} src={pkg.meta?.icon} />}
        actions={(
          <div className={css.detailActions}>
            {renderSlot('plugins.detail.actions', { subject })}
            {updateAvailable(pkg) ? (
              <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={13} />}
                disabled={busy} aria-label={t('updateLabel', { name: title })} onClick={onUpdate}>
                {t('update')}
              </Button>
            ) : null}
            {newer === undefined ? null : (
              <Button variant="primary" size="sm" icon={<IconRefreshOutlineRegular size={13} />}
                disabled={busy} aria-label={t('versionsUpdateLabel', { version: newer })} onClick={() => { onUpdateVersion(newer) }}>
                {t('versionsUpdateLabel', { version: newer })}
              </Button>
            )}
            {pkg.installed || pkg.removable
              ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={css.danger}
                  icon={<IconTrashOutlineRegular size={13} />}
                  aria-label={t('uninstallLabel', { name: title })}
                  disabled={busy || !pkg.removable || pkg.readOnlyReason !== undefined}
                  onClick={onUninstall}
                >
                  {t('uninstall')}
                </Button>
              )
              : null}
            <EnableSwitch pkg={pkg} title={title} t={t} busy={busy} onSetEnabled={onSetEnabled} />
          </div>
        )}
      />
      <div className={css.detailMain}>
        <div className={css.titleRow}>
          <h3 className={css.detailTitle}>{title}</h3>
          {pkg.version === undefined ? null : <Tag className={css.versionTag} tone="neutral">{t('versionTag', { version: pkg.version })}</Tag>}
          {beta ? <Tag className={css.statusTag} tone="info">{t('statusBeta')}</Tag> : null}
          {status === 'problem' ? <Tag className={css.statusTag} tone="danger">{t('statusProblem')}</Tag> : null}
          {pkg.availability === 'missing' ? <Tag className={css.statusTag}>{t(pkg.installed ? 'statusMissingFiles' : 'statusNotInstalled')}</Tag> : null}
          {updateAvailable(pkg) || newer !== undefined ? <Tag className={css.statusTag} tone="info">{t('statusUpdateAvailable')}</Tag> : null}
          {renderSlot('plugins.detail.badge', { subject })}
        </div>
        <p className={css.detailName}><code data-plugin-name>{pkg.name}</code></p>
        {description === undefined ? null : <p className={css.detailDesc}>{description}</p>}
      </div>
      <MetadataError error={pkg.meta?.error} t={t} />
      {pkg.error === undefined ? null : <p className={css.reason} role="status">{t('reasonLabel')}: {managementText(pkg.error, t)}</p>}
      {pkg.readOnlyReason === undefined ? null : <p className={css.reason} role="status">{managementText({ code: pkg.readOnlyReason }, t)}</p>}
      <div className={css.detailSections}>
        {detail}
        {configured
          ? (
            <section className={css.detailSection} data-plugin-config>
              {renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: pkg.name })}
            </section>
          )
          : null}
        {pkg.availability === 'missing' ? null : (<RowsSection
          rows={pkg.rows}
          t={t}
          resolveText={resolveText}
          toggle={pkg.enabled ? { busy: row => busy || rowBusy(row), onSetEnabled: onSetRowEnabled } : undefined}
          configure={configure}
        />)}
        <VersionSection
          pkg={pkg} check={versions} t={t} busy={busy} onEnsure={onEnsureVersions} onCheck={onCheckVersions} onUpdate={onUpdateVersion}
        />
        <SourceSection pkg={pkg} t={t} />
        {renderSlot('plugins.detail.section', { subject })}
      </div>
    </div>
  )
}

/** Output lines an install run's terminal shows before its middle folds: the first and last six of a long pnpm log. */

function ConfirmDialog({ name, t, onConfirm, onCancel }: {
  readonly name: string
  readonly t: Translate
  readonly onConfirm: () => void
  readonly onCancel: () => void
}): ReactNode {
  return (
    <Modal
      open
      onClose={onCancel}
      title={t('confirmUninstallTitle', { name })}
      closeLabel={t('close')}
      description={t('confirmUninstallDescription')}
      footer={(
        <>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" className={css.dangerButton} onClick={onConfirm}>
            {t('confirmUninstall')}
          </Button>
        </>
      )}
    />
  )
}

/** Render the plugin manager: the official plugins and installed bundles, their pages, the install dialog, and the confirmation. */

export {
  CardHead,
  ConfirmDialog,
  DetailTop,
  ItemCard,
  ItemDetail,
  ListSkeleton,
  PackageCard,
  PackageDetail,
  RowDetail,
  packageRef,
  packageStatus,
  rowRef,
  updateAvailable,
  updatesNote,
  versionUpdate,
}
