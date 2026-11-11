// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { SlotTestRuntime, stubConfigForm } from '@mammoth-ai/mmp-client-test-runtime'
import { LocaleRuntime } from '@mammoth-ai/mmp-client-locale/client'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import { apply, inject } from '@mammoth-ai/mmp-client-ui-conversation/client'
import type { SessionFace } from '@mammoth-ai/mmp-api-session-controller/client'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import { RemoteError } from '@mammoth-ai/mmp-typert-protocol'
import { submitExpertPreviewInput } from '../src/client/expert-preview-admission.ts'

let runtime: SlotTestRuntime | undefined
afterEach(async () => { await runtime?.dispose(); runtime = undefined })

async function setup() {
  const r = await SlotTestRuntime.create()
  runtime = r
  const locale = new LocaleRuntime(r.ctx)
  r.ctx.provide('locale', locale)
  r.slots.installLocale(locale)
  r.ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  r.ctx.provide('uiWorkspace', { workspaceForNewSession: () => undefined, openSession: () => {} } as never)
  const prompt = vi.fn<SessionFace['prompt']>().mockResolvedValue({ ok: true, value: { accepted: true } })
  const id = SessionId('admission-preview')
  await r.sessions.add({ id, session: { prompt } })
  const reference = r.sessions.retain(id, { source: 'mainView' })
  await r.mount({ inject: [...inject], apply })
  const input = r.ctx.conversation.input.for(reference.binding.ctx)
  const initialize = (text: string) => r.ctx.conversation.input.requestDraftInitialization(reference.binding, { prompt: text, whenDraftExists: 'keep' })
  return { r, prompt, input, initialize }
}

it('waits for ordinary Host admission before acknowledging, then keeps a committed question committed', async () => {
  const s = await setup()
  let accept!: (value: Awaited<ReturnType<SessionFace['prompt']>>) => void
  s.prompt.mockImplementationOnce(() => new Promise(resolve => { accept = resolve }))
  s.initialize('等待实际接收的问题')
  const submitted = submitExpertPreviewInput(s.input, new AbortController().signal)
  const acknowledged = vi.fn()
  void submitted.then(acknowledged, () => {})
  await waitFor(() => expect(s.prompt).toHaveBeenCalledTimes(1))
  expect(acknowledged).not.toHaveBeenCalled()
  expect(s.input.state.getSnapshot().draft).toBe('等待实际接收的问题')
  accept({ ok: true, value: { accepted: true } })
  await submitted
  expect(s.input.state.getSnapshot().draft).toBe('')
  expect(s.prompt).toHaveBeenCalledTimes(1)
  s.input.notify('error', 'EXPERT_KNOWLEDGE_NO_EVIDENCE: 此次检索没有证据')
  expect(s.input.state.getSnapshot().draft).toBe('')
  expect(s.prompt).toHaveBeenCalledTimes(1)
})

it.each(['transport failure', 'Host refusal'])('returns only its unchanged draft after %s and permits a normal retry', async failure => {
  const s = await setup()
  if (failure === 'transport failure') s.prompt.mockRejectedValueOnce(new Error('temporary transport failure'))
  else s.prompt.mockResolvedValueOnce({ ok: false, error: new RemoteError('session/agent-busy', 'prompt rejected before acceptance', { reason: 'busy' }) })
  s.initialize('可重试的原始问题')
  await expect(submitExpertPreviewInput(s.input, new AbortController().signal)).rejects.toThrow('Preview admission')
  expect(s.input.state.getSnapshot().draft).toBe('')
  expect(s.initialize('可重试的原始问题')).toBe('applied')
  await submitExpertPreviewInput(s.input, new AbortController().signal)
  expect(s.prompt).toHaveBeenCalledTimes(2)
  expect(s.input.state.getSnapshot().draft).toBe('')
})

it('releases its observation on preview disposal without clearing an unrelated retained draft', async () => {
  const s = await setup()
  s.prompt.mockImplementationOnce(() => new Promise(() => {}))
  s.initialize('离开前的问题')
  const controller = new AbortController()
  const submitted = submitExpertPreviewInput(s.input, controller.signal)
  await waitFor(() => expect(s.prompt).toHaveBeenCalledTimes(1))
  controller.abort()
  await expect(submitted).rejects.toThrow('Preview admission')
  expect(s.input.state.getSnapshot().draft).toBe('离开前的问题')
  expect(s.prompt).toHaveBeenCalledTimes(1)
})
