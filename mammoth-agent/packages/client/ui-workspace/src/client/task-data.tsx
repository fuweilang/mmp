/** Task-owned destructive confirmation and archived-data page on the existing settings shell. */
import type { Context } from '@mammoth-ai/cordis'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { WorkspaceId } from '@mammoth-ai/mmp-api-workspace-controller/client'
import type {} from '@mammoth-ai/mmp-client-ui-settings/client'
import type {} from './contract/slots.ts'
import css from './task-data.module.css'

type DeleteTarget = { sessionId: SessionId; title: string }
function messageText(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  const object = value as Record<string, unknown>
  if (Array.isArray(object.content)) return object.content.map(block => {
    if (typeof block !== 'object' || block === null) return ''
    const item = block as Record<string, unknown>
    return item.type === 'text' && typeof item.text === 'string' ? item.text : ''
  }).filter(Boolean).join('\n')
  return object.message ? messageText(object.message) : ''
}
/** Register once per actual connection context. Never persist task identity in global browser storage. */
export function installTaskDataSurfaces(ctx: Context, actions: { deleted(): void }): void {
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
  const permitted = (id: SessionId, action: 'session/deleteTask' | 'session/events' | 'workspace/unarchiveSession') =>
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
      footer={<><Button variant="outline" disabled={busy} onClick={close}>{t('data.cancel')}</Button><Button variant="outline" className={css.danger} disabled={busy} onClick={() => { void remove() }}>{busy ? t('data.busy') : t('delete.task.confirm')}</Button></>}>
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
    const [notice, setNotice] = useState('')
    const [error, setError] = useState('')
    const [destinations, setDestinations] = useState<Record<string, string>>({})
    const [view, setView] = useState<{ id: SessionId; title: string; lines: string[]; before?: number; through?: number; more: boolean } | null>(null)
    const [retrying, setRetrying] = useState(false), retryRef = useRef(false)
    const [reading, setReading] = useState(false), readEpoch=useRef(0), readingRef=useRef(false)
    useEffect(()=>()=>{readEpoch.current++;readingRef.current=false},[])
    const needle = query.trim().toLocaleLowerCase()
    const rows = (workspace.state === 'error' ? [] : workspace.archivedSessionIds).map(id => ({ id, summary: list.byId[id] })).filter(row =>
      row.summary !== undefined && (!needle || row.summary.displayTitle.toLocaleLowerCase().includes(needle)))
    const last = Math.max(0, Math.ceil(rows.length / 20) - 1)
    const visible = rows.slice(Math.min(page, last) * 20, (Math.min(page, last) + 1) * 20)
    const read = async (id: SessionId, title: string, earlier = false) => {
      if (readingRef.current) return
      readingRef.current=true;const epoch=++readEpoch.current
      setReading(true); setError('')
      try {
        if (!permitted(id, 'session/events')) throw new Error(t('data.denied'))
        const result = await ctx.remote.session.events({ address: { kind: 'session', sessionId: id }, maxMessages: 20,
          ...(earlier && view?.before !== undefined ? { beforeSeq: view.before, throughSeq: view.through } : {}) })
        if(readEpoch.current!==epoch)return
        if (!result.ok) throw new Error(result.error.message)
        const records = result.value.records
        const lines = records.filter(row => row.event.type === 'user/message' || row.event.type === 'assistant/message').map(row => messageText(row.event.data)).filter(Boolean)
        setView({ id, title, lines: earlier && view?.id === id ? [...lines, ...view.lines] : lines,
          ...(records[0] ? { before: records[0].event.seq } : {}), through: result.value.cursor, more: result.value.hasMore })
      } catch (reason) { if(readEpoch.current===epoch)setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { if(readEpoch.current===epoch){readingRef.current=false;setReading(false)} }
    }
    const restore = async (id: SessionId) => {
      if (busy) return
      setBusy(id); setError(''); setNotice('')
      try {
        if (!permitted(id, 'workspace/unarchiveSession')) throw new Error(t('data.denied'))
        const chosen = destinations[id]
        const result = await ctx.remote.workspace.unarchiveSession({ sessionId: id, ...(chosen ? { workspaceId: chosen as WorkspaceId } : {}) })
        if (!result.ok) throw new Error(result.error.message)
        setNotice(t('data.restored'))
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
    return <section className={css.page}>
      <h2>{t('data.archived')}</h2>
      <input className={css.search} aria-label={t('data.search')} placeholder={t('data.search')} value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} />
      {notice && <p role="status">{notice}</p>}{error && <p role="alert" className={css.error}>{error}</p>}
      {workspace.state === 'error' && <p role="alert" className={css.error}>{workspace.error?.message ?? t('data.loadError')}</p>}
      {(workspace.state === 'error' || error) && <Button variant="outline" disabled={retrying} onClick={() => { void retry() }}>{retrying ? t('data.busy') : t('data.retry')}</Button>}
      {(workspace.phase !== 'ready' || list.phase !== 'ready' || workspace.state === 'loading') && <p role="status">{t('data.listLoading')}</p>}
      {workspace.phase === 'ready' && list.phase === 'ready' && workspace.state === 'idle' && rows.length === 0 && <p>{t('data.empty')}</p>}
      {visible.map(({ id, summary }) => {
        const title = summary?.displayTitle ?? id
        const owner = workspace.items.find(item => item.sessionIds.includes(id))
        return <article key={id} className={css.row}>
          <div className={css.name}>{title}</div>
          {!owner && <div className={css.destination}><p>{t('data.destination')}</p><select aria-label={t('data.destination')} value={destinations[id] ?? ''} onChange={event => { setDestinations(old => ({ ...old, [id]: event.target.value })) }}>
            <option value="">—</option>{workspace.items.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}</select></div>}
          <div className={css.actions}>
            <Button variant="outline" disabled={reading || !permitted(id, 'session/events')} onClick={() => { void read(id, title) }}>{t('data.view')}</Button>
            <Button variant="outline" disabled={busy !== null || !permitted(id, 'workspace/unarchiveSession') || (!owner && !destinations[id])} onClick={() => { void restore(id) }}>{t('data.restore')}</Button>
            <Button variant="outline" className={css.danger} disabled={!permitted(id, 'session/deleteTask')} onClick={() => { requestDelete(id, title) }}>{t('delete.task')}</Button>
          </div>
        </article>
      })}
      <nav className={css.actions} aria-label={t('data.archived')}>
        <Button variant="outline" disabled={page === 0} onClick={() => { setPage(old => Math.max(0, old - 1)) }}>{t('data.previous')}</Button>
        <span>{Math.min(page, last) + 1} / {last + 1}</span>
        <Button variant="outline" disabled={page >= last} onClick={() => { setPage(old => old + 1) }}>{t('data.next')}</Button>
      </nav>
      {view && <Modal open title={view.title} description={t('data.readonly')} closeLabel={t('data.close')} onClose={() => { if (!reading) setView(null) }}>
        {view.lines.map((text, index) => <pre className={css.history} key={index}>{text}</pre>)}
        {view.more && <Button variant="outline" disabled={reading || !permitted(view.id, 'session/events')} onClick={() => { void read(view.id, view.title, true) }}>{reading ? t('data.loading') : t('data.moreHistory')}</Button>}
      </Modal>}
    </section>
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'data-management', order: 800, label: () => t('data.title') }, ArchivedTasks))
}
