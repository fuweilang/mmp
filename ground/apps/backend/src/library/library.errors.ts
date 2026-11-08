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
