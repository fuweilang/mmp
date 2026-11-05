// @vitest-environment jsdom
/** Read-only history, local-file notices and refresh after network recovery. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CloudHistoryDialog } from '../src/client/CloudHistoryDialog.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('views synced history as text without loading attachments or offering execution, then recovers after a failed read', async () => {
  const conversation = { id: 'a', title: 'Cross-device result', projectName: 'Project A', deviceName: 'Mac A', deviceId: 'desktop-a',
    clientKind: 'desktop', sourceCreatedAt: new Date().toISOString(), sourceUpdatedAt: new Date().toISOString(),
    state: 'completed', syncing: false, lastSyncedAt: new Date().toISOString(), deviceSeenAt: new Date().toISOString(),
    files: [{ name: 'report.docx', access: 'source-device-only' }] }
  let offline = true
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    if (path.endsWith('/status')) return Response.json({ deviceId: 'web-b', syncing: false, lastError: null, lastSuccessAt: null })
    if (offline) return new Response(null, { status: 503 })
    if (path.includes('/list')) return Response.json({ items: [conversation], nextCursor: null })
    return Response.json({ conversation, nextAfter: null, messages: [{ sourceSeq: 1, role: 'assistant', text: '![private](file:///secret.png)\nTask result', sourceTime: new Date().toISOString() }] })
  })
  render(<CloudHistoryDialog t={key => en[key]} close={vi.fn()} />)
  await screen.findByRole('alert')
  offline = false
  await waitFor(() => expect(screen.getByRole('button', { name: en.historyRefresh }).hasAttribute('disabled')).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: en.historyRefresh }))
  fireEvent.click(await screen.findByRole('button', { name: /Cross-device result/ }))
  await screen.findByText(en.historyRemoteFiles)
  expect(screen.getByText('report.docx')).toBeTruthy()
  expect(screen.getByText(/Task result/).tagName).toBe('PRE')
  expect(document.querySelectorAll('img, textarea, a[href^="file:"]').length).toBe(0)
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('secret.png'))).toBe(false)
  expect(screen.queryByRole('button', { name: /execute|continue|download/i })).toBeNull()
})
