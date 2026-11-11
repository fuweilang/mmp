// @vitest-environment jsdom
/** Summon writes the chosen example into the new task composer and does not send it. */
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SlotTestRuntime, stubConfigForm, usePinnedBrowserLanguages } from '@mammoth-ai/mmp-client-test-runtime'
import { LocaleRuntime } from '@mammoth-ai/mmp-client-locale/client'
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import { apply as conversation, inject as conversationInject } from '@mammoth-ai/mmp-client-ui-conversation/client'
import { SessionId } from '@mammoth-ai/mmp-session/types'
import { apply as gallery, inject as galleryInject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')
let active: SlotTestRuntime | undefined
afterEach(async () => {
  const runtime = active
  active = undefined
  if (runtime) await runtime.dispose()
  cleanup()
})

const expert = {
  id: 'general', key: 'general', kind: 'GENERAL', category: 'content',
  versionId: 'general-v1', version: 1,
  name: '文案润色', summary: '改善中文表达', openingQuestions: [],
  capabilities: [], avatarUrl: null, executionGranted: true,
}
const example = '帮我润色这段产品介绍'
const detail = {
  kind: 'expert', id: expert.id, key: expert.key, name: expert.name, summary: expert.summary,
  avatarUrl: null, linkedSkills: [],
  detail: {
    schemaVersion: 1, displayRevision: 1, introduction: '',
    outputs: [], materials: [], boundaries: [],
    starters: [{ text: example }, { text: '第二条' }, { text: '第三条' }],
  },
}

async function openPlaza(r: SlotTestRuntime) {
  await r.declare({ main: { kind: 'keyed', scope: 'root' } })
  await r.mount({ inject: [...galleryInject], apply: gallery })
  const slot = r.renderSlot('main', {}, { entryKey: 'official-agents' })
  await waitFor(() => { expect(slot.view.getByRole('button', { name: '查看详情 文案润色' })).toBeTruthy() })
  fireEvent.click(slot.view.getByRole('button', { name: '查看详情 文案润色' }))
  const dialog = await waitFor(() => slot.view.getByRole('dialog'))
  return { slot, dialog }
}

async function runtime() {
  const r = await SlotTestRuntime.create()
  active = r
  const locale = new LocaleRuntime(r.ctx)
  r.ctx.provide('locale', locale)
  r.slots.installLocale(locale)
  r.ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  const sessionId = SessionId('summoned-task')
  const created: { openingQuestion?: string }[] = []
  r.ctx.provide('uiWorkspace', {
    workspaceForNewSession: () => 'ws-1',
<<<<<<< HEAD
    openSession: (id: string) => { r.sessions.retain(SessionId(id), { source: 'mainView' }) },
=======
    openSession: (id: SessionId) => { r.sessions.retain(id, { source: 'mainView' }) },
>>>>>>> origin/4.0
  } as never)
  r.remote.provideNamespaces({
    officialAgentGallery: {
      preferences: async () => ({ ok: true, value: [] }),
      pageExperts: async () => ({ ok: true, value: { items: [expert], total: 1, hasMore: false, nextCursor: null } }),
      pageSkills: async () => ({ ok: true, value: { items: [], total: 0, hasMore: false, nextCursor: null } }),
      expertFacets: async () => ({ ok: true, value: { total: 1, capabilities: [], industries: [] } }),
      skillFacets: async () => ({ ok: true, value: { total: 0, capabilities: [], industries: [] } }),
      catalogDetail: async () => ({ ok: true, value: detail }),
      create: async (request: { openingQuestion?: string }) => {
        created.push(request)
        await r.sessions.add({
          id: sessionId,
          summary: { title: '新任务', displayTitle: '新任务', cwd: '/tmp' },
          session: { prompt: async () => ({ ok: true, value: { accepted: true } }) },
        })
        return { ok: true, value: sessionId }
      },
    },
  })
  await r.mount({ inject: [...conversationInject], apply: conversation })
  if (typeof HTMLDialogElement !== 'undefined') {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open') }
  }
  return { r, sessionId, created }
}

it('puts the clicked example into the new task input and does not send it', async () => {
  const { r, sessionId, created } = await runtime()
  const { dialog } = await openPlaza(r)
  fireEvent.click(within(dialog).getByText(example))
  await waitFor(() => { expect(r.sessions.binding(sessionId)).toBeTruthy() })
  const binding = r.sessions.binding(sessionId)!
  expect(r.ctx.conversation.input.for(binding.ctx).state.getSnapshot().draft).toBe(example)
  expect(created[0]).not.toHaveProperty('openingQuestion')
})
