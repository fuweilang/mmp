// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { makeTranslate } from '@mammoth-ai/mmp-client-test-runtime'
import type { CatalogDetail, CatalogFacets, CatalogQuery, OfficialAgentCard, OfficialSkillCard } from '@mammoth-ai/mmp-official-agent-gallery/types'
import { GalleryPage, type GalleryFace, type StartAgentFailure } from '../src/client/GalleryPage.tsx'
import { zh } from '../src/client/locales.ts'

const general: OfficialAgentCard = {
  id: 'general', key: 'general', kind: 'GENERAL', category: 'content',
  versionId: 'general-v1', version: 1,
  name: '文案润色', summary: '改善中文表达', openingQuestions: [],
  capabilities: ['表达优化'], avatarUrl: null, executionGranted: true,
}

const knowledge: OfficialAgentCard = {
  id: 'knowledge', key: 'knowledge', kind: 'KNOWLEDGE', category: 'expertise',
  versionId: 'knowledge-v2', version: 2,
  name: '企业问答', summary: '检索内部发布资料', openingQuestions: ['内部发布日期是什么？'],
  capabilities: ['企业资料'], avatarUrl: null, executionGranted: true,
}

const locked: OfficialAgentCard = {
  ...general, id: 'locked', key: 'locked', name: '未开通助手', executionGranted: false,
}

const t = makeTranslate(zh)

afterEach(cleanup)

type LoadAgents = () => Promise<readonly OfficialAgentCard[]>
type LoadSkills = () => Promise<readonly OfficialSkillCard[]>

type FacetItem = { readonly discovery?: { readonly capability: string; readonly industries: readonly string[] } | undefined; readonly category?: string | null }

function pageOf<T extends FacetItem>(all: readonly T[], query: CatalogQuery, text: (item: T) => string) {
  const needle = query.q?.toLowerCase()
  const items = all.filter(item => {
    if (needle && !text(item).toLowerCase().includes(needle)) return false
    if (query.capability && query.capability !== 'all' && item.discovery?.capability !== query.capability) return false
    return true
  })
  return { items, total: items.length, hasMore: false, nextCursor: null }
}

function facetsOf(all: readonly FacetItem[]): CatalogFacets {
  const capabilities = new Map<string, number>(), industries = new Map<string, number>()
  for (const item of all) {
    const capability = item.discovery?.capability ?? item.category
    if (capability) capabilities.set(capability, (capabilities.get(capability) ?? 0) + 1)
    for (const industry of item.discovery?.industries ?? []) industries.set(industry, (industries.get(industry) ?? 0) + 1)
  }
  return {
    total: all.length,
    capabilities: [...capabilities].map(([id, count]) => ({ id, count })),
    industries: [...industries].map(([id, count]) => ({ id, count })),
  }
}

function firstPage<T>(load: () => Promise<readonly T[]>): () => Promise<readonly T[]> {
  let pending: Promise<readonly T[]> | undefined
  return () => {
    pending ??= load().catch((error: unknown) => { pending = undefined; throw error })
    return pending
  }
}

const detail = async (kind: 'expert' | 'skill', id: string): Promise<CatalogDetail> => ({
  kind, id, key: id, name: id, summary: '', avatarUrl: null,
  detail: { schemaVersion: 1, displayRevision: 1, introduction: '', outputs: [], materials: [], boundaries: [], starters: [] },
  linkedSkills: [],
})

function mount(
  loadAgents: LoadAgents,
  startAgent: GalleryFace['startAgent'] = vi.fn(async () => undefined),
  loadSkills: LoadSkills = vi.fn(async () => []),
  requestSkill: GalleryFace['requestSkill'] = vi.fn<GalleryFace['requestSkill']>(async () => 'pending'),
) {
  const agents = firstPage(loadAgents), skills = firstPage(loadSkills)
  const pageExperts = async (query: CatalogQuery) => pageOf(await agents(), query, item => `${item.name} ${item.summary}`)
  const pageSkills = async (query: CatalogQuery) => pageOf(await skills(), query, item => `${item.name} ${item.summary}`)
  const emptyFacets: CatalogFacets = { total: 0, capabilities: [], industries: [] }
  const expertFacets = async () => { try { return facetsOf(await agents()) } catch { return emptyFacets } }
  const skillFacets = async () => { try { return facetsOf(await skills()) } catch { return emptyFacets } }
  render(<GalleryPage t={t} catalogDetail={detail} pageExperts={pageExperts} pageSkills={pageSkills}
    expertFacets={expertFacets} skillFacets={skillFacets}
    startAgent={startAgent} requestSkill={requestSkill} />)
  return { startAgent, requestSkill }
}

async function loaded(): Promise<void> {
  await waitFor(() => { expect(screen.getByRole('button', { name: '开始对话 文案润色' })).toBeTruthy() })
}

describe('GalleryPage', () => {
  it('loads cards, filters by name or summary, and renders a distinct no-match state', async () => {
    mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    expect(screen.getByText('企业问答')).toBeTruthy()
    expect(screen.queryByText('v2')).toBeNull()
    expect(screen.getByText('选择专家或技能，直接开始工作')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索专家' }), { target: { value: '发布资料' } })
    expect(screen.queryByText('文案润色')).toBeNull()
    expect(screen.getByText('企业问答')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索专家' }), { target: { value: '没有结果' } })
    expect(screen.getByText('没有找到相关专家')).toBeTruthy()
  })

  it('filters by category chips with live counts', async () => {
    mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    expect(screen.getByRole('button', { name: '全部 2', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: '内容营销 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '专业知识 1' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '专业知识 1' }))
    expect(screen.queryByText('文案润色')).toBeNull()
    expect(screen.getByText('企业问答')).toBeTruthy()

    expect(screen.queryByRole('button', { name: '数据分析 0' })).toBeNull()
  })

  it('omits capability chips, version, and detail panel on expert cards', async () => {
    mount(vi.fn(async () => [knowledge]))
    await waitFor(() => { expect(screen.getByText('企业问答')).toBeTruthy() })
    expect(screen.queryByText('企业资料')).toBeNull()
    expect(screen.queryByText('v2')).toBeNull()
    expect(screen.queryByText('试试这些问题')).toBeNull()
  })

  it('shows the empty published catalog state', async () => {
    mount(vi.fn(async () => []))
    await waitFor(() => { expect(screen.getByText('暂时还没有可用的专家')).toBeTruthy() })
  })

  it('blocks not-granted experts without creating a Session', async () => {
    const { startAgent } = mount(vi.fn(async () => [locked]))
    await waitFor(() => { expect(screen.getByText('未开通助手')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '开始对话 未开通助手' }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('当前企业暂未开通该专家')
    })
    expect(startAgent).not.toHaveBeenCalled()
  })

  it('does not open a detail panel when an expert card body is present', async () => {
    mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    expect(screen.queryByRole('region', { name: '企业问答' })).toBeNull()
    expect(screen.queryByRole('button', { name: '使用问题开始：内部发布日期是什么？' })).toBeNull()
  })

  it('starts directly from a card', async () => {
    const { startAgent } = mount(vi.fn(async () => [general]))
    await loaded()
    const card = screen.getByText('文案润色').closest('li')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLLIElement).getByRole('button', { name: '开始对话 文案润色' }))
    await waitFor(() => { expect(startAgent).toHaveBeenCalledExactlyOnceWith('general', undefined) })
  })

  it('binds each card start button to its own Agent, not the first card', async () => {
    const { startAgent } = mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    const button = screen.getByRole('button', { name: '开始对话 企业问答' })
    expect(button.getAttribute('data-agent-key')).toBe('knowledge')
    fireEvent.click(button)
    await waitFor(() => { expect(startAgent).toHaveBeenCalledExactlyOnceWith('knowledge', undefined) })
  })

  it.each([
    ['workspaceRequired', '请先创建一个工作区，再开始对话'],
    ['startFailed', '无法开始对话，请重试'],
  ] as const)('shows the safe %s failure', async (result, copy) => {
    const startAgent = vi.fn<GalleryFace['startAgent']>(async () => result as StartAgentFailure)
    mount(vi.fn(async () => [general]), startAgent)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '开始对话 文案润色' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(copy) })
  })

  it('contains a rejected creation and reports the safe failure', async () => {
    const startAgent = vi.fn<GalleryFace['startAgent']>(async () => { throw new Error('private Ground failure') })
    mount(vi.fn(async () => [general]), startAgent)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '开始对话 文案润色' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('无法开始对话，请重试') })
    expect(screen.queryByText('private Ground failure')).toBeNull()
  })

  it('offers a working retry after loading fails', async () => {
    const loadAgents = vi.fn<LoadAgents>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([general])
    mount(loadAgents)
    await waitFor(() => { expect(screen.getByText('暂时无法加载，请稍后重试')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await loaded()
    expect(loadAgents).toHaveBeenCalledTimes(2)
  })

  it('distinguishes auth failures from generic load errors', async () => {
    mount(vi.fn(async () => { throw new Error('HTTP 401 Unauthorized') }))
    await waitFor(() => {
      expect(screen.getByText('登录已失效，请重新登录')).toBeTruthy()
    })
  })

  it('renders a Ground portrait and falls back to the bundled same-key file before the glyph', async () => {
    const withAvatar: OfficialAgentCard = {
      ...general,
      id: 'growth',
      key: 'growth',
      name: '增长战略顾问',
      avatarUrl: 'https://example.test/avatars/growth.jpg',
    }
    mount(vi.fn(async () => [withAvatar]))
    await waitFor(() => { expect(screen.getByText('增长战略顾问')).toBeTruthy() })
    const image = screen.getByRole('img', { name: '增长战略顾问' }) as HTMLImageElement
    expect(image.getAttribute('src')).toBe('https://example.test/avatars/growth.jpg')
    fireEvent.error(image)
    await waitFor(() => {
      const fallback = screen.getByRole('img', { name: '增长战略顾问' }) as HTMLImageElement
      expect(fallback.getAttribute('src') ?? '').toMatch(/growth\.jpg/)
    })
  })

  it('falls back to the glyph when neither Ground nor a bundled portrait loads', async () => {
    const withBroken: OfficialAgentCard = {
      ...general,
      id: 'broken',
      key: 'no-such-agent',
      name: '临时助手',
      avatarUrl: 'https://example.test/missing.jpg',
    }
    mount(vi.fn(async () => [withBroken]))
    await waitFor(() => { expect(screen.getByText('临时助手')).toBeTruthy() })
    fireEvent.error(screen.getByRole('img', { name: '临时助手' }))
    await waitFor(() => {
      expect(screen.queryByRole('img', { name: '临时助手' })).toBeNull()
      expect(screen.getByText('临')).toBeTruthy()
    })
  })

  it('keeps the first-character glyph when no portrait is available', async () => {
    mount(vi.fn(async () => [general]))
    await loaded()
    expect(screen.queryByRole('img', { name: '文案润色' })).toBeNull()
    expect(screen.getByText('文')).toBeTruthy()
  })

  it('skill tab surfaces pending bind contract without claiming a Host session', async () => {
    const requestSkill = vi.fn<GalleryFace['requestSkill']>(async () => 'pending')
    mount(
      vi.fn(async () => [general]),
      vi.fn(async () => undefined),
      vi.fn<LoadSkills>(async () => [{
        id: 'skill-1', key: 'brief', name: '简报整理', summary: '把材料整理成简报',
        category: 'common', enabledAt: '2026-11-06T00:00:00.000Z', packageRevision: 1,
      }]),
      requestSkill,
    )
    await loaded()
    fireEvent.click(screen.getByRole('tab', { name: '技能' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: '使用技能 简报整理' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '使用技能 简报整理' }))
    await waitFor(() => {
      expect(requestSkill).toHaveBeenCalledExactlyOnceWith('skill-1')
      expect(screen.getByRole('status').textContent ?? '').toContain('skillId: skill-1')
    })
  })
})
