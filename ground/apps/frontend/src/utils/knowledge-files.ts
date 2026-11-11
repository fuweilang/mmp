import type { KnowledgeDocument, KnowledgeRelease } from '../api/admin';
const age = (value?: string) => Date.parse(value ?? '') || 0;
export function availableKnowledgeFile(document: KnowledgeDocument) {
  if (!document.enabled || document.deletedAt) return;
  return document.revisions.flatMap(revision => revision.indexes.filter(index => index.status === 'READY' && index.profile?.enabled !== false && (document.effectiveIndexId === undefined || document.effectiveIndexId === index.id)).map(index => ({ revision, index })))
    .sort((a,b) => age(b.revision.createdAt)-age(a.revision.createdAt) || age(b.index.createdAt)-age(a.index.createdAt) || b.index.id.localeCompare(a.index.id))[0];
}
export function latestKnowledgeRevision(document: KnowledgeDocument) {
  const requested = document.revisions.find(r=>r.indexes.some(i=>i.id===document.requestedIndexId));
  if (requested) return requested;
  return [...document.revisions].sort((a,b)=>age(b.createdAt)-age(a.createdAt)||b.id.localeCompare(a.id))[0];
}
export function latestKnowledgeIndex(document: KnowledgeDocument) {
  const revision=latestKnowledgeRevision(document);
  const requested = revision?.indexes.find(i=>i.id===document.requestedIndexId);
  if (requested) return requested;
  return revision && [...revision.indexes].sort((a,b)=>age(b.createdAt)-age(a.createdAt)||b.id.localeCompare(a.id))[0];
}
export function knowledgeFileStatus(document: KnowledgeDocument) {
  if (!document.enabled || document.deletedAt) return '已停用';
  const index=latestKnowledgeIndex(document), available=availableKnowledgeFile(document);
  if (index?.status==='READY') return '可用';
  const failed=['FAILED','PARTIAL','DOWNLOAD_ONLY','CANCELLED'].includes(index?.status??'');
  return available ? failed?'更新失败 · 继续使用旧内容':'更新中 · 当前内容可用' : failed?'处理失败':'处理中';
}
export function selectedKnowledgeFiles(documents: KnowledgeDocument[], releases: KnowledgeRelease[], releaseIds: string[]) {
  const selected=new Set(releases.filter(r=>releaseIds.includes(r.id)).flatMap(r=>r.items.map(i=>i.indexRevisionId)));
  return documents.filter(d=>d.revisions.some(r=>r.indexes.some(i=>selected.has(i.id)))).map(d=>d.id);
}
export function sameKnowledgeIndexes(release: KnowledgeRelease, indexes: string[]) {
  return release.items.length===indexes.length && release.items.every(i=>indexes.includes(i.indexRevisionId));
}
