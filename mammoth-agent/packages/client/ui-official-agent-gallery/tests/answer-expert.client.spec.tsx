// @vitest-environment jsdom
/** A reply shows the expert who answered that turn. */
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import { AnswerExpert } from '../src/client/AnswerExpert.tsx'
import { MAMMOTH_AI_ANSWER } from '@mammoth-ai/mmp-official-agent-gallery/types'

afterEach(cleanup)

const projected = {
  byId: {
    s1: {
      projectionValues: {
        officialGalleryAnswerExpert: {
          '1': { name: 'UI设计师', agentId: 'expert-ui' },
          '3': MAMMOTH_AI_ANSWER,
        },
      },
    },
  },
}

function useSessions<T>(selector: (state: typeof projected) => T): T {
  return selector(projected)
}

it('paints the expert for this turn and nothing for a turn without one', async () => {
  const loadCard = vi.fn(async () => ({ key: 'designer', avatarUrl: 'https://example.test/ui.png' }))
  const view = render(<AnswerExpert {...({
    sessionId: 's1',
    turn: 1,
    useSessions,
    loadCard,
  } as unknown as PropsRuntime<'conversation.chat.assistant.expert'>)} />)
  expect(view.getByText('UI设计师')).toBeTruthy()
  await waitFor(() => expect(view.container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/ui.png'))

  const empty = render(<AnswerExpert {...({
    sessionId: 's1',
    turn: 2,
    useSessions,
    loadCard,
  } as unknown as PropsRuntime<'conversation.chat.assistant.expert'>)} />)
  expect(empty.container.firstChild).toBeNull()

  const product = render(<AnswerExpert {...({
    sessionId: 's1',
    turn: 3,
    useSessions,
    loadCard,
  } as unknown as PropsRuntime<'conversation.chat.assistant.expert'>)} />)
  expect(product.getByText('猛犸AI')).toBeTruthy()
  const mark = product.container.querySelector('img')
  expect(mark?.getAttribute('width')).toBe('22')
  expect(mark?.getAttribute('src') ?? '').toContain('data:image/png;base64,')
  expect(loadCard).toHaveBeenCalledTimes(1)
})
