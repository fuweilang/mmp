import type { PrismaService } from '../prisma/prisma.service';
import { storedUploadedName } from '../common/uploaded-name';

/** One metadata batch for the editor; never load chunks, vectors, original bytes or credentials. */
export async function readExpertKnowledgeCatalog(db: PrismaService) {
  const platform = { scope: 'PLATFORM' as const, tenantId: null };
  const [bases, documents, releases] = await Promise.all([
    db.knowledgeBase.findMany({where:platform,select:{id:true,name:true,enabled:true,ownerAgentId:true,ownerAgentName:true,autoUpdate:true,currentReleaseId:true},orderBy:{createdAt:'desc'}}),
    db.knowledgeDocument.findMany({where:{deletedAt:null,base:{...platform,enabled:true}},select:{id:true,baseId:true,title:true,enabled:true,requestedIndexId:true,updatedAt:true,revisions:{select:{id:true,originalName:true,parserFormat:true,sizeBytes:true,createdAt:true,indexes:{select:{id:true,profileId:true,status:true,reasonCode:true,chunkCount:true,tokenCount:true,createdAt:true}}}}},orderBy:{createdAt:'desc'}}),
    db.knowledgeRelease.findMany({where:{sealed:true,base:{...platform,enabled:true}},select:{id:true,baseId:true,version:true,items:{select:{indexRevisionId:true}}},orderBy:{version:'desc'}}),
  ]);
  const documentsByBase = new Map<string, typeof documents>();
  const releasesByBase = new Map<string, typeof releases>();
  for (const document of documents) {
    const group=documentsByBase.get(document.baseId) ?? [];
    group.push(document);documentsByBase.set(document.baseId,group);
  }
  for (const release of releases) {
    const group=releasesByBase.get(release.baseId) ?? [];
    group.push(release);releasesByBase.set(release.baseId,group);
  }
  return bases.map(base => {
    const selectedReleases=base.enabled ? releasesByBase.get(base.id) ?? [] : [];
    const effective=new Set(selectedReleases.find(r=>r.id===base.currentReleaseId)?.items.map(i=>i.indexRevisionId) ?? []);
    return {base,releases:selectedReleases,documents:(base.enabled ? documentsByBase.get(base.id) ?? [] : []).map(document=>({
      ...document,title:storedUploadedName(document.title),
      ...(base.autoUpdate ? {effectiveIndexId:document.revisions.flatMap(r=>r.indexes).find(i=>effective.has(i.id))?.id ?? null} : {}),
      revisions:document.revisions.map(revision=>({...revision,originalName:storedUploadedName(revision.originalName)})),
    }))};
  });
}
