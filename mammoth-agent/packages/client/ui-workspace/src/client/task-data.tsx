/** Task-owned destructive confirmation and archived-data page on the existing settings shell. */
import type { Context } from '@mammoth-ai/cordis'
import { useRef, useState, useSyncExternalStore } from 'react'
import { Button, IconEllipsisOutlineRegular, IconSearchOutlineRegular, Menu, Modal, relativeTime } from '@mammoth-ai/mmp-client-ui-primitives'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { WorkspaceId } from '@mammoth-ai/mmp-api-workspace-controller/client'
import type {} from '@mammoth-ai/mmp-client-ui-settings/client'
import type {} from './contract/slots.ts'
import css from './task-data.module.css'

type DeleteTarget = { sessionId: SessionId; title: string }
type TaskCopy = (key: 'time.now' | 'time.minutes' | 'time.hours' | 'time.days' | 'time.months' | 'time.years' | 'time.ago', values?: Record<string, string | number>) => string
const PAGE_SIZE = 10
function pageIndexes(current: number, last: number): Array<number | 'gap'> {
  const total = last + 1
  if (total <= 7) return Array.from({ length: total }, (_, index) => index)
  const start = Math.max(1, current - 1)
  const end = Math.min(last - 1, current + 1)
  const items: Array<number | 'gap'> = [0]
  if (start > 1) items.push('gap')
  for (let index = start; index <= end; index += 1) items.push(index)
  if (end < last - 1) items.push('gap')
  items.push(last)
  return items
}
function archivedWhen(updatedAt: number, t: TaskCopy): string {
  const { unit, n } = relativeTime(updatedAt, Date.now())
  if (unit === 'now') return t('time.now')
  const amount = t(`time.${unit}`, { n })
  return t('time.ago', { t: amount })
}
/** Register once per actual connection context. Never persist task identity in global browser storage. */
export function installTaskDataSurfaces(ctx: Context, actions: { deleted(): void; restored(): void }): void {
  const t = ctx.locale.bind('workspace')
  // ClientWorkspaceModel methods use `this`. React invokes callbacks unbound;
  // retain the service/model receiver rather than extracting its methods.
  const workspaceSource = {
    subscribe: (listener: () => void) => ctx.workspaces.list.subscribe(listener),
    getSnapshot: () => ctx.workspaces.list.getSnapshot(),
  }
  const sessionSource = {
    subscribe: (listener: () => void) => ctx.sessions.list.subscribe(listener),
    getSnapshot: () => ctx.sessions.list.getSnapshot(),
  }
  const permitted = (id: SessionId, action: 'session/deleteTask' | 'workspace/unarchiveSession') =>
    ctx.remoteAccess.source('session', id, action).getSnapshot()
  const target = createSnapshotStore<DeleteTarget | null>(null)
  const requestDelete = (sessionId: SessionId, title: string) => { target.set({ sessionId, title }) }
  ctx.effect(() => ctx.contextMenus.register({
    id: 'session.delete-task', target: 'session', order: 700,
    observe: ({ sessionId }) => [ctx.remoteAccess.source('session', sessionId, 'session/deleteTask')],
    resolve: ({ sessionId, displayTitle }) => ctx.remoteAccess.source('session', sessionId, 'session/deleteTask').getSnapshot() ? [{
      id: 'delete-task', label: t('delete.task'), icon: { key: 'workspace.delete' }, danger: true, separatorBefore: true, afterContent: true,
      run: () => { requestDelete(sessionId, displayTitle) },
    }] : [],
  }), 'ui-workspace: permanent task delete')

  function DeleteTaskDialog() {
    const current = useSyncExternalStore(target.subscribe, target.getSnapshot)
    const [busy, setBusy] = useState(false), busyRef=useRef(false)
    const [error, setError] = useState('')
    if (current === null) return null
    const close = () => { if (!busy) { target.set(null); setError('') } }
    const remove = async () => {
      if (busyRef.current) return
      busyRef.current=true;setBusy(true); setError('')
      try {
        if (!permitted(current.sessionId, 'session/deleteTask')) throw new Error(t('data.denied'))
        const result = await ctx.remote.session.deleteTask({ sessionId: current.sessionId, confirmation: 'permanent-delete' })
        if (!result.ok) throw new Error(result.error.message)
        target.set(null)
        actions.deleted()
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { busyRef.current=false;setBusy(false) }
    }
    return <Modal open onClose={close} closeLabel={t('data.close')} title={t('delete.task.title')} description={current.title}
      footer={<><Button variant="outline" disabled={busy} onClick={close}>{t('data.cancel')}</Button><Button variant="primary" disabled={busy} onClick={() => { void remove() }}>{busy ? t('data.busy') : t('delete.task.confirm')}</Button></>}>
      <p>{t('delete.task.description')}</p>{error && <p role="alert" className={css.error}>{error}</p>}
    </Modal>
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'task-delete-confirm' }, DeleteTaskDialog))

  function ArchivedTasks() {
    const workspace = useSyncExternalStore(workspaceSource.subscribe, workspaceSource.getSnapshot)
    const list = useSyncExternalStore(sessionSource.subscribe, sessionSource.getSnapshot)
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(0)
    const [busy, setBusy] = useState<SessionId | null>(null)
    const [error, setError] = useState('')
    const [destinations, setDestinations] = useState<Record<string, string>>({})
    const [menuFor, setMenuFor] = useState<SessionId | null>(null)
    const [picking, setPicking] = useState<SessionId | null>(null)
    const [confirming, setConfirming] = useState<SessionId | null>(null)
    const [retrying, setRetrying] = useState(false), retryRef = useRef(false)
    const needle = query.trim().toLocaleLowerCase()
    const rows = (workspace.state === 'error' ? [] : workspace.archivedSessionIds).map(id => ({ id, summary: list.byId[id] })).filter(row =>
      row.summary !== undefined && (!needle || row.summary.displayTitle.toLocaleLowerCase().includes(needle)))
    const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)
    const current = Math.min(page, last)
    const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
    const restore = async (id: SessionId) => {
      if (busy) return
      setBusy(id); setError('')
      try {
        if (!permitted(id, 'workspace/unarchiveSession')) throw new Error(t('data.denied'))
        const chosen = destinations[id]
        const result = await ctx.remote.workspace.unarchiveSession({ sessionId: id, ...(chosen ? { workspaceId: chosen as WorkspaceId } : {}) })
        if (!result.ok) throw new Error(result.error.message)
        setConfirming(null)
        actions.restored()
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { setBusy(null) }
    }
    const retry = async () => {
      if (retryRef.current) return
      retryRef.current=true; setRetrying(true); setError('')
      try {
        if (!ctx.workspaces.retryList) throw new Error(t('data.retryUnavailable'))
        await ctx.workspaces.retryList()
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { retryRef.current=false;setRetrying(false) }
    }
    const listed = workspace.phase === 'ready' && list.phase === 'ready' && workspace.state === 'idle'
    return <section className={css.page}>
      <header className={css.header}>
        <h2 className={css.title}>{t('data.archived')}</h2>
        {listed && <span className={css.count}>{t('data.count', { n: rows.length })}</span>}
      </header>
      <label className={css.search}>
        <IconSearchOutlineRegular />
        <input type="search" aria-label={t('data.search')} placeholder={t('data.search')} value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} />
      </label>
      {error && confirming === null && <p role="alert" className={css.error}>{error}</p>}
      {workspace.state === 'error' && <p role="alert" className={css.error}>{workspace.error?.message ?? t('data.loadError')}</p>}
      {(workspace.state === 'error' || error) && <Button variant="outline" disabled={retrying} onClick={() => { void retry() }}>{retrying ? t('data.busy') : t('data.retry')}</Button>}
      {(workspace.phase !== 'ready' || list.phase !== 'ready' || workspace.state === 'loading') && <p role="status">{t('data.listLoading')}</p>}
      {listed && rows.length === 0 && <p>{t('data.empty')}</p>}
      <div className={css.list}>
      {visible.map(({ id, summary }) => {
        const title = summary?.displayTitle ?? id
        const owner = workspace.items.find(item => item.sessionIds.includes(id))
        const meta = [owner?.title, summary ? archivedWhen(summary.updatedAt, t) : ''].filter(Boolean).join(' · ')
        return <article key={id} className={css.row}>
          <div className={css.main}>
            <span className={css.name}>{title}</span>
            {meta !== '' && <span className={css.meta}>{meta}</span>}
          </div>
          <div className={css.actions}>
            <Button variant="ghost" size="sm" disabled={busy !== null || !permitted(id, 'workspace/unarchiveSession') || (picking === id && !owner && !destinations[id])} onClick={() => { if (!owner && !destinations[id]) setPicking(id); else setConfirming(id) }}>{t('data.restore')}</Button>
            <Menu open={menuFor === id} onClose={() => { setMenuFor(current => current === id ? null : current) }} portal align="end" autoFocus
              anchor={<Button variant="ghost" size="sm" className={css.menuButton} aria-label={t('actions.session.aria', { name: title })} aria-haspopup="menu" aria-expanded={menuFor === id} onClick={() => { setMenuFor(current => current === id ? null : id) }}><IconEllipsisOutlineRegular /></Button>}
              items={[{ id: 'delete', label: t('delete.task'), danger: true, disabled: !permitted(id, 'session/deleteTask') }]}
              onSelect={() => { setMenuFor(null); requestDelete(id, title) }} />
          </div>
          {picking === id && !owner && <div className={css.destination}><p>{t('data.destination')}</p><select aria-label={t('data.destination')} value={destinations[id] ?? ''} onChange={event => { setDestinations(old => ({ ...old, [id]: event.target.value })) }}>
            <option value="">—</option>{workspace.items.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}</select></div>}
        </article>
      })}
      </div>
      {rows.length > PAGE_SIZE && <nav className={css.pager} aria-label={t('data.archived')}>
        <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => { setPage(old => Math.max(0, old - 1)) }}>{t('data.previous')}</Button>
        {pageIndexes(current, last).map((item, index) => item === 'gap'
          ? <span key={`gap-${index}`} className={css.pageGap} aria-hidden="true">…</span>
          : <Button key={item} variant="ghost" size="sm" className={item === current ? css.pageCurrent : css.pageButton} aria-current={item === current ? 'page' : undefined} onClick={() => { setPage(item) }}>{item + 1}</Button>)}
        <Button variant="ghost" size="sm" disabled={current >= last} onClick={() => { setPage(old => old + 1) }}>{t('data.next')}</Button>
      </nav>}
      {confirming !== null && <Modal open onClose={() => { if (busy !== confirming) { setConfirming(null); setError('') } }} closeLabel={t('data.close')} title={t('data.restore.title')} description={list.byId[confirming]?.displayTitle ?? confirming}
        footer={<><Button variant="outline" disabled={busy === confirming} onClick={() => { setConfirming(null); setError('') }}>{t('data.cancel')}</Button><Button variant="primary" disabled={busy !== null} onClick={() => { void restore(confirming) }}>{busy === confirming ? t('data.busy') : t('data.restore.confirm')}</Button></>}>
        <p>{t('data.restore.description')}</p>{error && <p role="alert" className={css.error}>{error}</p>}
      </Modal>}
    </section>
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'data-management', order: 800, label: () => t('data.title') }, ArchivedTasks))
}
