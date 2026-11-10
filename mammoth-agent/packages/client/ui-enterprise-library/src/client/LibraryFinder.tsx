import { useEffect, useRef, useState } from 'react'
import type { UIEvent } from 'react'
import { Button, FileTypeIcon, IconCloseOutlineRegular, IconSearchOutlineRegular, Input, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import { fetchLibraryCatalog, type LibraryFetch } from './api.ts'
import type { LibraryPanelProps } from './LibraryPanel.tsx'
import type { LibraryChoice } from './selection.ts'
import css from './LibraryPanel.module.css'

type Props = {
  open: boolean
  origin: string
  fetchImpl: LibraryFetch
  t: LibraryPanelProps['t']
  onClose: () => void
  onLocate: (item: LibraryChoice) => void
}

function place(item: LibraryChoice, t: Props['t']) {
  const root = t(item.location === 'shared' ? 'shared' : 'mine')
  const rest = (item.parentPath ?? []).map((part) => part.name).filter(Boolean).join(' / ')
  return rest ? `${root} / ${rest}` : root
}

const SEARCH_PAUSE_MS = 300

/** Filename finder for every visible file. Clicking a row returns to that file in the sidebar tree. */
export function LibraryFinder({ open, origin, fetchImpl, t, onClose, onLocate }: Props) {
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<LibraryChoice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const appliedRef = useRef(applied)
  appliedRef.current = applied
  useEffect(() => {
    if (!open) { setQuery(''); setApplied(''); setPage(1); setItems([]); setTotal(0); setError(''); return }
    // The catalog is an HTTP query. Send it only after typing pauses, and leave the field itself immediate.
    const timer = window.setTimeout(() => {
      const next = query.trim()
      if (appliedRef.current === next) return
      setApplied(next)
      setPage(1)
    }, SEARCH_PAUSE_MS)
    return () => { window.clearTimeout(timer) }
  }, [open, query])
  useEffect(() => {
    if (!open) return
    const control = new AbortController()
    setLoading(true)
    setError('')
    void fetchLibraryCatalog(origin, applied, page, fetchImpl, control.signal).then((result) => {
      if (control.signal.aborted) return
      setTotal(result.total)
      setItems((current) => page === 1 ? result.items : [...current, ...result.items.filter((item) => !current.some((row) => row.nodeId === item.nodeId))])
    }).catch((reason: unknown) => {
      if (!control.signal.aborted) setError(reason instanceof Error ? reason.message : t('operationFailed'))
    }).finally(() => { if (!control.signal.aborted) setLoading(false) })
    return () => { control.abort() }
  }, [open, origin, fetchImpl, applied, page, t])
  const more = () => { if (!loading && items.length < total) setPage((current) => current + 1) }
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 48) more()
  }
  return <Modal open={open} headless title={t('finderTitle')} onClose={onClose} className={css.finder}>
    <div className={css.finderSearch}>
      <Input className={css.finderField} icon={<IconSearchOutlineRegular size={16} />} type="search" aria-label={t('finderPlaceholder')} placeholder={t('finderPlaceholder')} value={query} data-modal-autofocus onChange={(event) => { setQuery(event.target.value) }} />
      <Button aria-label={t('close')} onClick={onClose} icon={<IconCloseOutlineRegular size={16} />} />
    </div>
    <div className={css.finderList} onScroll={onScroll}>
      {items.map((item) => <button key={item.nodeId} type="button" className={css.finderRow} onClick={() => { onLocate(item) }}>
        <FileTypeIcon path={item.name} size={20} />
        <span className={css.finderCopy}>
          <span className={css.finderName}>{item.name.replace(/\.[^.]+$/, '')}</span>
          <span className={css.finderPlace}>{place(item, t)}</span>
        </span>
      </button>)}
      {loading && <p role="status">{t('loading')}</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && <p>{applied ? t('noResults') : t('empty')}</p>}
      {!loading && !error && page > 1 && items.length > 0 && items.length >= total && <p>{t('finderEnd')}</p>}
    </div>
  </Modal>
}
