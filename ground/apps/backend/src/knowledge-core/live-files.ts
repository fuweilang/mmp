interface FileIndex {
  id: string;
  status: string;
  createdAt: Date | string;
  profile: { enabled: boolean };
  revision: { createdAt: Date | string; document: { id: string; enabled: boolean; deletedAt?: Date | null; requestedIndexId?: string | null } };
}
const time = (value: Date | string) => new Date(value).getTime();
/** Revision age, rather than job completion time, determines which successful replacement wins. */
export function effectiveFileIndexes<T extends FileIndex>(indexes: T[], currentIndexIds: string[] = []): T[] {
  const byDocument = new Map<string, T>();
  const priority = (index: T) => index.revision.document.requestedIndexId === index.id ? 2 : currentIndexIds.includes(index.id) ? 1 : 0;
  const ordered = [...indexes].sort((a, b) => priority(b)-priority(a) || time(b.revision.createdAt) - time(a.revision.createdAt) || time(b.createdAt) - time(a.createdAt) || b.id.localeCompare(a.id));
  for (const index of ordered) {
    const document = index.revision.document;
    if (index.status === 'READY' && index.profile.enabled && document.enabled && !document.deletedAt && !byDocument.has(document.id)) byDocument.set(document.id, index);
  }
  return [...byDocument.values()];
}
/** undefined is a legacy whole-release grant; an explicit empty selection grants nothing. */
export function restrictFileInventory<T extends { revision: { document: { id: string } } }>(inventory: T[], documentIds?: string[]): T[] {
  if (documentIds === undefined) return inventory;
  const allowed = new Set(documentIds);
  return inventory.filter(index => allowed.has(index.revision.document.id));
}
