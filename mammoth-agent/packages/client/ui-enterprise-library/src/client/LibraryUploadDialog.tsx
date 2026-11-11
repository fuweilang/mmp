import { useEffect, useRef, useState } from 'react'
import { Button, Modal, fileSizeText, IconCloseOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryKey } from './locales.ts'
import css from './LibraryPanel.module.css'

type Row = { id: string; file: File; status: 'queued' | 'uploading' | 'success' | 'failed'; error?: string | undefined }
export function LibraryUploadDialog({ t, accept, single, maxFileBytes, hint, loadLimits, uploadFile, onSaved, onClose }: {
  t: (key: LibraryKey) => string; accept: string; single: boolean; maxFileBytes?: number | undefined
  hint?: string | undefined
  loadLimits: () => Promise<{ maxFileBytes: number; allowedExtensions: readonly string[] }>
  uploadFile: (file: File) => Promise<void>; onSaved: () => void; onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null), active = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [rows, setRows] = useState<readonly Row[]>([]), [running, setRunning] = useState(false), [error, setError] = useState('')
  const close = () => { if (!active.current) onClose() }
  const add = (files: readonly File[]) => {
    if (active.current) return
    if ((single && (files.length !== 1 || rows.length > 0)) || files.length + rows.length > 50) { setError(t(single ? 'uploadSingleHint' : 'uploadQueueLimit')); return }
    setRows(previous => [...previous, ...files.filter(file => !previous.some(row => row.file.name === file.name && row.file.size === file.size && row.file.lastModified === file.lastModified)).map(file => ({ id: crypto.randomUUID(), file, status: 'queued' as const }))]); setError('')
  }
  const run = async (jobs: readonly Row[]) => {
    if (active.current || !jobs.length) return
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
          submitted = true; await uploadFile(row.file); saved++; update(row.id, { status: 'success' })
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
    <header className={css.uploadHeader}><h2>{t(single ? 'replace' : 'upload')}</h2><Button aria-label={t('close')} disabled={running} onClick={close}>×</Button></header>
    <div className={css.uploadBody}>
      <div className={css.uploadDrop} onDragOver={event => { event.preventDefault() }} onDrop={event => {
        event.preventDefault()
        if (Array.from(event.dataTransfer.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) { setError(t('uploadQueueLimit')); return }
        add(Array.from(event.dataTransfer.files))
      }}><p>{t('uploadDrop')}</p><Button data-modal-autofocus variant="outline" disabled={running} onClick={() => { input.current?.click() }}>{t('uploadChoose')}</Button><input hidden ref={input} type="file" multiple={!single} accept={accept} aria-label={t('uploadChoose')} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = '' }} /></div>
      <p className={css.uploadNote}>{t(single ? 'uploadSingleHint' : 'uploadBatchHint')}{maxFileBytes !== undefined ? ` · ${t('uploadLimit')} ${fileSizeText(maxFileBytes)}` : ''}</p>
      {hint && <p className={css.uploadNote}>{hint}</p>}
      {running && <p role="status">{t('uploadBusyHint')}</p>}{error && <p role="alert" className={css.error}>{error}</p>}
      <ul className={css.uploadList}>{rows.map(row => <li key={row.id}><strong>{row.file.name}</strong><span>{fileSizeText(row.file.size)}</span>{row.status === 'queued' ? <Button size="sm" aria-label={`${t('uploadRemove')} · ${row.file.name}`} disabled={running} onClick={() => { setRows(previous => previous.filter(item => item.id !== row.id)) }} icon={<IconCloseOutlineRegular size={14} />} /> : <span role="status">{t(row.status === 'uploading' ? 'uploading' : row.status === 'success' ? 'uploadSuccess' : 'uploadFailure')}</span>}{row.error && <p role="alert">{row.error}</p>}{row.status === 'failed' && <Button size="sm" disabled={running} onClick={() => { void run([row]) }}>{t('uploadRetryOne')}</Button>}</li>)}</ul>
    </div>
    <footer className={css.uploadFooter}><Button variant="outline" disabled={running} onClick={close}>{t('close')}</Button>{rows.some(row => row.status === 'failed') && <Button variant="outline" disabled={running} onClick={() => { void run(rows.filter(row => row.status === 'failed')) }}>{t('uploadRetry')}</Button>}<Button variant="primary" disabled={running || !rows.some(row => row.status === 'queued')} onClick={() => { void run(rows.filter(row => row.status === 'queued')) }}>{t('uploadStart')}</Button></footer>
  </Modal>
}
