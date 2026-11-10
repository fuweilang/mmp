import type { LibraryView } from '../api/library';

/** Console classification only. Every destination stays inside the existing AppShell. */
export const consoleLibraryViews = [
  { id: 'recent', label: '最近使用', path: '/console/library/recent' },
  { id: 'mine', label: '我的资料', path: '/console/library/mine' },
  { id: 'shared', label: '企业共享', path: '/console/library/shared' },
  { id: 'trash', label: '回收站', path: '/console/library/trash' },
] as const satisfies readonly { id: LibraryView; label: string; path: string }[];

/** 企业管理员单独入口。普通成员的四个页面不包含它。 */
export const memberLibraryView = { id: 'members', label: '成员资料', path: '/console/library/members' } as const satisfies { id: LibraryView; label: string; path: string };

export function consoleLibraryNav(role: string | null | undefined) {
  if (role === 'ADMIN' || role === 'OWNER') return [...consoleLibraryViews, memberLibraryView];
  return [...consoleLibraryViews];
}

export function consoleLibraryView(path: string): LibraryView {
  if (path === memberLibraryView.path) return 'members';
  return consoleLibraryViews.find(item => item.path === path)?.id ?? 'mine';
}

/** Old entry points keep filters/hash, but can never choose an arbitrary destination. */
export function consoleLibraryEntry(view: unknown): string {
  return consoleLibraryViews.find(item => item.id === view)?.path ?? '/console/library/mine';
}

/** 左侧资料菜单每次都打开这一页的第一项：不带文件夹、成员或搜索。 */
export function consoleLibraryMenuTarget(path: string) {
  return { path };
}
