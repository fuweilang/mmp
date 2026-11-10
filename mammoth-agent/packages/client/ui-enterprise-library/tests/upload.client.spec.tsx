// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LibraryUploadDialog } from '../src/client/LibraryUploadDialog.tsx'
import { zh, type LibraryKey } from '../src/client/locales.ts'
afterEach(cleanup)
const t = (key: LibraryKey) => zh[key]
const limits = async () => ({ maxFileBytes: 100, allowedExtensions: ['.md'] })
it('real Modal drop/multiselect serial queue, partial permission failure and retry without replaying successes', async () => {
  const calls: string[] = []; let active = 0, max = 0; let failed = false
  const uploadFile = vi.fn(async (file: File) => { calls.push(file.name); active++; max = Math.max(max, active); await Promise.resolve(); active--; if (file.name === 'b.md' && !failed) { failed = true; throw new Error('403 没有上传权限') } })
  const saved = vi.fn(), closed = vi.fn()
  render(<LibraryUploadDialog t={t} accept=".md" single={false} loadLimits={limits} uploadFile={uploadFile} onSaved={saved} onClose={closed} />)
  const drop = screen.getByText(zh.uploadDrop).parentElement!
  expect(fireEvent.drop(drop, { dataTransfer: { files: [new File(['a'], 'a.md'), new File(['b'], 'b.md')], items: [] } })).toBe(false)
  fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['c'], 'c.md')] } })
  expect(uploadFile).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: zh.uploadStart })); fireEvent.click(screen.getByRole('button', { name: zh.uploadStart }))
  await screen.findByText('403 没有上传权限', { exact: false })
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(calls).toEqual(['a.md', 'b.md', 'c.md']); expect(max).toBe(1)
  expect(screen.queryByText(zh.uploadSuccess)).toBeNull()
  expect(screen.getByText('b.md')).toBeTruthy()
  expect(closed).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: zh.uploadRetry }))
  await waitFor(() => expect(closed).toHaveBeenCalledOnce())
  expect(calls).toEqual(['a.md', 'b.md', 'c.md', 'b.md'])
})
it('keeps the real in-flight request active on Escape/close and blocks invalid types without transport', async () => {
  let release: () => void = () => {}; const closed = vi.fn()
  const uploadFile = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
  render(<LibraryUploadDialog t={t} accept=".md" single={false} loadLimits={limits} uploadFile={uploadFile} onSaved={vi.fn()} onClose={closed} />)
  fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['a'], 'good.md'), new File(['a'], 'bad.exe')] } })
  fireEvent.click(screen.getByRole('button', { name: zh.uploadStart }))
  await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce())
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(closed).not.toHaveBeenCalled()
  for (const button of within(screen.getByRole('dialog')).getAllByRole('button', { name: zh.close })) expect((button as HTMLButtonElement).disabled).toBe(true)
  release(); await screen.findByText(zh.uploadFailure)
  expect(uploadFile).toHaveBeenCalledOnce()
})

it('unmount stops unsent files and suppresses stale callbacks without pretending to cancel the first request', async () => {
  let release: () => void = () => {}; const saved = vi.fn()
  const uploadFile = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
  const view = render(<LibraryUploadDialog t={t} accept=".md" single={false} loadLimits={limits} uploadFile={uploadFile} onSaved={saved} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['a'], 'first.md'), new File(['b'], 'unsent.md')] } })
  fireEvent.click(screen.getByRole('button', { name: zh.uploadStart }))
  await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce())
  view.unmount(); release(); await new Promise(resolve => setTimeout(resolve, 10))
  expect(uploadFile).toHaveBeenCalledOnce(); expect(saved).not.toHaveBeenCalled()
})

it('removes a queued file before upload', () => {
  render(<LibraryUploadDialog t={t} accept=".md" single={false} loadLimits={limits} uploadFile={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText(zh.uploadChoose, { selector: 'input' }), { target: { files: [new File(['a'], 'keep.md'), new File(['b'], 'drop.md')] } })
  fireEvent.click(screen.getByRole('button', { name: `${zh.uploadRemove} · drop.md` }))
  expect(screen.queryByText('drop.md')).toBeNull()
  expect(screen.getByText('keep.md')).toBeTruthy()
  expect(screen.queryByText(zh.uploadQueued)).toBeNull()
})
