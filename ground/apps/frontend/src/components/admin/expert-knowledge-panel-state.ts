import type { KnowledgeDocument, KnowledgeIndex, KnowledgeProfile, KnowledgeRelease, KnowledgeRevision } from '../../api/admin';

const time = (value: { createdAt?: string }) => Date.parse(value.createdAt ?? '') || 0;
export function newestRevision(document: KnowledgeDocument): KnowledgeRevision | undefined {
  return [...document.revisions].sort((a, b) => time(b) - time(a))[0];
}
export function newestIndex(revision: KnowledgeRevision): KnowledgeIndex | undefined {
  // Prisma returns createdAt with indexes. Never choose an earlier READY index when
  // the newest attempt failed or is still being processed.
  return [...revision.indexes].reverse().sort((a, b) => time(b as KnowledgeIndex & {createdAt?: string}) - time(a as KnowledgeIndex & {createdAt?: string}))[0];
}
export function newestReadyIndexes(documents: KnowledgeDocument[], profiles: KnowledgeProfile[], healthy: Record<string, boolean>): string[] | null {
  const usable = new Set(profiles.filter(p => p.enabled && p.task === 'EMBEDDING' && healthy[p.id]).map(p => p.id));
  const indexes: string[] = [];
  for (const document of documents.filter(d => d.enabled)) {
    const revision = newestRevision(document);
    const index = revision && newestIndex(revision);
    if (!index || index.status !== 'READY' || !usable.has(index.profileId)) return null;
    indexes.push(index.id);
  }
  return indexes.length ? indexes : null;
}
export function latestBindableRelease(releases: KnowledgeRelease[], documents: KnowledgeDocument[], profiles: KnowledgeProfile[], healthy: Record<string, boolean>): KnowledgeRelease | undefined {
  const indexes = newestReadyIndexes(documents, profiles, healthy);
  if (!indexes) return;
  return [...releases].sort((a, b) => b.version - a.version).find(r => r.items.length === indexes.length && r.items.every(i => indexes.includes(i.indexRevisionId)));
}
export function replaceBaseBinding(current: string[], releases: KnowledgeRelease[], next: string): string[] {
  const ids = new Set(releases.map(r => r.id));
  return [...current.filter(id => !ids.has(id)), next];
}
