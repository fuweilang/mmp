// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { PropsLocale } from '@mammoth-ai/mmp-client-ui-slots'
import { updateCopy } from '../src/client/DesktopUpdateIndicator.tsx'
import type { DesktopUpdateBridge, DesktopUpdatePresentation } from '../src/types.ts'
import { DesktopUpdateSource } from '../src/client/desktop-update-source.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { vi.unstubAllGlobals() })

type SettingsTranslate = PropsLocale<'settings'>['t']

function translate(dictionary: typeof zh | typeof en): SettingsTranslate {
  const messages: Readonly<Record<string, string>> = dictionary
  return (key, params) => Object.entries(params ?? {})
    .reduce((message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
      messages[key] ?? key)
}

/** Settle the source's fire-and-forget action and status continuations. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function fixture() {
  let listener: ((state: DesktopUpdatePresentation) => void) | undefined
  const status = Promise.withResolvers<DesktopUpdatePresentation>()
  const unsubscribe = vi.fn()
  const open = vi.fn(async () => {})
  const bridge: DesktopUpdateBridge = {
    status: () => status.promise,
    open,
    subscribe: (next) => { listener = next; return unsubscribe },
  }
  const source = new DesktopUpdateSource(bridge)
  return { open, status, unsubscribe, source, emit: async (state: DesktopUpdatePresentation) => {
    listener?.(state)
    await flush()
  }, close: (): void => { source.dispose() } }
}

const available = { phase: 'available', version: '1.0.1' } as const

it('creates no update state and starts nothing outside the Desktop carrier', async () => {
  const source = new DesktopUpdateSource(undefined)
  source.open()
  source.command('check')
  await flush()
  expect(source.store.getSnapshot()).toEqual({ failed: false, opening: false })
  source.dispose()
})

it('keeps the newest event, coalesces the shell action, and keeps retries actionable', async () => {
  const f = fixture()
  try {
    await f.emit(available)
    f.status.resolve({ phase: 'idle' })
    await flush()
    expect(f.source.store.getSnapshot().presentation).toEqual(available)
    f.source.open()
    await flush()
    expect(f.open).toHaveBeenCalledOnce()
    expect(f.source.store.getSnapshot().opening).toBe(false)
    await f.emit({ phase: 'downloading', version: available.version, percent: 58 })
    expect(updateCopy(f.source.store.getSnapshot().presentation as DesktopUpdatePresentation, translate(zh)).label)
      .toBe('58%')
    f.source.open()
    await flush()
    expect(f.open).toHaveBeenCalledOnce()
    await f.emit({ phase: 'error', version: available.version, failure: 'download' })
    expect(updateCopy(f.source.store.getSnapshot().presentation as DesktopUpdatePresentation, translate(zh)).detail)
      .toBe('下载更新失败，请重试。')
  } finally { f.status.resolve(available); f.close() }
  expect(f.unsubscribe).toHaveBeenCalledOnce()
})

it('keeps bridge failures actionable and ignores status completion after unmount', async () => {
  const f = fixture()
  f.status.reject(new Error('IPC unavailable'))
  await flush()
  expect(f.source.store.getSnapshot().failed).toBe(true)
  f.open.mockRejectedValueOnce(new Error('IPC unavailable'))
  f.source.open()
  await flush()
  expect(f.source.store.getSnapshot().failed).toBe(true)
  expect(f.open).toHaveBeenCalledOnce()
  f.close()
  expect(f.unsubscribe).toHaveBeenCalledOnce()
  const late = fixture()
  late.close()
  late.status.resolve(available)
  await flush()
  expect(late.source.store.getSnapshot()).toEqual({ failed: false, opening: false })
  expect(late.unsubscribe).toHaveBeenCalledOnce()
})

it('accepts initial status, coalesces actions, and ignores late events and action rejection after disposal', async () => {
  const f = fixture()
  const pending = Promise.withResolvers<undefined>()
  try {
    f.status.resolve(available)
    await flush()
    expect(f.source.store.getSnapshot().presentation).toEqual(available)
    await f.emit({ phase: 'verifying', version: available.version })
    f.source.open()
    await flush()
    expect(f.open).not.toHaveBeenCalled()
    await f.emit(available)
    f.open.mockImplementationOnce(() => pending.promise)
    f.source.open()
    f.source.open()
    await flush()
    expect(f.open).toHaveBeenCalledOnce()
    const state = f.source.store.getSnapshot()
    f.close()
    f.source.open()
    await f.emit({ phase: 'error', version: available.version, failure: 'install' })
    pending.reject(new Error('late IPC failure'))
    await flush()
    expect(f.source.store.getSnapshot()).toBe(state)
  } finally { pending.resolve(undefined); f.status.resolve(available) }
})

it('keeps an event newer than an initial-status failure', async () => {
  const f = fixture()
  try {
    await f.emit(available)
    f.status.reject(new Error('stale initial request'))
    await flush()
    expect(f.source.store.getSnapshot().failed).toBe(false)
    expect(f.source.store.getSnapshot().presentation).toEqual(available)
  } finally { f.status.resolve(available); f.close() }
})

it('renders the same semantic update in the active Web locale', async () => {
  const f = fixture()
  try {
    await f.emit(available)
    const state = f.source.store.getSnapshot().presentation as DesktopUpdatePresentation
    expect(updateCopy(state, translate(zh)).label).toBe('新版本')
    expect(updateCopy(state, translate(en)).label).toBe('Update')
  } finally { f.close(); f.status.resolve(available) }
})

it('shows fallback progress and error details when the shell omits optional fields', async () => {
  const f = fixture()
  try {
    await f.emit({ phase: 'downloading' })
    const progress = updateCopy({ phase: 'downloading' }, translate(zh))
    expect(progress.label).toBe('0%')
    expect(progress.detail).toBe('0%')
    const versioned = updateCopy({ phase: 'downloading', version: '1.0.1' }, translate(zh))
    expect(versioned.label).toBe('0%')
    expect(versioned.detail).toContain('1.0.1')
    expect(updateCopy({ phase: 'error' }, translate(zh))).toEqual({
      label: '重试更新',
      detail: '安装更新失败，请稍后重试。',
    })
  } finally { f.close(); f.status.resolve({ phase: 'idle' }) }
})

it.each(['checking', 'verifying', 'installing'] as const)('shows only the version during %s in both locales', async (phase) => {
  const f = fixture()
  try {
    await f.emit({ phase, version: '0.1.7-alpha.2' })
    const state = f.source.store.getSnapshot().presentation as DesktopUpdatePresentation
    for (const dictionary of [zh, en]) expect(updateCopy(state, translate(dictionary)).detail).toBe('0.1.7-alpha.2')
  } finally { f.close(); f.status.resolve({ phase: 'idle' }) }
})

it.each([
  ['checking', '正在检查更新…'],
  ['verifying', '正在校验更新文件…'],
  ['installing', '正在准备重启…'],
] as const)('retains the state label when %s has no version', async (phase, label) => {
  const f = fixture()
  try {
    await f.emit({ phase })
    expect(updateCopy(f.source.store.getSnapshot().presentation as DesktopUpdatePresentation, translate(zh)))
      .toEqual({ label, detail: label })
  } finally { f.close(); f.status.resolve({ phase: 'idle' }) }
})

it('localizes fullscreen timeout guidance and preserves the retry action', async () => {
  const f = fixture()
  const copy: string[] = []
  try {
    await f.emit({ phase: 'error', failure: 'fullscreen-timeout', version: available.version })
    const state = f.source.store.getSnapshot().presentation as DesktopUpdatePresentation
    for (const dictionary of [zh, en]) copy.push(updateCopy(state, translate(dictionary)).detail)
    expect(copy).toMatchInlineSnapshot(`
      [
        "无法退出全屏，请退出全屏后重试更新",
        "Could not exit fullscreen. Exit fullscreen, then retry the update.",
      ]
    `)
    f.source.open()
    await flush()
    expect(f.open).toHaveBeenCalledOnce()
  } finally { f.close(); f.status.resolve(available) }
})

it('coalesces explicit commands without using the legacy open/download action', async () => {
  const pending = Promise.withResolvers<DesktopUpdatePresentation>()
  const open = vi.fn(async () => {})
  const command = vi.fn(() => pending.promise)
  const source = new DesktopUpdateSource({ status: async () => ({ phase: 'idle', supported: true, currentVersion: '0.3.2' }),
    open, command, subscribe: () => () => {} })
  source.command('check')
  source.command('check')
  expect(source.store.getSnapshot().managed).toBe(true)
  expect(command).toHaveBeenCalledExactlyOnceWith('check')
  expect(open).not.toHaveBeenCalled()
  pending.resolve({ phase: 'available', version: '0.3.3', currentVersion: '0.3.2', supported: true })
  await pending.promise
  await Promise.resolve()
  expect(source.store.getSnapshot().presentation?.version).toBe('0.3.3')
  source.dispose()
})
