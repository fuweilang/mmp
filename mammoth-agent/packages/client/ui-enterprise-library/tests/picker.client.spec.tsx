// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryPicker } from '../src/client/LibraryPicker.tsx'
import type { LibraryChoice } from '../src/client/selection.ts'
import { zh, type LibraryKey } from '../src/client/locales.ts'

afterEach(cleanup)
const t = ((key: LibraryKey, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), zh[key])) as never
const file = (id: string, version = 'v1') => ({ id, name: `${id}.pdf`, kind: 'FILE', currentVersion: { id: version, versionNo: 1, parseStatus: 'READY', sizeBytes: 2048 } })
const select = (id: string) => fireEvent.click(screen.getByRole('checkbox', { name: `${zh.select} ${id}.pdf` }))

describe('library picker', () => {
  it('retains a persisted ready draft reference even when its version ordinal is unavailable', async () => {
    const initial: LibraryChoice = {
      nodeId: 'persisted', versionId: 'v-old', versionNo: null, name: 'Saved.pdf', kind: 'FILE',
      parseStatus: 'READY', parseReason: null,
    }
    const onConfirm = vi.fn(async (_items: readonly LibraryChoice[]) => {})
    render(<LibraryPicker open t={t} initialSelected={[initial]} origin="" fetchImpl={vi.fn(async () => Response.json({ items: [] }))} onClose={vi.fn()} onConfirm={onConfirm} />)
    await screen.findByText(zh.empty)
    fireEvent.click(screen.getByRole('button', { name: zh.pickerConfirm }))
    await waitFor(() => { expect(onConfirm).toHaveBeenCalledWith([initial]) })
  })

  it('keeps selections across tabs, search and pages, and replaces a selected node version', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const query = new URL(url, 'https://example.test').searchParams
      return Response.json({ total: 21, items: query.get('q') ? [file('same', 'v2')] : query.get('page') === '2' ? [file('page2')] : query.get('view') === 'shared' ? [file('shared')] : [file('same')] })
    })
    const onConfirm = vi.fn(async (_items: readonly LibraryChoice[]) => {})
    const onClose = vi.fn()
    render(<LibraryPicker open t={t} origin="" fetchImpl={fetchImpl} onClose={onClose} onConfirm={onConfirm} />)
    await screen.findByText('same.pdf'); select('same')
    fireEvent.click(screen.getByRole('tab', { name: zh.shared }))
    await screen.findByText('shared.pdf'); select('shared')
    fireEvent.click(screen.getByRole('button', { name: zh.nextPage }))
    await screen.findByText('page2.pdf'); select('page2')
    fireEvent.change(screen.getByRole('textbox', { name: zh.searchPlaceholder }), { target: { value: 'same' } })
    await screen.findByText('same.pdf'); select('same')
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh.pickerConfirm }))
    await waitFor(() => { expect(onClose).toHaveBeenCalledOnce() })
    expect(onConfirm.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'same', versionId: 'v2' }), expect.objectContaining({ nodeId: 'shared' }), expect.objectContaining({ nodeId: 'page2' })]))
    expect(onConfirm.mock.calls[0]?.[0]).toHaveLength(3)
  })

  it('navigates folders without selecting them and exposes one unready reason per row', async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json(url.includes('parentId=folder') ? { items: [file('nested')], breadcrumb: [{ id: 'folder', name: 'Folder' }] } : { items: [{ id: 'folder', name: 'Folder', kind: 'FOLDER' }, { ...file('pending'), currentVersion: { id: 'p', versionNo: 1, parseStatus: 'PROCESSING' } }, { ...file('failed'), currentVersion: { id: 'f', versionNo: 1, parseStatus: 'FAILED', parseReason: 'Extraction failed' } }, { id: 'link', name: 'Link', kind: 'LINK' }] }))
    render(<LibraryPicker open t={t} origin="" fetchImpl={fetchImpl} onClose={vi.fn()} onConfirm={vi.fn()} />)
    await screen.findByText('pending.pdf')
    expect(screen.queryByText('failed.pdf')).toBeNull()
    expect(screen.queryByText('Extraction failed')).toBeNull()
    expect(screen.getAllByText(zh.statusProcessing)).toHaveLength(1)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: `${zh.select} pending.pdf` }).disabled).toBe(true)
    expect(screen.queryByRole('checkbox', { name: `${zh.select} Folder` })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
    await screen.findByText('nested.pdf')
    fireEvent.click(screen.getByRole('button', { name: zh.root }))
    await screen.findByText('pending.pdf')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.pickerConfirm }).disabled).toBe(true)
  })

  it('does not commit on cancel, resets temporary choices on reopen, and aborts stale queries', async () => {
    let resolveOld: (value: Response) => void = () => {}
    let oldSignal: AbortSignal | undefined
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('q=old')) { oldSignal = init?.signal ?? undefined; return new Promise<Response>((resolve) => { resolveOld = resolve }) }
      return Response.json({ items: [file(url.includes('q=new') ? 'new' : 'initial')] })
    })
    const onConfirm = vi.fn(), onClose = vi.fn()
    const props = { t, origin: '', fetchImpl, onClose, onConfirm }
    const view = render(<LibraryPicker open {...props} />)
    await screen.findByText('initial.pdf'); select('initial')
    fireEvent.change(screen.getByRole('textbox', { name: zh.searchPlaceholder }), { target: { value: 'old' } })
    await waitFor(() => { expect(oldSignal).toBeTruthy() })
    fireEvent.change(screen.getByRole('textbox', { name: zh.searchPlaceholder }), { target: { value: 'new' } })
    await screen.findByText('new.pdf')
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => { resolveOld(Response.json({ items: [file('old')] })); await Promise.resolve() })
    expect(screen.queryByText('old.pdf')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.cancel }))
    expect(onConfirm).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledOnce()
    view.rerender(<LibraryPicker open={false} {...props} />)
    view.rerender(<LibraryPicker open {...props} />)
    await screen.findByText('initial.pdf')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.pickerConfirm }).disabled).toBe(true)
  })

  it('retries list failures, retains a failed confirmation and blocks dismissal while adding', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('no', { status: 500 })).mockResolvedValue(Response.json({ items: [file('ready')] }))
    let rejectCommit: (reason: Error) => void = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectCommit = reject }))
    const onClose = vi.fn()
    render(<LibraryPicker open t={t} origin="" fetchImpl={fetchImpl} onClose={onClose} onConfirm={onConfirm} />)
    await screen.findByText(zh.loadError)
    fireEvent.click(screen.getByRole('button', { name: zh.pickerRetry }))
    await screen.findByText('ready.pdf'); select('ready')
    fireEvent.click(screen.getByRole('button', { name: zh.pickerConfirm }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    expect(onClose).not.toHaveBeenCalled()
    rejectCommit(new Error('draft unavailable'))
    await screen.findByText(zh.pickerAttachFailed)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: `${zh.select} ready.pdf` }).checked).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.pickerConfirm }).disabled).toBe(false)
  })

  it('supports keyboard tabs and restores focus to the invoking control on dismissal', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger); trigger.focus()
    const onClose = vi.fn()
    const props = { t, origin: '', fetchImpl: vi.fn(async () => Response.json({ items: [] })), onClose, onConfirm: vi.fn() }
    const view = render(<LibraryPicker open {...props} />)
    await screen.findByText(zh.empty)
    const recent = screen.getByRole('tab', { name: zh.recent })
    recent.focus()
    fireEvent.keyDown(recent, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: zh.mine }))
    expect(screen.getByRole('tab', { name: zh.mine }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.rerender(<LibraryPicker open={false} {...props} />)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
