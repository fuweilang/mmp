// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { ExpertPreviewEntry } from '../src/client/ExpertPreviewEntry.tsx'
const t = (key: string) => key

afterEach(() => { cleanup(); vi.useRealTimers() })

it('retries workspace hydration automatically and stops after a successful launch', async () => {
  vi.useFakeTimers()
  const launch = vi.fn().mockResolvedValueOnce('workspaceRequired').mockResolvedValue(undefined)
  render(<ExpertPreviewEntry target={{ agentId: 'expert', previewId: 'preview' }} launch={launch} t={t as never} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
  expect(launch).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
  expect(launch).toHaveBeenCalledTimes(2)
})

it('bounds missing-workspace retries and releases a pending retry on unmount', async () => {
  vi.useFakeTimers()
  const launch = vi.fn(async () => 'workspaceRequired')
  const view = render(<ExpertPreviewEntry target={{ agentId: 'expert', previewId: 'preview' }} launch={launch} t={t as never} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
  expect(launch).toHaveBeenCalledTimes(41)
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
  launch.mockClear()
  const retrying = render(<ExpertPreviewEntry target={{ agentId: 'expert', previewId: 'preview' }} launch={launch} t={t as never} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  retrying.unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
  expect(launch).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps terminal preview failures available for manual retry without automatic creates', async () => {
  const launch = vi.fn(async () => 'previewUnavailable')
  const view = render(<ExpertPreviewEntry target={{ agentId: 'expert', previewId: 'preview' }} launch={launch} t={t as never} />)
  await waitFor(() => expect(view.getByRole('alert').textContent).toBe('previewUnavailable'))
  expect(launch).toHaveBeenCalledTimes(1)
})
