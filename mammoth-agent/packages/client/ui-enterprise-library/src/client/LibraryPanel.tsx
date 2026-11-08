import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import { fetchLibraryItems, libraryRequest, type LibraryFetch, type LibraryView } from './api.ts'
import { choiceBlock, type LibraryChoice } from './selection.ts'
import css from './LibraryPanel.module.css'

export type LibraryPanelInjected = {
  readonly origin: string
  readonly fetchImpl: LibraryFetch
  readonly onUse: (item: LibraryChoice) => Promise<void> | void
}
export type LibraryPanelProps = PropsRuntime<'main'> & PropsLocale<'enterpriseLibrary'> & InjectFace<LibraryPanelInjected>
const VIEWS: readonly LibraryView[] = ['recent', 'mine', 'shared', 'trash']
type Edit = { kind: 'folder' | 'link' | 'rename' | 'move'; item?: LibraryChoice }
type Source = { name?: string; text?: string; chunks?: readonly { locator: string; text: string }[] }

/** Native Web/desktop library browser. Explicit save never uploads temporary chat attachments. */
export function LibraryPanel({ t, origin, fetchImpl, onUse }: LibraryPanelProps) {
  const [view, setView] = useState<LibraryView>('mine')
  const [query, setQuery] = useState('')
  const [path, setPath] = useState<readonly { id: string; name: string }[]>([])
  const [items, setItems] = useState<readonly LibraryChoice[]>([])
  const [selected, setSelected] = useState<readonly string[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [edit, setEdit] = useState<Edit>()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState<Source>()
  const [moveFolders, setMoveFolders] = useState<readonly LibraryChoice[]>([])
  const [movePath, setMovePath] = useState<readonly { id: string; name: string }[]>([])
  const parentId = path.at(-1)?.id ?? null
  const refresh = () => { setRevision(n => n + 1) }
  useEffect(() => {
    const control = new AbortController()
    void fetchLibraryItems(origin, view, query, fetchImpl, control.signal, parentId).then(next => {
      if (!control.signal.aborted) { setItems(next); setSelected([]); setError('') }
    }).catch(e => { if (!control.signal.aborted) setError(`${t('loadError')} ${e instanceof Error ? e.message : ''}`) })
    return () => { control.abort() }
  }, [origin, view, query, fetchImpl, t, revision, parentId])
  useEffect(() => {
    if (edit?.kind !== 'move') return
    const control = new AbortController()
    void fetchLibraryItems(origin, 'mine', '', fetchImpl, control.signal, movePath.at(-1)?.id).then(next => {
      if (!control.signal.aborted) setMoveFolders(next.filter(x => x.kind === 'FOLDER' && x.nodeId !== edit.item?.nodeId))
    }).catch(e => { if (!control.signal.aborted) setError(String(e)) })
    return () => { control.abort() }
  }, [origin, fetchImpl, edit, movePath])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : t('operationFailed')) }
    finally { setBusy(false) }
  }
  const mutate = async (suffix: string, method: string, data?: unknown) => {
    await libraryRequest(origin, suffix, method, data, fetchImpl); refresh()
  }
  const upload = async (files: readonly File[], replacement?: LibraryChoice) => {
    await run(async () => {
      const failures: string[] = []
      for (const [index, file] of files.entries()) {
        setNotice(`${t('uploading')} ${index + 1}/${files.length}: ${file.name}`)
        const form = new FormData(); form.append('files', file)
        if (parentId && !replacement) form.append('parentId', parentId)
        const result = await libraryRequest(origin, replacement ? `files/${replacement.nodeId}/versions` : 'files', 'POST', form, fetchImpl)
        if (result && typeof result === 'object' && 'failed' in result && Array.isArray(result.failed)) {
          for (const failed of result.failed) if (failed && typeof failed === 'object' && 'message' in failed) failures.push(String(failed.message))
        }
      }
      refresh(); if (failures.length) throw new Error(failures.join('; '))
      setNotice(t('transferred'))
    })
  }
  const openEdit = (kind: Edit['kind'], item?: LibraryChoice) => {
    setEdit(item ? { kind, item } : { kind }); setName(item?.name ?? ''); setUrl(''); setMovePath([])
  }
  const useItems = (chosen: readonly LibraryChoice[]) => run(async () => {
    for (const item of chosen) await onUse(item)
    setNotice(t('added'))
  })
  return <section className={css.page} aria-busy={busy}>
    <nav className={css.views}>
      {VIEWS.map(id => <button key={id} type="button" aria-pressed={view === id} onClick={() => { setView(id); setPath([]); setQuery('') }}>{t(id)}</button>)}
    </nav>
    <header className={css.toolbar}>
      <input aria-label={t('searchPlaceholder')} value={query} placeholder={t('searchPlaceholder')} onChange={e => { setQuery(e.target.value) }} />
      {view !== 'trash' && <>
        <label>{t('upload')}<input aria-label={t('upload')} type="file" multiple disabled={busy} onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} /></label>
        <button disabled={busy} onClick={() => { openEdit('folder') }}>{t('folder')}</button>
        <button disabled={busy} onClick={() => { openEdit('link') }}>{t('link')}</button>
      </>}
      <button disabled={busy} onClick={refresh}>{t('retry')}</button>
      <button disabled={busy || !selected.length} onClick={() => { void useItems(items.filter(x => selected.includes(x.nodeId))) }}>{t('selected')} ({selected.length})</button>
    </header>
    <nav aria-label={t('root')} className={css.views}>
      <button onClick={() => { setPath([]) }}>{t('root')}</button>
      {path.map((part, i) => <button key={part.id} onClick={() => { setPath(path.slice(0, i + 1)) }}>{part.name}</button>)}
    </nav>
    {error && <p role="alert" className={css.error}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!items.length && <p className={css.muted}>{query ? t('noResults') : t('empty')}</p>}
    <ul>{items.map(item => {
      const blocked = choiceBlock(item).disabled || view === 'trash'
      const id = encodeURIComponent(item.nodeId)
      return <li key={item.nodeId} className={css.row}>
        <input type="checkbox" aria-label={`${t('select')} ${item.name}`} disabled={blocked || busy} checked={selected.includes(item.nodeId)} onChange={e => { setSelected(e.target.checked ? [...selected, item.nodeId] : selected.filter(x => x !== item.nodeId)) }} />
        <div className={css.details}>
          {item.kind === 'FOLDER' ? <button onClick={() => { setQuery(''); setPath([...path, { id: item.nodeId, name: item.name }]) }}>{item.name}/</button> : <span>{item.name}</span>}
          <small>{item.kind} · {item.scope} {item.versionNo ? `· v${item.versionNo}` : ''} · {item.parseStatus} {item.parseReason}</small>
          {item.kind === 'LINK' && <small>{item.url}</small>}
        </div>
        {!blocked && <button disabled={busy} onClick={() => { void useItems([item]) }}>{t('useForChat')}</button>}
        {item.kind === 'FILE' && view !== 'trash' && <>
          <a href={`${origin}/ground-library/nodes/${id}/download?versionId=${encodeURIComponent(item.versionId ?? '')}`} download>{t('download')}</a>
          <button disabled={busy} onClick={() => { void run(async () => {
            const response = await fetchImpl(`${origin}/ground-library/nodes/${id}/preview?versionId=${encodeURIComponent(item.versionId ?? '')}`, { credentials: 'include' })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            setSource(await response.json() as Source)
          }) }}>{t('preview')}</button>
        </>}
        {item.canManage && view !== 'trash' && <>
          <button disabled={busy} onClick={() => { openEdit('rename', item) }}>{t('rename')}</button>
          <button disabled={busy} onClick={() => { openEdit('move', item) }}>{t('move')}</button>
          {item.kind === 'FILE' && <>
            <label>{t('replace')}<input type="file" aria-label={`${t('replace')} ${item.name}`} disabled={busy} onChange={e => { void upload(Array.from(e.target.files ?? []), item); e.target.value = '' }} /></label>
            {item.parseStatus === 'FAILED' && <button disabled={busy} onClick={() => { void run(() => mutate(`nodes/${id}/retry-parse`, 'POST')) }}>{t('retry')}</button>}
          </>}
          <button disabled={busy} onClick={() => { if (item.scope === 'ENTERPRISE' || window.confirm(t('confirmShare'))) void run(() => mutate(`nodes/${id}/scope`, 'POST', { scope: item.scope === 'ENTERPRISE' ? 'PRIVATE' : 'ENTERPRISE', confirmShare: true })) }}>{item.scope === 'ENTERPRISE' ? t('unshare') : t('share')}</button>
          <button disabled={busy} onClick={() => { void run(() => mutate(`nodes/${id}/recycle`, 'POST')) }}>{t('recycle')}</button>
        </>}
        {item.canManage && view === 'trash' && <>
          <button disabled={busy} onClick={() => { void run(() => mutate(`nodes/${id}/restore`, 'POST')) }}>{t('restore')}</button>
          <button disabled={busy} onClick={() => { if (window.confirm(t('confirmPurge'))) void run(() => mutate(`nodes/${id}`, 'DELETE')) }}>{t('purge')}</button>
        </>}
      </li>
    })}</ul>
    {edit && <dialog open className={css.dialog}>
      <h3>{t(edit.kind)}</h3>
      {edit.kind === 'move' ? <>
        <p>{t('root')} / {movePath.map(x => x.name).join(' / ')}</p>
        <button onClick={() => { setMovePath(movePath.slice(0, -1)) }}>{t('back')}</button>
        {moveFolders.map(folder => <button key={folder.nodeId} onClick={() => { setMovePath([...movePath, { id: folder.nodeId, name: folder.name }]) }}>{folder.name}/</button>)}
      </> : <label>{t('name')}<input value={name} onChange={e => { setName(e.target.value) }} /></label>}
      {edit.kind === 'link' && <label>{t('url')}<input value={url} onChange={e => { setUrl(e.target.value) }} /></label>}
      <button disabled={busy || (edit.kind !== 'move' && !name.trim())} onClick={() => { void run(async () => {
        if (edit.kind === 'move' && edit.item) await mutate(`nodes/${edit.item.nodeId}/move`, 'POST', { parentId: movePath.at(-1)?.id ?? null })
        else if (edit.kind === 'rename' && edit.item) await mutate(`nodes/${edit.item.nodeId}`, 'PATCH', { name })
        else await mutate(edit.kind === 'folder' ? 'folders' : 'links', 'POST', { name, parentId, ...(edit.kind === 'link' ? { url } : {}) })
        setEdit(undefined)
      }) }}>{t('save')}</button>
      <button onClick={() => { setEdit(undefined) }}>{t('cancel')}</button>
    </dialog>}
    {source && <dialog open className={css.dialog}>
      <h3>{source.name}</h3><p>{t('sourceNote')}</p>
      {source.chunks?.map(chunk => <section key={chunk.locator}><b>{chunk.locator}</b><pre>{chunk.text}</pre></section>)}
      {source.text && <pre>{source.text}</pre>}
      <button onClick={() => { setSource(undefined) }}>{t('cancel')}</button>
    </dialog>}
    <p className={css.muted}>{t('localDraft')}</p>
  </section>
}
