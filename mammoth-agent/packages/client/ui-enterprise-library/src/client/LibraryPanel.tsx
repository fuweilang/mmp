import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-layout/client'
import { fetchLibraryItems, type LibraryFetch, type LibraryView } from './api.ts'
import { choiceBlock, type LibraryChoice } from './selection.ts'
import css from './LibraryPanel.module.css'

export type LibraryPanelInjected = {
  readonly origin: string
  readonly fetchImpl: LibraryFetch
  readonly onUse: (item: LibraryChoice) => void
}

export type LibraryPanelProps =
  PropsRuntime<'main'> & PropsLocale<'enterpriseLibrary'> & InjectFace<LibraryPanelInjected>

const VIEWS: readonly LibraryView[] = ['recent', 'mine', 'shared', 'trash']

/**
 * Library browser in the main column. It reads the cloud library and does not
 * keep a second copy.
 * @param props - locale, loader, and the composer attach callback.
 * @returns the library page.
 */
export function LibraryPanel({ t, origin, fetchImpl, onUse }: LibraryPanelProps) {
  const [view, setView] = useState<LibraryView>('mine')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<readonly LibraryChoice[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const control = new AbortController()
    void fetchLibraryItems(origin, view, query, fetchImpl, control.signal).then((next) => {
      if (!control.signal.aborted) {
        setItems(next)
        setError('')
      }
    }).catch(() => {
      if (!control.signal.aborted) setError(t('loadError'))
    })
    return () => { control.abort() }
  }, [origin, view, query, fetchImpl, t])
  return <section className={css.page}>
    <div className={css.views}>
      {VIEWS.map(id => <button key={id} type="button" aria-pressed={view === id} onClick={() => { setView(id) }}>{t(id)}</button>)}
    </div>
    <input aria-label={t('searchPlaceholder')} value={query} placeholder={t('searchPlaceholder')} onChange={(event) => { setQuery(event.target.value) }} />
    {error ? <p className={css.error}>{error}</p> : null}
    {items.length === 0 ? <p className={css.muted}>{query ? t('noResults') : t('empty')}</p> : null}
    <ul>
      {items.map((item) => {
        const block = choiceBlock(item)
        return <li key={item.nodeId} className={css.row}>
          <span>{item.name}</span>
          <button type="button" disabled={block.disabled} onClick={() => { onUse(item) }}>
            {block.disabled ? t('unready') : t('useForChat')}
          </button>
        </li>
      })}
    </ul>
    <p className={css.muted}>{t('localDraft')}</p>
  </section>
}
