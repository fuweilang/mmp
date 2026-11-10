/** Console presentation only. Terminal directory queries remain unchanged. */
export function libraryListLocation(view: string, parentId: string | null, searching = false) {
  if (view === 'recent' || view === 'trash') return { flat: false, parentId: null };
  if ((view === 'mine' || view === 'members') && searching) return { flat: true, parentId: null };
  return { flat: false, parentId };
}

export type LibraryTreeNode = { id: string; label: string; scope: 'PRIVATE' | 'ENTERPRISE'; children: LibraryTreeNode[] };

/** Folders nested by parent. Pass a scope to keep one side; null keeps every folder in the list. Ids in `blocked` are left out; the caller includes descendants. */
export function libraryFolderTree(folders: readonly { id: string; name: string; parentId?: string | null; scope: 'PRIVATE' | 'ENTERPRISE' }[], scope: 'PRIVATE' | 'ENTERPRISE' | null = null, blocked: ReadonlySet<string> = new Set()): LibraryTreeNode[] {
  const visible = folders.filter((folder) => (scope === null || folder.scope === scope) && !blocked.has(folder.id));
  const nodes = new Map(visible.map((folder) => [folder.id, { id: folder.id, label: folder.name, scope: folder.scope, children: [] as LibraryTreeNode[] }]));
  const roots: LibraryTreeNode[] = [];
  for (const folder of visible) {
    const node = nodes.get(folder.id)!;
    const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (list: LibraryTreeNode[]) => {
    list.sort((a, b) => a.label.localeCompare(b.label, 'zh'));
    for (const node of list) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

export function libraryFolderLabel(folder: { id: string; name: string; parentId?: string | null; parentPath?: readonly { name: string }[]; scope: 'PRIVATE' | 'ENTERPRISE' }, folders: readonly { id: string; name: string; parentId?: string | null }[]) {
  const root = folder.scope === 'ENTERPRISE' ? '企业共享' : '我的资料';
  if (folder.parentPath?.length) return `${root} / ${folder.parentPath.map(part => part.name).join(' / ')} / ${folder.name}`;
  const byId = new Map(folders.map(item => [item.id, item]));
  const names = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    names.unshift(parent.name);
    parentId = parent.parentId ?? null;
  }
  return `${root} / ${names.join(' / ')}`;
}

export const libraryFileTypeOptions = [
  { value: 'folder', label: '文件夹', color: '#C58A12' },
  { value: 'link', label: '链接', color: '#7C3AED' },
  { value: 'image', label: '图片', color: '#0284C7' },
  { value: 'video', label: '视频', color: '#DB2777' },
  { value: 'pdf', label: 'PDF', color: '#DC2626' },
  { value: 'word', label: 'Word', color: '#2563EB' },
  { value: 'excel', label: 'Excel', color: '#16A34A' },
  { value: 'ppt', label: 'PPT', color: '#EA580C' },
  { value: 'text', label: '文本', color: '#0891B2' },
  { value: 'other', label: '其他', color: '#78716C' },
] as const;

export function libraryFileTypeColor(label: string) {
  return libraryFileTypeOptions.find((option) => option.label === label)?.color ?? '#78716C';
}

/** Filter values and the table column share these four labels. */
export const libraryParseStatusOptions = [
  { value: 'ready', label: '可供 AI 引用', color: '#16A34A' },
  { value: 'download', label: '仅保存', color: '#0284C7' },
  { value: 'processing', label: '处理中', color: '#D97706' },
  { value: 'failed', label: '失败', color: '#DC2626' },
] as const;

const libraryParseStatusByCode: Record<string, (typeof libraryParseStatusOptions)[number]> = {
  READY: libraryParseStatusOptions[0],
  DOWNLOAD_ONLY: libraryParseStatusOptions[1],
  PENDING: libraryParseStatusOptions[2],
  PROCESSING: libraryParseStatusOptions[2],
  FAILED: libraryParseStatusOptions[3],
};

export function libraryParseStatusOption(status: string) {
  return libraryParseStatusByCode[status];
}

/** Use server-recorded kind and version MIME; never infer a type from the displayed filename. */
export function libraryFileType(item: { kind: string; currentVersion?: { mimeType?: string } | null }): string {
  if (item.kind === 'FOLDER') return '文件夹';
  if (item.kind === 'LINK') return '链接';
  const mime = item.currentVersion?.mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const types: Record<string, string> = {
    'image/png': '图片', 'image/jpeg': '图片', 'image/gif': '图片', 'image/webp': '图片', 'image/avif': '图片',
    'video/mp4': '视频', 'video/webm': '视频', 'video/quicktime': '视频',
    'application/pdf': 'PDF',
    'application/msword': 'Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.ms-excel': 'Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.ms-powerpoint': 'PPT', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPT',
    'text/plain': '文本', 'text/markdown': '文本', 'text/csv': '文本', 'text/html': '文本',
  };
  return types[mime] ?? '其他';
}

/** PDF preview uses the original bytes. Extracted text is not a page view. */
export function libraryPreviewIsPdf(item: { mimeType?: string | null; originalName?: string | null; name?: string | null }) {
  const mime = item.mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'application/pdf') return true;
  return (item.originalName || item.name || '').toLowerCase().endsWith('.pdf');
}

export function libraryParentPath(item: { parentPath?: readonly { name: string }[] }): string {
  return item.parentPath?.map(part => part.name).join(' / ') ?? '';
}
