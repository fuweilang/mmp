// @vitest-environment jsdom
/** Standalone content renders without file-resource, Session, or tab seats. */
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { en as common } from '../src/client/locales.ts'
import { bytesPreviewProps as props } from './bytes-fixtures.client.ts'
import type { PdfDocument } from '../src/client/pdf/document.ts'
import type { openPdf } from '../src/client/pdf/runtime.ts'
import { BytesPreview } from '../src/client/bytes/BytesPreview.tsx'

const engine = vi.hoisted(() => ({ open: vi.fn<typeof openPdf>(), parse: vi.fn() }))
vi.mock('../src/client/pdf/runtime.ts', () => ({ openPdf: engine.open }))
vi.mock('../src/client/pdf/document.ts', () => ({ renderPdfPage: vi.fn() }))
vi.mock('../src/client/pdf/text.ts', () => ({ pdfTextRenderer: vi.fn() }))
vi.mock('../src/client/excel/parse.ts', () => ({ parseExcel: engine.parse }))
vi.mock('@fortune-sheet/react', () => ({ Workbook: ({ data }: { data: { name: string; celldata: { v: { m: string } }[] }[] }) => <div role="table">{data.map(sheet => <section key={sheet.name}><h2>{sheet.name}</h2>{sheet.celldata.map((cell, i) => <span key={i}>{cell.v.m}</span>)}</section>)}</div> }))

beforeEach(() => {
  engine.open.mockReset()
  engine.parse.mockReset()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('renders Markdown headings, lists, emphasis and table cells from complete bytes', async () => {
  const view = render(<BytesPreview {...props('notes.md', '# Release\n\n- **Ready**\n\n| Name | Status |\n| --- | --- |\n| Preview | Done |')} />)
  expect(await screen.findByRole('heading', { name: 'Release' })).toBeDefined()
  expect(view.container.querySelector('li strong')?.textContent).toBe('Ready')
  expect(await screen.findByRole('cell', { name: 'Done' })).toBeDefined()
})

it('retains plain-text newlines and refuses unknown binary or undecodable text', async () => {
  const view = render(<BytesPreview {...props('notes.txt', 'First\nSecond')} />)
  expect(view.container.querySelector('pre')?.textContent).toBe('First\nSecond')
  view.rerender(<BytesPreview {...props('archive.zip', 'PK private binary')} />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', common.unsupportedFile)
  expect(view.container.textContent).not.toContain('PK private binary')
  view.rerender(<BytesPreview {...props('bad.txt', '')} bytes={new Uint8Array([255, 0])} />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', common.unsupportedFile)
})

it('opens converted Office bytes as PDF and retires the old PDF load on replacement and unmount', async () => {
  const loads: { pending: ReturnType<typeof Promise.withResolvers<PdfDocument>>; dispose: ReturnType<typeof vi.fn>; signal: AbortSignal }[] = []
  engine.open.mockImplementation((_data, signal) => {
    const pending = Promise.withResolvers<PdfDocument>()
    const dispose = vi.fn(async () => {})
    loads.push({ pending, dispose, signal })
    return { document: pending.promise, dispose }
  })
  const first = props('slides.pptx', '%PDF-1', 'application/pdf')
  const view = render(<BytesPreview {...first} missingFonts={['Example Font']} />)
  await waitFor(() => { expect(loads).toHaveLength(1) })
  expect(engine.open.mock.calls[0]?.[0]).toBe(first.bytes)
  expect(screen.queryByRole('note')).toBeNull()
  expect(screen.queryByText('Example Font')).toBeNull()
  view.rerender(<BytesPreview {...props('second.pdf', '%PDF-2', 'application/pdf')} />)
  await waitFor(() => { expect(loads).toHaveLength(2) })
  expect(loads[0]!.signal.aborted).toBe(true)
  expect(loads[0]!.dispose).toHaveBeenCalledOnce()
  await act(async () => { loads[0]!.pending.resolve({ numPages: 0 } as PdfDocument) })
  expect(view.container.querySelector('[data-pdf-preview]')).toBeNull()
  await act(async () => { loads[1]!.pending.resolve({ numPages: 0 } as PdfDocument) })
  expect(view.container.querySelector('[data-pdf-preview]')).not.toBeNull()
  view.unmount()
  expect(loads[1]!.signal.aborted).toBe(true)
  expect(loads[1]!.dispose).toHaveBeenCalledOnce()
})

it.each(['xlsx', 'xls', 'csv', 'tsv'])('routes .%s bytes through the workbook parser and shows sheet data', async (format) => {
  engine.parse.mockResolvedValue({ sheets: [{ name: 'Budget', celldata: [{ v: { m: '$42.00' } }] }], missingResults: 0, unsupportedFeatures: [] })
  const input = props(`budget.${format}`, 'workbook')
  const view = render(<BytesPreview {...input} />)
  expect(await screen.findByRole('heading', { name: 'Budget' })).toBeDefined()
  expect(screen.getByText('$42.00')).toBeDefined()
  expect(engine.parse.mock.calls[0]?.slice(0, 3)).toEqual([input.bytes, format, input.limits])
  const signal = engine.parse.mock.calls[0]![3] as AbortSignal
  view.unmount()
  expect(signal.aborted).toBe(true)
})

it('revokes image and media URLs on replacement/unmount and reports playback failure', async () => {
  const create = vi.fn().mockReturnValueOnce('blob:image').mockReturnValueOnce('blob:audio')
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static override createObjectURL = create; static override revokeObjectURL = revoke })
  const view = render(<BytesPreview {...props('photo.png', 'png', 'image/png')} />)
  const imageElement = await screen.findByRole('img', { name: 'photo.png' })
  expect(imageElement.getAttribute('src')).toBe('blob:image')
  view.rerender(<BytesPreview {...props('sound.mp3', 'audio', 'audio/mpeg')} />)
  await waitFor(() => { expect(view.container.querySelector('audio')?.getAttribute('src')).toBe('blob:audio') })
  expect(revoke).toHaveBeenCalledWith('blob:image')
  fireEvent.error(view.container.querySelector('audio')!)
  expect(await screen.findByRole('alert')).toBeDefined()
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:audio')
})

it('keeps PDF loading usable after a StrictMode effect restart', async () => {
  engine.open.mockImplementation(() => ({ document: Promise.resolve({ numPages: 0 } as PdfDocument), dispose: vi.fn(async () => {}) }))
  const view = render(<StrictMode><BytesPreview {...props('report.pdf', '%PDF-', 'application/pdf')} /></StrictMode>)
  await waitFor(() => { expect(view.container.querySelector('[data-pdf-preview]')).not.toBeNull() })
})

it('keeps image pinch zoom usable after a StrictMode effect restart', async () => {
  vi.stubGlobal('URL', class extends URL { static override createObjectURL = vi.fn(() => 'blob:strict-image'); static override revokeObjectURL = vi.fn() })
  render(<StrictMode><BytesPreview {...props('photo.png', 'image', 'image/png')} /></StrictMode>)
  const image = await screen.findByRole('img', { name: 'photo.png' })
  const frame = image.closest('[data-document-zoom-frame]')!
  fireEvent.wheel(frame.firstElementChild!, { ctrlKey: true, deltaY: -10 })
  expect(frame.getAttribute('data-document-zoom-mode')).toBe('fixed')
})

it('previews static HTML layout without active scripts or external resource access', async () => {
  render(<BytesPreview {...props('page.html', '<h1 style="color:red">原始网页</h1><script>window.ACTIVE=true</script><img src="https://example.test/private">', 'text/html')} />)
  const frame = screen.getByTitle('page.html') as HTMLIFrameElement
  const parsed = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
  expect(parsed.querySelector('h1')?.textContent).toBe('原始网页')
  expect(parsed.querySelector('h1')?.style.color).toBe('red')
  expect(parsed.querySelector('script')).toBeNull()
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("connect-src 'none'")
})
