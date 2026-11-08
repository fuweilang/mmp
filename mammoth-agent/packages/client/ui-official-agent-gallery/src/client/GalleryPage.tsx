import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconAppsAddOutlineRegular, IconSearchOutlineRegular, Input } from '@mammoth-ai/mmp-client-ui-primitives';
import type { Translate } from '@mammoth-ai/mmp-client-ui-slots';
import type { CatalogQuery, CatalogFacets, ExpertCatalogPage, SkillCatalogPage, OfficialAgentCard, OfficialSkillCard, CatalogDetail } from '@mammoth-ai/mmp-official-agent-gallery/types';
import type { OfficialAgentGalleryLocaleKey } from './locales.ts';
import { CAPABILITIES, EXPERT_CAPABILITIES, INDUSTRIES } from './skill-facets.ts';
import { CatalogIcon } from './CatalogIcon.tsx';
import css from './GalleryPage.module.css';
export type StartAgentFailure = 'workspaceRequired' | 'startFailed' | 'notGranted' | 'executionUnavailable';
export type StartSkillResult = 'pending' | 'workspaceRequired' | 'startFailed' | 'executionUnavailable' | undefined;
export type GalleryTab = 'experts' | 'skills';
export interface GalleryFace {
    readonly preferences?: (kind:'expert'|'skill',view:'favourites'|'recent') => Promise<readonly {resourceId:string}[]>;
    readonly favourite?: (kind:'expert'|'skill',id:string,value:boolean) => Promise<void>;
    readonly catalogDetail: (kind:'expert'|'skill',id:string) => Promise<CatalogDetail>;
    readonly pageExperts: (query: CatalogQuery) => Promise<ExpertCatalogPage>;
    readonly pageSkills: (query: CatalogQuery) => Promise<SkillCatalogPage>;
    readonly expertFacets: () => Promise<CatalogFacets>;
    readonly skillFacets: () => Promise<CatalogFacets>;
    readonly startAgent: (id: string, draft?: string) => Promise<StartAgentFailure | undefined>;
    readonly requestSkill: (id: string, draft?:string) => Promise<StartSkillResult>;
}
export type GalleryPageProps = GalleryFace & {
    readonly t: Translate<OfficialAgentGalleryLocaleKey>;
};
type Item = OfficialAgentCard | OfficialSkillCard;
type Page = {
    readonly items: readonly Item[];
    readonly total: number;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
};
type PageState = {
    items: Item[];
    total: number;
    hasMore: boolean;
    cursor: string | null;
    loading: boolean;
    error: string | null;
    loaded: boolean;
};
const EMPTY: PageState = { items: [], total: 0, hasMore: false, cursor: null, loading: false, error: null, loaded: false };
/** Both panels stay mounted, preserving their own query, pages and scroll position. */
export function GalleryPage({ t, preferences, favourite, catalogDetail, pageExperts, pageSkills, expertFacets, skillFacets, startAgent, requestSkill }: GalleryPageProps): ReactNode {
    const [favourites,setFavourites]=useState<Set<string>>(new Set()),[favBusy,setFavBusy]=useState<Set<string>>(new Set());
    const favouriteLock=useRef(new Set<string>());
    useEffect(()=>{let active=true;if(preferences)void Promise.all([preferences('expert','favourites'),preferences('skill','favourites')]).then(([experts,skills])=>{if(active)setFavourites(new Set([...experts.map(row=>`expert:${row.resourceId}`),...skills.map(row=>`skill:${row.resourceId}`)]))}).catch(()=>{});return()=>{active=false}},[preferences]);
    const toggleFavourite=async(item:Item)=>{if(!favourite)return;const kind='executionGranted' in item?'expert':'skill',key=`${kind}:${item.id}`;if(favouriteLock.current.has(key))return;favouriteLock.current.add(key);setFavBusy(new Set(favouriteLock.current));try{const value=!favourites.has(key);await favourite(kind,item.id,value);setFavourites(old=>{const next=new Set(old);if(value)next.add(key);else next.delete(key);return next})}catch{setNotice(t('loadFailed'))}finally{favouriteLock.current.delete(key);setFavBusy(new Set(favouriteLock.current))}};
    const favouriteButton=(item:Item)=>{const key=`${'executionGranted'in item?'expert':'skill'}:${item.id}`;return favourite?<Button variant="ghost" size="sm" disabled={favBusy.has(key)} aria-pressed={favourites.has(key)} onClick={()=>{void toggleFavourite(item)}}>{t(favourites.has(key)?'selectorUnfavourite':'selectorFavourite')}</Button>:null};
    const [selected,setSelected]=useState<Item|null>(null);
    const [tab, setTab] = useState<GalleryTab>('experts');
    const [starting, setStarting] = useState<string | undefined>();
    const [notice, setNotice] = useState<string | undefined>();
    const startLock = useRef(false);
    const start = async (item: Item, draft?:string): Promise<void> => {
        if (startLock.current)
            return;
        if ('executionGranted' in item && !item.executionGranted) {
            setNotice(t('notGrantedHint'));
            return;
        }
        startLock.current = true;
        setStarting(item.id);
        setNotice(undefined);
        try {
            if ('executionGranted' in item) {
                const failure = await startAgent(item.id,draft);
                if (failure)
                    setNotice(t(failure === 'notGranted' ? 'notGrantedHint' : failure));
            }
            else {
                const failure = await requestSkill(item.id,draft);
                if (failure)
                    setNotice(failure === 'pending' ? t('skillPending', { skillId: item.id }) : t(failure === 'executionUnavailable' ? 'executionUnavailable' : failure === 'workspaceRequired' ? 'workspaceRequired' : 'skillStartFailed'));
            }
        }
        catch {
            setNotice(t('startFailed'));
        }
        finally {
            startLock.current = false;
            setStarting(undefined);
        }
    };
    const tabKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'experts' : event.key === 'End' ? 'skills' : tab === 'experts' ? 'skills' : 'experts';
        setTab(next);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
    };
    return <main className={css.page}>
  <header className={css.heading}><h1>{t('title')}</h1><p>{t('subtitle')}</p></header>
  <div className={css.tabWrap}><div className={css.tabs} role="tablist" aria-label={t('title')}>
   {(['experts', 'skills'] as const).map(id => <button key={id} id={`gallery-tab-${id}`} type="button" role="tab" data-tab={id} className={`${css.tab} ${tab === id ? css.tabActive : ''}`} aria-controls={`gallery-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onKeyDown={tabKey} onClick={() => { setTab(id); setNotice(undefined); }}>{t(id === 'experts' ? 'tabExperts' : 'tabSkills')}</button>)}
  </div></div>
  <CatalogPanel kind="experts" active={tab === 'experts'} loadPage={pageExperts} loadFacets={expertFacets} starting={starting} onStart={start} onDetail={setSelected} renderFavourite={favouriteButton} t={t}/>
  <CatalogPanel kind="skills" active={tab === 'skills'} loadPage={pageSkills} loadFacets={skillFacets} starting={starting} onStart={start} onDetail={setSelected} renderFavourite={favouriteButton} t={t}/>
  <p className={css.notice}>{t('selectorScopeHint')}</p>
  {selected ? <CatalogDetails key={selected.id} item={selected} load={catalogDetail} onClose={()=>setSelected(null)} onStart={start} busy={starting!==undefined} t={t}/> : null}
  {notice ? <p className={css.notice} role="alert">{notice}</p> : null}
 </main>;
}
function CatalogPanel({ kind, active, loadPage, loadFacets, starting, onStart, onDetail, renderFavourite, t }: {
    readonly kind: GalleryTab;
    readonly active: boolean;
    readonly loadPage: (query: CatalogQuery) => Promise<Page>;
    readonly loadFacets: () => Promise<CatalogFacets>;
    readonly starting: string | undefined;
    readonly onStart: (item: Item) => Promise<void>;
    readonly onDetail:(item:Item)=>void;
    readonly renderFavourite:(item:Item)=>ReactNode;
    readonly t: Translate<OfficialAgentGalleryLocaleKey>;
}): ReactNode {
    const [input, setInput] = useState(''), [query, setQuery] = useState(''), [capability, setCapability] = useState('all'), [industry, setIndustry] = useState('all');
    const [expanded, setExpanded] = useState(false), [visibleCount, setVisibleCount] = useState(5), [refresh, setRefresh] = useState(0);
    const [state, setState] = useState<PageState>(EMPTY), [facets, setFacets] = useState<CatalogFacets | null>(null), [facetError, setFacetError] = useState(false);
    const root = useRef<HTMLDivElement>(null), sentinel = useRef<HTMLDivElement>(null), facetList = useRef<HTMLDivElement>(null), scroll = useRef(0);
    const generation = useRef(0), lock = useRef(false), mounted = useRef(true), activeRef = useRef(active), loadedSignature = useRef(''), facetGeneration = useRef(0), facetsLoaded = useRef(false);
    const current = useRef(state);
    current.current = state;
    activeRef.current = active;
    const signature = JSON.stringify([query, capability, industry, refresh]);
    const labels = kind === 'experts' ? EXPERT_CAPABILITIES : CAPABILITIES;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; facetGeneration.current++; loadedSignature.current = ''; facetsLoaded.current = false; }; }, []);
    useEffect(() => { const timer = window.setTimeout(() => setQuery(input.trim()), 300); return () => window.clearTimeout(timer); }, [input]);
    const fetchFacets = useCallback(async () => {
        const request = ++facetGeneration.current;
        facetsLoaded.current = true;
        setFacetError(false);
        try {
            const value = await loadFacets();
            if (mounted.current && request === facetGeneration.current)
                setFacets(value);
        }
        catch {
            if (mounted.current && request === facetGeneration.current) {
                setFacetError(true);
                facetsLoaded.current = false;
            }
        }
    }, [loadFacets]);
    const fetchPage = useCallback(async (append: boolean) => {
        if (lock.current || !activeRef.current)
            return;
        const previous = current.current;
        if (append && (!previous.hasMore || loadedSignature.current !== signature))
            return;
        lock.current = true;
        const request = generation.current;
        setState(value => ({ ...append ? value : EMPTY, loading: true, error: null }));
        try {
            const result = await loadPage({ q: query, capability, industry, ...append && previous.cursor ? { cursor: previous.cursor } : {} });
            if (!mounted.current || request !== generation.current)
                return;
            setState(value => {
                const seen = new Set<string>();
                const items = [...append ? value.items : [], ...result.items].filter(item => { if (seen.has(item.id))
                    return false; seen.add(item.id); return true; });
                return { items, total: result.total, hasMore: result.hasMore, cursor: result.nextCursor, loading: false, error: null, loaded: true };
            });
        }
        catch (error) {
            if (mounted.current && request === generation.current)
                setState(value => ({ ...value, loading: false, error: error instanceof Error ? error.message : String(error) }));
        }
        finally {
            if (request === generation.current)
                lock.current = false;
        }
    }, [query, capability, industry, signature, loadPage]);
    useEffect(() => {
        if (!active)
            return;
        if (!facetsLoaded.current)
            void fetchFacets();
        if (loadedSignature.current !== signature) {
            generation.current++;
            lock.current = false;
            loadedSignature.current = signature;
            scroll.current = 0;
            if (root.current)
                root.current.scrollTop = 0;
            void fetchPage(false);
        }
    }, [active, signature, fetchPage, fetchFacets]);
    useLayoutEffect(() => { if (active && root.current)
        root.current.scrollTop = scroll.current; }, [active]);
    useEffect(() => {
        if (!active || !sentinel.current || !root.current || !state.hasMore || state.loading || state.error || typeof IntersectionObserver === 'undefined')
            return;
        const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting))
            void fetchPage(true); }, { root: root.current, rootMargin: '160px 0px', threshold: 0 });
        observer.observe(sentinel.current);
        return () => observer.disconnect();
    }, [active, state.hasMore, state.cursor, state.loading, state.error, fetchPage]);
    useLayoutEffect(() => {
        const element = facetList.current;
        if (!active || !element)
            return;
        const resize = () => setVisibleCount(Math.max(1, Math.floor(element.clientWidth / 150) * 2 - 1));
        resize();
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [active, facets]);
    const available = useMemo(() => labels.map(label => ({ ...label, count: facets?.capabilities.find(item => item.id === label.id)?.count ?? 0 })).filter(item => item.count > 0), [facets, labels]);
    const shown = expanded ? available : [...available.filter(item => item.id === capability), ...available.filter(item => item.id !== capability)].slice(0, visibleCount);
    const industries = INDUSTRIES.map(label => ({ ...label, count: facets?.industries.find(item => item.id === label.id)?.count ?? 0 })).filter(item => item.count > 0);
    const filtered = Boolean(input.trim() || query || capability !== 'all' || industry !== 'all');
    const clear = (): void => { setInput(''); setQuery(''); setCapability('all'); setIndustry('all'); };
    const chipKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')
            return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[data-capability]') ?? []);
        const index = buttons.indexOf(event.currentTarget);
        const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
        if (next) {
            next.focus();
        }
    };
    return <div className={css.panel} hidden={!active} id={`gallery-panel-${kind}`} role="tabpanel" aria-labelledby={`gallery-tab-${kind}`} ref={root} onScroll={event => { if (activeRef.current)
        scroll.current = event.currentTarget.scrollTop; }}>
  <section className={css.content}>
   <div className={css.searchRow}>
    <Input className={css.search as string} type="search" maxLength={200} value={input} icon={<IconSearchOutlineRegular size={16}/>} placeholder={t(kind === 'experts' ? 'searchExpertsHint' : 'searchSkillsHint')} aria-label={t(kind === 'experts' ? 'searchExperts' : 'searchSkills')} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter')
        setQuery(input.trim()); }}/>
    {industries.length ? <label className={css.industryField}><span>{t('industryLabel')}</span><select value={industry} onChange={event => setIndustry(event.target.value)}><option value="all">{t('allIndustries')}</option>{industries.map(item => <option key={item.id} value={item.id}>{t(item.label)} · {item.count}</option>)}</select></label> : null}
    <Button variant="ghost" size="sm" disabled={state.loading} onClick={() => { setRefresh(value => value + 1); void fetchFacets(); }}>{t('refresh')}</Button>
   </div>
   {available.length ? <div className={css.filters}><span className={css.filterLabel}>{t('capabilityLabel')}</span><div className={css.facetList} ref={facetList} role="group" aria-label={t('capabilityLabel')}>
    <button type="button" className={`${css.chip} ${capability === 'all' ? css.chipActive : ''}`} aria-pressed={capability === 'all'} data-capability="all" onKeyDown={chipKey} onClick={() => setCapability('all')}>{t('categoryAll')}<span>{facets?.total ?? 0}</span></button>
    {shown.map(item => <button key={item.id} type="button" className={`${css.chip} ${capability === item.id ? css.chipActive : ''}`} aria-pressed={capability === item.id} data-capability={item.id} onKeyDown={chipKey} onClick={() => setCapability(item.id)}><span className={css.chipText}>{t(item.label)}</span><span>{item.count}</span></button>)}
   </div>{available.length > visibleCount ? <button className={`${css.chip} ${css.more}`} type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'lessCapabilities' : 'moreCapabilities')}</button> : null}</div> : null}
   {facetError ? <p className={css.feedback}>{t('facetFailed')} <button type="button" onClick={() => { void fetchFacets(); }}>{t('retry')}</button></p> : null}
   <div className={css.resultBar}><p role="status" aria-live="polite">{state.loaded ? t(kind === 'experts' ? 'expertsFound' : 'skillsFound', { count: String(state.total) }) : t(kind === 'experts' ? 'loadingExperts' : 'loadingSkills')}</p>{filtered ? <Button variant="ghost" size="sm" onClick={clear}>{t('clearSkillFilters')}</Button> : null}</div>
   {!state.loaded && state.loading ? <ul className={`${css.cards} ${kind === 'skills' ? css.skillCards : ''}`} aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <li key={index} className={`${css.card} ${css.skeleton}`}><span /><span /><span /></li>)}</ul> : null}
   {state.items.length ? <ul className={`${css.cards} ${kind === 'skills' ? css.skillCards : ''}`}>
    {state.items.map(item => {
                const primary = labels.find(label => label.id === item.discovery?.capability);
                const domain = INDUSTRIES.find(label => item.discovery?.industries.includes(label.id));
                const expert = 'executionGranted' in item ? item : undefined;
                const isStarting = starting === item.id;
                return <li key={item.id} className={css.card} data-catalog-key={item.key}>
      <button type="button" className={`${css.cardAction} ${expert ? css.expertAction : css.skillAction}`} disabled={starting !== undefined} aria-busy={isStarting} aria-label={`${t('viewDetails')} ${item.name}`} aria-describedby={`catalog-summary-${kind}-${item.id}`} onClick={() => { onDetail(item); }}>
       <span className={css.cardBody}><CatalogIcon catalogKey={item.key} kind={primary?.icon ?? (expert ? 'case' : 'file')} src={item.avatarUrl}/><span className={css.cardText}><span className={css.cardTitle} title={item.name}>{item.name}</span>{expert ? <span id={`catalog-summary-${kind}-${item.id}`} className={css.expertSummary} title={item.summary}>{item.summary}</span> : null}</span></span>
       {!expert ? <span id={`catalog-summary-${kind}-${item.id}`} className={css.skillSummary}>{item.summary.trim() && !/^[- >|]+$/.test(item.summary.trim()) ? item.summary : t('skillSummaryMissing')}</span> : null}
       <span className={css.cardFooter}><span className={css.tags}>{primary ? <span className={css.tag}>{t(primary.label)}</span> : null}{domain ? <span className={css.tag}>{t(domain.label)}</span> : null}</span></span>
      </button>
      <div className={css.directStart}><Button variant="outline" size="sm" disabled={starting!==undefined} onClick={()=>{void onStart(item);}}>{t(isStarting?'starting':expert?'start':'useSkill')}</Button>{renderFavourite(item)}</div>
      {expert?.linkedSkills?.length ? <details className={css.expertSkills} onClick={event => event.stopPropagation()}><summary>{t('linkedSkillsCount', { count: String(expert.linkedSkills.length) })}</summary><ul>{expert.linkedSkills.map(skill => <li key={skill.id}><strong>{skill.name}</strong><span>{skill.summary}</span></li>)}</ul></details> : null}
     </li>;
            })}
   </ul> : null}
   {state.loaded && !state.items.length && !state.error ? <div className={css.empty}><IconAppsAddOutlineRegular size={30}/><p>{t(filtered ? (kind === 'experts' ? 'noMatchExperts' : 'noMatchSkills') : (kind === 'experts' ? 'emptyExperts' : 'emptySkills'))}</p>{filtered ? <Button variant="outline" size="sm" onClick={clear}>{t('clearSkillFilters')}</Button> : null}</div> : null}
   {state.error ? <div className={css.feedback} role="alert"><span>{t(/401|unauthor|未登录|sign-?in|login/i.test(state.error) ? 'loadFailedAuth' : 'loadFailed')}</span><Button variant="outline" size="sm" onClick={() => { void fetchPage(state.items.length > 0); }}>{t('retry')}</Button></div> : null}
   <div ref={sentinel} className={css.sentinel} aria-hidden="true"/>
   <div className={css.pageFooter}>
    {state.loading && state.items.length ? <p role="status">{t('loadingMore')}</p> : state.hasMore && !state.error ? <Button variant="outline" size="sm" onClick={() => { void fetchPage(true); }}>{t('loadMore')}</Button> : state.loaded && state.items.length && !state.error ? <p role="status">{t('catalogEnd')}</p> : null}
   </div>
  </section>
 </div>;
}

function CatalogDetails({item,load,onClose,onStart,busy,t}:{readonly item:Item;readonly load:(kind:'expert'|'skill',id:string)=>Promise<CatalogDetail>;readonly onClose:()=>void;readonly onStart:(item:Item,draft?:string)=>Promise<void>;readonly busy:boolean;readonly t:Translate<OfficialAgentGalleryLocaleKey>}):ReactNode {
 const dialog=useRef<HTMLDialogElement>(null),backdropDown=useRef(false);const [data,setData]=useState<CatalogDetail|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[draft,setDraft]=useState('');
 const kind='executionGranted' in item?'expert':'skill';
 // Native showModal keeps the card in the top layer (not the gallery stacking context),
 // owns inert/focus/ESC semantics; lock page scroll without replacing shared modal infrastructure.
 useEffect(()=>{
   const node=dialog.current;if(!node)return;
   const document=node.ownerDocument,previous=document.activeElement;
   const htmlOverflow=document.documentElement.style.overflow,bodyOverflow=document.body.style.overflow;
   document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';
   try{if(!node.open)node.showModal();}catch(error){document.documentElement.style.overflow=htmlOverflow;document.body.style.overflow=bodyOverflow;throw error;}
   return()=>{node.close();document.documentElement.style.overflow=htmlOverflow;document.body.style.overflow=bodyOverflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{let alive=true;setError(false);setData(null);void load(kind,item.id).then(value=>{if(alive)setData(value);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[kind,item.id,load,retry]);
 const details=data?.detail;
 const outside=(node:HTMLDialogElement,x:number,y:number):boolean=>{const rect=node.getBoundingClientRect();return x<rect.left||x>rect.right||y<rect.top||y>rect.bottom;};
 return <dialog ref={dialog} className={css.detailDialog} role="dialog" aria-labelledby="catalog-detail-heading" aria-modal="true" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}
   onPointerDown={event=>{backdropDown.current=event.target===event.currentTarget&&outside(event.currentTarget,event.clientX,event.clientY);}}
   onPointerCancel={()=>{backdropDown.current=false;}}
   onClick={event=>{const dismiss=backdropDown.current&&event.target===event.currentTarget&&outside(event.currentTarget,event.clientX,event.clientY);backdropDown.current=false;if(dismiss&&!busy)onClose();}}>
   <header className={css.detailHeader}><CatalogIcon catalogKey={item.key} kind={kind==='expert'?'case':'file'} src={data?.avatarUrl??item.avatarUrl}/><h2 id="catalog-detail-heading">{data?.name??item.name}</h2><Button variant="ghost" size="sm" disabled={busy} aria-label={t('closeDetails')} onClick={onClose}>{t('closeDetails')}</Button></header>
   <div className={css.detailBody} aria-busy={!data&&!error}>
   {error?<p className={css.detailFeedback} role="alert">{t('loadFailed')} <Button variant="outline" size="sm" onClick={()=>setRetry(v=>v+1)}>{t('retry')}</Button></p>:!data?<p className={css.detailFeedback} role="status">{t('loadingDetails')}</p>:<>
   <p className={css.detailSummary}>{data.summary}</p>
   {details?.introduction?<section className={css.detailSection}><h3>{t('introductionLabel')}</h3><p>{details.introduction}</p></section>:null}
   {(['outputs','materials','boundaries'] as const).map(field=>details?.[field].length?<section className={css.detailSection} key={field}><h3>{t(field==='outputs'?'outputsLabel':field==='materials'?'materialsLabel':'boundariesLabel')}</h3><ul>{details[field].map((text,index)=><li key={index}>{text}</li>)}</ul></section>:null)}
   {data.linkedSkills.length?<section className={css.detailSection}><h3>{t('linkedSkillsCount',{count:String(data.linkedSkills.length)})}</h3><ul>{data.linkedSkills.map(skill=><li key={skill.id}><strong>{skill.name}</strong> · {skill.summary}</li>)}</ul></section>:null}
   {details?.starters.length?<section className={css.detailSection}><h3>{t('startersLabel')}</h3><div className={css.starters}>{details.starters.map((starter,index)=><Button key={index} variant="outline" size="sm" onClick={()=>setDraft(current=>current.trim()?current:starter.text)}>{starter.label}</Button>)}</div><p className={css.detailHint}>{t('starterHint')}</p><textarea className={css.detailDraft} aria-label={t('starterDraft')} value={draft} maxLength={2000} rows={3} onChange={event=>setDraft(event.target.value)} /></section>:null}
   </>}
   <p className={css.detailHint}>{t('executionUnavailable')}</p>
   </div>
   <footer className={css.detailActions}><Button variant="outline" size="sm" disabled={busy||!data||error} onClick={()=>{void onStart(item,draft||undefined);}}>{t(busy?'starting':kind==='expert'?'start':'useSkill')}</Button></footer>
 </dialog>;
}
