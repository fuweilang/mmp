/** Temporary, version-aware library selection; only confirmation mutates the caller's draft. */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@mammoth-ai/mmp-client-ui-slots'
import {
  Button, FileTypeIcon, Input, Modal, Tooltip, fileSizeText,
  IconCloseOutlineRegular, IconFolderOpenOutlineRegular, IconSearchOutlineRegular,
} from '@mammoth-ai/mmp-client-ui-primitives'
import { fetchLibraryPage, type LibraryFetch, type LibraryPage } from './api.ts'
import { choiceBlock, type LibraryChoice } from './selection.ts'
import css from './LibraryPicker.module.css'

/** Plain owner inputs; the slot supplies the locale share. Confirmation rejects without losing selection. */
export type LibraryPickerProps = PropsLocale<'enterpriseLibrary'> & {
  origin: string
  fetchImpl: LibraryFetch
  open: boolean
  initialSelected?: readonly LibraryChoice[]
  onClose: () => void
  onConfirm: (items: readonly LibraryChoice[]) => Promise<void>
}

/** Mount a fresh temporary selection for each open dialog.
 * @param props - authenticated list transport, initial choices and draft callbacks.
 * @returns The viewport-bounded modal, or nothing while closed.
 */
export function LibraryPicker(props: LibraryPickerProps) {
  return props.open ? <PickerBody {...props} /> : null
}

function PickerBody({ t, origin, fetchImpl, initialSelected = [], onClose, onConfirm }: LibraryPickerProps) {
  const [query, setQuery] = useState({ view: 'recent' as 'recent' | 'mine' | 'shared', search: '', parentId: null as string | null, page: 1 })
  const [selected, setSelected] = useState(() => new Map(
    initialSelected.filter(item => item.kind === 'FILE' && item.parseStatus === 'READY' && item.versionId !== null)
      .map(item => [item.nodeId, item]),
  ))
  const [result, setResult] = useState<{ page: LibraryPage | null; loading: boolean; failed: boolean }>({
    page: null, loading: true, failed: false,
  })
  const [retry, setRetry] = useState(0)
  const [committing, setCommitting] = useState(false)
  const [commitFailed, setCommitFailed] = useState(false)
  const activeCommit = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setResult({ page: null, loading: true, failed: false })
    void fetchLibraryPage(origin, query.view, query.search, fetchImpl, controller.signal, query.parentId, query.page).then((page) => {
      if (!controller.signal.aborted) setResult({ page, loading: false, failed: false })
    }, () => {
      if (!controller.signal.aborted) setResult({ page: null, loading: false, failed: true })
    })
    return () => { controller.abort() }
  }, [origin, fetchImpl, query, retry])

  const close = () => { if (!activeCommit.current) onClose() }
  const toggle = (item: LibraryChoice) => {
    if (activeCommit.current || choiceBlock(item).disabled) return
    setSelected((previous) => {
      const next = new Map(previous)
      if (next.get(item.nodeId)?.versionId === item.versionId) next.delete(item.nodeId)
      else next.set(item.nodeId, item)
      return next
    })
    setCommitFailed(false)
  }
  const confirm = async () => {
    if (activeCommit.current || selected.size === 0) return
    activeCommit.current = true; setCommitting(true); setCommitFailed(false)
    try {
      await onConfirm([...selected.values()])
    } catch (_error) {
      // The caller owns draft mutation; a refusal keeps this exact selection for retry.
      if (mounted.current) { setCommitFailed(true); setCommitting(false) }
      activeCommit.current = false
      return
    }
    activeCommit.current = false
    if (mounted.current) onClose()
  }
  const reason = (item: LibraryChoice) => {
    if (item.kind === 'LINK') return t('pickerUnsupported')
    if (item.parseReason?.trim()) return item.parseReason
    switch (item.parseStatus) {
      case 'FAILED': return t('statusFailed')
      case 'PROCESSING': return t('statusProcessing')
      case 'PENDING': return t('statusPending')
      case 'DOWNLOAD_ONLY': return t('pickerUnsupported')
      default: return t('unready')
    }
  }
  const page = result.page
  const pages = Math.max(1, Math.ceil((page?.total ?? 0) / 20))
  const navigate = (parentId: string | null) => { setQuery(previous => ({ ...previous, parentId, search: '', page: 1 })) }
  return <Modal headless open title={t('pickerTitle')} onClose={close} className={css.dialog ?? ''}>
    <header className={css.header}>
      <h2>{t('pickerTitle')}</h2>
      <Tooltip label={t('close')} portal><Button size="sm" aria-label={t('close')} disabled={committing} onClick={close}><IconCloseOutlineRegular size={16} /></Button></Tooltip>
    </header>
    <div className={css.controls}>
      <Input className={css.search ?? ''} icon={<IconSearchOutlineRegular size={16} />} aria-label={t('searchPlaceholder')} placeholder={t('searchPlaceholder')} value={query.search} disabled={committing} onChange={(event) => { const search = event.target.value; setQuery(previous => ({ ...previous, search, page: 1 })) }} />
      <div role="tablist" aria-label={t('browse')} className={css.tabs}>{(['recent', 'mine', 'shared'] as const).map(view => <Button key={view} role="tab" aria-selected={query.view === view} tabIndex={query.view === view ? 0 : -1} disabled={committing} onKeyDown={(event) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
        if (!keys.includes(event.key)) return
        event.preventDefault()
        const tabs = [...event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []]
        const index = tabs.indexOf(event.currentTarget)
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        tabs[target]?.focus(); tabs[target]?.click()
      }} onClick={() => { setQuery({ view, search: query.search, parentId: null, page: 1 }) }}>{t(view)}</Button>)}</div>
    </div>
    <nav className={css.breadcrumb} aria-label={t('pickerLocation')}>
      <Button size="sm" disabled={committing} onClick={() => { navigate(null) }}>{t('root')}</Button>
      {!query.search.trim() && page?.breadcrumb.map(part => <Button size="sm" key={part.id} disabled={committing} aria-current={part.id === query.parentId ? 'location' : undefined} onClick={() => { navigate(part.id) }}>{part.name}</Button>)}
    </nav>
    <div className={css.list} aria-busy={result.loading}>
      {result.loading ? <div role="status" aria-label={t('loading')} className={css.skeleton}>{['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].map(id => <div key={id} />)}</div>
        : result.failed ? <div className={css.empty}><p role="alert">{t('loadError')}</p><Button variant="outline" disabled={committing} onClick={() => { setRetry(value => value + 1) }}>{t('pickerRetry')}</Button></div>
          : page?.items.length === 0 ? <div className={css.empty}><p>{t(query.search.trim() ? 'noResults' : 'empty')}</p><p className={css.secondary}>{t(query.search.trim() ? 'searchHint' : 'pickerEmptyHint')}</p></div>
            : <ul className={css.rows}>{page?.items.map((item) => {
              const folder = item.kind === 'FOLDER', blocked = choiceBlock(item).disabled
              const checked = selected.get(item.nodeId)?.versionId === item.versionId
              const timestamp = query.view === 'recent'
                ? item.accessedAt ?? item.updatedAt
                : item.updatedAt
              const date = timestamp ? new Date(timestamp) : null
              return <li key={item.nodeId} className={css.row}
                data-disabled={!folder && blocked || undefined} data-selected={checked || undefined}>
                <div className={css.check}>{!folder && <input type="checkbox" aria-label={`${t('select')} ${item.name}`} checked={checked} disabled={committing || blocked} onChange={() => { toggle(item) }} />}</div>
                {folder ? <IconFolderOpenOutlineRegular size={20} /> : <FileTypeIcon path={item.name} size={20} />}
                <div className={css.file}>
                  <Tooltip label={item.name} portal onlyWhenClipped openOnClick={!folder} side="bottom">{folder
                    ? <button type="button" className={css.folder} disabled={committing} onClick={() => { navigate(item.nodeId) }}>{item.name}</button>
                    : <span className={css.name} tabIndex={0}>{item.name}</span>}</Tooltip>
                  {!folder && blocked && <span className={css.reason}>{reason(item)}</span>}
                </div>
                <span className={css.scope}>{t(item.scope === 'ENTERPRISE' ? 'shared' : 'private')}</span>
                <span className={css.size}>{item.sizeBytes === undefined ? '' : fileSizeText(item.sizeBytes)}</span>
                <span className={css.date}>{date && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : ''}</span>
              </li>
            })}</ul>}
    </div>
    <div className={css.status}>
      <span role={commitFailed ? 'alert' : undefined} className={css.error}>{commitFailed ? t('pickerAttachFailed') : committing ? t('pickerAdding') : ''}</span>
      <div className={css.pagination}><Button size="sm" disabled={committing || result.loading || query.page === 1} aria-label={t('previousPage')} onClick={() => { setQuery(previous => ({ ...previous, page: previous.page - 1 })) }}>{t('previousPage')}</Button><span>{t('pickerPage', { page: query.page, total: pages })}</span><Button size="sm" disabled={committing || result.loading || result.failed || query.page >= pages} aria-label={t('nextPage')} onClick={() => { setQuery(previous => ({ ...previous, page: previous.page + 1 })) }}>{t('nextPage')}</Button></div>
    </div>
    <footer className={css.footer}><span>{t('pickerSelected', { count: selected.size })}</span><div><Button variant="outline" disabled={committing} onClick={close}>{t('cancel')}</Button><Button variant="primary" disabled={committing || selected.size === 0} onClick={() => { void confirm() }}>{t('pickerConfirm')}</Button></div></footer>
  </Modal>
}
