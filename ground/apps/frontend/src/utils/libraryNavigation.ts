import type { LibraryView } from '../api/library';

/** Console classification only. Every destination stays inside the existing AppShell. */
export const consoleLibraryViews = [
  { id: 'recent', label: '最近使用', path: '/console/library/recent' },
  { id: 'mine', label: '我的资料', path: '/console/library/mine' },
  { id: 'shared', label: '企业共享', path: '/console/library/shared' },
  { id: 'trash', label: '回收站', path: '/console/library/trash' },
] as const satisfies readonly { id: LibraryView; label: string; path: string }[];

export function consoleLibraryView(path: string): LibraryView {
  return consoleLibraryViews.find(item => item.path === path)?.id ?? 'mine';
}

/** Old entry points keep filters/hash, but can never choose an arbitrary destination. */
export function consoleLibraryEntry(view: unknown): string {
  return consoleLibraryViews.find(item => item.id === view)?.path ?? '/console/library/mine';
}
