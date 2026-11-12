// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installExpertPreviewBridge } from '../src/client/expert-preview-bridge.ts'

const target = { agentId: 'expert-one', previewId: 'preview-one' }
const originalParent = window.parent
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  Object.defineProperty(window, 'parent', { configurable: true, value: originalParent })
  vi.useRealTimers()
})

function setup() {
  const postMessage = vi.fn()
  const parent = { postMessage }
  Object.defineProperty(window, 'parent', { configurable: true, value: parent })
  const initialize = vi.fn((_text: string): 'applied' | 'preserved' | 'blocked' => 'applied')
  const submit = vi.fn<() => void | Promise<void>>()
  const cancel = vi.fn(async () => {})
  let ready = false
  const bridge = installExpertPreviewBridge({ frame: window, target,
    input: () => ready ? { initialize, submit, cancel } : undefined,
    message: key => key,
  })
  dispose = bridge.dispose
  const send = (data: object, origin = window.location.origin, source = parent) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as never }))
  }
  const request = { type: 'mmp.expert-preview.submit', ...target, requestId: 'request-one', text: '  原样首问\n第二行  ' }
  return { bridge, postMessage, initialize, submit, cancel, send, request, ready: () => { ready = true } }
}

it('waits for retained input, announces readiness once, submits exact text, and replays duplicates', async () => {
  vi.useFakeTimers()
  const s = setup()
  s.bridge.start()
  expect(s.postMessage).not.toHaveBeenCalled()
  s.ready()
  await vi.advanceTimersByTimeAsync(100)
  expect(s.postMessage).toHaveBeenCalledWith({ type: 'mmp.expert-preview.ready', ...target }, window.location.origin)
  s.send(s.request)
  s.send(s.request)
  expect(s.initialize).toHaveBeenCalledExactlyOnceWith(s.request.text)
  expect(s.submit).toHaveBeenCalledTimes(1)
  expect(s.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.accepted', ...target, requestId: 'request-one' }, window.location.origin)
  await vi.advanceTimersByTimeAsync(20_000)
  expect(s.postMessage.mock.calls.filter(([event]) => event.type === 'mmp.expert-preview.ready')).toHaveLength(1)
})

it('ignores other origins, sources, preview identities and malformed requests', () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  s.postMessage.mockClear()
  s.send(s.request, 'https://other.example')
  s.send(s.request, window.location.origin, { postMessage: vi.fn() })
  s.send({ ...s.request, previewId: 'other-preview' })
  s.send({ ...s.request, agentId: 'other-expert' })
  s.send({ ...s.request, requestId: '' })
  s.send({ ...s.request, requestId: 1 })
  s.send({ ...s.request, text: 123 })
  expect(s.initialize).not.toHaveBeenCalled()
  expect(s.postMessage).not.toHaveBeenCalled()
})

it('reports oversized or blank text and never overwrites or submits a preserved draft', () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  s.send({ ...s.request, text: 'a'.repeat(16_001), requestId: 'too-long' })
  expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'mmp.expert-preview.error', message: 'previewQuestionTooLong' }), window.location.origin)
  s.send({ ...s.request, text: '  \n ', requestId: 'empty' })
  expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'previewQuestionEmpty' }), window.location.origin)
  expect(s.initialize).not.toHaveBeenCalled()
  s.initialize.mockReturnValue('preserved')
  s.send(s.request)
  expect(s.submit).not.toHaveBeenCalled()
  expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'previewDraftExists' }), window.location.origin)
})

it('contains input failures without echoing exception contents', () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  s.submit.mockImplementation(() => { throw new Error('private upstream detail') })
  s.send(s.request)
  s.send(s.request)
  expect(s.submit).toHaveBeenCalledTimes(1)
  expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'previewSubmitFailed' }), window.location.origin)
})

it('bounds readiness polling and removes listeners and timers on disposal', async () => {
  vi.useFakeTimers()
  const s = setup()
  s.bridge.start()
  await vi.advanceTimersByTimeAsync(11_000)
  expect(vi.getTimerCount()).toBe(0)
  s.bridge.dispose()
  s.ready()
  s.send(s.request)
  await vi.advanceTimersByTimeAsync(11_000)
  expect(s.submit).not.toHaveBeenCalled()
  expect(s.postMessage).not.toHaveBeenCalled()
})

it('cancels a pending readiness poll when the preview is disposed', async () => {
  vi.useFakeTimers()
  const s = setup()
  s.bridge.start()
  expect(vi.getTimerCount()).toBe(1)
  s.bridge.dispose()
  expect(vi.getTimerCount()).toBe(0)
  s.ready()
  s.send(s.request)
  await vi.advanceTimersByTimeAsync(20_000)
  expect(s.postMessage).not.toHaveBeenCalled()
  expect(s.submit).not.toHaveBeenCalled()
})

it('accepts the exact text limit and returns explicit errors for temporarily blocked input', () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  s.send({ ...s.request, text: '字'.repeat(16_000), requestId: 'exact-limit' })
  expect(s.initialize).toHaveBeenCalledExactlyOnceWith('字'.repeat(16_000))
  expect(s.submit).toHaveBeenCalledTimes(1)
  s.initialize.mockReturnValue('blocked')
  s.send(s.request)
  expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'mmp.expert-preview.error', message: 'previewInputNotReady' }), window.location.origin)
  expect(s.submit).toHaveBeenCalledTimes(1)
})


it('publishes only captured running state and cancels through the ordinary scoped session once', async () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  s.bridge.state(true)
  expect(s.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.state', ...target, running: true }, window.location.origin)
  const cancel = { type: 'mmp.expert-preview.cancel', ...target, requestId: 'stop-one' }
  s.send(cancel, 'https://other.example')
  s.send({ ...cancel, previewId: 'another-preview' })
  expect(s.cancel).not.toHaveBeenCalled()
  s.send(cancel)
  s.send(cancel)
  await Promise.resolve()
  expect(s.cancel).toHaveBeenCalledTimes(1)
  expect(s.initialize).not.toHaveBeenCalled()
  expect(s.submit).not.toHaveBeenCalled()
  await vi.waitFor(()=>expect(s.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.accepted', ...target, requestId: 'stop-one' }, window.location.origin))
  s.bridge.dispose()
  s.postMessage.mockClear()
  s.bridge.state(false)
  s.send({ ...cancel, requestId: 'after-dispose' })
  expect(s.postMessage).not.toHaveBeenCalled()
  expect(s.cancel).toHaveBeenCalledTimes(1)
})

it('contains cancellation failures without echoing upstream details', async () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  s.cancel.mockRejectedValue(new Error('private cancellation details'))
  s.send({ type: 'mmp.expert-preview.cancel', ...target, requestId: 'failed-stop' })
  await Promise.resolve()
  await vi.waitFor(()=>expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'mmp.expert-preview.error', message: 'previewSubmitFailed' }), window.location.origin))
})

it('interrupts immediately and again after in-flight admission so the first stop cannot race a queued prompt', async () => {
  const s=setup();s.ready();s.bridge.start();
  let admit!:()=>void;s.submit.mockImplementation(()=>new Promise<void>(resolve=>{admit=resolve}));
  s.send(s.request);
  const stop={type:'mmp.expert-preview.cancel',...target,requestId:'stop-during-admission'};
  s.send(stop);await Promise.resolve();expect(s.cancel).toHaveBeenCalledTimes(1);
  admit();await vi.waitFor(()=>expect(s.cancel).toHaveBeenCalledTimes(2));
  await vi.waitFor(()=>expect(s.postMessage).toHaveBeenCalledWith({type:'mmp.expert-preview.accepted',...target,requestId:stop.requestId},window.location.origin));
});

it('keeps a compact request pending until ordinary admission succeeds and reports asynchronous refusal', async () => {
  const s = setup()
  s.ready()
  s.bridge.start()
  let accept!: () => void
  s.submit.mockReturnValueOnce(new Promise<void>(resolve => { accept = resolve }))
  s.send(s.request)
  s.send(s.request)
  expect(s.submit).toHaveBeenCalledTimes(1)
  expect(s.postMessage.mock.calls.some(([event]) => event.type === 'mmp.expert-preview.accepted')).toBe(false)
  accept()
  await Promise.resolve()
  expect(s.postMessage).toHaveBeenLastCalledWith({ type: 'mmp.expert-preview.accepted', ...target, requestId: 'request-one' }, window.location.origin)
  s.submit.mockRejectedValueOnce(new Error('private admission detail'))
  s.send({ ...s.request, requestId: 'refused-question' })
  await Promise.resolve()
  expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'mmp.expert-preview.error', requestId: 'refused-question', message: 'previewSubmitFailed' }), window.location.origin)
})
