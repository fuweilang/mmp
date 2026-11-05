/** Read-only cloud conversations: explicit source-device and file availability cues. */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import type { AccountKey } from './locales.ts'
import css from './CloudHistoryDialog.module.css'

type T = (key: AccountKey) => string
interface Conversation {
  id: string; title: string; projectName: string; deviceName: string; deviceId: string; clientKind: 'desktop' | 'web'
  sourceCreatedAt: string; sourceUpdatedAt: string; state: string; syncing: boolean; lastSyncedAt: string | null; deviceSeenAt: string
  files?: { name: string; access: 'source-device-only' }[]
}
interface Message { sourceSeq: number; role: 'user' | 'assistant'; text: string; sourceTime: string }
interface Page { conversation: Conversation; messages: Message[]; nextAfter: number | null }
interface Status { deviceId: string; syncing: boolean; lastError: string | null; lastSuccessAt: string | null }

async function read<TValue>(path: string, signal: AbortSignal, method = 'GET'): Promise<TValue> {
  const response = await fetch(`ground-history/${path}`, { method, credentials: 'same-origin', signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('history-unavailable')
  return response.json() as Promise<TValue>
}

/** Display paginated cloud replicas without exposing any prompt, execute or file-download action. */
export function CloudHistoryDialog({ t, close }: { t: T; close(): void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Conversation[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage] = useState<Page | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [version, setVersion] = useState(0)
  const lifetime = useRef<AbortController | null>(null)
  const selectionRevision = useRef(0)
  const listRevision = useRef(0)
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    return () => { abort.abort() }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    listRevision.current++
    setLoading(true); setError(false)
    const timer = setTimeout(() => {
      void Promise.all([
        read<{ items: Conversation[]; nextCursor: string | null }>(`list?q=${encodeURIComponent(query.trim())}`, abort.signal),
        read<Status>('status', abort.signal).catch(() => null),
      ]).then(([list, sync]) => {
        if (abort.signal.aborted) return
        setItems(list.items); setCursor(list.nextCursor); setStatus(sync)
      }).catch(() => { if (!abort.signal.aborted) setError(true) })
        .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    }, 200)
    return () => { clearTimeout(timer); abort.abort() }
  }, [query, version])
  useEffect(() => {
    const abort = new AbortController()
    selectionRevision.current++
    setPage(null)
    if (!selected) return () => { abort.abort() }
    setLoadingMessages(true)
    void read<Page>(`detail?id=${encodeURIComponent(selected)}`, abort.signal).then(value => {
      if (!abort.signal.aborted) setPage(value)
    }).catch(() => { if (!abort.signal.aborted) setError(true) })
      .finally(() => { if (!abort.signal.aborted) setLoadingMessages(false) })
    return () => { abort.abort() }
  }, [selected, version])
  const moreSessions = async () => {
    if (!cursor || !lifetime.current) return
    const revision = listRevision.current
    setLoading(true)
    try {
      const list = await read<{ items: Conversation[]; nextCursor: string | null }>(`list?q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(cursor)}`, lifetime.current.signal)
      if (revision !== listRevision.current || lifetime.current.signal.aborted) return
      setItems(previous => [...previous, ...list.items.filter(item => !previous.some(old => old.id === item.id))]); setCursor(list.nextCursor)
    } catch { if (revision === listRevision.current && !lifetime.current.signal.aborted) setError(true) }
    finally { if (revision === listRevision.current) setLoading(false) }
  }
  const moreMessages = async () => {
    if (!selected || !page || page.nextAfter === null || !lifetime.current) return
    const revision = selectionRevision.current
    setLoadingMessages(true)
    try {
      const next = await read<Page>(`detail?id=${encodeURIComponent(selected)}&after=${page.nextAfter}`, lifetime.current.signal)
      if (revision === selectionRevision.current) setPage(previous => previous ? { ...next, messages: [...previous.messages, ...next.messages] } : next)
    } catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { if (revision === selectionRevision.current) setLoadingMessages(false) }
  }
  const retry = async () => {
    if (!lifetime.current) return
    setLoading(true)
    try { await read('retry', lifetime.current.signal, 'POST'); setVersion(value => value + 1) }
    catch { if (!lifetime.current.signal.aborted) setError(true) }
    finally { setLoading(false) }
  }
  const date = (value: string | null) => value ? new Date(value).toLocaleString() : t('historyNotSynced')
  const taskState = (item: Conversation) => item.syncing ? t('historySyncing')
    : item.state === 'running' && Date.now() - new Date(item.deviceSeenAt).getTime() > 90000 ? t('historyOffline')
      : item.state === 'running' ? t('historyRunning') : item.state === 'completed' ? t('historyCompleted')
        : item.state === 'error' ? t('historyFailed') : item.state === 'interrupted' ? t('historyInterrupted') : t('historyIdle')
  return <Modal open title={t('cloudHistory')} closeLabel={t('close')} onClose={close}
    description={t('historyReadOnly')} className={css.dialog!} contentClassName={css.content!}>
    <div className={css.toolbar}>
      <Input aria-label={t('historySearch')} placeholder={t('historySearch')} value={query} onChange={event => { setQuery(event.target.value) }} />
      <Button variant="outline" disabled={loading} onClick={() => { setVersion(value => value + 1) }}>{t('historyRefresh')}</Button>
      <Button variant="outline" disabled={loading || status?.syncing} onClick={() => { void retry() }}>{t('historyRetry')}</Button>
    </div>
    {error && <p role="alert" className={css.notice}>{t('historyError')}</p>}
    {status?.lastError && <p role="status" className={css.notice}>{t('historyPending')}</p>}
    <div className={css.layout}>
      <aside className={css.list} aria-label={t('cloudHistory')}>
        {loading && !items.length && <p role="status">{t('loading')}</p>}
        {!loading && !items.length && <p className={css.empty}>{t('historyEmpty')}</p>}
        {items.map(item => <button type="button" key={item.id} className={css.item} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setError(false) }}>
          <strong>{item.title}</strong><span>{item.projectName || t('historyNoProject')}</span>
          <span>{item.clientKind === 'desktop' ? t('historyDesktop') : t('historyWeb')} · {item.deviceName}</span>
          <small>{taskState(item)} · {date(item.sourceUpdatedAt)}</small>
        </button>)}
        {cursor && <Button variant="outline" disabled={loading} onClick={() => { void moreSessions() }}>{t('historyMore')}</Button>}
      </aside>
      <section className={css.viewer} aria-label={t('historyTranscript')}>
        {!selected && <p className={css.empty}>{t('historySelect')}</p>}
        {loadingMessages && !page && <p role="status">{t('loading')}</p>}
        {page && <>
          <header className={css.detailHeader}>
            <h2>{page.conversation.title}</h2>
            <p>{page.conversation.projectName || t('historyNoProject')} · {page.conversation.deviceName} · {taskState(page.conversation)}</p>
            <p>{t('historyLastSynced')} {date(page.conversation.lastSyncedAt)}</p>
            <div className={css.fileNotice}>{page.conversation.deviceId === status?.deviceId ? t('historySourceDevice') : t('historyRemoteFiles')}</div>
            {!!page.conversation.files?.length && <ul>{page.conversation.files.map((file, index) => <li key={`${index}-${file.name}`}>{file.name}</li>)}</ul>}
          </header>
          <div className={css.transcript}>
            {page.messages.map(message => <article className={css.message} key={message.sourceSeq} data-role={message.role}>
              <div className={css.messageMeta}>{message.role === 'user' ? t('historyYou') : t('historyAssistant')} · {date(message.sourceTime)}</div>
              <pre>{message.text || t('historyAttachmentOnly')}</pre>
            </article>)}
            {page.nextAfter !== null && <Button variant="outline" disabled={loadingMessages} onClick={() => { void moreMessages() }}>{t('historyMoreMessages')}</Button>}
          </div>
        </>}
      </section>
    </div>
  </Modal>
}
