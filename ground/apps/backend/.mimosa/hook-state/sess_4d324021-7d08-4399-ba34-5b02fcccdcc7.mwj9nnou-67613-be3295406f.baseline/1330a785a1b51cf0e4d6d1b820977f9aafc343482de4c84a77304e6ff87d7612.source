export const FILE_PURGE_BLOCKED_REASON = '文件暂不支持彻底删除，可回收或恢复';

export class LibraryError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export function libraryNotFound(): LibraryError {
  return new LibraryError(404, '资料不存在', 'NOT_FOUND');
}
