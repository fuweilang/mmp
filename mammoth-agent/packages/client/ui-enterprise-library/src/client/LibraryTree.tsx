import { useEffect, useState } from 'react'
import { Button, IconChevronDownOutlineRegular, IconFolderCloseRegular, IconLinkOutlineRegular, FileTypeIcon } from '@mammoth-ai/mmp-client-ui-primitives'
import { fetchLibraryPage, type LibraryFetch } from './api.ts'
import type { LibraryChoice } from './selection.ts'
import type { LibraryPanelProps } from './LibraryPanel.tsx'
import { RowActions } from './LibraryRowActions.tsx'
import { LibraryCreateMenu, type LibraryCreateAction } from './LibraryCreateMenu.tsx'
import css from './LibraryPanel.module.css'

type Crumb = { id: string; name: string }
type Props = {
  view?: 'mine' | 'shared'
  selectedId?: string | undefined
  origin: string
  fetchImpl: LibraryFetch
  t: LibraryPanelProps['t']
  path: readonly Crumb[]
  onFolder: (path: readonly Crumb[], item: LibraryChoice) => void
  onFile: (item: LibraryChoice) => void
  onCreate?: (action: LibraryCreateAction, path: readonly Crumb[], item: LibraryChoice) => void
  onAction?: (action: string, item: LibraryChoice) => void
  onDenied?: () => void
  busy?: boolean
}
/** Children are fetched only while expanded; every branch has its own bounded page and cancellation. */
export function LibraryTree(props: Props) {
  const { origin, fetchImpl, t, path, onFolder, onFile, selectedId, view = 'mine', onDenied } = props
  const parentId = path.at(-1)?.id ?? null
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<LibraryChoice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState<readonly string[]>([])
  useEffect(() => {
    const control = new AbortController(); setLoading(true); setError('')
    void fetchLibraryPage(origin, view, '', fetchImpl, control.signal, parentId, page).then(result => {
      if (control.signal.aborted) return
      setRows(previous => page === 1 ? result.items : [...new Map([...previous, ...result.items].map(row => [row.nodeId, row])).values()]); setTotal(result.total)
    }).catch(e => { if (!control.signal.aborted) {
      setRows([]); setError(String(e))
      if (/(?:401|403|409)/.test(String(e))) onDenied?.()
    } }).finally(() => { if (!control.signal.aborted) setLoading(false) })
    return () => { control.abort() }
  }, [origin, fetchImpl, parentId, page, retry, view, onDenied])
  return <ul className={css.tree} aria-label={path.at(-1)?.name ?? t(view)}>
    {rows.map(item => {
      const folder = item.kind === 'FOLDER'; const invalid = path.some(part => part.id === item.nodeId) || path.length >= 32
      const open = expanded.includes(item.nodeId)
      const next = [...path, { id: item.nodeId, name: item.name }]
      return <li key={item.nodeId}><div className={css.treeRow} data-actions={props.onAction ? true : undefined} data-current={selectedId === item.nodeId || undefined}>
        {folder ? <Button className={css.treeToggle} size="sm" aria-label={`${t('toggleTree')} · ${item.name}`} aria-expanded={open} disabled={invalid} onClick={() => { setExpanded(open ? expanded.filter(id => id !== item.nodeId) : [...expanded, item.nodeId]) }}><span style={{ display: 'flex', transform: open ? undefined : 'rotate(-90deg)' }}><IconChevronDownOutlineRegular size={12} /></span></Button> : <span className={css.treeToggleSpace} aria-hidden="true" />}
        <button type="button" className={css.treeName} aria-current={selectedId === item.nodeId ? 'page' : undefined} disabled={invalid} title={invalid ? t('treeLoop') : item.name} onClick={() => {
          if (folder) { setExpanded(ids => ids.includes(item.nodeId) ? ids : [...ids, item.nodeId]); onFolder(next, item) }
          else onFile(item)
        }}>
          {folder ? <IconFolderCloseRegular size={14} /> : item.kind === 'LINK' ? <IconLinkOutlineRegular size={14} /> : <FileTypeIcon path={item.name} size={14} />}<span>{item.name}</span>
        </button>
        {props.onAction && <span className={css.treeActions}>
          {folder && item.canManage && props.onCreate && <LibraryCreateMenu name={item.name} disabled={!!props.busy || invalid} t={t}
            onCreate={action => { props.onCreate?.(action, next, item) }} />}
          <RowActions item={item} view={view} busy={props.busy ?? false} t={t} onAction={props.onAction} />
        </span>}
      </div>{folder && open && !invalid && <LibraryTree {...props} path={next} />}</li>
    })}
    {loading && <li role="status">{t('loading')}</li>}
    {error && <li role="alert">{error}<Button size="sm" onClick={() => { setPage(1); setRetry(n => n + 1) }}>{t('refresh')}</Button></li>}
    {!loading && !error && rows.length === 0 && <li className={css.treeEmpty}>{t('empty')}</li>}
    {!loading && !error && rows.length < total && <li className={css.treeMore}><Button size="sm" onClick={() => { setPage(n => n + 1) }}>{t('loadMore')}</Button></li>}
  </ul>
}
