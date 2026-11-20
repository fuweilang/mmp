import { useEffect, useId, useRef, useState } from 'react'
import { Button, Modal, fileSizeText, IconCloseOutlineRegular, IconInfoOutlineRegular, IconWarningTriangleOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryKey } from './locales.ts'
import css from './LibraryPanel.module.css'

const MAX_FILES = 50
const MAX_FOLDER_DEPTH = 5

type Row = {
  id: string
  file: File
  displayPath: string
  folderPath?: readonly string[]
  status: 'queued' | 'uploading' | 'success' | 'failed'
  error?: string | undefined
}
type FolderEntry = { file: File; folderPath: readonly string[]; displayPath: string }

export function LibraryUploadDialog({ t, accept, single, maxFileBytes, loadLimits, uploadFile, existingFolderNames, existingFileNames, onSaved, onClose }: {
  t: (key: LibraryKey) => string; accept: string; single: boolean; maxFileBytes?: number | undefined
  loadLimits: () => Promise<{ maxFileBytes: number; allowedExtensions: readonly string[] }>
  uploadFile: (file: File, folderPath?: readonly string[]) => Promise<void>; onSaved: () => void; onClose: () => void
  existingFolderNames?: ReadonlySet<string>
  existingFileNames?: ReadonlySet<string>
}) {
  const input = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null)
  const active = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [rows, setRows] = useState<readonly Row[]>([]), [running, setRunning] = useState(false), [error, setError] = useState('')
  const [reuseNames, setReuseNames] = useState<readonly string[]>([])
  const fileConflicts = [...new Set(rows.flatMap(row => row.folderPath?.length ? [] : existingFileNames?.has(row.file.name) ? [row.file.name] : []))]
  const conflictTitleId = useId()
  const queuedCount = rows.filter(row => row.status === 'queued').length
  const close = () => { if (!active.current) onClose() }
  const keyOf = (displayPath: string, file: File) => `${displayPath}\u0000${file.size}\u0000${file.lastModified}`
  const add = (files: readonly File[]) => {
    if (active.current) return
    setReuseNames([])
    if (single && (files.length !== 1 || rows.length > 0)) { setError(t('uploadSingleHint')); return }
    const known = new Set(rows.map(row => keyOf(row.displayPath, row.file)))
    const unique = files.filter(file => {
      const key = keyOf(file.name, file)
      if (known.has(key)) return false
      known.add(key)
      return true
    })
    if (unique.length + rows.length > MAX_FILES) { setError(t(single ? 'uploadSingleHint' : 'uploadQueueLimit')); return }
    setRows(previous => [...previous, ...unique.map(file => ({ id: crypto.randomUUID(), file, displayPath: file.name, status: 'queued' as const }))])
    setError('')
  }
  const addFolder = (files: readonly File[]) => {
    if (active.current || single) return
    const entries: FolderEntry[] = []
    for (const file of files) {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
      const parts = relative.split('/').filter(Boolean)
      if (parts.length < 2) continue
      const name = parts[parts.length - 1]!
      if (/^(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name) || parts.some(part => part.startsWith('._'))) continue
      entries.push({ file, folderPath: parts.slice(0, -1), displayPath: parts.join('/') })
    }
    if (!entries.length) {
      setError(t(files.some(file => Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath)) ? 'uploadFolderEmpty' : 'uploadFolderNoRoot'))
      return
    }
    if (new Set(entries.map(entry => entry.folderPath[0])).size !== 1) { setError(t('uploadFolderMultipleRoots')); return }
    if (entries.some(entry => entry.folderPath.length > MAX_FOLDER_DEPTH)) { setError(t('uploadFolderDepth')); return }
    const known = new Set(rows.map(row => keyOf(row.displayPath, row.file)))
    const unique = entries.filter(entry => {
      const key = keyOf(entry.displayPath, entry.file)
      if (known.has(key)) return false
      known.add(key)
      return true
    })
    if (!unique.length) { setError(''); return }
    if (unique.length + rows.length > MAX_FILES) { setError(t('uploadQueueLimit')); return }
    const roots = [...new Set(unique.map(entry => entry.folderPath[0]!))]
    setReuseNames(roots.filter(name => existingFolderNames?.has(name)))
    setRows(previous => [...previous, ...unique.map(entry => ({
      id: crypto.randomUUID(),
      file: entry.file,
      displayPath: entry.displayPath,
      folderPath: entry.folderPath,
      status: 'queued' as const,
    }))])
    setError('')
  }
  const chooseFolder = () => {
    if (active.current || single) return
    if (typeof HTMLInputElement === 'undefined' || !('webkitdirectory' in HTMLInputElement.prototype)) {
      setError(t('uploadFolderUnsupported'))
      return
    }
    folderInput.current?.click()
  }
  const run = async (jobs: readonly Row[]) => {
    if (active.current || !jobs.length) return
    if (fileConflicts.length > 0) { setError(t('fileExists').replace('{name}', fileConflicts.join('、'))); return }
    active.current = true; setRunning(true); setError('')
    const update = (id: string, next: Partial<Row>) => { if (!mounted.current) return; setRows(previous => previous.map(row => row.id === id ? { ...row, ...next } : row)) }
    let saved = 0
    let failed = 0
    try {
      const limits = await loadLimits()
      if (!Number.isFinite(limits.maxFileBytes) || !Array.isArray(limits.allowedExtensions)) throw new Error(t('loadError'))
      for (const row of jobs) {
        if (!mounted.current) break
        if (row.status === 'success' || row.status === 'uploading') continue
        update(row.id, { status: 'uploading', error: undefined })
        let submitted = false
        try {
          const ext = /\.[^.]+$/.exec(row.file.name)?.[0]?.toLowerCase() ?? ''
          if (row.file.size <= 0 || row.file.size > limits.maxFileBytes || !limits.allowedExtensions.includes(ext)) throw new Error(`${t('uploadHint')} (${fileSizeText(limits.maxFileBytes)})`)
          submitted = true; await uploadFile(row.file, row.folderPath); saved++; update(row.id, { status: 'success' })
        } catch (cause) { failed++; update(row.id, { status: 'failed', error: `${cause instanceof Error ? cause.message : t('operationFailed')}${submitted ? ` · ${t('uploadUncertain')}` : ''}` }) }
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : t('operationFailed')) }
    finally {
      active.current = false
      if (!mounted.current) return
      setRunning(false)
      if (saved) onSaved()
      setRows(previous => previous.filter(row => row.status !== 'success'))
      if (saved > 0 && failed === 0) onClose()
    }
  }
  return <Modal headless open title={t(single ? 'replace' : 'upload')} onClose={close} className={css.uploadDialog ?? ''}>
    <header className={css.uploadHeader}>
      <div className={css.uploadHeading}>
        <h2>{t(single ? 'replace' : 'upload')}</h2>
        <p className={css.uploadSubtitle}>{t(single ? 'uploadSingleHint' : 'uploadBatchHint')}</p>
      </div>
      <Button className={css.uploadClose} aria-label={t('close')} disabled={running} onClick={close} icon={<IconCloseOutlineRegular size={16} />} />
    </header>
    <div className={css.uploadBody}>
      <div className={css.uploadDrop} onDragOver={event => { event.preventDefault() }} onDrop={event => {
        event.preventDefault()
        if (Array.from(event.dataTransfer.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) { setError(t('uploadFolderDragHint')); return }
        add(Array.from(event.dataTransfer.files))
      }}><p>{t('uploadDrop')}</p>
        <div className={css.uploadActions}>
          <Button data-modal-autofocus variant="outline" disabled={running} onClick={() => { input.current?.click() }}>{t('uploadChoose')}</Button>
          {!single && <Button variant="outline" disabled={running} onClick={chooseFolder}>{t('uploadChooseFolder')}</Button>}
        </div>
        <input hidden ref={input} type="file" multiple={!single} accept={accept} aria-label={t('uploadChoose')} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
        {!single && <input hidden ref={folderInput} type="file" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} aria-label={t('uploadChooseFolder')} onChange={event => { addFolder(Array.from(event.target.files ?? [])); event.target.value = '' }} />}
      </div>
      <p className={css.uploadNote}>{t('uploadHint')}{maxFileBytes !== undefined ? ` · ${t('uploadLimit')} ${fileSizeText(maxFileBytes)}` : ''}</p>
      {reuseNames.length > 0 && <div role="status" className={css.uploadNotice}>
        <IconInfoOutlineRegular size={16} className={css.uploadNoticeIcon} />
        <div className={css.uploadNoticeBody}>
          <p className={css.uploadNoticeTitle}>{t('folderMergeTitle')}</p>
          <p className={css.uploadWarningHint}>{t('folderMergeNotice').replace('{name}', reuseNames.join('、'))}</p>
        </div>
      </div>}
      {fileConflicts.length > 0 && <div role="alert" aria-labelledby={conflictTitleId} className={css.uploadWarning}>
        <IconWarningTriangleOutlineRegular size={16} className={css.uploadWarningIcon} />
        <div className={css.uploadWarningBody}>
          <p id={conflictTitleId} className={css.uploadWarningTitle}>{t('fileConflictTitle')}</p>
          <ul className={css.uploadWarningList}>{fileConflicts.map(name => <li key={name}>{t('fileExists').replace('{name}', name)}</li>)}</ul>
          <p className={css.uploadWarningHint}>{t('fileConflictNext')}</p>
        </div>
      </div>}
      {error && <div role="alert" className={css.uploadWarning} data-tone="danger">
        <IconWarningTriangleOutlineRegular size={16} className={css.uploadWarningIcon} />
        <div className={css.uploadWarningBody}><p className={css.uploadWarningHint}>{error}</p></div>
      </div>}
      {running && <p role="status" className={css.uploadNote}>{t('uploadBusyHint')}</p>}
      {rows.length > 0 && <section className={css.uploadQueue} aria-label={t('uploadQueueTitle')}>
        <div className={css.uploadQueueHead}><p>{t('uploadQueueTitle')}</p><span>{t('uploadQueueCount').replace('{count}', String(queuedCount))}</span></div>
        <ul className={css.uploadList}>{rows.map(row => {
          const conflict = !row.folderPath?.length && fileConflicts.includes(row.file.name)
          return <li key={row.id} data-conflict={conflict || undefined}>
            <div className={css.uploadRowMain}>
              <strong className={css.uploadRowName} title={row.displayPath}>{row.displayPath}</strong>
              <span className={css.uploadRowMeta}>{fileSizeText(row.file.size)}</span>
              {row.status === 'queued' ? <Button size="sm" aria-label={`${t('uploadRemove')} · ${row.displayPath}`} disabled={running} onClick={() => { setRows(previous => previous.filter(item => item.id !== row.id)) }} icon={<IconCloseOutlineRegular size={14} />} /> : <span className={css.uploadRowStatus} data-status={row.status} role="status">{t(row.status === 'uploading' ? 'uploading' : row.status === 'success' ? 'uploadSuccess' : 'uploadFailure')}</span>}
            </div>
            {conflict && <span className={css.uploadRowBadge}>{t('fileConflictBadge')}</span>}
            {row.error && <p className={css.uploadRowError} role="alert">{row.error}</p>}
            {row.status === 'failed' && <Button size="sm" disabled={running} onClick={() => { void run([row]) }}>{t('uploadRetryOne')}</Button>}
          </li>
        })}</ul>
      </section>}
    </div>
    <footer className={css.uploadFooter}>
      <span className={css.uploadFooterCount}>{t('uploadQueueCount').replace('{count}', String(queuedCount))}</span>
      <div className={css.uploadFooterActions}>
        <Button variant="outline" disabled={running} onClick={close}>{t('close')}</Button>
        {rows.some(row => row.status === 'failed') && <Button variant="outline" disabled={running} onClick={() => { void run(rows.filter(row => row.status === 'failed')) }}>{t('uploadRetry')}</Button>}
        <Button variant="primary" disabled={running || fileConflicts.length > 0 || !rows.some(row => row.status === 'queued')} onClick={() => { void run(rows.filter(row => row.status === 'queued')) }}>{t('uploadStart')}</Button>
      </div>
    </footer>
  </Modal>
}
