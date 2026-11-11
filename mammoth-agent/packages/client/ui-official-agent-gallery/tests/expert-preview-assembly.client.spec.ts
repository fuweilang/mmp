// @vitest-environment jsdom
import '../../ui-conversation/tests/control-row-dom.ts'
import { afterEach, expect, vi } from 'vitest'
import { act, fireEvent, waitFor } from '@testing-library/react'
import { ok } from '@mammoth-ai/mmp-remote-mock'
import { createClientTest, webApp } from '@mammoth-ai/mmp-client-test-runtime/src/assembly/index.ts'
import { SESSION_FORMAT_VERSION, SessionId } from '@mammoth-ai/mmp-session/types'
import type { WorkspaceId } from '@mammoth-ai/mmp-workspace/types'
import type { SessionFollowFrame, SessionProjectionValues } from '@mammoth-ai/mmp-api-session-controller/types'

const it = createClientTest({ roster: webApp }, { mount: true })
const originalParent = window.parent
const originalUrl = window.location.href
const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
afterEach(() => {
  Object.defineProperty(window, 'parent', { configurable: true, value: originalParent })
  window.history.replaceState(null, '', originalUrl)
  localStorage.clear()
  if (originalRangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRangeRect)
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
})

it('opens an admin preview and hands its first question through the shipped client Loader composition', async ({ mock, start }) => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() })
  window.history.replaceState(null, '', '?expertPreview=assembly-preview&expertId=assembly-expert')
  const parent = { postMessage: vi.fn() }
  Object.defineProperty(window, 'parent', { configurable: true, value: parent })
  const sessionId = SessionId('assembly-preview-session')
  const workspaceId = 'assembly-workspace' as WorkspaceId
  mock.remote.session.list.mockResolvedValue(ok({ items: [{ sessionId, updatedAt: 1, running: false, blank: true, agentAvailable: true }] }))
  mock.remote.officialAgentGallery.createPreview.mockResolvedValue(ok(sessionId))
  mock.remote.session.prompt.mockResolvedValue(ok({ accepted: true }))
  mock.remote.session.create.mockResolvedValue(ok({ sessionId }))
  mock.remote.commands.list.mockResolvedValue(ok([]))
  mock.remote.skills.list.mockResolvedValue(ok({ skills: [] }))
  mock.remote.schedule.catalog.mockResolvedValue(ok([]))
  mock.stream('job/list', (_request, stream) => { stream.push({ type: 'rows', jobs: [] }) })
  mock.stream('workspace/follow', (_request, stream) => {
    stream.push({ type: 'baseline', value: { items: [{ workspaceId, path: '/tmp', title: 'Preview workspace', sessionIds: [sessionId], createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z' }], archivedSessionIds: [], pinnedSessionIds: [] } })
  })
  mock.stream('session/follow', (_request, stream) => {
    stream.push({ type: 'snapshot', header: { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: 1, isSeeded: false }, cursor: -1, records: [], hasMore: false, projections: { asOfSeq: -1, values: {} }, assistantStream: { revision: 0 } } satisfies SessionFollowFrame)
  })
  const client = await start()
  await waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith({ type: 'mmp.expert-preview.ready', agentId: 'assembly-expert', previewId: 'assembly-preview' }, window.location.origin))
  expect(mock.remote.officialAgentGallery.createPreview).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[data-expert-preview-compact]')).toBeNull()
  expect(document.querySelector('[data-shell-overlay]')).not.toBeNull()
  const text = '请通过标准会话处理此预览问题。'
  const request = { type: 'mmp.expert-preview.submit', agentId: 'assembly-expert', previewId: 'assembly-preview', requestId: 'assembly-first', text }
  act(() => {
    for (let i = 0; i < 2; i++) window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: parent as never, data: request }))
  })
  await waitFor(() => expect(mock.remote.session.prompt).toHaveBeenCalledTimes(1), { container: document.createElement('div') })
  expect(mock.remote.session.prompt.mock.calls[0]?.[0]).toMatchObject({ sessionId, content: [{ type: 'text', text }], mode: 'queue' })
  expect(parent.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.accepted', agentId: 'assembly-expert', previewId: 'assembly-preview', requestId: 'assembly-first' }, window.location.origin)
  await client.unload('@mammoth-ai/mmp-client-ui-official-agent-gallery')
  parent.postMessage.mockClear()
  act(() => { window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: parent as never, data: { ...request, requestId: 'after-unload' } })) })
  expect(parent.postMessage).not.toHaveBeenCalled()
  await client.unload('@mammoth-ai/mmp-client-ui-renderer')
}, 60_000)

it('renders embedded expert messages and citations while the ordinary session list is still loading', async ({ mock, start }) => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() })
  window.history.replaceState(null, '', '?expertPreview=assembly-preview&expertId=assembly-expert&expertEmbed=1')
  const parent = { postMessage: vi.fn() }
  Object.defineProperty(window, 'parent', { configurable: true, value: parent })
  const sessionId = SessionId('assembly-preview-session')
  const workspaceId = 'assembly-workspace' as WorkspaceId
  let releaseSessionList = () => {}
  const pendingSessionList = new Promise<Awaited<ReturnType<typeof mock.remote.session.list>>>(resolve => {
    releaseSessionList = () => resolve(ok({ items: [{ sessionId, updatedAt: 1, running: false, blank: true, agentAvailable: true }] }))
  })
  mock.remote.session.list.mockReturnValue(pendingSessionList)
  mock.remote.officialAgentGallery.createPreview.mockResolvedValue(ok(sessionId))
  mock.remote.session.prompt.mockResolvedValue(ok({ accepted: true }))
  mock.remote.officialAgentGallery.openKnowledgeSource.mockResolvedValue(ok({ knowledgeReleaseId: 'release-1', documentId: 'doc-1', revisionId: 'rev-1', indexRevisionId: 'index-1', chunkId: 'chunk-1', sourceStart: 0, sourceEnd: 30, text: '原文第一段。\n原文第二段必须完整换行。', locator: { page: 2 } }))
  mock.remote.session.create.mockResolvedValue(ok({ sessionId }))
  mock.remote.commands.list.mockResolvedValue(ok([]))
  mock.remote.skills.list.mockResolvedValue(ok({ skills: [] }))
  mock.remote.schedule.catalog.mockResolvedValue(ok([]))
  mock.stream('job/list', (_request, stream) => { stream.push({ type: 'rows', jobs: [] }) })
  mock.stream('workspace/follow', (_request, stream) => {
    stream.push({ type: 'baseline', value: { items: [{ workspaceId, path: '/tmp', title: 'Preview workspace', sessionIds: [sessionId], createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z' }], archivedSessionIds: [], pinnedSessionIds: [] } })
  })
  mock.stream('session/follow', (_request, stream) => {
    stream.push({ type: 'snapshot', header: { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: 1, isSeeded: false }, cursor: 4, records: [
      { type: 'event', event: { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } } },
      { type: 'event', event: { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } } },
      { type: 'event', event: { type: 'user/message', seq: 2, time: 3, surfaceOp: 'append', data: { id: 'compact-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '仅此预览会话的问题' }] } } },
      { type: 'event', event: { type: 'assistant/message', seq: 3, time: 4, surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: 'compact-assistant', role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: '这是**标准会话**回答。 [T1L1S1]' }] }, stream: [] } } },
      { type: 'event', event: { type: 'turn/end', seq: 4, time: 5, data: { turn: 1, reason: { kind: 'error', error: { code: 'EXPERT_KNOWLEDGE_NO_EVIDENCE', message: '已启用必需检索，但此次没有可用的知识证据。' } } } } },
    ], hasMore: false, projections: { asOfSeq: 4, values: { officialExpertKnowledge: [{ recordId: 'old-record', turn: 1, messageId: 'm1', label: 'T1L1S1', title: '知识文档完整标题', locator: '第 2 页' }] } as SessionProjectionValues }, assistantStream: { revision: 0 } } satisfies SessionFollowFrame)
  })
  const client = await start()
  await waitFor(() => expect(mock.remote.officialAgentGallery.createPreview).toHaveBeenCalledTimes(1))
  act(() => { releaseSessionList() })
  await waitFor(() => expect(parent.postMessage, document.querySelector('[data-expert-preview-compact]')?.textContent ?? 'no compact view').toHaveBeenCalledWith({ type: 'mmp.expert-preview.ready', agentId: 'assembly-expert', previewId: 'assembly-preview' }, window.location.origin))
  expect(mock.remote.officialAgentGallery.createPreview).toHaveBeenCalledTimes(1)
  const compact = document.querySelector('[data-expert-preview-compact]')!
  expect(compact).not.toBeNull()
  await waitFor(() => expect(compact.querySelector('[data-role="user"]')?.textContent).toBe('仅此预览会话的问题'))
  expect(compact.querySelector('[data-role="assistant"] strong')?.textContent).toBe('标准会话')
  expect(compact.querySelector('[data-role="assistant"] details')?.textContent).toContain('T1L1S1')
  expect(compact.textContent).toContain('EXPERT_KNOWLEDGE_NO_EVIDENCE')
  expect(compact.textContent).toContain('此次没有可用的知识证据')
  expect(compact.textContent).not.toContain('未能交接预览问题')
  expect(document.querySelector('[data-sidebar-drawer]')).toBeNull()
  expect(document.querySelector('[data-shell-leading]')).toBeNull()
  expect(document.querySelector('[data-shell-bottom]')).toBeNull()
  expect(document.querySelector('[data-chat-flow]')).toBeNull()
  expect(document.querySelector('[data-composer-seat]')).toBeNull()
  expect(document.querySelector('textarea')).toBeNull()
  expect(window.location.search).toBe('')
  await waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith({ type: 'mmp.expert-preview.state', agentId: 'assembly-expert', previewId: 'assembly-preview', running: false }, window.location.origin))
  fireEvent.click(compact.querySelector('summary')!)
  fireEvent.click(compact.querySelector('button')!)
  await waitFor(() => expect(compact.textContent).toContain('原文第二段必须完整换行。'))
  expect(mock.remote.officialAgentGallery.openKnowledgeSource).toHaveBeenCalledWith(sessionId, 'old-record', 'T1L1S1')
  expect(compact.querySelector('pre')?.textContent).toBe('原文第一段。\n原文第二段必须完整换行。')
  const text = '请通过标准会话处理此预览问题。'
  const request = { type: 'mmp.expert-preview.submit', agentId: 'assembly-expert', previewId: 'assembly-preview', requestId: 'assembly-first', text }
  act(() => {
    for (let i = 0; i < 2; i++) window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: parent as never, data: request }))
  })
  await waitFor(() => expect(mock.remote.session.prompt).toHaveBeenCalledTimes(1), { container: document.createElement('div') })
  expect(mock.remote.session.prompt.mock.calls[0]?.[0]).toMatchObject({ sessionId, content: [{ type: 'text', text }], mode: 'queue' })
  expect(parent.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.accepted', agentId: 'assembly-expert', previewId: 'assembly-preview', requestId: 'assembly-first' }, window.location.origin)
  await client.unload('@mammoth-ai/mmp-client-ui-official-agent-gallery')
  parent.postMessage.mockClear()
  act(() => { window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: parent as never, data: { ...request, requestId: 'after-unload' } })) })
  expect(parent.postMessage).not.toHaveBeenCalled()
  await client.unload('@mammoth-ai/mmp-client-ui-renderer')
}, 60_000)
