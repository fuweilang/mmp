// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryIcon } from '../src/client/LibraryIcon.tsx'
import { LibraryPanel } from '../src/client/LibraryPanel.tsx'
import { zh, type LibraryKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = (key: LibraryKey) => zh[key]

describe('library icon', () => {
  it('draws the sidebar glyph', () => {
    const view = render(<LibraryIcon size={16} active={false} />)
    expect(view.container.querySelector('svg')).toBeTruthy()
  })
})

describe('library panel', () => {
  it('shows a load error without clearing rows that already arrived', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('view=shared')) return new Response('no', { status: 500 })
      return Response.json({ items: [
        { id: 'n1', name: '制度.md', kind: 'FILE', currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY', parseReason: null } },
        { id: 'z', name: '包.zip', kind: 'FILE', currentVersion: { id: 'vz', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: '仅下载' } },
      ] })
    })
    const onUse = vi.fn()
    const view = render(<LibraryPanel t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={onUse} />)
    await waitFor(() => expect(screen.getByText('制度.md')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: zh.shared }))
    await waitFor(() => expect(screen.getByText(zh.loadError)).toBeTruthy())
    expect(screen.getByText('制度.md')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(zh.searchPlaceholder), { target: { value: '没有' } })
    fireEvent.click(screen.getByRole('button', { name: zh.useForChat }))
    expect(onUse).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('shows an empty library and a search miss', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [] }))
    render(<LibraryPanel t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(zh.empty)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(zh.searchPlaceholder), { target: { value: '没有' } })
    await waitFor(() => expect(screen.getByText(zh.noResults)).toBeTruthy())
  })

  it('ignores a response that arrives after the view is gone', async () => {
    let release: (value: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    const view = render(<LibraryPanel t={t as never} origin="http://ground.test" fetchImpl={fetchImpl} onUse={vi.fn()} />)
    view.unmount()
    release(Response.json({ items: [] }))
    await Promise.resolve()
  })
})

