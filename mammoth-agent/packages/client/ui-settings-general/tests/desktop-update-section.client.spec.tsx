// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps, PropsLocale } from '@mammoth-ai/mmp-client-ui-slots'
import type { DesktopUpdateView } from '../src/types.ts'
import { DesktopUpdateContent, DesktopUpdateSection } from '../src/client/DesktopUpdateSection.tsx'
import { zh } from '../src/client/locales.ts'

const t: PropsLocale<'settings'>['t'] = (key, params) => Object.entries(params ?? {})
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), (zh as Readonly<Record<string, string>>)[key] ?? key)
afterEach(cleanup)
function fixture(view: DesktopUpdateView) {
  const runUpdate = vi.fn()
  const close = vi.fn()
  const content = render(<DesktopUpdateContent view={view} t={t} runUpdate={runUpdate} close={close} />)
  return { ...content, runUpdate, close }
}
const installed = { currentVersion: '0.3.2', supported: true } as const

it('does not create a version section in ordinary Web or start an action on mount', () => {
  const runUpdate = vi.fn()
  const view = render(<DesktopUpdateSection {...({} as GlobalStandardProps)} t={t} close={() => {}} runUpdate={runUpdate}
    useDesktopUpdate={selector => selector({ failed: false, opening: false })} />)
  expect(view.container.innerHTML).toBe('')
  expect(runUpdate).not.toHaveBeenCalled()
})

it('reads actual installed version and never claims latest before a successful check', () => {
  const f = fixture({ managed: true, failed: false, opening: false, presentation: { ...installed, phase: 'idle' } })
  expect(screen.getByText('0.3.2')).toBeTruthy()
  expect(screen.getByText('尚未检查更新')).toBeTruthy()
  expect(screen.queryByText('当前已是最新版本')).toBeNull()
  expect(f.runUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
  expect(f.runUpdate).toHaveBeenCalledExactlyOnceWith('check')
})

it('displays unsupported builds truthfully with no false latest or download control', () => {
  fixture({ managed: true, failed: false, opening: false, presentation: { ...installed, phase: 'idle', supported: false } })
  expect(screen.getByRole('status').textContent).toContain('当前构建不支持应用内更新')
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByText('当前已是最新版本')).toBeNull()
})

it('renders release notes as text and keeps download separate from installation', () => {
  const f = fixture({ managed: true, failed: false, opening: false, presentation: {
    ...installed, phase: 'available', version: '0.3.3', releaseNotes: '<img src=x onerror=alert(1) />',
  } })
  expect(f.container.querySelector('img')).toBeNull()
  expect(screen.getByText('<img src=x onerror=alert(1) />')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '安装并重启' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '下载更新' }))
  expect(f.runUpdate).toHaveBeenCalledExactlyOnceWith('download')
})

it('shows progress and requires an explicit install gesture, with a harmless later action', () => {
  const f = fixture({ managed: true, failed: false, opening: false, presentation: { ...installed, phase: 'downloading', percent: 58 } })
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('58')
  expect((screen.getByRole('button', { name: '检查更新' }) as HTMLButtonElement).disabled).toBe(true)
  f.rerender(<DesktopUpdateContent view={{ managed: true, failed: false, opening: false,
    presentation: { ...installed, phase: 'ready', version: '0.3.3' } }} runUpdate={f.runUpdate} close={f.close} t={t} />)
  expect(f.runUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '稍后安装' }))
  expect(f.close).toHaveBeenCalledOnce()
  expect(f.runUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '安装并重启' }))
  expect(f.runUpdate).toHaveBeenCalledExactlyOnceWith('install')
})

it('shows blocked installation failures and exposes retry without claiming completion', () => {
  const f = fixture({ managed: true, failed: false, opening: false, presentation: {
    ...installed, phase: 'error', version: '0.3.3', failure: 'tasks-unavailable',
  } })
  expect(screen.getByRole('alert').textContent).toContain('无法确认任务状态')
  fireEvent.click(screen.getByRole('button', { name: '安装并重启' }))
  expect(f.runUpdate).toHaveBeenCalledExactlyOnceWith('install')
  expect(screen.queryByText('当前已是最新版本')).toBeNull()
})
