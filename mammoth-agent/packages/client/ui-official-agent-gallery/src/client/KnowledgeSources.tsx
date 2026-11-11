import { useEffect, useRef, useState } from 'react';
import { Button } from '@mammoth-ai/mmp-client-ui-primitives';
import css from './KnowledgeSources.module.css';
import type { Translate } from '@mammoth-ai/mmp-client-ui-slots';
import type { OfficialAgentGalleryLocaleKey } from './locales.ts';
import type { ExpertKnowledgeSource } from '@mammoth-ai/mmp-official-agent-gallery/types';

/** Format current structured locators and older plain-text locations without exposing wire JSON. */
function sourceLocation(locator: unknown, t: Translate<OfficialAgentGalleryLocaleKey>): string {
    if (typeof locator === 'string') {
        if (!locator.trim().startsWith('{')) return locator;
        try { locator = JSON.parse(locator); } catch { return ''; }
    }
    if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return '';
    const value = locator as Record<string, unknown>;
    const parts = Array.isArray(value.headingPath) ? value.headingPath.filter((part): part is string => typeof part === 'string' && !!part.trim()) : [];
    if (typeof value.page === 'number') parts.push(t('knowledgePage', { value: value.page }));
    if (typeof value.paragraph === 'number') parts.push(t('knowledgeParagraph', { value: value.paragraph }));
    if (typeof value.rowStart === 'number') parts.push(t('knowledgeRows', { start: value.rowStart, end: typeof value.rowEnd === 'number' ? value.rowEnd : value.rowStart }));
    if (!parts.length && typeof value.sectionId === 'string') parts.push(value.sectionId);
    return parts.join(' › ');
}
/** Source buttons exist only for admitted evidence and keep their original turn/lookup identity. */
export function KnowledgeSources({ sources, open, t, embedded = false }: {
    embedded?: boolean;
    sources: readonly ExpertKnowledgeSource[];
    open: (recordId: string, label: string) => Promise<{
        text: string;
        locator: unknown;
    }>;
    t: Translate<OfficialAgentGalleryLocaleKey>;
}) {
    const [opened, setOpened] = useState<{
        text: string;
        locator: unknown;
    } | null>(null), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), generation = useRef(0);
    useEffect(() => () => { generation.current++; }, []);
    const show = async (source: ExpertKnowledgeSource) => { const request = ++generation.current; setBusy(true); setFailed(false); setOpened(null); try {
        const result = await open(source.recordId, source.label);
        if (request === generation.current)
            setOpened(result);
    }
    catch {
        if (request === generation.current)
            setFailed(true);
    }
    finally {
        if (request === generation.current)
            setBusy(false);
    } };
    if (!sources.length)
        return null;
    return <details className={embedded ? css.embedded : css.sources}>
        <summary>{t('knowledgeSources')}</summary>
        {sources.map(source => <Button className={embedded ? css.source : undefined} key={source.recordId + source.label} variant="ghost" disabled={busy} onClick={() => void show(source)}>
            <span>{`[${source.label}] ${source.title}`}</span>
            <span className={css.location}>{sourceLocation(source.locator, t)}</span>
        </Button>)}
        {failed ? <p role="alert">{t('knowledgeSourceUnavailable')}</p> : null}
        {opened ? <div className={css.opened}><div className={css.location}>{sourceLocation(opened.locator, t)}</div><pre>{opened.text}</pre><Button onClick={() => setOpened(null)}>{t('closeDetails')}</Button></div> : null}
    </details>;
}
