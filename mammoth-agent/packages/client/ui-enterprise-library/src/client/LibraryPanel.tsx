import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Menu, Modal, Tag, FileTypeIcon, IconClockOutlineRegular, IconFolderCloseRegular, IconShareOutlineRegular, IconTrashOutlineRegular, IconSearchOutlineRegular, IconLinkOutlineRegular, IconChevronDownOutlineRegular, IconCloseOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryKey } from './locales.ts'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsRenderFactories } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar-documentpreview/client'
import { fetchLibraryItems, fetchLibraryPage, fetchLibraryScopeImpact, fetchLibraryPreviewBytes, LibraryRequestError, libraryRequest, type LibraryFetch, type LibraryView } from './api.ts'
import { choiceBlock, type LibraryChoice } from './selection.ts'
import { RowActions } from './LibraryRowActions.tsx'
import { LibraryTree } from './LibraryTree.tsx'
import { LibraryCreateMenu, type LibraryCreateAction } from './LibraryCreateMenu.tsx'
import { LibraryUploadDialog } from './LibraryUploadDialog.tsx'
import { useLibrarySidebarResize } from './useLibrarySidebarResize.ts'
import css from './LibraryPanel.module.css'

export type LibrarySourceRequest = { nodeId: string; versionId: string }

export type LibraryPanelInjected = {
  readonly hooks: { sourceRequest: HostObservable<LibrarySourceRequest | null>; navigationWidth: HostObservable<number | null> }
  readonly setNavigationElement: (element: HTMLElement | null) => void
  readonly clearSourceRequest: () => void
  readonly origin: string
  readonly fetchImpl: LibraryFetch
  readonly onUse: (item: LibraryChoice) => Promise<void> | void
  readonly onUseMany?: (items: readonly LibraryChoice[]) => Promise<void>
}
export type LibraryPanelProps = PropsRuntime<'main'> & PropsLocale<'enterpriseLibrary'> & InjectFace<LibraryPanelInjected> & PropsRenderFactories
const VIEWS: readonly LibraryView[] = ['recent', 'mine', 'shared', 'trash']
type SaveTarget = { parentId: string | null; scope: 'PRIVATE' | 'ENTERPRISE'; name: string }
type Edit = { kind: 'folder' | 'link' | 'rename' | 'move'; item?: LibraryChoice; target?: SaveTarget }
type Source = { originalName?: string; parseStatus?: string; bytes?: Uint8Array<ArrayBuffer>; mimeType?: string; missingFonts?: readonly string[]; item?: LibraryChoice; nodeId?: string; previewKind?: string; mediaUrl?: string; name?: string; text?: string | null; linkUrl?: string | null; parseReason?: string | null; highlightNote?: string | null; locator?: string | null; versionNo?: number | null; versionId?: string; truncated?: boolean; truncationNote?: string | null; chunks?: readonly { locator: string; text: string }[] }

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.markdown,.txt,.csv,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.webm,.mov'
const VIEW_ICONS = { recent: IconClockOutlineRegular, mine: IconFolderCloseRegular, shared: IconShareOutlineRegular, trash: IconTrashOutlineRegular }
function statusKey(status: string | null): LibraryKey {
  if (status === 'READY') return 'statusReady'
  if (status === 'FAILED') return 'statusFailed'
  if (status === 'PENDING' || status === 'QUEUED') return 'statusPending'
  if (status === 'PROCESSING' || status === 'PARSING') return 'statusProcessing'
  return 'statusDownloadOnly'
}

/** Native Web/desktop library browser. Explicit save never uploads temporary chat attachments. */
export function LibraryPanel({ t, origin, fetchImpl, onUse, onUseMany, useSourceRequest, clearSourceRequest, renderFactorySlot, useNavigationWidth, setNavigationElement }: LibraryPanelProps) {
  const navigationWidth = useNavigationWidth(value => value)
  const sidebarResize = useLibrarySidebarResize(navigationWidth, setNavigationElement)
  const requested = useSourceRequest(value => value)
  const previewGeneration = useRef(0)
  useEffect(() => () => { previewGeneration.current++ }, [])
  const [view, setView] = useState<LibraryView>('mine')
  const [expandedRoots, setExpandedRoots] = useState({ mine: true, shared: false })
  const [mountedRoots, setMountedRoots] = useState({ mine: true, shared: false })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limits, setLimits] = useState<{ maxFileBytes: number; allowedExtensions: string[] }>()
  const [path, setPath] = useState<readonly { id: string; name: string }[]>([])
  const [parentScope, setParentScope] = useState<'PRIVATE' | 'ENTERPRISE'>()
  const [items, setItems] = useState<readonly LibraryChoice[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [tenants, setTenants] = useState<readonly { id: string; name: string }[]>([])
  const [switching, setSwitching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<SaveTarget & { replacement?: LibraryChoice }>()
  const [revision, setRevision] = useState(0)
  const [edit, setEdit] = useState<Edit>()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState<Source>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewControl = useRef<AbortController>()
  const closePreview = useCallback(() => {
    previewGeneration.current++
    previewControl.current?.abort()
    setSource(undefined)
    setPreviewLoading(false)
    setPreviewError('')
  }, [])
  useEffect(() => () => { previewControl.current?.abort() }, [])
  const openSource = useCallback(async (item: LibraryChoice, versionId = item.versionId) => {
    previewControl.current?.abort()
    const control = new AbortController()
    previewControl.current = control
    const generation = ++previewGeneration.current
    setSource({ nodeId: item.nodeId, name: item.name, item: { ...item, versionId, versionNo: null, parseStatus: null }, ...(versionId ? { versionId } : {}) })
    setPreviewLoading(true)
    setPreviewError('')
    const transport: LibraryFetch = (url, init) => fetchImpl(url, { ...init, signal: control.signal })
    let metadataReady = false
    try {
      const result = await libraryRequest(origin, `nodes/${encodeURIComponent(item.nodeId)}/preview?versionId=${encodeURIComponent(versionId ?? '')}`, 'GET', undefined, transport) as Source
      if (control.signal.aborted || generation !== previewGeneration.current) return
      if ((result.nodeId && result.nodeId !== item.nodeId) || (result.versionId && result.versionId !== versionId)) throw new Error(t('operationFailed'))
      metadataReady = true
      const versionNo = result.versionNo ?? (versionId === item.versionId ? item.versionNo : null)
      const authorized = { ...result, nodeId: item.nodeId,
        item: { ...item, versionId, versionNo, parseStatus: result.parseStatus ?? (versionId === item.versionId ? item.parseStatus : null), parseReason: result.parseReason ?? null },
        versionNo, name: result.name ?? item.name, ...(versionId ? { versionId } : {}) }
      setSource(authorized)
      const contents = item.kind === 'FILE' && versionId
        ? await fetchLibraryPreviewBytes(origin, item.nodeId, versionId, result.originalName ?? result.name ?? item.name, fetchImpl, control.signal)
        : undefined
      if (control.signal.aborted || generation !== previewGeneration.current) return
      setSource({ ...authorized, ...contents })
    } catch (error) {
      if (!control.signal.aborted && generation === previewGeneration.current) {
        if (!metadataReady || (error instanceof LibraryRequestError && [401, 403, 409].includes(error.status))) setSource(undefined)
        setPreviewError(error instanceof Error ? error.message : t('operationFailed'))
      }
    } finally {
      if (!control.signal.aborted && generation === previewGeneration.current) setPreviewLoading(false)
    }
  }, [origin, fetchImpl, t])
  const [versions, setVersions] = useState<{ item: LibraryChoice; rows: readonly { id: string; versionNo: number; parseStatus: string }[] }>()
  const [moveFolders, setMoveFolders] = useState<readonly LibraryChoice[]>([])
  const [movePath, setMovePath] = useState<readonly { id: string; name: string; scope?: string | undefined }[]>([])
  const parentId = path.at(-1)?.id ?? null
  const refresh = () => { setRevision(n => n + 1) }
  /** Platform admins have no default enterprise; let them enter one in place. */
  const loadTenants = async () => {
    try {
      const res = await fetch(`${origin}/api/auth/me`, { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const me = await res.json() as { user?: { isPlatformAdmin?: boolean }; tenants?: readonly { id: string; name: string; type?: string; status?: string }[] }
      if (!me.user?.isPlatformAdmin) return
      setTenants((me.tenants ?? []).filter(x => x.type !== 'PLATFORM' && x.status === 'active').map(x => ({ id: x.id, name: x.name })))
    } catch { /* the guidance text stays when tenant discovery fails */ }
  }
  const enterTenant = async (tenantId: string) => {
    if (switching) return
    setSwitching(true); setError('')
    try {
      const res = await fetch(`${origin}/api/auth/switch-tenant`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message ?? `切换企业失败 (${res.status})`)
      }
      closePreview(); setBlocked(null); setLimits(undefined); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : t('operationFailed')) }
    finally { setSwitching(false) }
  }
  useEffect(() => { setPage(1) }, [view, query, parentId, filter])

  useEffect(() => {
    let current = true
    void libraryRequest(origin, 'config', 'GET', undefined, fetchImpl).then(value => {
      const config = value as { maxFileBytes?: number; allowedExtensions?: string[]; enabled?: boolean; message?: string }
      if (!current) return
      if (config.enabled === false) {
        closePreview()
        setBlocked(config.message ?? t('loadError'))
        void loadTenants()
        return
      }
      setBlocked(null)
      if (typeof config.maxFileBytes === 'number' && Array.isArray(config.allowedExtensions)) setLimits({ maxFileBytes: config.maxFileBytes, allowedExtensions: config.allowedExtensions })
    }).catch(e => {
      // Older Ground builds answer 403 NO_TENANT instead of a disabled config.
      if (current && e instanceof Error && /缺少企业上下文|NO_TENANT/.test(e.message)) {
        closePreview()
        setBlocked('资料库属于企业能力：请先在控制台进入企业工作台，再打开资料库')
        void loadTenants()
      }
    })
    return () => { current = false }
  }, [origin, fetchImpl, revision])
  useEffect(() => {
    if (blocked !== null) { setLoading(false); setItems([]); return }
    const control = new AbortController()
    setLoading(true); setItems([])
    void fetchLibraryPage(origin, view, query, fetchImpl, control.signal, parentId, page, filter).then(next => {
      if (!control.signal.aborted) {
        const lastPage = Math.max(1, Math.ceil(next.total / 20)); if (page > lastPage) { setPage(lastPage); return }
        setItems(next.items); setTotal(next.total); setParentScope(next.parentScope);
        if (parentId && next.breadcrumb.length) setPath(next.breadcrumb); setError('') }
    }).catch(e => { if (!control.signal.aborted) {
      if (e instanceof Error && /(?:401|403|409)/.test(e.message)) { setItems([]); closePreview(); setVersions(undefined) }
      setError(`${t('loadError')} ${e instanceof Error ? e.message : ''}`)
    } }).finally(() => { if (!control.signal.aborted) setLoading(false) })
    return () => { control.abort() }
  }, [blocked, origin, view, query, fetchImpl, t, revision, parentId, page, filter])
  useEffect(() => {
    if (edit?.kind !== 'move') return
    const control = new AbortController()
    void fetchLibraryItems(origin, 'mine', '', fetchImpl, control.signal, movePath.at(-1)?.id).then(next => {
      if (!control.signal.aborted) setMoveFolders(next.filter(x => x.kind === 'FOLDER' && x.nodeId !== edit.item?.nodeId))
    }).catch(e => { if (!control.signal.aborted) setError(String(e)) })
    return () => { control.abort() }
  }, [origin, fetchImpl, edit, movePath])
  useEffect(() => {
    if (!requested) return
    previewControl.current?.abort()
    const control = new AbortController()
    previewControl.current = control
    const generation = ++previewGeneration.current
    setSource(undefined)
    setPreviewError('')
    setPreviewLoading(true)
    const transport: LibraryFetch = (url, init) => fetchImpl(url, { ...init, signal: control.signal })
    void libraryRequest(origin, `nodes/${encodeURIComponent(requested.nodeId)}/preview?versionId=${encodeURIComponent(requested.versionId)}`, 'GET', undefined, transport).then(async value => {
      const opened = value as Source
      if (control.signal.aborted || generation !== previewGeneration.current) return
      if (opened.versionId !== requested.versionId || !opened.name) throw new Error(t('operationFailed'))
      const contents = await fetchLibraryPreviewBytes(origin, requested.nodeId, requested.versionId, opened.originalName ?? opened.name, fetchImpl, control.signal)
      if (!control.signal.aborted && generation === previewGeneration.current) {
        setSource({ ...opened, ...contents, nodeId: requested.nodeId, name: opened.name, versionId: requested.versionId })
      }
    }).catch(error => {
      if (!control.signal.aborted && generation === previewGeneration.current) {
        setPreviewError(error instanceof Error ? error.message : t('operationFailed'))
      }
    }).finally(() => {
      if (!control.signal.aborted && generation === previewGeneration.current) setPreviewLoading(false)
    })
    return () => { control.abort() }
  }, [requested, origin, fetchImpl, t])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setNotice(''); setError(e instanceof Error ? e.message : t('operationFailed')) }
    finally { setBusy(false) }
  }
  const mutate = async (suffix: string, method: string, data?: unknown) => {
    await libraryRequest(origin, suffix, method, data, fetchImpl)
    if (method === 'DELETE' || /\/(?:recycle|scope|move)$/.test(suffix)) closePreview()
    refresh()
  }
  const loadUploadLimits = async () => {
    const config = await libraryRequest(origin, 'config', 'GET', undefined, fetchImpl) as { maxFileBytes: number; allowedExtensions: string[] }
    setLimits(config); return config
  }
  const uploadOne = async (file: File) => {
    if (!uploadTarget) throw new Error(t('operationFailed'))
    const form = new FormData(); form.append('files', file)
    if (!uploadTarget.replacement) {
      if (uploadTarget.parentId) form.append('parentId', uploadTarget.parentId)
      form.append('scope', uploadTarget.scope); form.append('confirmShare', String(uploadTarget.scope === 'ENTERPRISE'))
    }
    const result = await libraryRequest(origin, uploadTarget.replacement ? `files/${uploadTarget.replacement.nodeId}/versions` : 'files', 'POST', form, fetchImpl)
    if (uploadTarget.replacement) return
    if (result && typeof result === 'object' && 'failed' in result && Array.isArray(result.failed) && result.failed.length) throw new Error(result.failed.map(row => String(row && typeof row === 'object' && 'message' in row ? row.message : t('operationFailed'))).join('; '))
    if (!result || typeof result !== 'object' || !('items' in result) || !Array.isArray(result.items) || !result.items.length) throw new Error(t('operationFailed'))
  }
  const revealCreated = () => {
    if (view === 'recent') { setView('mine'); setPath([]) }
    setQuery(''); setFilter('all'); setPage(1); refresh()
  }
  const captureTarget = (): SaveTarget => ({ parentId, scope: parentId ? parentScope ?? (view === 'shared' ? 'ENTERPRISE' : 'PRIVATE') : view === 'shared' ? 'ENTERPRISE' : 'PRIVATE', name: path.at(-1)?.name ?? t(view === 'shared' ? 'shared' : 'mine') })
  const openEdit = (kind: Edit['kind'], item?: LibraryChoice, target = captureTarget()) => {
    setEdit(item ? { kind, item } : { kind, target }); setName(item?.name ?? ''); setUrl(''); setMovePath([])
  }
  const useItems = (chosen: readonly LibraryChoice[]) => run(async () => {
    if (onUseMany) await onUseMany(chosen)
    else for (const item of chosen) await onUse(item)
    setNotice(t('added'))
  })
  const visibleItems = items.filter(item => filter === 'all' || (filter === 'ready' ? !choiceBlock(item).disabled : filter === 'failed' ? item.parseStatus === 'FAILED' : item.kind === 'FILE' && statusKey(item.parseStatus) === 'statusDownloadOnly'))
  const chooseView = (next: LibraryView) => {
    if (next !== view || next === 'recent') closePreview()
    if (next === 'mine' || next === 'shared') {
      setExpandedRoots(roots => ({ ...roots, [next]: next === view ? !roots[next] : true }))
      setMountedRoots(roots => ({ ...roots, [next]: true }))
    }
    setView(next); setPath([]); setParentScope(undefined); setQuery(''); setFilter('all')
  }
  const chooseFolder = (nextView: 'mine' | 'shared', next: readonly { id: string; name: string }[], item: LibraryChoice) => {
    closePreview()
    setView(nextView); setQuery(''); setPath(next)
    setParentScope(item.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRIVATE')
  }
  const downloadVersion = (item: Pick<LibraryChoice, 'nodeId'> & { versionId?: string | null }, versionId = item.versionId) => {
    const link = document.createElement('a')
    link.href = `${origin}/ground-library/nodes/${encodeURIComponent(item.nodeId)}/download?versionId=${encodeURIComponent(versionId ?? '')}`
    link.download = ''; link.click()
  }
  const rowAction = (action: string, item: LibraryChoice) => {
    const id = encodeURIComponent(item.nodeId)
    if (action === 'use') { void useItems([item]); return }
    if (action === 'download') { downloadVersion(item); return }
    if (action === 'preview') { void openSource(item); return }
    if (action === 'rename' || action === 'move') { openEdit(action, item); return }
    if (action === 'replace') { setUploadTarget({ ...captureTarget(), replacement: item }); return }
    void run(async () => {
      if (action === 'versions') {
        const result = await libraryRequest(origin, `nodes/${id}/versions`, 'GET', undefined, fetchImpl)
        setVersions({ item, rows: Array.isArray(result) ? result : [] })
      } else if (action === 'scope') {
        const scope = item.scope === 'ENTERPRISE' ? 'PRIVATE' : 'ENTERPRISE'
        const impact = await fetchLibraryScopeImpact(origin, item.nodeId, scope, fetchImpl)
        if (window.confirm(t(scope === 'ENTERPRISE' ? 'confirmShareTree' : 'confirmUnshareTree').replace('{count}', String(impact.total)))) await mutate(`nodes/${id}/scope`, 'POST', { scope, confirmShare: scope === 'ENTERPRISE', confirmUnshare: scope === 'PRIVATE', expectedTreeRevision: impact.treeRevision })
      } else if (action === 'purge') {
        if (window.confirm(t('confirmPurge'))) await mutate(`nodes/${id}`, 'DELETE')
      } else if (action === 'retry') await mutate(`nodes/${id}/retry-parse`, 'POST')
      else if (action === 'restore' || action === 'recycle') await mutate(`nodes/${id}/${action}`, 'POST')
    })
  }
  const saveEdit = () => { if (edit) void run(async () => {
    if (edit.kind === 'move' && edit.item) {
      let options: { confirmShare?: boolean; expectedTreeRevision?: string } = {}
      if (movePath.at(-1)?.scope === 'ENTERPRISE') {
        const impact = await fetchLibraryScopeImpact(origin, edit.item.nodeId, 'ENTERPRISE', fetchImpl)
        if (impact.changed && !window.confirm(t('confirmShareTree').replace('{count}', String(impact.total)))) return
        options = { confirmShare: true, expectedTreeRevision: impact.treeRevision }
      }
      await mutate(`nodes/${edit.item.nodeId}/move`, 'POST', { parentId: movePath.at(-1)?.id ?? null, ...options })
    }
    else if (edit.kind === 'rename' && edit.item) {
      await mutate(`nodes/${edit.item.nodeId}`, 'PATCH', { name })
      setSource(current => current?.nodeId === edit.item?.nodeId ? { ...current, name } : current)
    }
    else if (edit.target) { const target = edit.target; await mutate(edit.kind === 'folder' ? 'folders' : 'links', 'POST', { name, parentId: target.parentId, scope: target.scope, confirmShare: target.scope === 'ENTERPRISE', ...(edit.kind === 'link' ? { url } : {}) }); revealCreated() }
    setEdit(undefined)
  }) }
  const beginCreate = (action: LibraryCreateAction, nextView: 'mine' | 'shared', nextPath: readonly { id: string; name: string }[], target: SaveTarget) => {
    closePreview()
    setView(nextView); setPath(nextPath); setParentScope(target.scope); setQuery(''); setFilter('all')
    setExpandedRoots(roots => ({ ...roots, [nextView]: true }))
    setMountedRoots(roots => ({ ...roots, [nextView]: true }))
    if (action === 'upload') setUploadTarget(target)
    else openEdit(action, undefined, target)
  }
  const flatList = <div className={css.flatList}>
    {loading && <p role="status">{t('loading')}</p>}
    {!loading && visibleItems.length === 0 && <p className={css.treeEmpty}>{query || filter !== 'all' ? t('noResults') : t('empty')}</p>}
    {visibleItems.map(item => <div key={item.nodeId} className={css.flatRow}>
      <FileTypeIcon path={item.name} size={16} />
      <button type="button" className={css.treeName} disabled={view === 'trash'} title={item.name} onClick={() => {
        if (item.kind === 'FOLDER') { chooseFolder(view === 'shared' ? 'shared' : 'mine', [...path, { id: item.nodeId, name: item.name }], item) }
        else void openSource(item)
      }}><span>{item.name}</span></button>
      <span className={css.treeActions}>
        {view !== 'trash' && item.kind === 'FOLDER' && item.canManage && <LibraryCreateMenu name={item.name} disabled={busy} t={t}
          onCreate={action => { beginCreate(action, view === 'shared' ? 'shared' : 'mine', [...path, { id: item.nodeId, name: item.name }], {
            parentId: item.nodeId, scope: item.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRIVATE', name: item.name,
          }) }} />}
        <RowActions item={item} view={view} busy={busy} t={t} onAction={rowAction} />
      </span>
      {item.parseReason && <small className={css.flatReason}>{item.parseReason}</small>}
    </div>)}
    {total > 20 && <nav className={css.pagination} aria-label={t('browse')}>
      <Button size="sm" disabled={loading || page <= 1} onClick={() => { setPage(n => n - 1) }}>{t('previousPage')}</Button>
      <span>{page} / {Math.ceil(total / 20)}</span>
      <Button size="sm" disabled={loading || page * 20 >= total} onClick={() => { setPage(n => n + 1) }}>{t('nextPage')}</Button>
    </nav>}
  </div>
  return <section ref={sidebarResize.pageRef} className={css.page} style={sidebarResize.style} aria-busy={busy || loading}>
    <aside className={css.navigation} ref={sidebarResize.attachNavigation}>
      <h2 className={css.navTitle}>{t('panel')}</h2>
      <div className={css.toolbar}>
        <div className={css.search}><IconSearchOutlineRegular size={18} /><Input type="search" aria-label={t('searchPlaceholder')} value={query} placeholder={t('searchPlaceholder')} onChange={e => { setQuery(e.target.value) }} /></div>
        <Menu open={filterOpen} onClose={() => { setFilterOpen(false) }} portal compact minWidthFromAnchor autoFocus align="end" selectedId={filter} listClassName={css.filterList}
          items={[{ id: 'all', label: t('allStatus') }, { id: 'ready', label: t('statusReady') }, { id: 'failed', label: t('statusFailed') }, { id: 'download', label: t('statusDownloadOnly') }]}
          onSelect={id => { setFilter(id); setFilterOpen(false) }}
          anchor={<Button variant="outline" className={css.filterButton} aria-label={t('filterStatus')} aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => { setFilterOpen(!filterOpen) }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setFilterOpen(true) } }}><span>{t(filter === 'ready' ? 'statusReady' : filter === 'failed' ? 'statusFailed' : filter === 'download' ? 'statusDownloadOnly' : 'allStatus')}</span><IconChevronDownOutlineRegular size={14} /></Button>} />
        <Button variant="outline" disabled={busy || loading} onClick={refresh}>{t('refresh')}</Button>
      </div>

      {blocked !== null && <div role="alert" className={css.error}>{blocked}</div>}
      {blocked !== null && tenants.map(tenant => <Button key={tenant.id} size="sm" disabled={switching} onClick={() => { void enterTenant(tenant.id) }}>{tenant.name}</Button>)}
      <nav className={css.navScroll} aria-label={t('browse')}>
        {VIEWS.map(id => {
          const Icon = VIEW_ICONS[id]
          const treeView = id === 'mine' || id === 'shared' ? id : undefined
          return <div key={id} className={css.navGroup} data-group={id} data-active={view === id}>
            <div className={css.navRow}>
              <Button className={css.navItem} icon={<Icon size={16} />} aria-current={view === id && path.length === 0 ? 'page' : undefined}
                aria-expanded={treeView ? expandedRoots[treeView] : undefined}
                aria-controls={treeView ? `enterprise-library-${treeView}-tree` : undefined} onClick={() => { chooseView(id) }}>
                <span>{t(id)}</span>{treeView && <span className={css.rootChevron} data-expanded={expandedRoots[treeView]}><IconChevronDownOutlineRegular size={12} /></span>}
              </Button>
              {treeView && <LibraryCreateMenu name={t(treeView)} disabled={busy || blocked !== null} t={t}
                onCreate={action => { beginCreate(action, treeView, [], { parentId: null, scope: treeView === 'shared' ? 'ENTERPRISE' : 'PRIVATE', name: t(treeView) }) }} />}
            </div>
            {treeView && mountedRoots[treeView] && blocked === null && <div id={`enterprise-library-${treeView}-tree`} className={css.treeRoot}
              hidden={!expandedRoots[treeView] || (view === treeView && (query !== '' || filter !== 'all'))}>
              <LibraryTree key={revision} view={treeView} t={t} origin={origin} fetchImpl={fetchImpl} path={[]}
                selectedId={view === treeView ? source?.nodeId ?? parentId ?? undefined : undefined}
                onFolder={(next, item) => { chooseFolder(treeView, next, item) }} onFile={item => { if (view !== treeView) { setView(treeView); setPath([]); setQuery('') } void openSource(item) }}
                onCreate={(action, next, item) => { beginCreate(action, treeView, next, { parentId: item.nodeId, scope: item.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRIVATE', name: item.name }) }} onAction={(action, item) => { if (view !== treeView) { closePreview(); setView(treeView); setPath([]); setQuery('') } rowAction(action, item) }} onDenied={closePreview} busy={busy} />
            </div>}
            {view === id && id !== 'recent' && (id === 'trash' || query !== '' || filter !== 'all') && flatList}
          </div>
        })}
      </nav>
      {error && <div role="alert" className={css.error}><span>{error}</span><Button size="sm" onClick={refresh}>{t('refresh')}</Button></div>}
      {notice && <p role="status" className={css.notice}>{notice}</p>}
      <nav aria-label={t('root')} className={css.saveLocation}>
        <span>{t('saveTo')} {captureTarget().name}</span>
        {path.length > 0 && <Button size="sm" onClick={() => { setPath([]); setParentScope(undefined) }}>{t('root')}</Button>}
      </nav>
      <p className={css.navHint}>{t('localDraft')}</p>
    </aside>
    <div className={css.resizeHandle} data-resizing={sidebarResize.resizing || undefined} aria-label={t('resizeNavigation')} {...sidebarResize.separatorProps} />
    <main className={css.previewPane} aria-label={t('preview')} aria-busy={previewLoading}>
      {source && <header className={css.previewHeading}>
        <FileTypeIcon path={source.name ?? ''} size={24} />
        <div className={css.previewTitle}><h2 title={source.name}>{source.name}</h2></div>
        <div className={css.previewActions}>
          {source.item && <RowActions item={source.item} view={view} busy={busy} t={t} onAction={rowAction} />}
          {source.nodeId && source.versionId && <Button variant="outline" onClick={() => { downloadVersion({ nodeId: source.nodeId ?? '' }, source.versionId) }}>{t('download')}</Button>}
          <Button size="sm" aria-label={t('close')} onClick={() => { closePreview(); clearSourceRequest() }}><IconCloseOutlineRegular size={16} /></Button>
        </div>
      </header>}
      {previewLoading && <p role="status" className={css.previewStatus}>{t('loading')}</p>}
      {previewError && <div role="alert" className={css.previewStatus}><p>{previewError}</p>
        {!source && <Button variant="outline" onClick={() => { closePreview(); clearSourceRequest() }}>{t('close')}</Button>}
      </div>}
      {source?.bytes && <div className={css.previewBody} key={`${source.nodeId}:${source.versionId}`}>
        {renderFactorySlot('document.preview.bytes', { name: source.originalName ?? source.name ?? '', bytes: source.bytes, mimeType: source.mimeType ?? 'application/octet-stream', ...(source.missingFonts ? { missingFonts: source.missingFonts } : {}) })}
      </div>}
      {source?.linkUrl && <div className={css.previewStatus}><IconLinkOutlineRegular size={32} /><p>{source.linkUrl}</p><a href={source.linkUrl} target="_blank" rel="noopener noreferrer">{t('openLink')}</a></div>}
      {source?.parseReason && <p className={css.previewNote}>{source.parseReason}</p>}
      {view === 'recent' && !source && !previewLoading && !previewError && <section className={css.recentFiles} aria-label={t('recent')}><h2>{t('recent')}</h2>{flatList}</section>}
      {view !== 'recent' && !source && !previewLoading && !previewError && <div className={css.previewEmpty}>
        <IconFolderCloseRegular size={40} /><h2>{t('selectPreview')}</h2><p>{t('selectPreviewHint')}</p>
      </div>}
    </main>
    {uploadTarget && <LibraryUploadDialog t={t} accept={limits?.allowedExtensions.join(',') ?? ACCEPT} single={!!uploadTarget.replacement} hint={uploadTarget.replacement ? undefined : `${t('saveTo')} ${uploadTarget.name} · ${t(uploadTarget.scope === 'ENTERPRISE' ? 'sharedSaveHint' : 'privateSaveHint')}`} maxFileBytes={limits?.maxFileBytes} loadLimits={loadUploadLimits} uploadFile={uploadOne} onSaved={revealCreated} onClose={() => { setUploadTarget(undefined) }} />}
    <Modal open={edit !== undefined} onClose={() => { if (!busy) setEdit(undefined) }} title={edit ? t(edit.kind) : ''} closeLabel={t('cancel')} className={css.dialog ?? ''} contentClassName={css.dialogContent ?? ''} footer={<><Button variant="outline" disabled={busy} onClick={() => { setEdit(undefined) }}>{t('cancel')}</Button><Button variant="primary" disabled={busy || (edit?.kind !== 'move' && !name.trim()) || (edit?.kind === 'link' && !url.trim())} onClick={saveEdit}>{t('save')}</Button></>}>
      {edit?.target && <><p>{t('saveTo')} {edit.target.name}</p><p>{t(edit.target.scope === 'ENTERPRISE' ? 'sharedSaveHint' : 'privateSaveHint')}</p></>}
      {edit?.kind === 'move' ? <div className={css.folderPicker}>
        <p>{t('moveShareHint')}</p><p>{t('root')} / {movePath.map(x => x.name).join(' / ')}</p><Button variant="outline" disabled={!movePath.length || busy} onClick={() => { setMovePath(movePath.slice(0, -1)) }}>{t('back')}</Button>
        {moveFolders.map(folder => <Button key={folder.nodeId} icon={<IconFolderCloseRegular size={18} />} onClick={() => { setMovePath([...movePath, { id: folder.nodeId, name: folder.name, scope: folder.scope }]) }}>{folder.name}</Button>)}
      </div> : <div className={css.form}><label>{t('name')}<Input data-modal-autofocus value={name} onChange={e => { setName(e.target.value) }} /></label>{edit?.kind === 'link' && <label>{t('url')}<Input value={url} onChange={e => { setUrl(e.target.value) }} /></label>}</div>}
      {error && <p role="alert" className={css.error}>{error}</p>}
    </Modal>
    <Modal open={versions !== undefined} onClose={() => { setVersions(undefined) }} title={`${versions?.item.name ?? ''} · ${t('versions')}`} closeLabel={t('cancel')} className={css.dialog ?? ''} contentClassName={css.dialogContent ?? ''} footer={<Button variant="outline" onClick={() => { setVersions(undefined) }}>{t('close')}</Button>}>
      <div className={css.versionList}>{versions?.rows.map(version => <div key={version.id}><span>v{version.versionNo}</span><Tag>{t(statusKey(version.parseStatus))}</Tag><Button size="sm" disabled={busy} onClick={() => { if (versions) void run(async () => { await openSource(versions.item, version.id); setVersions(undefined) }) }}>{t('preview')}</Button><Button size="sm" onClick={() => { if (versions) downloadVersion(versions.item, version.id) }}>{t('download')}</Button></div>)}</div>
    </Modal>

  </section>
}
