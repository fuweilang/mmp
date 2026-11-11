// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SlotTestRuntime, stubConfigForm, usePinnedBrowserLanguages } from '@mammoth-ai/mmp-client-test-runtime'
import { LocaleRuntime } from '@mammoth-ai/mmp-client-locale/client'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import { apply as conversation, inject as conversationInject } from '@mammoth-ai/mmp-client-ui-conversation/client'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import type { WorkspaceId } from '@mammoth-ai/mmp-workspace/types'
import { apply as gallery, inject as galleryInject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')
const originalParent = window.parent
const originalUrl = window.location.href
let active: SlotTestRuntime | undefined
afterEach(async () => {
  await active?.dispose()
  active = undefined
  cleanup()
  Object.defineProperty(window, 'parent', { configurable: true, value: originalParent })
  window.history.replaceState(null, '', originalUrl)
})

async function runtime(navigationReady = true) {
  window.history.replaceState(null, '', '?expertPreview=preview-one&expertId=expert-one')
  const parent = { postMessage: vi.fn() }
  Object.defineProperty(window, 'parent', { configurable: true, value: parent })
  const r = await SlotTestRuntime.create()
  active = r
  const locale = new LocaleRuntime(r.ctx)
  r.ctx.provide('locale', locale)
  r.slots.installLocale(locale)
  r.ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  r.ctx.provide('layout', { selectPanel: vi.fn() } as never)
  const sessionId = SessionId('preview-task')
  const prompt = vi.fn(async (_content: unknown) => ({ ok: true as const, value: { accepted: true as const } }))
  r.ctx.provide('uiWorkspace', {
    workspaceForNewSession: () => navigationReady ? 'ws-1' : undefined,
    openSession: (id: SessionId) => { r.sessions.retain(id, { source: 'mainView' }) },
  } as never)
  if (!navigationReady) await r.workspaces.update(snapshot => {
    snapshot.phase = 'ready'; snapshot.state = 'idle'
    snapshot.items = [{ workspaceId: 'ws-1' as WorkspaceId, path: '/tmp', title: 'Preview', sessionIds: [], createdAt: '', updatedAt: '' }]
  })
  const createPreview = vi.fn(async () => {
    await r.sessions.add({ id: sessionId, summary: { title: '预览', displayTitle: '预览', cwd: '/tmp' }, session: { prompt } })
    return { ok: true, value: sessionId }
  })
  r.remote.provideNamespaces({ officialAgentGallery: { createPreview } })
  await r.mount({ inject: [...conversationInject], apply: conversation })
  await r.declare({ main: { kind: 'keyed', scope: 'root' } })
  const feature = await r.mount({ inject: [...galleryInject], apply: gallery })
  const view = r.renderSlot('main', {}, { entryKey: 'official-expert-preview' })
  await waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith({ type: 'mmp.expert-preview.ready', agentId: 'expert-one', previewId: 'preview-one' }, window.location.origin))
  const send = (requestId: string, text: string) => {
    act(() => { window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: parent as never,
      data: { type: 'mmp.expert-preview.submit', agentId: 'expert-one', previewId: 'preview-one', requestId, text } })) })
  }
  return { r, feature, view, parent, sessionId, prompt, createPreview, send }
}

it('hands exact first-question text through the retained standard composer after removing launch queries', async () => {
  const s = await runtime()
  expect(window.location.search).toBe('')
  const text = '  预览首问：\n请保留中文与换行。  '
  const binding = s.r.sessions.binding(s.sessionId)!
  const initialize = vi.spyOn(s.r.ctx.conversation.input, 'requestDraftInitialization')
  const submit = vi.spyOn(s.r.ctx.conversation.input.for(binding.ctx), 'submit')
  s.send('first-question', text)
  s.send('first-question', text)
  expect(initialize).toHaveBeenCalledExactlyOnceWith(binding, { prompt: text, whenDraftExists: 'keep' })
  expect(submit).toHaveBeenCalledExactlyOnceWith('queue', 'click')
  await waitFor(() => expect(s.prompt).toHaveBeenCalledTimes(1))
  expect(s.prompt.mock.calls[0]?.[0]).toEqual([{ type: 'text', text: text.trim() }])
  expect(s.parent.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.accepted', agentId: 'expert-one', previewId: 'preview-one', requestId: 'first-question' }, window.location.origin)
  fireEvent.click(s.view.view.getByRole('button'))
  await s.r.flush()
  expect(s.createPreview).toHaveBeenCalledTimes(1)
})

it('starts preview from the workspace feed while ordinary session navigation is still loading', async () => {
  const s = await runtime(false)
  expect(s.createPreview).toHaveBeenCalledExactlyOnceWith({ agentId: 'expert-one', previewId: 'preview-one', workspaceId: 'ws-1' })
  s.send('loading-session-list', '会话列表未就绪时仍可试聊')
  await waitFor(() => expect(s.prompt).toHaveBeenCalledTimes(1))
  expect(s.prompt.mock.calls[0]?.[0]).toEqual([{ type: 'text', text: '会话列表未就绪时仍可试聊' }])
})

it('preserves an existing real input draft and releases the handoff with its plugin', async () => {
  const s = await runtime()
  const binding = s.r.sessions.binding(s.sessionId)!
  const input = s.r.ctx.conversation.input.for(binding.ctx)
  input.setDraft('会话中已有的未发送内容')
  s.send('keep-existing', '管理页首问')
  expect(input.state.getSnapshot().draft).toBe('会话中已有的未发送内容')
  expect(s.prompt).not.toHaveBeenCalled()
  expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'mmp.expert-preview.error', requestId: 'keep-existing' }), window.location.origin)
  await s.feature.dispose()
  s.parent.postMessage.mockClear()
  s.send('after-dispose', '卸载后不应发送')
  expect(s.parent.postMessage).not.toHaveBeenCalled()
  expect(s.prompt).not.toHaveBeenCalled()
})
