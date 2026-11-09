// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  discovery: { capability: 'marketing', industries: [] },
}

const knowledge: OfficialAgentCard = {
  id: 'knowledge', key: 'knowledge', kind: 'KNOWLEDGE', category: 'expertise',
  versionId: 'knowledge-v2', version: 2,
  name: '企业问答', summary: '检索内部发布资料', openingQuestions: ['内部发布日期是什么？'],
  capabilities: ['企业资料'], avatarUrl: null, executionGranted: true,
  discovery: { capability: 'development', industries: [] },
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
  catalogDetail: GalleryFace['catalogDetail'] = detail,
) {
  const agents = firstPage(loadAgents), skills = firstPage(loadSkills)
  const pageExperts = async (query: CatalogQuery) => pageOf(await agents(), query, item => `${item.name} ${item.summary}`)
  const pageSkills = async (query: CatalogQuery) => pageOf(await skills(), query, item => `${item.name} ${item.summary}`)
  const emptyFacets: CatalogFacets = { total: 0, capabilities: [], industries: [] }
  const expertFacets = async () => { try { return facetsOf(await agents()) } catch { return emptyFacets } }
  const skillFacets = async () => { try { return facetsOf(await skills()) } catch { return emptyFacets } }
  render(<GalleryPage t={t} catalogDetail={catalogDetail} pageExperts={pageExperts} pageSkills={pageSkills}
    expertFacets={expertFacets} skillFacets={skillFacets}
    startAgent={startAgent} requestSkill={requestSkill} />)
  return { startAgent, requestSkill }
}

async function loaded(): Promise<void> {
  await waitFor(() => { expect(screen.getByRole('button', { name: '召唤专家 文案润色' })).toBeTruthy() })
}

describe('GalleryPage', () => {
  it('loads cards, filters by name or summary, and renders a distinct no-match state', async () => {
    mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    expect(screen.getByText('企业问答')).toBeTruthy()
    expect(screen.queryByText('v2')).toBeNull()
    expect(screen.getByText('选择专家或技能，直接开始工作')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索专家' }), { target: { value: '发布资料' } })
    await waitFor(() => { expect(screen.queryByText('文案润色')).toBeNull() })
    expect(screen.getByText('企业问答')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索专家' }), { target: { value: '没有结果' } })
    await waitFor(() => { expect(screen.getByText('没有找到相关专家')).toBeTruthy() })
  })

  it('filters by category chips with live counts', async () => {
    mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    expect(screen.getByRole('button', { name: /全部\s*2/, pressed: true })).toBeTruthy()
    const more = screen.queryByRole('button', { name: /更多能力/ })
    if (more) fireEvent.click(more)
    expect(screen.getByRole('button', { name: /营销与内容/ })).toBeTruthy()
    const developmentChip = screen.getByRole('button', { name: /开发与架构/ })
    fireEvent.click(developmentChip)
    await waitFor(() => { expect(screen.queryByText('文案润色')).toBeNull() })
    await waitFor(() => { expect(screen.getByText('企业问答')).toBeTruthy() })
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
    fireEvent.click(screen.getByRole('button', { name: '召唤专家 未开通助手' }))
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
    fireEvent.click(within(card as HTMLLIElement).getByRole('button', { name: '召唤专家 文案润色' }))
    await waitFor(() => { expect(startAgent).toHaveBeenCalledExactlyOnceWith('general', undefined) })
  })

  it('binds each card start button to its own Agent, not the first card', async () => {
    const { startAgent } = mount(vi.fn(async () => [general, knowledge]))
    await loaded()
    const button = screen.getByRole('button', { name: '召唤专家 企业问答' })
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
    fireEvent.click(screen.getByRole('button', { name: '召唤专家 文案润色' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(copy) })
  })

  it('contains a rejected creation and reports the safe failure', async () => {
    const startAgent = vi.fn<GalleryFace['startAgent']>(async () => { throw new Error('private Ground failure') })
    mount(vi.fn(async () => [general]), startAgent)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '召唤专家 文案润色' }))
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
    // CatalogIcon keeps decorative alt="" (parent card carries the accessible name).
    // Successful portrait must not stack the default SVG underneath (transparent logos).
    const image = document.querySelector('img[src="https://example.test/avatars/growth.jpg"]') as HTMLImageElement
    expect(image).toBeTruthy()
    expect(document.querySelector('[class*="artwork"] svg')).toBeNull()
    fireEvent.error(image)
    await waitFor(() => {
      expect(document.querySelector('img[src="https://example.test/avatars/growth.jpg"]')).toBeNull()
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
    const image = document.querySelector('img[src="https://example.test/missing.jpg"]') as HTMLImageElement
    expect(image).toBeTruthy()
    fireEvent.error(image)
    await waitFor(() => {
      expect(document.querySelector('img[src="https://example.test/missing.jpg"]')).toBeNull()
      expect(document.querySelector('[class*="artwork"] svg')).toBeTruthy()
    })
  })

  it('keeps the first-character glyph when no portrait is available', async () => {
    mount(vi.fn(async () => [general]))
    await loaded()
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('[class*="artwork"] svg')).toBeTruthy()
  })

  it('skill use binds the real skill and does not prefill or announce a pending session', async () => {
    const requestSkill = vi.fn<GalleryFace['requestSkill']>(async () => undefined)
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
      expect(requestSkill).toHaveBeenCalledExactlyOnceWith('skill-1', undefined)
    })
    expect(screen.queryByText(/skillId:\s*skill-1/)).toBeNull()
    expect(screen.queryByText(/即将上线/)).toBeNull()
  })

  it('debounces search input and ignores stale catalog responses', async () => {
    const calls: string[] = []
    let releaseSlow: ((page: { items: OfficialAgentCard[]; total: number; hasMore: boolean; nextCursor: string | null }) => void) | undefined
    const slow = new Promise<{ items: OfficialAgentCard[]; total: number; hasMore: boolean; nextCursor: string | null }>(resolve => { releaseSlow = resolve })
    const pageExperts = vi.fn(async (query: CatalogQuery) => {
      calls.push(query.q ?? '')
      if ((query.q ?? '') === '慢') return slow
      return pageOf([general, knowledge], query, item => `${item.name} ${item.summary}`)
    })
    const pageSkills = async () => ({ items: [] as OfficialSkillCard[], total: 0, hasMore: false, nextCursor: null })
    const detail = async () => ({ id: 'x', key: 'x', name: 'x', summary: '', avatarUrl: null, linkedSkills: [], detail: { schemaVersion: 1 as const, displayRevision: 1, introduction: '', outputs: [], materials: [], boundaries: [], starters: [] } })
    const favourite = vi.fn(async () => undefined)
    render(<GalleryPage t={t} favourite={favourite} catalogDetail={detail as never} pageExperts={pageExperts as never} pageSkills={pageSkills as never}
      expertFacets={async () => ({ total: 2, capabilities: [], industries: [] })} skillFacets={async () => ({ total: 0, capabilities: [], industries: [] })}
      startAgent={async () => undefined} requestSkill={async () => undefined} />)
    await waitFor(() => { expect(screen.getAllByRole('button', { name: '加入常用' }).length).toBeGreaterThan(0) })
    const fav = screen.getAllByRole('button', { name: '加入常用' })[0]!
    expect(fav.className).toMatch(/favouriteAction/)
    expect(fav.className).not.toMatch(/favouriteOn/)
    expect(fav.textContent).toContain('加入常用')
    const star = fav.querySelector('svg')
    expect(star?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(star?.getAttribute('width')).toBe('16')
    expect(star?.getAttribute('height')).toBe('16')
    expect(star?.querySelector('path')?.getAttribute('d') ?? '').toContain('M12 2.5l2.9 5.88')
    expect(star?.querySelector('path')?.getAttribute('fill')).toBe('none')
    fireEvent.click(fav)
    await waitFor(() => { expect(screen.getAllByRole('button', { name: '取消常用' }).length).toBeGreaterThan(0) })
    const favOn = screen.getAllByRole('button', { name: '取消常用' })[0]!
    expect(favOn.className).toMatch(/favouriteOn/)
    expect(favOn.textContent).toContain('已加入常用')
    expect(favOn.querySelector('svg path')?.getAttribute('fill')).toBe('currentColor')

    const box = await screen.findByRole('searchbox', { name: '搜索专家' })
    fireEvent.change(box, { target: { value: '慢' } })
    fireEvent.change(box, { target: { value: '慢查' } })
    await waitFor(() => { expect(calls.includes('慢查')).toBe(true) }, { timeout: 1500 })
    expect(calls.filter(v => v === '慢')).toHaveLength(0)
    fireEvent.change(box, { target: { value: '文案' } })
    await waitFor(() => { expect(calls.includes('文案')).toBe(true) }, { timeout: 1500 })
    releaseSlow?.({ items: [{ ...general, name: '过期慢结果' }], total: 1, hasMore: false, nextCursor: null })
    await waitFor(() => { expect(screen.queryByText('过期慢结果')).toBeNull() })
    const before = pageExperts.mock.calls.length
    fireEvent.compositionStart(box)
    fireEvent.change(box, { target: { value: 'shang' } })
    await new Promise(r => setTimeout(r, 350))
    expect(pageExperts.mock.calls.length).toBe(before)
    fireEvent.compositionEnd(box, { currentTarget: { value: '商' } })
    fireEvent.change(box, { target: { value: '商' } })
    await waitFor(() => { expect(pageExperts.mock.calls.some(call => call[0]?.q === '商')).toBe(true) }, { timeout: 1500 })
  })

  it('keeps capability chip order stable when selecting 3rd and 5th facets', async () => {
    const experts: OfficialAgentCard[] = [
      { ...general, id: 'e1', key: 'e1', name: 'E1', discovery: { capability: 'product-project', industries: [] } },
      { ...general, id: 'e2', key: 'e2', name: 'E2', discovery: { capability: 'development', industries: [] } },
      { ...general, id: 'e3', key: 'e3', name: 'E3', discovery: { capability: 'design', industries: [] } },
      { ...general, id: 'e4', key: 'e4', name: 'E4', discovery: { capability: 'marketing', industries: [] } },
      { ...general, id: 'e5', key: 'e5', name: 'E5', discovery: { capability: 'sales-customer', industries: [] } },
      { ...general, id: 'e6', key: 'e6', name: 'E6', discovery: { capability: 'business', industries: [] } },
    ]
    const skills: OfficialSkillCard[] = [
      { id: 's1', key: 's1', name: 'S1', summary: 'a', category: 'common', enabledAt: '2026-11-07T00:00:00Z', packageRevision: 1, discovery: { capability: 'file-processing', industries: [] } },
      { id: 's2', key: 's2', name: 'S2', summary: 'a', category: 'common', enabledAt: '2026-11-07T00:00:00Z', packageRevision: 1, discovery: { capability: 'writing', industries: [] } },
      { id: 's3', key: 's3', name: 'S3', summary: 'a', category: 'common', enabledAt: '2026-11-07T00:00:00Z', packageRevision: 1, discovery: { capability: 'data-analysis', industries: [] } },
      { id: 's4', key: 's4', name: 'S4', summary: 'a', category: 'common', enabledAt: '2026-11-07T00:00:00Z', packageRevision: 1, discovery: { capability: 'research', industries: [] } },
      { id: 's5', key: 's5', name: 'S5', summary: 'a', category: 'common', enabledAt: '2026-11-07T00:00:00Z', packageRevision: 1, discovery: { capability: 'planning', industries: [] } },
      { id: 's6', key: 's6', name: 'S6', summary: 'a', category: 'common', enabledAt: '2026-11-07T00:00:00Z', packageRevision: 1, discovery: { capability: 'marketing', industries: [] } },
    ]
    const facetsOf = (items: FacetItem[]) => {
      const capabilities = new Map<string, number>(), industries = new Map<string, number>()
      for (const item of items) {
        const capability = item.discovery?.capability ?? item.category
        if (capability) capabilities.set(capability, (capabilities.get(capability) ?? 0) + 1)
        for (const industry of item.discovery?.industries ?? []) industries.set(industry, (industries.get(industry) ?? 0) + 1)
      }
      return {
        total: items.length,
        capabilities: [...capabilities].map(([id, count]) => ({ id, count })),
        industries: [...industries].map(([id, count]) => ({ id, count })),
      }
    }
    render(<GalleryPage t={t} catalogDetail={async () => ({ id: 'x', key: 'x', name: 'x', summary: '', avatarUrl: null, linkedSkills: [], detail: { schemaVersion: 1 as const, displayRevision: 1, introduction: '', outputs: [], materials: [], boundaries: [], starters: [] } })}
      pageExperts={async (query) => pageOf(experts, query, item => `${item.name}`)}
      pageSkills={async (query) => pageOf(skills, query, item => `${item.name}`)}
      expertFacets={async () => facetsOf(experts)} skillFacets={async () => facetsOf(skills)}
      startAgent={async () => undefined} requestSkill={async () => undefined} />)

    const orderOf = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>('button[data-capability]')].filter(btn => btn.dataset.capability !== 'all').map(btn => btn.dataset.capability)
    const expertPanel = await screen.findByRole('tabpanel', { name: '专家' })
    await waitFor(() => { expect(expertPanel.querySelector('[data-capability="all"]')).toBeTruthy() })
    const moreExperts = within(expertPanel).queryByRole('button', { name: '更多能力' })
    if (moreExperts) fireEvent.click(moreExperts)
    await waitFor(() => { expect(orderOf(expertPanel).length).toBeGreaterThanOrEqual(5) })
    const baseline = orderOf(expertPanel)
    const third = baseline[2]!
    const fifth = baseline[4]!
    fireEvent.click(expertPanel.querySelector(`[data-capability="${third}"]`)!)
    expect(orderOf(expertPanel)).toEqual(baseline)
    expect(expertPanel.querySelector(`[data-capability="${third}"]`)?.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(expertPanel.querySelector(`[data-capability="${fifth}"]`)!)
    expect(orderOf(expertPanel)).toEqual(baseline)
    expect(expertPanel.querySelector(`[data-capability="${fifth}"]`)?.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(expertPanel.querySelector('[data-capability="all"]')!)
    expect(orderOf(expertPanel)).toEqual(baseline)

    fireEvent.click(screen.getByRole('tab', { name: '技能' }))
    const skillPanel = screen.getByRole('tabpanel', { name: '技能' })
    await waitFor(() => { expect(skillPanel.querySelector('[data-capability="all"]')).toBeTruthy() })
    const moreSkills = within(skillPanel).queryByRole('button', { name: '更多能力' })
    if (moreSkills) fireEvent.click(moreSkills)
    await waitFor(() => { expect(orderOf(skillPanel).length).toBeGreaterThanOrEqual(5) })
    const skillBaseline = orderOf(skillPanel)
    fireEvent.click(skillPanel.querySelector(`[data-capability="${skillBaseline[2]!}"]`)!)
    expect(orderOf(skillPanel)).toEqual(skillBaseline)
    fireEvent.click(skillPanel.querySelector(`[data-capability="${skillBaseline[4]!}"]`)!)
    expect(orderOf(skillPanel)).toEqual(skillBaseline)
    fireEvent.click(skillPanel.querySelector('[data-capability="all"]')!)
    expect(orderOf(skillPanel)).toEqual(skillBaseline)
  })

})

describe('expert detail dialog layout (t86)', () => {
  const longStarter =
    '帮我看这份销售 CSV 里的异常波动，并给出可能原因与下一步核验建议；请保留原始口径，不要擅自改字段名。'

  beforeEach(() => {
    // jsdom lacks <dialog>.showModal/close; gallery uses native modal for focus/top-layer.
    if (typeof HTMLDialogElement !== 'undefined') {
      HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      }
      HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
        this.removeAttribute('open')
      }
    }
  })

  function detailPayload(overrides: Partial<CatalogDetail['detail']> = {}): CatalogDetail {
    return {
      kind: 'expert',
      id: general.id,
      key: general.key,
      name: general.name,
      summary: general.summary,
      avatarUrl: null,
      linkedSkills: [],
      detail: {
        schemaVersion: 1,
        displayRevision: 1,
        introduction: '我是文案润色专家，擅长改善中文表达。',
        outputs: ['润色后的段落'],
        materials: ['原文草稿'],
        boundaries: ['不写法律意见'],
        starters: [
          { text: '帮我润色这段产品介绍' },
          { text: longStarter },
          { text: '把这份纪要改得更简洁' },
        ],
        ...overrides,
      },
    }
  }

  it('orders intro → starters → collapsed more → primary summon, without hint copy', async () => {
    const startAgent = vi.fn<GalleryFace['startAgent']>(async () => undefined)
    const catalogDetail = vi.fn(async () => detailPayload())
    mount(vi.fn(async () => [general]), startAgent, undefined, undefined, catalogDetail)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '查看详情 文案润色' }))
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    expect(within(dialog).getByRole('heading', { name: '文案润色' })).toBeTruthy()
    expect(within(dialog).getByText('改善中文表达')).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: '专家介绍' })).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: '专家帮你做' })).toBeTruthy()

    const bodyText = dialog.textContent || ''
    const introAt = bodyText.indexOf('专家介绍')
    const startersAt = bodyText.indexOf('专家帮你做')
    const moreAt = bodyText.indexOf('更多说明')
    expect(introAt).toBeGreaterThan(-1)
    expect(startersAt).toBeGreaterThan(introAt)
    expect(moreAt).toBeGreaterThan(startersAt)

    const more = within(dialog).getByText('更多说明').closest('details') as HTMLDetailsElement
    expect(more).toBeTruthy()
    expect(more.open).toBe(false)
    fireEvent.click(within(dialog).getByText('更多说明'))
    expect(more.open).toBe(true)
    expect(within(more).getByText('交付内容')).toBeTruthy()
    expect(within(dialog).getByText('准备资料')).toBeTruthy()
    expect(within(dialog).getByText('使用边界')).toBeTruthy()

    expect(within(dialog).queryByText(/点击一条后关闭详情/)).toBeNull()
    expect(within(dialog).queryByText(/已开放任务上传文本/)).toBeNull()
    expect(within(dialog).queryByText(/Host/)).toBeNull()

    const rows = within(dialog).getAllByRole('listitem')
    expect(rows.length).toBe(3)
    expect(rows[1]?.textContent).toContain(longStarter)
    expect(rows[0]?.className).toMatch(/starterRow/)

    const summon = within(dialog).getByRole('button', { name: '召唤专家' })
    expect(summon.className).toMatch(/detailStartPrimary|primary/)
  })

  it('hides more-details entry when all three blocks are empty', async () => {
    const catalogDetail = vi.fn(async () => detailPayload({ outputs: [], materials: [], boundaries: [] }))
    mount(vi.fn(async () => [general]), undefined, undefined, undefined, catalogDetail)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '查看详情 文案润色' }))
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    expect(within(dialog).queryByText('更多说明')).toBeNull()
  })

  it('clicking a starter row still starts with full text and closes the dialog', async () => {
    const startAgent = vi.fn<GalleryFace['startAgent']>(async () => undefined)
    const catalogDetail = vi.fn(async () => detailPayload())
    mount(vi.fn(async () => [general]), startAgent, undefined, undefined, catalogDetail)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: '查看详情 文案润色' }))
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(within(dialog).getByText(longStarter))
    await waitFor(() => {
      expect(startAgent).toHaveBeenCalledExactlyOnceWith('general', longStarter)
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})

describe('skill detail dialog', () => {
  const question = '请根据附件整理一份不超过十行的项目简报，并列出还缺的资料。'
  const skill: OfficialSkillCard = {
    id: 'skill-1', key: 'brief', name: '简报整理', summary: '把材料整理成简报',
    category: 'common', enabledAt: '2026-11-06T00:00:00.000Z', packageRevision: 2,
    avatarUrl: 'https://example.test/skill.png',
  }

  beforeEach(() => {
    if (typeof HTMLDialogElement !== 'undefined') {
      HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
      HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open') }
    }
  })

  function skillDetail(starters: Array<{ text: string; label?: string }> = [{ text: question, label: '短标签' }]): CatalogDetail {
    return {
      kind: 'skill', id: skill.id, key: skill.key, name: skill.name, summary: skill.summary,
      avatarUrl: skill.avatarUrl ?? null, linkedSkills: [],
      detail: {
        schemaVersion: 1, displayRevision: 1, introduction: '',
        outputs: [], materials: [], boundaries: [], starters,
      },
    }
  }

  it('shows the full question, a primary use button, and no short label or extra hint', async () => {
    const requestSkill = vi.fn<GalleryFace['requestSkill']>(async () => undefined)
    const catalogDetail = vi.fn(async () => skillDetail())
    mount(vi.fn(async () => []), undefined, vi.fn(async () => [skill]), requestSkill, catalogDetail)
    fireEvent.click(screen.getByRole('tab', { name: '技能' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: '查看详情 简报整理' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '查看详情 简报整理' }))
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    expect(within(dialog).getByText(question)).toBeTruthy()
    expect(within(dialog).queryByText('短标签')).toBeNull()
    expect(within(dialog).queryByText('开场白')).toBeNull()
    expect(within(dialog).queryByText(/点击一条后关闭详情/)).toBeNull()
    expect(within(dialog).queryByText(/已开放任务上传文本/)).toBeNull()
    expect(within(dialog).queryByText('更多说明')).toBeNull()
    const use = within(dialog).getByRole('button', { name: '使用技能' })
    expect(use.className).toMatch(/primary/)
    fireEvent.click(within(dialog).getByText(question))
    await waitFor(() => { expect(requestSkill).toHaveBeenCalledExactlyOnceWith(skill.id, question) })
  })

  it('use skill binds without a prefilled question when there are no examples', async () => {
    const requestSkill = vi.fn<GalleryFace['requestSkill']>(async () => undefined)
    mount(vi.fn(async () => []), undefined, vi.fn(async () => [skill]), requestSkill, vi.fn(async () => skillDetail([])))
    fireEvent.click(screen.getByRole('tab', { name: '技能' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: '查看详情 简报整理' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '查看详情 简报整理' }))
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    expect(within(dialog).queryByText('试试这样用')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '使用技能' }))
    await waitFor(() => { expect(requestSkill).toHaveBeenCalledExactlyOnceWith(skill.id, undefined) })
  })
})
