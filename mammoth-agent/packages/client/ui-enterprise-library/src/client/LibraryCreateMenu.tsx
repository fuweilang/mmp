import { useState } from 'react'
import { Button, Menu, IconFolderCloseRegular, IconLinkOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryPanelProps } from './LibraryPanel.tsx'
import css from './LibraryPanel.module.css'

/** Creation capabilities already supported by the library. */
export type LibraryCreateAction = 'folder' | 'link' | 'upload'

/** @param props - Destination label, availability and callback capturing that folder. @returns its creation menu. */
export function LibraryCreateMenu({ name, disabled, t, onCreate }: {
  name: string
  disabled: boolean
  t: LibraryPanelProps['t']
  onCreate: (action: LibraryCreateAction) => void
}) {
  const [open, setOpen] = useState(false)
  return <Menu open={open} onClose={() => { setOpen(false) }} portal align="end" autoFocus
    anchor={<Button size="sm" className={css.createButton} disabled={disabled} aria-label={`${t('new')} · ${name}`} aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setOpen(!open) }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 3v14M3 10h14" /></svg></Button>}
    items={[
      { id: 'folder', label: t('folder'), icon: <IconFolderCloseRegular size={16} /> },
      { id: 'link', label: t('link'), icon: <IconLinkOutlineRegular size={16} /> },
      { id: 'upload', label: t('upload'), icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 13V3m-4 4 4-4 4 4M3 12v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></svg> },
    ]} onSelect={id => { setOpen(false); onCreate(id as LibraryCreateAction) }} />
}
