// @vitest-environment jsdom
/** Sent messages show skills in chip order. The header origin chip stays off that row. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import { SentSkillChips } from '../src/client/SentSkillChips.tsx'
import { GallerySourceLabel, type GallerySourceLabelProps } from '../src/client/GallerySourceLabel.tsx'

afterEach(cleanup)

const projected = {
  byId: {
    s1: {
      projectionValues: {
        officialGallerySentSkills: {
          'req-1': [
            { name: '学院学习指南', key: 'academy', icon: null },
            { name: '百炼模型推荐', key: 'bailian', icon: 'https://example.test/b.png' },
          ],
        },
        officialGalleryRuntime: { lastArtifact: { id: 'art-1', name: '笔记.md' } },
      },
    },
  },
}

function useSessions<T>(selector: (state: typeof projected) => T): T {
  return selector(projected)
}

it('paints projected skills in chip order and echo skills ahead of the projection', () => {
  const view = render(<SentSkillChips {...({
    sessionId: 's1',
    requestId: 'req-1',
    useSessions,
  } as unknown as PropsRuntime<'conversation.chat.user.skills'>)} />)
  const text = view.container.textContent ?? ''
  expect(text.indexOf('学院学习指南')).toBeGreaterThanOrEqual(0)
  expect(text.indexOf('学院学习指南')).toBeLessThan(text.indexOf('百炼模型推荐'))
  expect(view.container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/b.png')
  view.unmount()

  const echo = render(<SentSkillChips {...({
    sessionId: 's1',
    requestId: 'req-1',
    skills: [{ name: '先看到的技能', key: 'echo' }],
    useSessions,
  } as unknown as PropsRuntime<'conversation.chat.user.skills'>)} />)
  expect(echo.getByText('先看到的技能')).toBeTruthy()
  expect(echo.queryByText('学院学习指南')).toBeNull()
  echo.unmount()

  const empty = render(<SentSkillChips {...({
    sessionId: 's1',
    requestId: 'missing',
    useSessions,
  } as unknown as PropsRuntime<'conversation.chat.user.skills'>)} />)
  expect(empty.container.firstChild).toBeNull()
  empty.unmount()

  const sentence = '介绍一下这个技能。再介绍一下这个技能。'
  const inline = render(<SentSkillChips {...({
    sessionId: 's1',
    text: sentence,
    skills: [
      { name: '学院学习指南', key: 'academy', offset: 0 },
      { name: '品牌视觉规范', key: 'brand', offset: '介绍一下这个技能。'.length },
    ],
    renderText: (slice: string) => slice,
    useSessions,
  } as unknown as PropsRuntime<'conversation.chat.user.skills'>)} />)
  expect(inline.container.textContent).toBe(`学院学习指南${sentence.slice(0, '介绍一下这个技能。'.length)}品牌视觉规范${sentence.slice('介绍一下这个技能。'.length)}`)
  inline.unmount()

  const leading = render(<SentSkillChips {...({
    sessionId: 's1',
    text: '只有文字',
    skills: [
      { name: '学院学习指南', key: 'academy' },
      { name: '品牌视觉规范', key: 'brand', offset: 2 },
    ],
    renderText: (slice: string) => slice,
    useSessions,
  } as unknown as PropsRuntime<'conversation.chat.user.skills'>)} />)
  expect(leading.container.textContent).toBe('学院学习指南品牌视觉规范只有文字')
})

it('keeps the artifact download and renders nothing without one', () => {
  const t = (key: string, values?: { name?: string }) => key === 'artifactDownload' ? values?.name ?? '' : key
  const bare = render(<GallerySourceLabel {...({
    sessionId: 's1',
    useSessions,
    t,
  } as unknown as GallerySourceLabelProps)} />)
  expect(bare.container.firstChild).toBeNull()
  bare.unmount()

  const download = render(<GallerySourceLabel {...({
    sessionId: 's1',
    useSessions,
    t,
    download: async () => ({ name: '笔记.md', data: '', sha256: '' }),
  } as unknown as GallerySourceLabelProps)} />)
  expect(download.getByRole('button', { name: '笔记.md' })).toBeTruthy()
})
