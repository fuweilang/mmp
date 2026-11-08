/** Console presentation only. Terminal directory queries remain unchanged. */
export function libraryListLocation(view: string, parentId: string | null) {
  return { flat: view === 'mine', parentId: view === 'mine' || view === 'recent' || view === 'trash' ? null : parentId };
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

export function libraryParentPath(item: { parentPath?: readonly { name: string }[] }): string {
  return item.parentPath?.map(part => part.name).join(' / ') ?? '';
}
