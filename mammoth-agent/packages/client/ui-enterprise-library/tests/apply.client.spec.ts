import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply as nodeApply } from '../src/index.ts'
import { apply } from '../src/client/index.ts'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.MMP_GROUND_ORIGIN })

function harness() {
  const registered: { name: string; inject?: () => unknown; label?: () => string }[] = []
  const command = { register: vi.fn(() => () => {}) }
  const triggers = { registerSource: vi.fn(() => () => {}) }
  const ctx = {
    locale: { register: vi.fn(() => () => {}), bind: () => (key: string) => key },
    slots: {
      inject: (_name: string, install: () => { inject?: () => unknown; label?: () => string }) => {
        const options = install()
        options.inject?.()
        options.label?.()
        return () => {}
      },
      register: (options: { name: string; inject?: () => { onUse?: (item: { nodeId: string; versionId: string; versionNo: number; name: string; kind: 'FILE'; parseStatus: string; parseReason: null }) => void }; label?: () => string }) => {
        registered.push(options)
        options.label?.()
        options.inject?.().onUse?.({
          nodeId: 'n', versionId: 'v', versionNo: 1, name: 'a', kind: 'FILE', parseStatus: 'READY', parseReason: null,
        })
        return () => {}
      },
    },
    effect: (fn: () => unknown) => fn(),
    inject: (_names: string[], fn: (scope: unknown) => void) => fn({
      get: () => command,
      effect: (run: () => unknown) => run(),
    }),
    get: (name: string) => name === 'inputTriggers' ? triggers : undefined,
  }
  return { ctx, command, triggers, registered }
}

describe('library registration', () => {
  it('registers nothing but an empty host apply', () => {
    expect(nodeApply()).toBeUndefined()
  })

  it('registers pickers and serializes only a real excerpt', async () => {
    process.env.MMP_GROUND_ORIGIN = 'http://ground.test/'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/open')) {
        const body = JSON.parse(String(init?.body)) as { versionId: string }
        if (body.versionId === 'empty') return Response.json({ name: '空.md', versionId: 'empty', locator: null, quote: null })
        return Response.json({ name: '制度.md', versionId: body.versionId, locator: 'paragraph:1', quote: '正文' })
      }
      if (String(url).includes('view=shared')) {
        return Response.json({ items: [{ id: 'n2', name: '包.zip', kind: 'FILE', currentVersion: { id: 'vz', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: null } }] })
      }
      if (String(url).includes('q=')) return Response.json({ items: [] })
      return Response.json({ items: [
        { id: 'n1', name: '制度.md', kind: 'FILE', currentVersion: { id: 'ver-1', versionNo: 2, parseStatus: 'READY', parseReason: null } },
        { id: 'folder', name: '目录', kind: 'FOLDER' },
      ] })
    }))
    const { ctx, command, triggers } = harness()
    apply(ctx as never)
    const contribution = command.register.mock.calls[0]?.[0] as {
      label: () => string
      description: () => string
      available: () => boolean
      ui: {
        searchLabels: () => { placeholder: string }
        options: (session: unknown, signal: AbortSignal) => Promise<{ id: string; badge?: string }[]>
        onSelect: (option: { id: string; label: string; badge?: string; detail?: string }, session: { sessionId: string }) => void
      }
    }
    expect(contribution.label()).toBe('command')
    expect(contribution.description()).toBe('commandDescription')
    expect(contribution.available()).toBe(true)
    expect(contribution.ui.searchLabels().placeholder).toBe('searchPlaceholder')
    const options = await contribution.ui.options({}, new AbortController().signal)
    expect(options.some(option => option.badge)).toBe(true)
    contribution.ui.onSelect({ id: 'not-a-ref', label: '跳过' }, { sessionId: 's1' })
    contribution.ui.onSelect({ id: 'n1@ver-1', label: '制度.md' }, { sessionId: 's1' })
    contribution.ui.onSelect({ id: 'n2@vz', label: '包.zip', badge: 'unready', detail: '仅下载' }, { sessionId: 's1' })
    const source = triggers.registerSource.mock.calls[0]?.[0] as {
      candidates: (session: unknown, req: { query: string; signal: AbortSignal }) => Promise<unknown[]>
      onPick: (pick: { action: string; candidate: { name: string; label?: string; value?: unknown } }) => unknown
      codec: { clipboardText: (ref: string) => string; serialize: (ref: string, signal: AbortSignal) => Promise<string> }
    }
    expect(await source.candidates({}, { query: '', signal: new AbortController().signal })).toHaveLength(1)
    expect(await source.candidates({}, { query: '制度', signal: new AbortController().signal })).toEqual([])
    expect(source.onPick({ action: 'drill', candidate: { name: 'n1@ver-1' } })).toBeUndefined()
    expect(source.onPick({ action: 'pick', candidate: { name: 'n1@ver-1', label: '制度.md', value: 'n1' } })).toMatchObject({ insert: { source: 'library' } })
    expect(source.onPick({ action: 'pick', candidate: { name: 'plain', value: 1 } })).toMatchObject({ insert: { ref: 'plain@plain' } })
    expect(source.codec.clipboardText('n1@ver-1')).toBe('ver-1')
    expect(source.codec.clipboardText('plain')).toBe('plain')
    await expect(source.codec.serialize('plain', new AbortController().signal)).rejects.toThrow(/not a real version/)
    await expect(source.codec.serialize('n1@empty', new AbortController().signal)).rejects.toThrow(/no stored excerpt/)
    await expect(source.codec.serialize('n1@ver-1', new AbortController().signal)).resolves.toContain('正文')
  })

  it('attaches panel choices to the current session, or creates one, and never sends', async () => {
    const appended: string[] = []
    const panels: unknown[] = []
    const input = { appendReference: (ref: { ref: string }) => { appended.push(ref.ref); return true } }
    const binding = { ctx: {} }
    const ready = {
      get: (name: string) => {
        if (name === 'inputTriggers') return { registerSource: () => () => {} }
        if (name === 'uiSession') return { adapter: { current: { value: { props: { sessionId: 'live' } } } } }
        if (name === 'sessions') return { binding: (id: string) => id === 'live' ? binding : undefined }
        if (name === 'conversation') return { input: { for: () => input } }
        if (name === 'layout') return { selectPanel: (id: unknown) => { panels.push(id) } }
        return undefined
      },
    }
    const current = harness()
    current.ctx.get = ready.get
    apply(current.ctx as never)
    await vi.waitFor(() => { expect(appended).toEqual(['n@v']) })
    expect(panels).toEqual([null])

    appended.length = 0
    panels.length = 0
    const created = harness()
    created.ctx.get = (name: string) => {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'uiSession') return { adapter: { current: { value: { props: { sessionId: '' } } } } }
      if (name === 'sessions') return {
        binding: () => undefined,
        create: async () => 'created',
      }
      if (name === 'layout') return { selectPanel: (id: unknown) => { panels.push(id) } }
      return undefined
    }
    apply(created.ctx as never)
    await vi.waitFor(() => { expect(panels).toEqual([null]) })
    expect(appended).toEqual([])

    const failed = harness()
    failed.ctx.get = (name: string) => {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'sessions') return { create: async () => { throw new Error('no workspace') } }
      return undefined
    }
    apply(failed.ctx as never)
    await Promise.resolve()
    expect(appended).toEqual([])
  })

  it('skips the mention source when the trigger service is absent', () => {
    const { ctx } = harness()
    ctx.get = () => undefined
    apply(ctx as never)
  })
})
