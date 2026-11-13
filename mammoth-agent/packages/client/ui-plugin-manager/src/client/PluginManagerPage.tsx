import { BundleDetailSection } from './BundleDetailSection.tsx'
import {
  ConfirmDialog, ItemCard, ItemDetail, ListSkeleton, PackageCard, PackageDetail, RowDetail, updatesNote, versionUpdate,
} from './PluginManagerDetail.tsx'
import { InstallDialog, INSTALLED_TAB } from './PluginManagerInstall.tsx'
import { AddPluginMenu, HIGHLIGHT_MS } from './PluginManagerList.tsx'
import { rowConfigKey } from './config-ledger.ts'
import type { PluginHeaderLayoutFace } from './header-scroll.ts'
import type { PackageRow, PackageView, PluginManagerFace } from './manager-store.ts'
import { bundleBusy, rowKey } from './manager-store.ts'
import type { createNavigationStore } from './navigation-store.ts'
import type { RowConfigure } from './plugin-manager-format.tsx'
import { orderOptionalBundles, pinnedToMainList, rowsRunning, toastHoldMs } from './plugin-manager-format.tsx'
import { noticeText, packageText } from './presentation.ts'
import type { ConfigPageForm } from './slot-contract.ts'
import { UpdateDialog } from './versions.tsx'
import {
  Button, IconChevronLeftOutlineMedium, IconChevronRightOutlineRegular, IconInfoOutlineRegular,
  IconPlusOutlineRegular, IconRefreshOutlineRegular,
  IconWarningOutlineRegular, SegmentedTabs, StateDot, Toast, Tooltip,
} from '@mammoth-ai/mmp-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@mammoth-ai/mmp-client-ui-slots'
import { HIDDEN_BUNDLES, MORE_BUNDLES } from '@mammoth-ai/mmp-official-bundles'
import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import css from './PluginManagerPage.module.css'

export type PluginManagerPageProps =
  PropsRuntime<'main'>
  & PropsLocale<'pluginManager'>
  & PropsRenderSlots<
    | 'plugins.item' | 'plugins.bundle.config' | 'plugins.row.config' | 'plugins.bundle.activation'
    | 'plugins.add.actions' | 'plugins.tab'
    | 'plugins.detail.actions' | 'plugins.detail.badge' | 'plugins.detail.section'
  >
  & InjectFace<PluginManagerFace & PluginHeaderLayoutFace>
  & PropsStore<ReturnType<typeof createNavigationStore>>

/** The page's slot renderer, narrowed to the configuration slots. */
type RenderConfig = PluginManagerPageProps['renderSlot']
type ResolveText = PluginManagerFace['resolveText']


export function PluginManagerPage(props: PluginManagerPageProps): ReactNode {
  const { t, ensure, renderSlot, resolveText } = props
  const configurations = props.useConfigurations(snapshot => snapshot.view?.namespaces)
  const formFor = (id: string): ConfigPageForm | undefined => {
    if (!configurations?.some(view => view.ns === id)) return undefined
    const form = props.configForm<Record<string, unknown>>(id)
    return { state: form.getSnapshot(), mutate: (ops, revision) => form.mutate(ops, revision) }
  }
  const state = props.usePluginManager(snapshot => snapshot)
  const ledger = props.useConfigLedger(snapshot => snapshot)
  // What is open; a package that leaves the list (uninstalled) drops back to the cards.
  const view = props.useStore(state => state.view), { setView, setTab } = props.actions
  const tabs = props.usePluginTabs(snapshot => snapshot)
  const bundleDetails = props.useBundleDetails(snapshot => snapshot)
  const language = props.useLocale(snapshot => snapshot.active)
  const selectedTab = props.useStore(state => state.tab)
  // A contributed tab that left the ledger falls back to Installed, and stays there when it returns.
  const tab = tabs.some(item => item.id === selectedTab) ? selectedTab : INSTALLED_TAB
  useEffect(() => { if (tab !== selectedTab) setTab(tab) }, [tab, selectedTab, setTab])
  const tabsId = useId()
  const [activation, setActivation] = useState<string | null>(null)
  const [headerRef] = useState(props.createHeaderRef)
  useEffect(() => { ensure() }, [ensure])
  // Installation highlights visible cards without changing the user's current page.
  const { highlight, clearHighlight } = { highlight: state.highlight, clearHighlight: props.clearHighlight }
  useEffect(() => {
    if (highlight === null) return
    const card = document.querySelector(`[data-plugin-package="${highlight}"]`)
    if (card !== null && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(clearHighlight, HIGHLIGHT_MS)
    return () => { clearTimeout(timer) }
  }, [highlight, clearHighlight])
  const noticeLine = state.notice === null || state.notice.kind === 'refresh-failed' ? null : noticeText(state.notice, t)

  // The page omits profile bundles and persistent terminals. Other installed or offered bundles and
  // unreadable selections remain manageable; Settings' Plugin list inspects the full Host inventory.
  const listed = state.packages.filter(pkg => !HIDDEN_BUNDLES.has(pkg.name)
    && (pkg.listedByDefault !== false || pkg.enabled || pkg.installed || rowsRunning(pkg))
    && (pkg.installed || pkg.official || pkg.error !== undefined))
  const mine = listed.filter(pkg => !pkg.official)
  const official = listed.filter(pkg => pkg.official)
  // Both lists read one order over the eligible bundles: the main list holds the always-held ones plus the held-back
  // ones the profile enabled, and the More list holds the eligible ones, so enabling a bundle from the More list pins it
  // to the main list without moving it among its neighbours there.
  const ordered = orderOptionalBundles(official)
  const pinned = new Set(official.filter(pinnedToMainList).map(pkg => pkg.name))
  const extensions = ordered.filter(pkg => pinned.has(pkg.name))
  const more = ordered
  const loaded = state.status === 'ready' || state.status === 'error'
  const refreshing = state.refreshStatus === 'refreshing'
  const openPkg = view.kind === 'package' || view.kind === 'row'
    ? listed.find(pkg => pkg.name === view.name)
    : undefined
  const openItem = view.kind === 'item' ? ledger.items.find(item => item.id === view.id) : undefined
  const openRow = view.kind === 'row' && openPkg !== undefined ? openPkg.rows.find(row => row.rowId === view.rowId) : undefined
  const onInstalled = tab === INSTALLED_TAB
  const showsCards = !onInstalled || (openPkg === undefined && openItem === undefined)
  const detailFromMore = (view.kind === 'package' || view.kind === 'row')
    && (view.from === 'more' || (openPkg !== undefined && MORE_BUNDLES.includes(view.name) && !pinned.has(view.name)))
  const showsMoreList = onInstalled && showsCards && (view.kind === 'more' || detailFromMore)
  const showsMainList = showsCards && !showsMoreList
  const installedCards = onInstalled && showsCards
  const openPkgInMore = openPkg !== undefined && openPkg.official && detailFromMore
  const returnTab = view.kind === 'package' || view.kind === 'row' ? view.returnTab : undefined
  const backToMore = openPkgInMore && returnTab === undefined
  const pkgOrigin = returnTab !== undefined ? { returnTab } : backToMore ? { from: 'more' as const } : {}
  // The Installed tab's panel, whatever it currently shows; the More list is not a tab panel.
  const installedPanel = tabs.length === 0 || showsMoreList
    ? {}
    : { role: 'tabpanel', id: `${tabsId}-${INSTALLED_TAB}-panel`, 'aria-labelledby': `${tabsId}-${INSTALLED_TAB}` }
  const activated = listed.find(pkg => pkg.name === activation && pkg.enabled && !state.busy.includes(pkg.name))
  const setBundleEnabled = (name: string, enabled: boolean): void => {
    setActivation(enabled ? name : null)
    props.setEnabled(name, enabled)
  }
  const setRowEnabled = (row: PackageRow, enabled: boolean): void => {
    /* v8 ignore next -- a row without a live entry has its switch disabled */
    if (row.entryId !== undefined) props.setRowEnabled(row.entryId, enabled)
  }
  const configure = (pkg: PackageView): RowConfigure => ({
    has: row => ledger.rows.has(rowConfigKey(pkg.name, row.rowId)),
    open: (row) => { setView({ kind: 'row', name: pkg.name, rowId: row.rowId, ...pkgOrigin }) },
  })
  const updates = updatesNote(mine, state.versions, t)
  const updatePkg = state.update === null ? undefined : state.packages.find(pkg => pkg.name === state.update?.packageName)
  const packageBusy = (pkg: PackageView): boolean => bundleBusy(state, pkg.name)
  const packageCard = (pkg: PackageView): ReactNode => (
    <PackageCard
      key={pkg.name}
      pkg={pkg}
      t={t}
      resolveText={resolveText}
      busy={packageBusy(pkg)}
      highlighted={state.highlight === pkg.name}
      newer={versionUpdate(state.versions[pkg.name])}
      onOpen={() => { setActivation(null); setView({ kind: 'package', name: pkg.name, ...showsMoreList ? { from: 'more' } : {} }) }}
      onSetEnabled={(enabled) => { setBundleEnabled(pkg.name, enabled) }}
    />
  )
  const basicCards = ledger.items.map(item => (
    <ItemCard key={`item:${item.id}`} item={item} t={t} renderSlot={renderSlot} onOpen={() => { setView({ kind: 'item', id: item.id }) }} />
  ))
  const renderGroup = (id: 'basic' | 'extensions' | 'bundles', heading: string, cards: readonly ReactNode[]): ReactNode => {
    const offersMore = id === 'extensions' && more.length > 0
    if (cards.length === 0 && !offersMore) return null
    return (
      <section className={css.group} data-plugin-scope="global" data-plugin-group={id}>
        <div className={css.groupHead}>
          <h3 className={css.groupTitle}>{heading}</h3>
          {offersMore ? (
            <Button size="sm" className={css.groupMore} onClick={() => { setView({ kind: 'more' }) }}>
              {t('moreAction')}<IconChevronRightOutlineRegular size={14} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        {cards.length > 0 ? <ul className={css.cards}>{cards}</ul> : null}
      </section>
    )
  }

  return (
    <section className={css.page} data-plugin-panel aria-busy={state.status === 'loading' || refreshing}>
      {showsMoreList ? (
        <header className={css.moreHead} data-window-drag>
          <Button size="sm" className={css.moreBack} aria-label={t('backToList')} onClick={() => { setView({ kind: 'list' }) }}>
            <IconChevronLeftOutlineMedium size={20} aria-hidden="true" />
          </Button>
          <h1 className={css.pageTitle}>{t('moreTitle')}</h1>
        </header>
      ) : null}
      <div className={css.pageBody} data-plugin-body>
        {showsMainList
          ? (
            <div
              className={`${css.pageBar}${tabs.length > 0 ? ` ${css.pageBarWithTabs}` : ''}`}
              data-plugin-bar
              ref={headerRef}
            >
              <header className={css.pageHead} data-window-drag>
                <div className={css.pageHeading}>
                  <h1 className={css.pageTitle} data-plugin-header-part="title">{t('title')}</h1>
                  <div className={css.pageIntro} data-plugin-header-part="intro">
                    <span>{t('intro')}</span>
                    <Tooltip label={t('infoDescription')} side="bottom" delayMs={300} maxWidth={300} portal openOnClick>
                      <Button variant="ghost" size="sm" className={css.infoButton} aria-label={t('infoLabel')}>
                        <IconInfoOutlineRegular size={11} aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
                <div className={css.toolbar} data-plugin-toolbar data-plugin-header-part="toolbar" hidden={!onInstalled}>
                  {updates === undefined ? null : <span className={css.updatesNote} data-tone={updates.tone}>{updates.text}</span>}
                  <Tooltip label={t('refresh')} delayMs={500} focusDelayMs={500} side="bottom" portal disabled={!loaded || refreshing}>
                    <Button variant="outline" size="sm" className={css.addButton} aria-label={t('refresh')} aria-busy={refreshing}
                      disabled={!loaded || refreshing} onClick={props.refresh}
                      icon={refreshing ? <StateDot state="ongoing" size={13} /> : <IconRefreshOutlineRegular size={13} />}>
                      <span className={css.toolbarLabel}>{t('refresh')}</span>
                    </Button>
                  </Tooltip>
                  {state.install.requestId === undefined
                    ? <AddPluginMenu t={t} disabled={!loaded} openInstall={props.openInstall} renderSlot={renderSlot} />
                    : (
                      <Tooltip label={t('installViewTask')} side="bottom" delayMs={500} focusDelayMs={500} portal disabled={!loaded}>
                        <Button variant="primary" size="sm" className={css.addButton} icon={<IconPlusOutlineRegular size={13} />}
                          aria-label={t('installViewTask')} disabled={!loaded} onClick={props.openInstall}>
                          <span className={css.toolbarLabel}>{t('installViewTask')}</span>
                        </Button>
                      </Tooltip>
                    )}
                </div>
                {tabs.length > 0
                  ? (
                    <div className={css.pageTabs} data-plugin-header-part="tabs">
                      <SegmentedTabs
                        size="sm"
                        className={css.pageTabList}
                        label={t('tabsLabel')}
                        value={tab}
                        onChange={(next) => { setTab(next) }}
                        items={[
  { value: INSTALLED_TAB, label: t('installedTab'), id: `${tabsId}-${INSTALLED_TAB}`, panelId: `${tabsId}-${INSTALLED_TAB}-panel` },
  ...tabs.map(item => ({ value: item.id, label: item.label, id: `${tabsId}-${item.id}`, panelId: `${tabsId}-${item.id}-panel` })),
                        ]}
                      />
                    </div>
                  )
                  : null}
              </header>
            </div>
          )
          : null}

        {!onInstalled
          ? (
            <div role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`} className={css.tabPanel}>
              {renderSlot('plugins.tab', {
                install: props.installFrom,
                openPackage: (name) => { setTab(INSTALLED_TAB); setView({ kind: 'package', name, returnTab: tab }) },
              }, { only: tab })}
            </div>
          )
          : null}
        {installedCards && !loaded ? (
          <div className={css.installedPanel} {...installedPanel}>
            {state.status === 'loading' ? <ListSkeleton label={t('loading')} /> : null}
            {state.status === 'unavailable' ? (
              <p className={`${css.status} ${css.statusWithDot}`} role="status">
                <StateDot state="idle" />{t('unavailable')}
              </p>
            ) : null}
          </div>
        ) : null}
        {state.notice === null || noticeLine === null
          ? null
          : (
            <Toast
              key={state.notice.seq}
              text={noticeLine}
              icon={<IconWarningOutlineRegular />}
              holdMs={toastHoldMs(noticeLine)}
              onDone={props.dismissNotice}
            />
          )}
        {!showsCards && state.status === 'error' && !refreshing
          ? (
            <div className={css.failure}>
              <p className={css.statusWithDot} role="alert">
                <StateDot state="error" />{t(state.refreshStatus === 'failed' ? 'refreshError' : 'error')}
              </p>
              <Button variant="outline" size="sm" onClick={props.refresh}>{t('retry')}</Button>
            </div>
          )
          : null}
        {onInstalled && loaded && openPkg !== undefined && openRow !== undefined
          ? (
            <RowDetail
              pkg={openPkg}
              row={openRow}
              form={formFor(openRow.rowId)}
              t={t}
              resolveText={resolveText}
              renderSlot={renderSlot}
              onBack={() => { setView({ kind: 'package', name: openPkg.name, ...pkgOrigin }) }}
            />
          )
          : null}
        {onInstalled && loaded && openPkg !== undefined && openRow === undefined
          ? (
            <PackageDetail
              pkg={openPkg}
              t={t}
              resolveText={resolveText}
              busy={packageBusy(openPkg)}
              rowBusy={row => row.entryId !== undefined && state.busy.includes(rowKey(row.entryId))}
              configured={ledger.bundles.has(openPkg.name)}
              configure={configure(openPkg)}
              renderSlot={renderSlot}
              inMore={backToMore}
              detail={(
                <BundleDetailSection name={openPkg.name} version={openPkg.version} fromNpm={openPkg.availability === 'missing'}
                  language={language} details={bundleDetails} t={t}
                  load={props.loadDetail} retry={props.retryDetail} image={props.detailImage} />
              )}
              onBack={() => {
                if (returnTab !== undefined) setTab(returnTab)
                setView({ kind: backToMore ? 'more' : 'list' })
              }}
              onSetEnabled={(enabled) => { setBundleEnabled(openPkg.name, enabled) }}
              onUninstall={() => { props.uninstall(openPkg.name) }}
              onUpdate={() => { props.update(openPkg.name) }}
              onSetRowEnabled={setRowEnabled}
              versions={state.versions[openPkg.name]}
              onEnsureVersions={props.ensureVersions}
              onCheckVersions={() => { props.checkVersions(openPkg.name) }}
              onUpdateVersion={(version) => { props.openUpdate(openPkg.name, version) }}
            />
          )
          : null}
        {onInstalled && loaded && openItem !== undefined
          ? <ItemDetail form={formFor(openItem.id)} item={openItem} t={t} renderSlot={renderSlot} onBack={() => { setView({ kind: 'list' }) }} />
          : null}
        {loaded && installedCards
          ? basicCards.length === 0 && official.length === 0 && mine.length === 0 && state.status !== 'error'
            ? <div className={css.installedPanel} {...installedPanel}><p className={css.empty}>{t('empty')}</p></div>
            : (
              <div className={css.installedPanel} {...installedPanel}>
                {showsMoreList ? (
                  <section className={css.group} data-plugin-scope="global" data-plugin-group="more">
                    <ul className={css.cards}>{more.map(packageCard)}</ul>
                  </section>
                ) : (
                  <>
                    {renderGroup('basic', t('basicTitle'), basicCards)}
                    {renderGroup('extensions', t('extensionsTitle'), extensions.map(packageCard))}
                    {renderGroup('bundles', t('bundlesTitle'), mine.map(packageCard))}
                  </>
                )}
                {/* A failed package read trails the groups it left incomplete: right under the groups on a
                    first-load failure, and after the kept cards when a refresh fails over stale data. */}
                {state.status === 'error' && !refreshing
                  ? (
                    <div className={css.failure}>
                      <p className={css.statusWithDot} role="alert">
                        <StateDot state="error" />{t(state.refreshStatus === 'failed' ? 'refreshError' : 'error')}
                      </p>
                      <Button variant="outline" size="sm" onClick={props.refresh}>{t('retry')}</Button>
                    </div>
                  )
                  : null}
              </div>
            )
          : null}
        {onInstalled && activated !== undefined && !state.install.open
          ? renderSlot('plugins.bundle.activation', {
            packageName: activated.name,
            onDismiss: () => { setActivation(null) },
            onOpenDetails: () => {
              setActivation(null)
              setView({ kind: 'package', name: activated.name, ...showsMoreList ? { from: 'more' } : {} })
            },
          }, { entryKey: activated.name }) : null}
      </div>
      {state.update === null ? null : (
        <UpdateDialog
          update={state.update}
          title={updatePkg === undefined ? state.update.packageName : packageText(updatePkg, resolveText).title}
          t={t}
          onRun={props.runUpdate}
          onClose={props.closeUpdate}
          onToggleOutput={props.toggleUpdateOutput}
        />
      )}
      <InstallDialog
        install={state.install}
        t={t}
        onClose={props.closeInstall}
        onEditSpec={props.editInstallSpec}
        onRun={props.runInstall}
        onCancel={props.cancelInstall}
        onReconcile={props.reconcileInstall}
        onToggleDetails={props.toggleInstallDetails}
        onEnableNow={() => { setActivation(state.install.installed); props.enableInstalled() }}
        onApproveBuilds={props.approveBuildsAndRetry}
        onToggleRegistry={props.toggleRegistryOptions}
        onChooseRegistry={props.chooseRegistry}
        onChangeRegistry={props.changeRegistry}
        onUseGithubMirror={props.useGithubMirror}
      />
      {state.confirm === null
        ? null
        : (
          <ConfirmDialog
            name={packageText(
              state.packages.find(pkg => pkg.name === state.confirm?.packageName) ?? { name: state.confirm.packageName },
              resolveText,
            ).title}
            t={t}
            onConfirm={props.confirm}
            onCancel={props.cancelConfirm}
          />
        )}
    </section>
  )
}

export { RenderConfig, ResolveText }
