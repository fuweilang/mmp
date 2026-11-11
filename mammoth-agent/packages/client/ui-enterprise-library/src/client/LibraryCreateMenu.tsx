import { useState, type KeyboardEvent } from 'react'
import { Button, Menu, IconFolderCloseRegular, IconLinkOutlineRegular, IconPlusOutlineRegular } from '@mammoth-ai/mmp-client-ui-primitives'
import type { LibraryPanelProps } from './LibraryPanel.tsx'
import css from './LibraryPanel.module.css'

/** Creation capabilities already supported by the library. */
export type LibraryCreateAction = 'folder' | 'link' | 'upload'

/** @param props - Destination label, availability and callback capturing that folder. `prominent` is the labeled nav row; the default is the compact plus. @returns its creation menu. */
export function LibraryCreateMenu({ name, disabled, t, onCreate, prominent = false }: {
  name: string
  disabled: boolean
  t: LibraryPanelProps['t']
  onCreate: (action: LibraryCreateAction) => void
  prominent?: boolean
}) {
  const [open, setOpen] = useState(false)
  const toggle = () => { setOpen(current => !current) }
  const openFromKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
  }
  return <Menu className={prominent ? css.createMenu : undefined} open={open} onClose={() => { setOpen(false) }} portal align={prominent ? 'start' : 'end'} minWidthFromAnchor={prominent} autoFocus
    anchor={prominent
      ? <Button className={css.createEntry} disabled={disabled} aria-label={t('new')} aria-haspopup="menu" aria-expanded={open} onClick={toggle} onKeyDown={openFromKey} icon={<IconPlusOutlineRegular size={16} />}><span>{t('new')}</span></Button>
      : <Button size="sm" className={css.createButton} disabled={disabled} aria-label={`${t('new')} · ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle} onKeyDown={openFromKey}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 3v14M3 10h14" /></svg></Button>}
    items={[
      { id: 'upload', label: t('upload'), icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 13V3m-4 4 4-4 4 4M3 12v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></svg> },
      { id: 'folder', label: t('folder'), icon: <IconFolderCloseRegular size={16} /> },
      { id: 'link', label: t('link'), icon: <IconLinkOutlineRegular size={16} /> },
    ]} onSelect={id => { setOpen(false); onCreate(id as LibraryCreateAction) }} />
}
