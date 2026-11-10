import { useState } from 'react'
import { Button, Menu } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryPanelProps } from './LibraryPanel.tsx'
import type { LibraryChoice } from './selection.ts'
import { choiceBlock } from './selection.ts'
import type { LibraryView } from './api.ts'
import css from './LibraryPanel.module.css'

/** @param props - authorized item, selected category, busy state and operation callback. @returns the permitted item menu. */
export function RowActions({ item, view, busy, t, onAction }: { item: LibraryChoice; view: LibraryView; busy: boolean; t: LibraryPanelProps['t']; onAction: (action: string, item: LibraryChoice) => void }) {
  const [open, setOpen] = useState(false)
  const entries = view === 'trash'
    ? (item.canManage ? [{ id: 'restore', label: t('restore') }, { id: 'purge', label: t('purge'), danger: true }] : [])
    : [
      ...(item.kind !== 'FOLDER' ? [{ id: 'preview', label: t('preview') }] : []),
      ...(item.kind === 'FILE' ? [{ id: 'use', label: t('useForChat'), disabled: choiceBlock(item).disabled }, { id: 'download', label: t('download') }, { id: 'versions', label: t('versions') }] : []),
      ...(item.canManage ? [{ id: 'rename', label: t('rename') }, { id: 'move', label: t('move') },
        ...(item.kind === 'FILE' ? [{ id: 'replace', label: t('replace') }, ...(item.parseStatus === 'FAILED' ? [{ id: 'retry', label: t('retry') }] : [])] : []),
        { id: 'scope', label: t(item.scope === 'ENTERPRISE' ? 'unshare' : 'share') }, { id: 'recycle', label: t('recycle'), danger: true }] : []),
    ]
  return <Menu open={open} onClose={() => { setOpen(false) }} portal align="end" autoFocus
    anchor={<Button size="sm" disabled={busy || !entries.length} aria-label={`${t('more')} · ${item.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open) }}><span className={css.moreGlyph} aria-hidden="true">⋯</span></Button>}
    items={entries} onSelect={action => { setOpen(false); onAction(action, item) }} />
}

