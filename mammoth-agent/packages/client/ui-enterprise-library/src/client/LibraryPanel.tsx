import { useEffect, useRef, useState } from 'react'
import { Button, Input, Menu, Modal, Tag, FileTypeIcon, fileSizeText, IconClockOutlineRegular, IconFolderCloseRegular, IconShareOutlineRegular, IconTrashOutlineRegular, IconSearchOutlineRegular, IconLinkOutlineRegular, IconChevronDownOutlineRegular, IconCloseOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryKey } from './locales.ts'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import { fetchLibraryItems, fetchLibraryPage, fetchLibraryMedia, fetchLibrarySource, libraryRequest, type LibraryFetch, type LibraryView } from './api.ts'
import { choiceBlock, type LibraryChoice } from './selection.ts'
import { LibraryTree } from './LibraryTree.tsx'
import { LibraryUploadDialog } from './LibraryUploadDialog.tsx'
import css from './LibraryPanel.module.css'

export type LibrarySourceRequest = { nodeId: string; versionId: string }

export type LibraryPanelInjected = {
  readonly hooks: { sourceRequest: HostObservable<LibrarySourceRequest | null> }
  readonly clearSourceRequest: () => void
  readonly origin: string
  readonly fetchImpl: LibraryFetch
  readonly onUse: (item: LibraryChoice) => Promise<void> | void
  readonly onUseMany?: (items: readonly LibraryChoice[]) => Promise<void>
}
export type LibraryPanelProps = PropsRuntime<'main'> & PropsLocale<'enterpriseLibrary'> & InjectFace<LibraryPanelInjected>
const VIEWS: readonly LibraryView[] = ['recent', 'mine', 'shared', 'trash']
type Edit = { kind: 'folder' | 'link' | 'rename' | 'move'; item?: LibraryChoice }
type Source = { nodeId?: string; previewKind?: string; mediaUrl?: string; name?: string; text?: string | null; linkUrl?: string | null; parseReason?: string | null; highlightNote?: string | null; locator?: string | null; versionNo?: number | null; versionId?: string; truncated?: boolean; truncationNote?: string | null; chunks?: readonly { locator: string; text: string }[] }

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.markdown,.txt,.csv,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.webm,.mov'
const VIEW_ICONS = { recent: IconClockOutlineRegular, mine: IconFolderCloseRegular, shared: IconShareOutlineRegular, trash: IconTrashOutlineRegular }
function UploadIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 13V3m-4 4 4-4 4 4M3 12v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></svg>
}
function statusKey(status: string | null): LibraryKey {
  if (status === 'READY') return 'statusReady'
  if (status === 'FAILED') return 'statusFailed'
  if (status === 'PENDING' || status === 'QUEUED') return 'statusPending'
  if (status === 'PROCESSING' || status === 'PARSING') return 'statusProcessing'
  return 'statusDownloadOnly'
}
function RowActions({ item, view, busy, t, onAction }: { item: LibraryChoice; view: LibraryView; busy: boolean; t: LibraryPanelProps['t']; onAction: (action: string, item: LibraryChoice) => void }) {
  const [open, setOpen] = useState(false)
  const entries = view === 'trash'
    ? (item.canManage ? [{ id: 'restore', label: t('restore') }, { id: 'purge', label: t('purge'), danger: true }] : [])
    : [
      ...(item.kind !== 'FOLDER' ? [{ id: 'preview', label: t('preview') }] : []),
      ...(item.kind === 'FILE' ? [{ id: 'use', label: t('useForChat'), disabled: choiceBlock(item).disabled }, { id: 'download', label: t('download') }, { id: 'versions', label: t('versions') }] : []),
      ...(item.canManage ? [{ id: 'rename', label: t('rename') }, { id: 'move', label: t('move') },
        ...(item.kind === 'FILE' ? [{ id: 'replace', label: t('replace') }, ...(item.parseStatus === 'FAILED' ? [{ id: 'retry', label: t('retry') }] : [])] : []),
        { id: 'scope', label: t(item.scope === 'ENTERPRISE' ? 'unshare' : 'share') }, { id: 'recycle', label: t('recycle'), danger: true }] : []),
    ]
  return <Menu open={open} onClose={() => { setOpen(false) }} portal align="end" autoFocus
    anchor={<Button size="sm" disabled={busy || !entries.length} aria-label={`${t('more')} · ${item.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open) }}><span className={css.moreGlyph} aria-hidden="true">⋯</span></Button>}
    items={entries} onSelect={action => { setOpen(false); onAction(action, item) }} />
}

/** Native Web/desktop library browser. Explicit save never uploads temporary chat attachments. */
export function LibraryPanel({ t, origin, fetchImpl, onUse, onUseMany, useSourceRequest, clearSourceRequest }: LibraryPanelProps) {
  const requested = useSourceRequest(value => value)
  const previewGeneration = useRef(0)
  useEffect(() => () => { previewGeneration.current++ }, [])
  const [view, setView] = useState<LibraryView>('mine')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limits, setLimits] = useState<{ maxFileBytes: number; allowedExtensions: string[] }>()
  const [path, setPath] = useState<readonly { id: string; name: string }[]>([])
  const [items, setItems] = useState<readonly LibraryChoice[]>([])
  const [selected, setSelected] = useState<readonly string[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [tenants, setTenants] = useState<readonly { id: string; name: string }[]>([])
  const [switching, setSwitching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [newOpen, setNewOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<{ parentId: string | null; replacement?: LibraryChoice }>()
  const [revision, setRevision] = useState(0)
  const [edit, setEdit] = useState<Edit>()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState<Source>()
  const [versions, setVersions] = useState<{ item: LibraryChoice; rows: readonly { id: string; versionNo: number; parseStatus: string }[] }>()
  const [moveFolders, setMoveFolders] = useState<readonly LibraryChoice[]>([])
  const [movePath, setMovePath] = useState<readonly { id: string; name: string }[]>([])
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
      setBlocked(null); setLimits(undefined); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : t('operationFailed')) }
    finally { setSwitching(false) }
  }
  useEffect(() => { setPage(1) }, [view, query, parentId, filter])
  useEffect(() => { const url = source?.mediaUrl; return () => { if (url) URL.revokeObjectURL(url) } }, [source?.mediaUrl])
  useEffect(() => {
    let current = true
    void libraryRequest(origin, 'config', 'GET', undefined, fetchImpl).then(value => {
      const config = value as { maxFileBytes?: number; allowedExtensions?: string[]; enabled?: boolean; message?: string }
      if (!current) return
      if (config.enabled === false) {
        setBlocked(config.message ?? t('loadError'))
        void loadTenants()
        return
      }
      setBlocked(null)
      if (typeof config.maxFileBytes === 'number' && Array.isArray(config.allowedExtensions)) setLimits({ maxFileBytes: config.maxFileBytes, allowedExtensions: config.allowedExtensions })
    }).catch(e => {
      // Older Ground builds answer 403 NO_TENANT instead of a disabled config.
      if (current && e instanceof Error && /缺少企业上下文|NO_TENANT/.test(e.message)) {
        setBlocked('资料库属于企业能力：请先在控制台进入企业工作台，再打开资料库')
        void loadTenants()
      }
    })
    return () => { current = false }
  }, [origin, fetchImpl, revision])
  useEffect(() => {
    if (blocked !== null) { setLoading(false); setItems([]); setSelected([]); return }
    const control = new AbortController()
    setLoading(true); setItems([]); setSelected([])
    void fetchLibraryPage(origin, view, query, fetchImpl, control.signal, parentId, page, filter).then(next => {
      if (!control.signal.aborted) {
        const lastPage = Math.max(1, Math.ceil(next.total / 20)); if (page > lastPage) { setPage(lastPage); return }
        setItems(next.items); setTotal(next.total);
        if (parentId && next.breadcrumb.length) setPath(next.breadcrumb); setSelected([]); setError('') }
    }).catch(e => { if (!control.signal.aborted) {
      if (e instanceof Error && /(?:401|403|409)/.test(e.message)) { setItems([]); setSelected([]); setSource(undefined); setVersions(undefined) }
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
    const control = new AbortController()
    setSource(undefined)
    void fetchLibrarySource(origin, requested.nodeId, requested.versionId, fetchImpl, control.signal).then(opened => {
      if (!control.signal.aborted) setSource({ name: opened.name, text: opened.quote ?? '', locator: opened.locator, versionId: opened.versionId, truncated: opened.truncated, truncationNote: opened.truncationNote })
    }).catch(e => { if (!control.signal.aborted) setError(e instanceof Error ? e.message : t('operationFailed')) })
    return () => { control.abort() }
  }, [requested, origin, fetchImpl, t])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setNotice(''); setError(e instanceof Error ? e.message : t('operationFailed')) }
    finally { setBusy(false) }
  }
  const mutate = async (suffix: string, method: string, data?: unknown) => {
    await libraryRequest(origin, suffix, method, data, fetchImpl); refresh()
  }
  const loadUploadLimits = async () => {
    const config = await libraryRequest(origin, 'config', 'GET', undefined, fetchImpl) as { maxFileBytes: number; allowedExtensions: string[] }
    setLimits(config); return config
  }
  const uploadOne = async (file: File) => {
    if (!uploadTarget) throw new Error(t('operationFailed'))
    const form = new FormData(); form.append('files', file)
    if (uploadTarget.parentId && !uploadTarget.replacement) form.append('parentId', uploadTarget.parentId)
    const result = await libraryRequest(origin, uploadTarget.replacement ? `files/${uploadTarget.replacement.nodeId}/versions` : 'files', 'POST', form, fetchImpl)
    if (uploadTarget.replacement) return
    if (result && typeof result === 'object' && 'failed' in result && Array.isArray(result.failed) && result.failed.length) throw new Error(result.failed.map(row => String(row && typeof row === 'object' && 'message' in row ? row.message : t('operationFailed'))).join('; '))
    if (!result || typeof result !== 'object' || !('items' in result) || !Array.isArray(result.items) || !result.items.length) throw new Error(t('operationFailed'))
  }
  const revealCreated = () => {
    if (view !== 'mine') { setView('mine'); setPath([]) }
    setQuery(''); setFilter('all'); setPage(1); refresh()
  }
  const openEdit = (kind: Edit['kind'], item?: LibraryChoice) => {
    setEdit(item ? { kind, item } : { kind }); setName(item?.name ?? ''); setUrl(''); setMovePath([])
  }
  const useItems = (chosen: readonly LibraryChoice[]) => run(async () => {
    if (onUseMany) await onUseMany(chosen)
    else for (const item of chosen) await onUse(item)
    setSelected([]); setNotice(t('added'))
  })
  const visibleItems = items.filter(item => filter === 'all' || (filter === 'ready' ? !choiceBlock(item).disabled : filter === 'failed' ? item.parseStatus === 'FAILED' : item.kind === 'FILE' && statusKey(item.parseStatus) === 'statusDownloadOnly'))
  const chosen = items.filter(item => selected.includes(item.nodeId) && !choiceBlock(item).disabled)
  const openSource = async (item: LibraryChoice, versionId = item.versionId) => {
    const generation = ++previewGeneration.current
    // Drop the previous file before the request so a refusal cannot leave its title, URL or text visible.
    setSource(undefined)
    const result = await libraryRequest(origin, `nodes/${encodeURIComponent(item.nodeId)}/preview?versionId=${encodeURIComponent(versionId ?? '')}`, 'GET', undefined, fetchImpl) as Source
    let mediaUrl: string | undefined
    if ((result.previewKind === 'image' || result.previewKind === 'video') && versionId) {
      mediaUrl = URL.createObjectURL(await fetchLibraryMedia(origin, item.nodeId, versionId, fetchImpl))
    }
    if (generation !== previewGeneration.current) { if (mediaUrl) URL.revokeObjectURL(mediaUrl); return }
    setSource({ ...result, nodeId: item.nodeId, name: result.name ?? item.name, ...(versionId ? { versionId } : {}), ...(mediaUrl ? { mediaUrl } : {}) })
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
    if (action === 'preview') { void run(() => openSource(item)); return }
    if (action === 'rename' || action === 'move') { openEdit(action, item); return }
    if (action === 'replace') { setUploadTarget({ parentId, replacement: item }); return }
    void run(async () => {
      if (action === 'versions') {
        const result = await libraryRequest(origin, `nodes/${id}/versions`, 'GET', undefined, fetchImpl)
        setVersions({ item, rows: Array.isArray(result) ? result : [] })
      } else if (action === 'scope') {
        if (item.scope === 'ENTERPRISE' || window.confirm(t('confirmShare'))) await mutate(`nodes/${id}/scope`, 'POST', { scope: item.scope === 'ENTERPRISE' ? 'PRIVATE' : 'ENTERPRISE', confirmShare: true })
      } else if (action === 'purge') {
        if (window.confirm(t('confirmPurge'))) await mutate(`nodes/${id}`, 'DELETE')
      } else if (action === 'retry') await mutate(`nodes/${id}/retry-parse`, 'POST')
      else if (action === 'restore' || action === 'recycle') await mutate(`nodes/${id}/${action}`, 'POST')
    })
  }
  const saveEdit = () => { if (edit) void run(async () => {
    if (edit.kind === 'move' && edit.item) await mutate(`nodes/${edit.item.nodeId}/move`, 'POST', { parentId: movePath.at(-1)?.id ?? null })
    else if (edit.kind === 'rename' && edit.item) await mutate(`nodes/${edit.item.nodeId}`, 'PATCH', { name })
    else { await mutate(edit.kind === 'folder' ? 'folders' : 'links', 'POST', { name, parentId, ...(edit.kind === 'link' ? { url } : {}) }); revealCreated() }
    setEdit(undefined)
  }) }
  return <section className={css.page} aria-busy={busy || loading}>
    <aside className={css.navigation}>
      <h2 className={css.navTitle}>{t('panel')}</h2>
      <nav className={css.navScroll} aria-label={t('browse')}>
        {VIEWS.map(id => { const Icon = VIEW_ICONS[id]; return <div key={id} className={css.navGroup} data-group={id}><div className={css.navRow}><Button className={css.navItem} icon={<Icon size={16} />} aria-current={view === id && (id !== 'mine' || path.length === 0) ? 'page' : undefined} aria-expanded={id === 'mine' ? true : undefined} aria-controls={id === 'mine' ? 'enterprise-library-mine-tree' : undefined} onClick={() => { setView(id); setPath([]); setQuery(''); setFilter('all'); setSelected([]) }}>{t(id)}</Button></div>{id === 'mine' && <div id="enterprise-library-mine-tree" className={css.treeRoot}><LibraryTree key={revision} t={t} origin={origin} fetchImpl={fetchImpl} path={[]} selectedId={view === 'mine' ? source?.nodeId ?? parentId ?? undefined : undefined} onFolder={next => { setView('mine'); setQuery(''); setPath(next); setSelected([]) }} onFile={item => { void run(() => openSource(item)) }} /></div>}</div> })}
      </nav>
      <p className={css.navHint}>{t('localDraft')}</p>
    </aside>
    <main className={css.content}>
      <header className={css.heading}>
        <div><h2>{t(view)}</h2><p>{t('panelDescription')}</p></div>
        {view !== 'trash' && <div className={css.headerActions}>
          <Menu open={newOpen} onClose={() => { setNewOpen(false) }} portal align="end" items={[{ id: 'folder', label: t('folder'), icon: <IconFolderCloseRegular size={16} /> }, { id: 'link', label: t('link'), icon: <IconLinkOutlineRegular size={16} /> }]} onSelect={id => { setNewOpen(false); openEdit(id as 'folder' | 'link') }} anchor={<Button variant="outline" disabled={busy || blocked !== null} aria-haspopup="menu" aria-expanded={newOpen} onClick={() => { setNewOpen(!newOpen) }}>{t('new')}<IconChevronDownOutlineRegular size={14} /></Button>} />
          <Button variant="primary" icon={<UploadIcon />} disabled={busy || blocked !== null} onClick={() => { setUploadTarget({ parentId }) }}>{t('upload')}</Button>
        </div>}
      </header>
      <p className={css.uploadHint}>{t('uploadHint')}{limits ? ` · ${fileSizeText(limits.maxFileBytes)}` : ''}</p>
      {blocked !== null && <div role="alert" className={css.error}><span>{blocked}</span></div>}
      {blocked !== null && tenants.length > 0 && <div className={css.toolbar}>
        <span>{t('panel')}:</span>
        {tenants.map(tenant => <Button key={tenant.id} size="sm" disabled={switching} onClick={() => { void enterTenant(tenant.id) }}>{tenant.name}</Button>)}
      </div>}
      <div className={css.toolbar}>
        <div className={css.search}><IconSearchOutlineRegular size={18} /><Input type="search" aria-label={t('searchPlaceholder')} value={query} placeholder={t('searchPlaceholder')} onChange={e => { setQuery(e.target.value) }} /></div>
        <Menu open={filterOpen} onClose={() => { setFilterOpen(false) }} portal compact minWidthFromAnchor autoFocus align="end" selectedId={filter} listClassName={css.filterList}
          items={[{ id: 'all', label: t('allStatus') }, { id: 'ready', label: t('statusReady') }, { id: 'failed', label: t('statusFailed') }, { id: 'download', label: t('statusDownloadOnly') }]}
          onSelect={id => { setFilter(id); setFilterOpen(false) }}
          anchor={<Button variant="outline" className={css.filterButton} aria-label={t('filterStatus')} aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => { setFilterOpen(!filterOpen) }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setFilterOpen(true) } }}><span>{t(filter === 'ready' ? 'statusReady' : filter === 'failed' ? 'statusFailed' : filter === 'download' ? 'statusDownloadOnly' : 'allStatus')}</span><IconChevronDownOutlineRegular size={14} /></Button>} />
        <Button variant="outline" disabled={busy || loading} onClick={refresh}>{t('refresh')}</Button>
      </div>
      {path.length > 0 && <nav aria-label={t('root')} className={css.breadcrumb}>
        <Button size="sm" onClick={() => { setPath([]) }}>{t('root')}</Button>
        {path.map((part, i) => <span key={part.id}> / <Button size="sm" onClick={() => { setPath(path.slice(0, i + 1)) }}>{part.name}</Button></span>)}
      </nav>}
      {error && <div role="alert" className={css.error}><span>{error}</span><Button size="sm" onClick={refresh}>{t('refresh')}</Button></div>}
      {notice && <p role="status" className={css.notice}>{notice}</p>}
      {chosen.length > 0 && <section className={css.selection} aria-label={t('selected')}>
        <div className={css.chips}>{chosen.map(item => <span className={css.chip} key={item.nodeId}><span title={item.name}>{item.name}</span><Button size="sm" aria-label={t('remove', { name: item.name })} onClick={() => { setSelected(selected.filter(id => id !== item.nodeId)) }}><IconCloseOutlineRegular size={12} /></Button></span>)}</div>
        <div className={css.selectionActions}><Button size="sm" onClick={() => { setSelected([]) }}>{t('clearSelection')}</Button><Button variant="primary" disabled={busy} onClick={() => { void useItems(chosen) }}>{t('selected')} ({chosen.length})</Button></div>
      </section>}
      {loading && <p role="status" className={css.loading}>{t('loading')}</p>}
      {!loading && visibleItems.length === 0 && <div className={css.empty}>
        <div className={css.emptyIcon}><IconFolderCloseRegular size={32} /></div>
        <h3>{query || filter !== 'all' ? t('noResults') : t('empty')}</h3>
        <p>{query || filter !== 'all' ? t('searchHint') : view === 'trash' ? t('trashHint') : t('emptyHint')}</p>
        {query || filter !== 'all' ? <Button variant="outline" onClick={() => { setQuery(''); setFilter('all') }}>{t('clearFilters')}</Button> : view !== 'trash' && !error && <Button variant="primary" icon={<UploadIcon />} disabled={busy} onClick={() => { setUploadTarget({ parentId }) }}>{t('upload')}</Button>}
      </div>}
      {visibleItems.length > 0 && <table className={css.table}>
        <caption className={css.srOnly}>{t(view)}</caption>
        <thead><tr><th className={css.checkColumn}><span className={css.srOnly}>{t('select')}</span></th><th>{t('name')}</th><th className={css.statusColumn}>{t('parseStatus')}</th><th className={css.sizeColumn}>{t('size')}</th><th className={css.dateColumn}>{t(view === 'recent' ? 'recent' : 'updated')}</th><th className={css.actionColumn}><span className={css.srOnly}>{t('more')}</span></th></tr></thead>
        <tbody>{visibleItems.map(item => {
          const blocked = choiceBlock(item).disabled || view === 'trash'
          const key = item.kind === 'FOLDER' ? 'folderType' : item.kind === 'LINK' ? 'linkType' : statusKey(item.parseStatus)
          return <tr key={item.nodeId} data-selected={selected.includes(item.nodeId) || undefined}>
            <td className={css.checkColumn}><input type="checkbox" aria-label={`${t('select')} ${item.name}`} disabled={blocked || busy} checked={selected.includes(item.nodeId)} onChange={e => { setSelected(e.target.checked ? [...selected, item.nodeId] : selected.filter(x => x !== item.nodeId)) }} /></td>
            <td><div className={css.fileName}>
              <span className={css.fileIcon}>{item.kind === 'FOLDER' ? <IconFolderCloseRegular size={16} /> : item.kind === 'LINK' ? <IconLinkOutlineRegular size={16} /> : <FileTypeIcon path={item.name} size={16} />}</span>
              <div className={css.fileText}><button type="button" className={css.nameButton} disabled={view === 'trash' || busy} onClick={() => { if (item.kind === 'FOLDER') { if (path.some(part => part.id === item.nodeId) || path.length >= 32) { setError(t('treeLoop')); return } setQuery(''); setPath([...path, { id: item.nodeId, name: item.name }]); setSelected([]) } else void run(() => openSource(item)) }} title={item.name}>{item.name}</button><span className={css.fileMeta}>{t(item.scope === 'ENTERPRISE' ? 'shared' : 'private')}{item.versionNo ? ` · v${item.versionNo}` : ''}</span></div>
            </div></td>
            <td className={css.statusColumn}><Tag tone={key === 'statusFailed' ? 'danger' : key === 'statusReady' ? 'success' : key === 'statusPending' ? 'warning' : key === 'statusProcessing' ? 'info' : 'neutral'}>{t(key)}</Tag>{item.parseReason && <span className={css.reason} title={item.parseReason}>{item.parseReason}</span>}</td>
            <td className={css.sizeColumn}>{item.sizeBytes === undefined ? '—' : fileSizeText(item.sizeBytes)}</td>
            <td className={css.dateColumn}>{item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)) ? new Date(view === 'recent' ? item.accessedAt ?? item.updatedAt : item.updatedAt).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
            <td className={css.actionColumn}><RowActions item={item} view={view} busy={busy} t={t} onAction={rowAction} /></td>
          </tr>
        })}</tbody>
      </table>}
      {total > 20 && <nav className={css.pagination} aria-label={t('browse')}><Button size="sm" disabled={loading || page <= 1} onClick={() => { setPage(n => n - 1) }}>{t('previousPage')}</Button><span>{page} / {Math.ceil(total / 20)}</span><Button size="sm" disabled={loading || page * 20 >= total} onClick={() => { setPage(n => n + 1) }}>{t('nextPage')}</Button></nav>}
    </main>
    {uploadTarget && <LibraryUploadDialog t={t} accept={limits?.allowedExtensions.join(',') ?? ACCEPT} single={!!uploadTarget.replacement} maxFileBytes={limits?.maxFileBytes} loadLimits={loadUploadLimits} uploadFile={uploadOne} onSaved={revealCreated} onClose={() => { setUploadTarget(undefined) }} />}
    <Modal open={edit !== undefined} onClose={() => { if (!busy) setEdit(undefined) }} title={edit ? t(edit.kind) : ''} closeLabel={t('cancel')} className={css.dialog ?? ''} contentClassName={css.dialogContent ?? ''} footer={<><Button variant="outline" disabled={busy} onClick={() => { setEdit(undefined) }}>{t('cancel')}</Button><Button variant="primary" disabled={busy || (edit?.kind !== 'move' && !name.trim()) || (edit?.kind === 'link' && !url.trim())} onClick={saveEdit}>{t('save')}</Button></>}>
      {edit?.kind === 'move' ? <div className={css.folderPicker}>
        <p>{t('root')} / {movePath.map(x => x.name).join(' / ')}</p><Button variant="outline" disabled={!movePath.length || busy} onClick={() => { setMovePath(movePath.slice(0, -1)) }}>{t('back')}</Button>
        {moveFolders.map(folder => <Button key={folder.nodeId} icon={<IconFolderCloseRegular size={18} />} onClick={() => { setMovePath([...movePath, { id: folder.nodeId, name: folder.name }]) }}>{folder.name}</Button>)}
      </div> : <div className={css.form}><label>{t('name')}<Input data-modal-autofocus value={name} onChange={e => { setName(e.target.value) }} /></label>{edit?.kind === 'link' && <label>{t('url')}<Input value={url} onChange={e => { setUrl(e.target.value) }} /></label>}</div>}
      {error && <p role="alert" className={css.error}>{error}</p>}
    </Modal>
    <Modal open={versions !== undefined} onClose={() => { setVersions(undefined) }} title={`${versions?.item.name ?? ''} · ${t('versions')}`} closeLabel={t('cancel')} className={css.dialog ?? ''} contentClassName={css.dialogContent ?? ''} footer={<Button variant="outline" onClick={() => { setVersions(undefined) }}>{t('close')}</Button>}>
      <div className={css.versionList}>{versions?.rows.map(version => <div key={version.id}><span>v{version.versionNo}</span><Tag>{t(statusKey(version.parseStatus))}</Tag><Button size="sm" disabled={busy} onClick={() => { if (versions) void run(async () => { await openSource(versions.item, version.id); setVersions(undefined) }) }}>{t('preview')}</Button><Button size="sm" onClick={() => { if (versions) downloadVersion(versions.item, version.id) }}>{t('download')}</Button></div>)}</div>
    </Modal>
    <Modal open={source !== undefined} onClose={() => { previewGeneration.current++; setSource(undefined); clearSourceRequest() }} title={source?.name ?? t('preview')} description={t(source?.mediaUrl ? 'uploadHint' : 'sourceNote')} closeLabel={t('close')} className={css.sourceDialog ?? ''} contentClassName={css.dialogContent ?? ''} footer={<Button variant="outline" onClick={() => { previewGeneration.current++; setSource(undefined); clearSourceRequest() }}>{t('close')}</Button>}>
      {source?.versionId && <p className={css.sourceMeta}>{t('version')} · {source.versionNo ? `v${source.versionNo}` : source.versionId}{source.locator ? ` · ${source.locator}` : ''}</p>}
      {source?.chunks?.map(chunk => <section key={chunk.locator}><Tag>{chunk.locator}</Tag><pre className={css.sourceText}>{chunk.text}</pre></section>)}
      {source?.mediaUrl && (source.previewKind === 'image' ? <img className={css.media} src={source.mediaUrl} alt={source.name ?? ''} onError={() => { setNotice(t('mediaFallback')) }} /> : <video className={css.media} src={source.mediaUrl} controls preload="metadata" onError={() => { setNotice(t('mediaFallback')) }} />)}
      {source?.mediaUrl && <p className={css.previewReason}>{t('mediaFallback')}</p>}
      {source?.nodeId && source.versionId && <Button variant="outline" onClick={() => { downloadVersion({ nodeId: source.nodeId! }, source.versionId) }}>{t('download')}</Button>}
      {source?.text && <pre className={css.sourceText}>{source.text}</pre>}
      {source?.linkUrl && <pre className={css.sourceText}>{source.linkUrl}</pre>}
      {source?.truncated && <p className={css.previewReason}>{source.truncationNote ?? t('truncatedExcerpt')}</p>}
      {source?.parseReason && <p className={css.previewReason}>{source.parseReason}</p>}
      {source?.highlightNote && source.highlightNote !== source.parseReason && <p className={css.previewReason}>{source.highlightNote}</p>}
      {!source?.text && !source?.linkUrl && !source?.chunks?.length && !source?.parseReason && !source?.truncated && <p className={css.previewReason}>{t('unready')}</p>}
    </Modal>
  </section>
}
