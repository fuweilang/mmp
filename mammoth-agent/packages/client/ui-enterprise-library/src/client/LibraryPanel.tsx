import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Menu, Modal, Tag, Toast, Tooltip, FileTypeIcon, IconClockOutlineRegular, IconFolderCloseRegular, IconShareOutlineRegular, IconTrashOutlineRegular, IconSearchOutlineRegular, IconLinkOutlineRegular, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconRefreshOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryKey } from './locales.ts'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsRenderFactories } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar-documentpreview/client'
import { fetchLibraryItems, fetchLibrarySource, fetchLibraryPage, fetchLibraryScopeImpact, fetchLibraryPreviewBytes, LibraryRequestError, libraryRequest, type LibraryFetch, type LibraryView } from './api.ts'
import { choiceBlock, type LibraryChoice } from './selection.ts'
import { RowActions } from './LibraryRowActions.tsx'
import { LibraryTree } from './LibraryTree.tsx'
import { LibraryFinder } from './LibraryFinder.tsx'
import { LibraryCreateMenu, type LibraryCreateAction } from './LibraryCreateMenu.tsx'
import { LibraryUploadDialog } from './LibraryUploadDialog.tsx'
import { useLibrarySidebarResize } from './useLibrarySidebarResize.ts'
import css from './LibraryPanel.module.css'

export type LibrarySourceRequest = { nodeId: string; versionId: string; locator?: string }

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
<<<<<<< HEAD
type ScopeConfirm = { nodeId: string; scope: 'PRIVATE' | 'ENTERPRISE'; total: number; treeRevision: string; moveParentId?: string | null }
type ArchiveEntry = { name: string; size: number }
type Source = { originalName?: string; parseStatus?: string; bytes?: Uint8Array<ArrayBuffer>; mimeType?: string; missingFonts?: readonly string[]; item?: LibraryChoice; nodeId?: string; previewKind?: string; mediaUrl?: string; name?: string; text?: string | null; linkUrl?: string | null; parseReason?: string | null; highlightNote?: string | null; locator?: string | null; versionNo?: number | null; versionId?: string; truncated?: boolean; truncationNote?: string | null; entries?: readonly ArchiveEntry[]; chunks?: readonly { locator: string; text: string }[] }
=======
type Source = { citationQuote?: string | null; originalName?: string; parseStatus?: string; bytes?: Uint8Array<ArrayBuffer>; mimeType?: string; missingFonts?: readonly string[]; item?: LibraryChoice; nodeId?: string; previewKind?: string; mediaUrl?: string; name?: string; text?: string | null; linkUrl?: string | null; parseReason?: string | null; highlightNote?: string | null; locator?: string | null; versionNo?: number | null; versionId?: string; truncated?: boolean; truncationNote?: string | null; chunks?: readonly { locator: string; text: string }[] }
>>>>>>> origin/4.0

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.markdown,.txt,.csv,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.webm,.mov'
const VIEW_ICONS = { recent: IconClockOutlineRegular, mine: IconFolderCloseRegular, shared: IconShareOutlineRegular, trash: IconTrashOutlineRegular }
type VersionRow = { id: string; versionNo: number; parseStatus: string; createdAt?: string }

function readArchiveEntries(value: unknown): readonly ArchiveEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows: ArchiveEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const name = 'name' in item && typeof item.name === 'string' ? item.name : ''
    const size = 'size' in item && typeof item.size === 'number' ? item.size : Number.NaN
    if (!name || name.length > 240 || !Number.isSafeInteger(size) || size < 0) continue
    rows.push({ name, size })
    if (rows.length >= 40) break
  }
  return rows
}

function archiveSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function versionWrittenAt(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusKey(status: string | null): LibraryKey {
  if (status === 'READY') return 'statusReady'
  if (status === 'FAILED') return 'statusFailed'
  if (status === 'PENDING' || status === 'QUEUED') return 'statusPending'
  if (status === 'PROCESSING' || status === 'PARSING') return 'statusProcessing'
  return 'statusDownloadOnly'
}

function filterLabel(filter: string): LibraryKey {
  if (filter === 'ready') return 'statusReady'
  if (filter === 'uncitable') return 'statusDownloadOnly'
  return 'allStatus'
}

function folderGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('404') || message.includes('资料不存在')
}

function matchesFilter(item: LibraryChoice, filter: string): boolean {
  if (item.kind === 'FILE' && item.parseStatus === 'FAILED') return false
  if (filter === 'all') return true
  if (filter === 'ready') return !choiceBlock(item).disabled
  if (filter === 'uncitable') return item.kind === 'FILE' && choiceBlock(item).disabled
  return false
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
  const [finderOpen, setFinderOpen] = useState(false)
  const [located, setLocated] = useState<{ view: 'mine' | 'shared'; ids: readonly string[] } | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limits, setLimits] = useState<{ maxFileBytes: number; allowedExtensions: string[] }>()
  const [path, setPath] = useState<readonly { id: string; name: string }[]>([])
  const [parentScope, setParentScope] = useState<'PRIVATE' | 'ENTERPRISE'>()
  const [items, setItems] = useState<readonly LibraryChoice[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const showToast = (text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [configReady, setConfigReady] = useState(false)
  const [tenants, setTenants] = useState<readonly { id: string; name: string }[]>([])
  const [switching, setSwitching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<SaveTarget & { replacement?: LibraryChoice }>()
  const [revision, setRevision] = useState(0)
  const [edit, setEdit] = useState<Edit>()
  const [purgeItem, setPurgeItem] = useState<LibraryChoice>()
  const [scopeConfirm, setScopeConfirm] = useState<ScopeConfirm>()
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
      const entries = readArchiveEntries(result.entries)
      const authorized = { ...result, nodeId: item.nodeId, ...(entries ? { entries } : {}),
        item: { ...item, versionId, versionNo, parseStatus: result.parseStatus ?? (versionId === item.versionId ? item.parseStatus : null), parseReason: result.parseReason ?? null },
        versionNo, name: result.name ?? item.name, ...(versionId ? { versionId } : {}) }
      setSource(authorized)
      const contents = item.kind === 'FILE' && versionId && !entries
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
  const [versions, setVersions] = useState<{ item: LibraryChoice; rows: readonly VersionRow[] }>()
  const [moveFolders, setMoveFolders] = useState<readonly LibraryChoice[]>([])
  const [movePath, setMovePath] = useState<readonly { id: string; name: string; scope?: string | undefined }[]>([])
  const parentId = path.at(-1)?.id ?? null
<<<<<<< HEAD
  const refresh = () => { setRevision(n => n + 1) }
  const [memberTenantId, setMemberTenantId] = useState<string | null>(null)
  const entering = useRef(false)
  const autoTenant = useRef<string | null>(null)
=======
  const refresh = () => { setConfigReady(false); setRevision(n => n + 1) }
  /** Platform admins have no default enterprise; let them enter one in place. */
>>>>>>> origin/4.0
  const loadTenants = async () => {
    const context = await libraryRequest(origin, 'context', 'GET', undefined, fetchImpl) as {
      tenants: readonly { id: string; name: string }[]; selectedTenantId: string | null
    }
    if (!Array.isArray(context.tenants)) throw new Error(t('operationFailed'))
    setTenants(context.tenants); setMemberTenantId(context.selectedTenantId)
    const only = context.tenants.length === 1 ? context.tenants[0] : undefined
    if (!context.selectedTenantId && only && autoTenant.current !== only.id) {
      autoTenant.current = only.id
      void enterTenant(only.id)
    }
  }
  const enterTenant = async (tenantId: string) => {
    if (entering.current || busy) return
    entering.current = true
    setSwitching(true); setError(''); setBlocked(t('loading')); closePreview(); setItems([]); setVersions(undefined)
    setPath([]); setFilter('all'); setView('mine'); setUploadTarget(undefined); setEdit(undefined)
    setMountedRoots({ mine: true, shared: false }); setExpandedRoots({ mine: true, shared: false })
    try {
      await libraryRequest(origin, 'context', 'POST', { tenantId }, fetchImpl)
      setMemberTenantId(tenantId); setBlocked(null); setLimits(undefined); refresh()
    } catch (error) {
      setBlocked(t('memberContextHint'))
      showToast(error instanceof Error ? error.message : t('operationFailed'))
    } finally { entering.current = false; setSwitching(false) }
  }
  useEffect(() => { void loadTenants().catch(() => { /* Failed discovery grants no enterprise access. */ }) }, [origin, fetchImpl, revision])
  useEffect(() => { setPage(1) }, [view, parentId, filter])

  useEffect(() => {
    let current = true
    setConfigReady(false)
    void libraryRequest(origin, 'config', 'GET', undefined, fetchImpl).then(value => {
      const config = value as { maxFileBytes?: number; allowedExtensions?: string[]; enabled?: boolean; reason?: string; message?: string }
      if (!current) return
      setError('')
      if (config.enabled === false) {
        closePreview()
<<<<<<< HEAD
        setBlocked(config.message ?? t('loadError'))
        void loadTenants().catch(() => { /* Keep the refusal, never show an unverified enterprise. */ })
=======
        setBlocked(config.reason === 'NO_TENANT' ? t('enterpriseRequired') : config.message ?? t('loadError'))
        void loadTenants()
>>>>>>> origin/4.0
        return
      }
      setBlocked(null)
      if (typeof config.maxFileBytes === 'number' && Array.isArray(config.allowedExtensions)) setLimits({ maxFileBytes: config.maxFileBytes, allowedExtensions: config.allowedExtensions })
      setConfigReady(true)
    }).catch(e => {
<<<<<<< HEAD
      // Older Ground builds answer 403 NO_TENANT instead of a disabled config.
      if (current && e instanceof Error && /缺少企业上下文|NO_TENANT/.test(e.message)) {
        closePreview()
        setBlocked(t('memberContextHint'))
        void loadTenants().catch(() => { /* Keep the refusal, never show an unverified enterprise. */ })
      }
=======
      if (!current) return
      closePreview(); setVersions(undefined); setError('')
      if (e instanceof LibraryRequestError && e.code === 'NO_TENANT') {
        setBlocked(t('enterpriseRequired')); void loadTenants()
      } else setBlocked(t(e instanceof LibraryRequestError && e.status === 401 ? 'signInRequired' : e instanceof LibraryRequestError && e.status === 403 ? 'accessDenied' : 'loadError'))
>>>>>>> origin/4.0
    })
    return () => { current = false }
  }, [origin, fetchImpl, revision])
  useEffect(() => {
    if (!configReady || blocked !== null) { setLoading(false); setItems([]); setTotal(0); return }
    const control = new AbortController()
    setLoading(true); setItems([])
    void fetchLibraryPage(origin, view, '', fetchImpl, control.signal, parentId, page, filter).then(next => {
      if (!control.signal.aborted) {
        const lastPage = Math.max(1, Math.ceil(next.total / 20)); if (page > lastPage) { setPage(lastPage); return }
        setItems(next.items); setTotal(next.total); setParentScope(next.parentScope);
        if (parentId && next.breadcrumb.length) setPath(next.breadcrumb); setError('') }
    }).catch(e => { if (!control.signal.aborted) {
      if (parentId && folderGone(e)) {
        setPath(current => current.filter(part => part.id !== parentId))
        if (path.length === 1) setParentScope(undefined)
        setError('')
        return
      }
      if (e instanceof Error && /(?:401|403|409)/.test(e.message)) { setItems([]); closePreview(); setVersions(undefined) }
      setError(`${t('loadError')} ${e instanceof Error ? e.message : ''}`)
    } }).finally(() => { if (!control.signal.aborted) setLoading(false) })
    return () => { control.abort() }
<<<<<<< HEAD
  }, [blocked, origin, view, fetchImpl, t, revision, parentId, page, filter])
=======
  }, [configReady, blocked, origin, view, query, fetchImpl, t, revision, parentId, page, filter])
>>>>>>> origin/4.0
  useEffect(() => {
    if (edit?.kind !== 'move') return
    const control = new AbortController()
    void fetchLibraryItems(origin, 'mine', '', fetchImpl, control.signal, movePath.at(-1)?.id).then(next => {
      if (!control.signal.aborted) setMoveFolders(next.filter(x => x.kind === 'FOLDER' && x.nodeId !== edit.item?.nodeId))
    }).catch(e => { if (!control.signal.aborted) showToast(e instanceof Error ? e.message : String(e)) })
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
    void (async () => {
      const citation = requested.locator === undefined ? undefined
        : await fetchLibrarySource(origin, requested.nodeId, requested.versionId, fetchImpl, control.signal, 'preview', requested.locator)
      if (control.signal.aborted || generation !== previewGeneration.current) return
<<<<<<< HEAD
      if (opened.versionId !== requested.versionId || !opened.name) throw new Error(t('operationFailed'))
      const entries = readArchiveEntries(opened.entries)
      const contents = entries ? undefined : await fetchLibraryPreviewBytes(origin, requested.nodeId, requested.versionId, opened.originalName ?? opened.name, fetchImpl, control.signal)
      if (!control.signal.aborted && generation === previewGeneration.current) {
        setSource({ ...opened, ...contents, ...(entries ? { entries } : {}), nodeId: requested.nodeId, name: opened.name, versionId: requested.versionId })
      }
    }).catch(error => {
      if (!control.signal.aborted && generation === previewGeneration.current) {
=======
      const opened = await libraryRequest(origin, `nodes/${encodeURIComponent(requested.nodeId)}/preview?versionId=${encodeURIComponent(requested.versionId)}`, 'GET', undefined, transport) as Source
      if (control.signal.aborted || generation !== previewGeneration.current) return
      if (opened.versionId !== requested.versionId || !opened.name || (opened.nodeId && opened.nodeId !== requested.nodeId)) throw new Error(t('operationFailed'))
      const authorized: Source = { ...opened, ...(citation ? { name: citation.name, versionNo: citation.versionNo,
        locator: citation.locator, citationQuote: citation.quote, highlightNote: citation.highlightNote,
        truncated: citation.truncated, truncationNote: citation.truncationNote } : {}), nodeId: requested.nodeId, versionId: requested.versionId }
      setSource(authorized)
      const contents = await fetchLibraryPreviewBytes(origin, requested.nodeId, requested.versionId, opened.originalName ?? opened.name, fetchImpl, control.signal)
      if (!control.signal.aborted && generation === previewGeneration.current) setSource({ ...authorized, ...contents })
    })().catch(error => {
      if (!control.signal.aborted && generation === previewGeneration.current) {
        if (error instanceof LibraryRequestError && [401, 403, 404, 409, 410].includes(error.status)) setSource(undefined)
>>>>>>> origin/4.0
        setPreviewError(error instanceof Error ? error.message : t('operationFailed'))
      }
    }).finally(() => {
      if (!control.signal.aborted && generation === previewGeneration.current) setPreviewLoading(false)
    })
    return () => { control.abort() }
  }, [requested, origin, fetchImpl, t])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setNotice('')
    try { await action() } catch (e) { setNotice(''); showToast(e instanceof Error ? e.message : t('operationFailed')) }
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
    setFilter('all'); setPage(1); refresh()
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
  const visibleItems = items.filter(item => matchesFilter(item, filter))
  const chooseView = (next: LibraryView) => {
    if (next !== view || next === 'recent') closePreview()
    if (next === 'mine' || next === 'shared') {
      setExpandedRoots(roots => ({ ...roots, [next]: next === view ? !roots[next] : true }))
      setMountedRoots(roots => ({ ...roots, [next]: true }))
    }
    setView(next); setPath([]); setParentScope(undefined); setFilter('all')
  }
  const leaveFolder = (nodeId: string) => {
    setPath(current => {
      const index = current.findIndex(part => part.id === nodeId)
      if (index < 0) return current
      const next = current.slice(0, index)
      if (next.length === 0) setParentScope(undefined)
      return next
    })
  }
  const chooseFolder = (nextView: 'mine' | 'shared', next: readonly { id: string; name: string }[], item: LibraryChoice) => {
    closePreview()
    setView(nextView); setPath(next)
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
    if (action === 'purge') { setPurgeItem(item); return }
    void run(async () => {
      if (action === 'versions') {
        const result = await libraryRequest(origin, `nodes/${id}/versions`, 'GET', undefined, fetchImpl)
        const rows = (Array.isArray(result) ? result : []) as VersionRow[]
        setVersions({ item, rows: [...rows].sort((a, b) => b.versionNo - a.versionNo) })
      } else if (action === 'scope') {
        const scope = item.scope === 'ENTERPRISE' ? 'PRIVATE' : 'ENTERPRISE'
        const impact = await fetchLibraryScopeImpact(origin, item.nodeId, scope, fetchImpl)
<<<<<<< HEAD
        setScopeConfirm({ nodeId: item.nodeId, scope, total: impact.total, treeRevision: impact.treeRevision })
=======
        if (window.confirm(t(scope === 'ENTERPRISE' ? 'confirmShareTree' : 'confirmUnshareTree').replace('{count}', String(impact.total)))) await mutate(`nodes/${id}/scope`, 'POST', { scope, confirmShare: scope === 'ENTERPRISE', confirmUnshare: scope === 'PRIVATE', expectedTreeRevision: impact.treeRevision })
      } else if (action === 'purge') {
        if (item.purgeBlockedReason || item.kind === 'FILE') throw new Error(item.purgeBlockedReason || t('filePurgeBlocked'))
        if (window.confirm(t('confirmPurge'))) await mutate(`nodes/${id}`, 'DELETE')
>>>>>>> origin/4.0
      } else if (action === 'retry') await mutate(`nodes/${id}/retry-parse`, 'POST')
      else if (action === 'restore' || action === 'recycle') { leaveFolder(item.nodeId); await mutate(`nodes/${id}/${action}`, 'POST') }
    })
  }
  const confirmPurge = () => {
    const item = purgeItem
    if (!item) return
    setPurgeItem(undefined)
    void run(async () => {
      leaveFolder(item.nodeId)
      await mutate(`nodes/${encodeURIComponent(item.nodeId)}`, 'DELETE')
    })
  }
  const confirmScope = () => {
    const pending = scopeConfirm
    if (!pending) return
    setScopeConfirm(undefined)
    void run(async () => {
      if ('moveParentId' in pending) {
        await mutate(`nodes/${pending.nodeId}/move`, 'POST', { parentId: pending.moveParentId ?? null, confirmShare: true, expectedTreeRevision: pending.treeRevision })
        setEdit(undefined)
      } else {
        await mutate(`nodes/${encodeURIComponent(pending.nodeId)}/scope`, 'POST', { scope: pending.scope, confirmShare: pending.scope === 'ENTERPRISE', confirmUnshare: pending.scope === 'PRIVATE', expectedTreeRevision: pending.treeRevision })
      }
    })
  }
  const saveEdit = () => { if (edit) void run(async () => {
    if (edit.kind === 'move' && edit.item) {
      let options: { confirmShare?: boolean; expectedTreeRevision?: string } = {}
      if (movePath.at(-1)?.scope === 'ENTERPRISE') {
        const impact = await fetchLibraryScopeImpact(origin, edit.item.nodeId, 'ENTERPRISE', fetchImpl)
        if (impact.changed) {
          setScopeConfirm({ nodeId: edit.item.nodeId, scope: 'ENTERPRISE', total: impact.total, treeRevision: impact.treeRevision, moveParentId: movePath.at(-1)?.id ?? null })
          return
        }
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
    setView(nextView); setPath(nextPath); setParentScope(target.scope); setFilter('all')
    setExpandedRoots(roots => ({ ...roots, [nextView]: true }))
    setMountedRoots(roots => ({ ...roots, [nextView]: true }))
    if (action === 'upload') setUploadTarget(target)
    else openEdit(action, undefined, target)
  }
  const flatList = <div className={view === 'trash' ? css.treeRoot : css.flatList}>
    {loading && <p role="status">{t('loading')}</p>}
    {!loading && visibleItems.length === 0 && <p className={css.treeEmpty}>{filter !== 'all' ? t('noResults') : t('empty')}</p>}
    {visibleItems.map(item => view === 'trash' ? <div key={item.nodeId} className={css.treeRow} data-actions>
      <span className={css.treeToggleSpace} aria-hidden="true" />
      <button type="button" className={css.treeName} disabled title={item.name}>
        {item.kind === 'FOLDER' ? <IconFolderCloseRegular size={14} /> : item.kind === 'LINK' ? <IconLinkOutlineRegular size={14} /> : <FileTypeIcon path={item.name} size={14} />}
        <span>{item.name}</span>
      </button>
      <span className={css.treeActions}><RowActions item={item} view={view} busy={busy} t={t} onAction={rowAction} /></span>
    </div> : <div key={item.nodeId} className={css.flatRow}>
      <FileTypeIcon path={item.name} size={16} />
      <button type="button" className={css.treeName} title={item.name} onClick={() => {
        if (item.kind === 'FOLDER') { chooseFolder(view === 'shared' ? 'shared' : 'mine', [...path, { id: item.nodeId, name: item.name }], item) }
        else void openSource(item)
      }}><span>{item.name}</span></button>
      <span className={css.treeActions}>
        {item.kind === 'FOLDER' && item.canManage && <LibraryCreateMenu name={item.name} disabled={busy} t={t}
          onCreate={action => { beginCreate(action, view === 'shared' ? 'shared' : 'mine', [...path, { id: item.nodeId, name: item.name }], {
            parentId: item.nodeId, scope: item.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRIVATE', name: item.name,
          }) }} />}
        <RowActions item={item} view={view} busy={busy} t={t} onAction={rowAction} />
      </span>
<<<<<<< HEAD
=======
      {item.parseReason && <small className={css.flatReason}>{item.parseReason}</small>}
      {view === 'trash' && (item.purgeBlockedReason || item.kind === 'FILE') && <small className={css.flatReason}>{item.purgeBlockedReason || t('filePurgeBlocked')}</small>}
>>>>>>> origin/4.0
    </div>)}
    {total > 20 && <nav className={css.pagination} aria-label={t('browse')}>
      <Button size="sm" disabled={loading || page <= 1} onClick={() => { setPage(n => n - 1) }}>{t('previousPage')}</Button>
      <span>{page} / {Math.ceil(total / 20)}</span>
      <Button size="sm" disabled={loading || page * 20 >= total} onClick={() => { setPage(n => n + 1) }}>{t('nextPage')}</Button>
    </nav>}
  </div>
  return <section ref={sidebarResize.pageRef} className={css.page} style={sidebarResize.style} aria-busy={busy || loading}>
    <aside className={css.navigation} ref={sidebarResize.attachNavigation}>
      <div className={css.toolbar}>
        <div className={css.toolbarTools}>
          <Menu open={filterOpen} onClose={() => { setFilterOpen(false) }} portal minWidthFromAnchor autoFocus align="end" selectedId={filter} listClassName={css.filterList}
            items={[{ id: 'ready', label: t('statusReady') }, { id: 'uncitable', label: t('statusDownloadOnly') }]}
            onSelect={id => { setFilter(id === filter ? 'all' : id); setFilterOpen(false) }}
            anchor={<Button variant="outline" className={css.filterButton} aria-label={t('filterStatus')} aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => { setFilterOpen(!filterOpen) }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setFilterOpen(true) } }}><span>{t(filterLabel(filter))}</span><IconChevronDownOutlineRegular size={14} /></Button>} />
          <Tooltip label={t('searchPlaceholder')}>
            <Button variant="outline" className={css.finderButton} aria-label={t('searchPlaceholder')} disabled={blocked !== null} onClick={() => { setFinderOpen(true) }} icon={<IconSearchOutlineRegular size={16} />} />
          </Tooltip>
          <Tooltip label={t('refresh')}>
            <Button variant="outline" className={css.refresh} aria-label={t('refresh')} disabled={busy || loading} onClick={refresh} icon={<IconRefreshOutlineRegular size={16} />} />
          </Tooltip>
        </div>
      </div>

      {blocked !== null && <div role="alert" className={css.error}>{blocked}</div>}
      {tenants.length > 1 && tenants.map(tenant => <Button key={tenant.id} size="sm" aria-pressed={memberTenantId === tenant.id} disabled={switching || busy} onClick={() => { void enterTenant(tenant.id) }}>{tenant.name}</Button>)}
      <nav className={css.navScroll} aria-label={t('browse')}>
        <LibraryCreateMenu prominent name={t('new')} disabled={busy || blocked !== null} t={t}
          onCreate={action => {
            const here = view === 'mine' || view === 'shared'
            beginCreate(action, here ? view : 'mine', here ? path : [], here ? captureTarget() : { parentId: null, scope: 'PRIVATE', name: t('mine') })
          }} />
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
              {treeView && <LibraryCreateMenu name={t(treeView)} disabled={busy || !configReady || blocked !== null} t={t}
                onCreate={action => { beginCreate(action, treeView, [], { parentId: null, scope: treeView === 'shared' ? 'ENTERPRISE' : 'PRIVATE', name: t(treeView) }) }} />}
            </div>
<<<<<<< HEAD
            {treeView && mountedRoots[treeView] && blocked === null && <div id={`enterprise-library-${treeView}-tree`} className={css.treeRoot}
              hidden={!expandedRoots[treeView] || (view === treeView && filter !== 'all')}>
              <LibraryTree key={memberTenantId ?? 'unselected'} revision={revision} view={treeView} t={t} origin={origin} fetchImpl={fetchImpl} path={[]}
                revealIds={located?.view === treeView ? located.ids : undefined}
                selectedId={located?.view === treeView ? located.ids.at(-1) : view === treeView ? source?.nodeId ?? parentId ?? undefined : undefined}
                onFolder={(next, item) => { setLocated(null); chooseFolder(treeView, next, item) }} onFile={item => { setLocated(null); if (view !== treeView) { setView(treeView); setPath([]) } void openSource(item) }}
                onCreate={(action, next, item) => { beginCreate(action, treeView, next, { parentId: item.nodeId, scope: item.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRIVATE', name: item.name }) }} onAction={(action, item) => { if (view !== treeView) { closePreview(); setView(treeView); setPath([]) } rowAction(action, item) }} onDenied={closePreview} busy={busy} />
            </div>}
            {view === id && id !== 'recent' && (id === 'trash' || filter !== 'all') && flatList}
=======
            {treeView && mountedRoots[treeView] && configReady && blocked === null && <div id={`enterprise-library-${treeView}-tree`} className={css.treeRoot}
              hidden={!expandedRoots[treeView] || (view === treeView && (query !== '' || filter !== 'all'))}>
              <LibraryTree key={revision} view={treeView} t={t} origin={origin} fetchImpl={fetchImpl} path={[]}
                selectedId={view === treeView ? source?.nodeId ?? parentId ?? undefined : undefined}
                onFolder={(next, item) => { chooseFolder(treeView, next, item) }} onFile={item => { if (view !== treeView) { setView(treeView); setPath([]); setQuery('') } void openSource(item) }}
                onCreate={(action, next, item) => { beginCreate(action, treeView, next, { parentId: item.nodeId, scope: item.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRIVATE', name: item.name }) }} onAction={(action, item) => { if (view !== treeView) { closePreview(); setView(treeView); setPath([]); setQuery('') } rowAction(action, item) }} onDenied={closePreview} busy={busy} />
            </div>}
            {configReady && blocked === null && view === id && id !== 'recent' && (id === 'trash' || query !== '' || filter !== 'all') && flatList}
>>>>>>> origin/4.0
          </div>
        })}
      </nav>
      {error && <div role="alert" className={css.error}><span>{error}</span><Button size="sm" onClick={refresh}>{t('refresh')}</Button></div>}
      {notice && <p role="status" className={css.notice}>{notice}</p>}
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
<<<<<<< HEAD
      {source?.entries && <div className={css.previewBody} key={`${source.nodeId}:${source.versionId}:archive`}>
        <div className={css.archivePreview}>
          <p className={css.archiveTitle}>{t('archiveEntries')}</p>
          {source.entries.length === 0 ? <p className={css.archiveEmpty}>{t('archiveEmpty')}</p> : <ul className={css.archiveList}>{source.entries.map((entry) => <li key={entry.name}><span>{entry.name}</span><span>{archiveSize(entry.size)}</span></li>)}</ul>}
          {source.text ? <pre className={css.archiveText}>{source.text}</pre> : null}
        </div>
      </div>}
      {source?.bytes && !source.entries && <div className={css.previewBody} key={`${source.nodeId}:${source.versionId}`}>
=======
      {source?.citationQuote !== undefined && <section className={`${css.previewNote} ${css.citationExcerpt}`}>
        <p>{t('version')} · {source.versionNo ? `v${source.versionNo}` : source.versionId}{source.locator ? ` · ${source.locator}` : ''}</p>
        {source.citationQuote && <pre className={css.sourceText}>{source.citationQuote}</pre>}
        {source.truncated && <p>{source.truncationNote ?? t('truncatedExcerpt')}</p>}
        {source.highlightNote && <p>{source.highlightNote}</p>}
      </section>}
      {source?.bytes && <div className={css.previewBody} key={`${source.nodeId}:${source.versionId}`}>
>>>>>>> origin/4.0
        {renderFactorySlot('document.preview.bytes', { name: source.originalName ?? source.name ?? '', bytes: source.bytes, mimeType: source.mimeType ?? 'application/octet-stream', ...(source.missingFonts ? { missingFonts: source.missingFonts } : {}) })}
      </div>}
      {source?.linkUrl && <div className={css.previewStatus}><IconLinkOutlineRegular size={32} /><p>{source.linkUrl}</p><a href={source.linkUrl} target="_blank" rel="noopener noreferrer">{t('openLink')}</a></div>}
      {source?.parseReason && <p className={css.previewNote}>{source.parseReason}</p>}
      {configReady && blocked === null && view === 'recent' && !source && !previewLoading && !previewError && <section className={css.recentFiles} aria-label={t('recent')}><h2>{t('recent')}</h2>{flatList}</section>}
      {configReady && blocked === null && view !== 'recent' && !source && !previewLoading && !previewError && <div className={css.previewEmpty}>
        <IconFolderCloseRegular size={40} /><h2>{t('selectPreview')}</h2><p>{t('selectPreviewHint')}</p>
      </div>}
    </main>
    {uploadTarget && <LibraryUploadDialog t={t} accept={limits?.allowedExtensions.join(',') ?? ACCEPT} single={!!uploadTarget.replacement} maxFileBytes={limits?.maxFileBytes} loadLimits={loadUploadLimits} uploadFile={uploadOne} onSaved={revealCreated} onClose={() => { setUploadTarget(undefined) }} />}
    <LibraryFinder open={finderOpen} origin={origin} fetchImpl={fetchImpl} t={t} onClose={() => { setFinderOpen(false) }} onLocate={(item) => {
      const treeView = item.location === 'shared' ? 'shared' : 'mine'
      const ids = [...(item.parentPath ?? []).map((part) => part.id), item.nodeId]
      closePreview()
      setView(treeView); setPath([]); setParentScope(undefined); setFilter('all'); setPage(1)
      setExpandedRoots((roots) => ({ ...roots, [treeView]: true }))
      setMountedRoots((roots) => ({ ...roots, [treeView]: true }))
      setLocated({ view: treeView, ids })
      setFinderOpen(false)
    }} />
    <Modal open={purgeItem !== undefined} onClose={() => { if (!busy) setPurgeItem(undefined) }} title={t('purge')} closeLabel={t('cancel')} className={`${css.dialog ?? ''} ${css.compactDialog ?? ''}`} footer={<><Button variant="outline" disabled={busy} onClick={() => { setPurgeItem(undefined) }}>{t('cancel')}</Button><Button variant="primary" disabled={busy} onClick={confirmPurge}>{t('purge')}</Button></>}><p className={css.confirmCopy}>{t('confirmPurge')}</p></Modal>
    <Modal open={scopeConfirm !== undefined} onClose={() => { if (!busy) setScopeConfirm(undefined) }} title={scopeConfirm ? t(scopeConfirm.scope === 'ENTERPRISE' ? 'share' : 'unshare') : ''} closeLabel={t('cancel')} className={`${css.dialog ?? ''} ${css.compactDialog ?? ''}`} footer={<><Button variant="outline" disabled={busy} onClick={() => { setScopeConfirm(undefined) }}>{t('cancel')}</Button><Button variant="primary" disabled={busy || scopeConfirm === undefined} onClick={confirmScope}>{scopeConfirm ? t(scopeConfirm.scope === 'ENTERPRISE' ? 'share' : 'unshare') : ''}</Button></>}><p className={css.confirmCopy}>{scopeConfirm ? t(scopeConfirm.scope === 'ENTERPRISE' ? 'confirmShareTree' : 'confirmUnshareTree').replace('{count}', String(scopeConfirm.total)) : ''}</p></Modal>
    <Modal open={edit !== undefined} onClose={() => { if (!busy) setEdit(undefined) }} title={edit ? t(edit.kind) : ''} closeLabel={t('cancel')} className={`${css.dialog ?? ''} ${edit?.kind === 'folder' || edit?.kind === 'link' ? css.compactDialog : ''}`} contentClassName={css.dialogContent ?? ''} footer={<><Button variant="outline" disabled={busy} onClick={() => { setEdit(undefined) }}>{t('cancel')}</Button><Button variant="primary" disabled={busy || (edit?.kind !== 'move' && !name.trim()) || (edit?.kind === 'link' && !url.trim())} onClick={saveEdit}>{t('save')}</Button></>}>
      {edit?.target && <div className={css.saveTarget}><p><span>{t('saveTo')}</span> {edit.target.name}</p><p>{t(edit.target.scope === 'ENTERPRISE' ? 'sharedSaveHint' : 'privateSaveHint')}</p></div>}
      {edit?.kind === 'move' ? <div className={css.folderPicker}>
        <p>{t('moveShareHint')}</p><p>{t('root')} / {movePath.map(x => x.name).join(' / ')}</p><Button variant="outline" disabled={!movePath.length || busy} onClick={() => { setMovePath(movePath.slice(0, -1)) }}>{t('back')}</Button>
        {moveFolders.map(folder => <Button key={folder.nodeId} icon={<IconFolderCloseRegular size={18} />} onClick={() => { setMovePath([...movePath, { id: folder.nodeId, name: folder.name, scope: folder.scope }]) }}>{folder.name}</Button>)}
      </div> : <div className={css.form}><label>{t('name')}<Input data-modal-autofocus value={name} onChange={e => { setName(e.target.value) }} /></label>{edit?.kind === 'link' && <div className={css.field}><label>{t('url')}<Input value={url} onChange={e => { setUrl(e.target.value) }} /></label><span className={css.fieldHint}>{t('urlHint')}</span></div>}</div>}
    </Modal>
    {toast !== null && <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(current => current?.seq === toast.seq ? null : current) }} />}
    <Modal open={versions !== undefined} onClose={() => { setVersions(undefined) }} title={`${versions?.item.name ?? ''} · ${t('versions')}`} closeLabel={t('cancel')} className={css.dialog ?? ''} contentClassName={css.dialogContent ?? ''} footer={<Button variant="outline" onClick={() => { setVersions(undefined) }}>{t('close')}</Button>}>
      <div className={css.versionList}>{versions?.rows.map(version => <div key={version.id} className={css.versionRow}><span>v{version.versionNo}</span>{versionWrittenAt(version.createdAt) ? <time className={css.versionWhen} dateTime={version.createdAt}>{versionWrittenAt(version.createdAt)}</time> : <span />}<span className={css.versionStatus}><Tag>{t(statusKey(version.parseStatus))}</Tag></span><Button size="sm" disabled={busy} onClick={() => { if (versions) void run(async () => { await openSource(versions.item, version.id); setVersions(undefined) }) }}>{t('preview')}</Button><Button size="sm" onClick={() => { if (versions) downloadVersion(versions.item, version.id) }}>{t('download')}</Button></div>)}</div>
    </Modal>

  </section>
}
