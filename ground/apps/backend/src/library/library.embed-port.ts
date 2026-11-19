let current: ((text: string) => Promise<number[] | null>) | null = null;

export function setLibraryEmbedQuery(fn: ((text: string) => Promise<number[] | null>) | null): void {
  current = fn;
}

export function libraryEmbedQuery(): ((text: string) => Promise<number[] | null>) | null {
  return current;
}
