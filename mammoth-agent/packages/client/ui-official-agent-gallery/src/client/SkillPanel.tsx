import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, IconAppsAddOutlineRegular, IconSearchOutlineRegular, Input } from '@mammoth-ai/mmp-client-ui-primitives'
import type { Translate } from '@mammoth-ai/mmp-client-ui-slots'
import type { OfficialSkillCard } from '@mammoth-ai/mmp-official-agent-gallery/types'
import type { OfficialAgentGalleryLocaleKey } from './locales.ts'
import { CAPABILITIES, INDUSTRIES, discoveryFor, type Capability, type Industry } from './skill-facets.ts'
import css from './SkillPanel.module.css'

interface SkillPanelProps {
  readonly skills: readonly OfficialSkillCard[]
  readonly status: 'loading' | 'ready' | 'error'
  readonly authError: boolean
  readonly starting: string | undefined
  readonly onUseSkill: (id: string) => Promise<void>
  readonly onReload: () => Promise<void>
  readonly t: Translate<OfficialAgentGalleryLocaleKey>
}

/** Discovery only. Card activation delegates to the existing new-session path. */
export function SkillPanel({ skills, status, authError, starting, onUseSkill, onReload, t }: SkillPanelProps): ReactNode {
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [capability, setCapability] = useState<Capability | 'all'>('all')
  const [industry, setIndustry] = useState<Industry | 'all'>('all')
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(queryInput) }, 300)
    return () => { window.clearTimeout(timer) }
  }, [queryInput])

  const entries = useMemo(() => skills.map(skill => ({ skill, discovery: discoveryFor(skill) })), [skills])
  const counts = useMemo(() => {
    const capabilities = new Map<Capability, number>()
    const industries = new Map<Industry, number>()
    for (const { discovery } of entries) {
      capabilities.set(discovery.capability, (capabilities.get(discovery.capability) ?? 0) + 1)
      for (const id of discovery.industries) industries.set(id, (industries.get(id) ?? 0) + 1)
    }
    return { capabilities, industries }
  }, [entries])
  const availableCapabilities = CAPABILITIES.filter(item => (counts.capabilities.get(item.id) ?? 0) > 0)
  const availableIndustries = INDUSTRIES.filter(item => (counts.industries.get(item.id) ?? 0) > 0)
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    return entries.filter(({ skill, discovery }) => {
      if (capability !== 'all' && discovery.capability !== capability) return false
      if (industry !== 'all' && !discovery.industries.includes(industry)) return false
      if (text === '') return true
      const capabilityName = CAPABILITIES.find(item => item.id === discovery.capability)
      const industryNames = INDUSTRIES.filter(item => discovery.industries.includes(item.id)).map(item => t(item.label)).join(' ')
      return `${skill.name} ${skill.summary} ${skill.key} ${capabilityName ? t(capabilityName.label) : ''} ${industryNames}`.toLocaleLowerCase().includes(text)
    })
  }, [entries, capability, industry, query, t])
  const hasFilters = queryInput.trim() !== '' || capability !== 'all' || industry !== 'all'
  const clear = (): void => {
    setQueryInput('')
    setQuery('')
    setCapability('all')
    setIndustry('all')
  }
  const onCapabilityKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button[data-capability]')]
      .filter(button => button.getClientRects().length > 0)
    const index = buttons.indexOf(event.currentTarget)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    const target = buttons[next]
    if (!target) return
    event.preventDefault()
    target.focus()
    setCapability(target.dataset.capability as Capability | 'all')
  }

  return (
    <section className={css.panel} aria-label={t('tabSkills')}>
      <div className={css.searchRow}>
        <Input className={css.search as string} type="search" value={queryInput}
          icon={<IconSearchOutlineRegular size={16} />} placeholder={t('searchSkillsHint')} aria-label={t('searchSkills')}
          onChange={event => { setQueryInput(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') setQuery(queryInput) }} />
        <label className={css.industryField}>
          <span>{t('industryLabel')}</span>
          <select value={industry} onChange={event => { setIndustry(event.target.value as Industry | 'all') }} disabled={status === 'loading' && skills.length === 0}>
            <option value="all">{t('allIndustries')}</option>
            {availableIndustries.map(item => <option key={item.id} value={item.id}>{t(item.label)} · {counts.industries.get(item.id)}</option>)}
          </select>
        </label>
      </div>

      {status === 'ready' && skills.length > 0 ? (
        <div className={css.capabilities}>
          <span className={css.filterLabel}>{t('capabilityLabel')}</span>
          <div className={`${css.capabilityGrid} ${expanded ? '' : css.collapsed}`} role="group" aria-label={t('capabilityLabel')}>
            <CapabilityChip id="all" active={capability === 'all'} label={t('categoryAll')} count={skills.length} select={setCapability} onKeyDown={onCapabilityKeyDown} />
            {availableCapabilities.map(item => <CapabilityChip key={item.id} id={item.id} active={capability === item.id} label={t(item.label)} count={counts.capabilities.get(item.id) ?? 0} select={setCapability} onKeyDown={onCapabilityKeyDown} />)}
            {availableCapabilities.length > 4 ? <button type="button" className={`${css.facetChip} ${css.more}`} aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>{t(expanded ? 'lessCapabilities' : 'moreCapabilities')}</button> : null}
          </div>
        </div>
      ) : null}

      {status === 'ready' ? <div className={css.resultBar}>
        <p role="status" aria-live="polite">{t('skillsFound', { count: String(filtered.length) })}{capability !== 'all' ? ` · ${t(CAPABILITIES.find(item => item.id === capability)!.label)}` : ''}</p>
        {hasFilters ? <Button variant="ghost" size="sm" onClick={clear}>{t('clearSkillFilters')}</Button> : null}
      </div> : null}

      {status === 'loading' ? <>
        <p className={css.feedback} role="status">{t('loadingSkills')}</p>
        <ul className={css.cards} aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <li key={index} className={`${css.skeleton} ${css.card}`}><span className={css.cardTop}><span className={css.skeletonIcon} /><span className={css.skeletonTitle} /></span><span className={css.skeletonCopy}><span className={css.skeletonLine} /><span className={css.skeletonLine} /></span><span className={css.skeletonTag} /></li>)}</ul>
      </> : null}
      {status === 'error' ? <div className={css.empty} role="alert"><p>{t(authError ? 'loadFailedAuth' : 'loadFailed')}</p><Button variant="outline" size="sm" onClick={() => { void onReload() }}>{t('retry')}</Button></div> : null}
      {status === 'ready' && filtered.length === 0 ? <div className={css.empty}><IconAppsAddOutlineRegular size={32} /><p>{t(skills.length === 0 ? 'emptySkills' : 'noMatchSkills')}</p>{hasFilters ? <Button variant="outline" size="sm" onClick={clear}>{t('clearSkillFilters')}</Button> : null}</div> : null}
      {status === 'ready' && filtered.length > 0 ? <ul className={css.cards}>
        {filtered.map(({ skill, discovery }) => {
          const primary = CAPABILITIES.find(item => item.id === discovery.capability)!
          const domain = INDUSTRIES.find(item => item.id === discovery.industries[0])
          const isStarting = starting === skill.id
          return <li key={skill.id}>
            <button type="button" className={css.card} disabled={starting !== undefined} aria-busy={isStarting}
              aria-label={`${t('useSkill')} ${skill.name}`} data-skill-id={skill.id} data-skill-key={skill.key}
              onClick={() => { void onUseSkill(skill.id) }}>
              <span className={css.cardTop}><SkillIcon kind={primary.icon} /><span className={css.cardTitle} title={skill.name}>{skill.name}</span></span>
              <span className={css.summary}>{skill.summary.trim() && !/^[- >|]+$/.test(skill.summary.trim()) ? skill.summary : t('skillSummaryMissing')}</span>
              <span className={css.cardFooter}><span className={css.tag}>{t(primary.label)}</span>{domain ? <span className={css.industryTag}>{t(domain.label)}</span> : null}{isStarting ? <span className={css.starting} role="status">{t('skillStarting')}</span> : null}</span>
            </button>
          </li>
        })}
      </ul> : null}
    </section>
  )
}

function CapabilityChip({ id, active, label, count, select, onKeyDown }: {
  readonly id: Capability | 'all'; readonly active: boolean; readonly label: string; readonly count: number
  readonly select: (id: Capability | 'all') => void; readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}): ReactNode {
  return <button type="button" className={`${css.facetChip} ${active ? css.facetActive : ''}`} data-capability={id} aria-pressed={active} onClick={() => { select(id) }} onKeyDown={onKeyDown}><span>{label}</span><span className={css.count}>{count}</span></button>
}

function SkillIcon({ kind }: { readonly kind: string }): ReactNode {
  const paths: Record<string, ReactNode> = {
    code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /></>,
    file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 12h8M8 16h6" /></>,
    chart: <><path d="M4 4v16h16M8 16v-5m4 5V7m4 9v-7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    design: <><path d="m12 3 9 9-9 9-9-9zM12 3v18M3 12h18" /></>,
    video: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" /></>,
    plan: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M9 3v3m6-3v3M8 11l1 1 2-2m2 1h3m-8 6 1 1 2-2m2 1h3" /></>,
  }
  return <span className={css.artwork} aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[kind] ?? paths.plan}</svg></span>
}
