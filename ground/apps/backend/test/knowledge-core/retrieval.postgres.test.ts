import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../../src/prisma/prisma.service';
import { encryptApiKey } from '../../src/llm/llm-key-crypto';
import { KnowledgeProfilesService } from '../../src/knowledge-core/profiles.service';
import { KnowledgeCoreService } from '../../src/knowledge-core/knowledge-core.service';
import { KnowledgeJobsService } from '../../src/knowledge-core/jobs.service';
import { KnowledgeBlobStorage } from '../../src/knowledge-core/storage';
import { KnowledgeIngestionWorker } from '../../src/knowledge-core/ingestion.worker';
import { KnowledgeCandidateStore } from '../../src/knowledge-core/candidate-store';
import { KnowledgeRetrievalService } from '../../src/knowledge-core/retrieval.service';
import { KnowledgeCoreError } from '../../src/knowledge-core/errors';
import type { KnowledgeAccess } from '../../src/knowledge-core/retrieval-access';
const url=process.env.RAG_TEST_DATABASE_URL;
if(!url?.startsWith('postgresql://rag_test:')||!url.includes('@127.0.0.1:55441/mmp_rag_acceptance'))throw new Error('DEDICATED_DB_REQUIRED');
process.env.LLM_API_KEY_SECRET='test-only-rag-encryption-secret';
const db=new PrismaService({datasources:{db:{url}}});
const profiles=new KnowledgeProfilesService(db),jobs=new KnowledgeJobsService(db),blobs=new KnowledgeBlobStorage();
const core=new KnowledgeCoreService(db,profiles,blobs,jobs),store=new KnowledgeCandidateStore(db);
const embedCalls:string[][]=[];
let mode='ok', dir:string, userId:string, releaseId:string, profileId:string;
let beforeEmbed:(()=>Promise<void>)|undefined;
// Engineering-only deterministic vector fixture, never a semantic quality test or production fallback.
const adapter={embed:async(_id:string,texts:string[])=>{
 embedCalls.push(texts);
 if(beforeEmbed)await beforeEmbed();
 if(mode==='failed')throw new KnowledgeCoreError('PROVIDER_HTTP_ERROR',true);
 return {vectors:texts.map(text=>text.includes('MMP-CN-2026-0909')?[0,1]:text.includes('WEAK')?[1,1]:[1,0])};
},rerank:async()=>{throw new KnowledgeCoreError('PROVIDER_HTTP_ERROR');}} as any;
const service=new KnowledgeRetrievalService(db,core,adapter,store);
const worker=new KnowledgeIngestionWorker(db,profiles,blobs,jobs,adapter);
let denied=false;
function access(override:Partial<KnowledgeAccess>={}):KnowledgeAccess{return {actorUserId:userId,tenantId:null,conversationId:randomUUID(),turnId:randomUUID(),authorize:async()=>{
 if(denied)throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
 return [{releaseId,scope:{type:'PLATFORM'}}];
},...override};}
before(async()=>{
 await db.$connect();dir=await mkdtemp(join(tmpdir(),'rag-retrieval-'));process.env.KNOWLEDGE_CORE_DIR=dir;
 const user=await db.user.create({data:{phone:`r3-${randomUUID()}`,name:'RAG3 test',passwordHash:'unused'}});userId=user.id;
 const provider=await db.llmProvider.create({data:{name:`r3-${randomUUID()}`,displayName:'RAG3 mock',baseUrl:'http://127.0.0.1:1/v1',apiKeyEnc:encryptApiKey('fake-key')}});
 const profile=await profiles.create({providerId:provider.id,task:'EMBEDDING',model:'mock-engineering-only',dimension:2,maxInputTokens:900});profileId=profile.id;
 const base=await core.createBase({type:'PLATFORM'},'RAG3 test');
 const text=Array.from({length:250},(_,i)=>`第${i}段：常规说明内容。`).join('\n\n')+'\n\n最后合同编号 MMP-CN-2026-0909，退款期限九十九天。';
 const job=await core.upload(base.id,{type:'PLATFORM'},{bytes:Buffer.from(text),originalName:'tail.txt',profileId,idempotencyKey:randomUUID(),indexConfig:{targetTokens:30,maxTokens:60,overlapTokens:0}});
 await worker.runOnce();
 const state=await core.inspectJob(job.id,{type:'PLATFORM'});assert.equal(state.index.status,'READY');
 const release=await core.createRelease(base.id,{type:'PLATFORM'},[job.indexRevisionId]);releaseId=release.id;
});
after(async()=>{beforeEmbed=undefined;await db.$disconnect();await rm(dir,{recursive:true,force:true});});
test('long Chinese document tail exact identifier survives relevance ranking and has pinned locator',async()=>{
 const result=await service.retrieve(access(),{query:'合同编号 MMP-CN-2026-0909',mode:'required'});
 assert.equal(result.status,'READY');assert.ok(result.evidence.some(e=>e.text.includes('九十九天')));
 const hit=result.evidence.find(e=>e.text.includes('九十九天'))!;
 assert.ok(hit.locator.paragraph!>200);assert.equal(hit.knowledgeReleaseId,releaseId);
 assert.ok(result.context.tokenCount<=8000);assert.ok(result.context.context.includes('untrusted'));
 const source=await service.openSource(access(),hit);assert.equal(source.text,hit.text);assert.ok(source.sourceStart>2000);
 await assert.rejects(service.openSource(access(),{...hit,revisionId:'forged'}));
});
test('forged release/index scope and revoked source denied',async()=>{
 const deniedResult=await service.retrieve(access({authorize:async()=>[{releaseId:'forged',scope:{type:'PLATFORM'}}]}),{query:'合同'});
 assert.equal(deniedResult.status,'FORBIDDEN');assert.deepEqual(deniedResult.evidence,[]);
 const good=await service.retrieve(access(),{query:'MMP-CN-2026-0909'});denied=true;
 await assert.rejects(service.openSource(access(),good.evidence[0]));denied=false;
});
test('current document toggle wins over pinned release and forged tenant cannot read',async()=>{
 const good=await service.retrieve(access(),{query:'MMP-CN-2026-0909'}),hit=good.evidence[0];
 await db.knowledgeDocument.update({where:{id:hit.documentId},data:{enabled:false}});
 await assert.rejects(service.openSource(access(),hit));
 await db.knowledgeDocument.update({where:{id:hit.documentId},data:{enabled:true}});
 const result=await service.retrieve(access({authorize:async()=>[{releaseId,scope:{type:'TENANT',tenantId:'forged-tenant'}}]}),{query:'合同'});
 assert.equal(result.status,'FORBIDDEN');
});
test('required provider failure differs from empty hit; optional degrades and rerank failure retains RRF',async()=>{
 mode='failed';const required=await service.retrieve(access(),{query:'合同编号 MMP-CN-2026-0909',mode:'required'});
 assert.equal(required.status,'FAILED');assert.deepEqual(required.evidence,[]);
 const optional=await service.retrieve(access(),{query:'MMP-CN-2026-0909',mode:'optional',rerankProfileId:'mock-rerank'});
 assert.equal(optional.status,'READY');assert.ok(optional.degradation.includes('DENSE_UNAVAILABLE_LEXICAL_ONLY'));
 assert.ok(optional.degradation.includes('RERANK_FAILED_RRF_FALLBACK'));mode='ok';
});
test('profile mismatch, wrapper-inclusive budget and lookup limit enforced',async()=>{
 assert.equal((await service.retrieve(access(),{query:'合同',embeddingProfileId:'other'})).status,'NOT_READY');
 const tiny=await service.retrieve(access(),{query:'合同',budgetTokens:1});assert.deepEqual(tiny.evidence,[]);assert.equal(tiny.context.tokenCount,0);
 const turn=access();for(let n=0;n<2;n++)assert.notEqual((await service.retrieve(turn,{query:'合同'})).status,'FAILED');
 const extra=await service.retrieve(turn,{query:'合同'});assert.ok(extra.degradation.includes('RETRIEVAL_LOOKUP_BUDGET_EXHAUSTED'));
});
test('cancel during provider wait and authorization revoked while upstream waits expose no evidence',async()=>{
 const controller=new AbortController();beforeEmbed=async()=>{controller.abort();};
 const cancelled=await service.retrieve(access(),{query:'合同',signal:controller.signal});assert.equal(cancelled.status,'CANCELLED');assert.deepEqual(cancelled.evidence,[]);
 beforeEmbed=async()=>{denied=true;};const revoked=await service.retrieve(access(),{query:'合同'});
 assert.equal(revoked.status,'FORBIDDEN');assert.deepEqual(revoked.evidence,[]);beforeEmbed=undefined;denied=false;
});
test('successful empty candidates, missing configuration and inactive actor have distinct outcomes',async()=>{
 const emptyStore={lexical:async()=>[],dense:async()=>[]} as any;
 const emptyService=new KnowledgeRetrievalService(db,core,adapter,emptyStore);
 const empty=await emptyService.retrieve(access(),{query:'not found',mode:'required'});assert.equal(empty.status,'NO_EVIDENCE');
 const missingAdapter={embed:async()=>{throw new KnowledgeCoreError('PROFILE_UNCONFIGURED');}} as any;
 const missingService=new KnowledgeRetrievalService(db,core,missingAdapter,emptyStore);
 assert.equal((await missingService.retrieve(access(),{query:'not found',mode:'required'})).status,'NOT_CONFIGURED');
 mode='failed';assert.equal((await emptyService.retrieve(access(),{query:'not found',mode:'optional'})).status,'FAILED');mode='ok';
 assert.equal((await missingService.retrieve(access(),{query:'not found',mode:'optional'})).status,'NOT_CONFIGURED');
 await db.user.update({where:{id:userId},data:{status:'disabled'}});
 const inactive=await service.retrieve(access(),{query:'合同'});assert.equal(inactive.status,'FORBIDDEN');assert.deepEqual(inactive.evidence,[]);
 await db.user.update({where:{id:userId},data:{status:'active'}});
});
test('soft base archive revokes pinned source without deleting immutable releases',async()=>{
 const result=await service.retrieve(access(),{query:'MMP-CN-2026-0909'}),hit=result.evidence[0];
 const release=await core.getRelease(releaseId,{type:'PLATFORM'});
 await db.knowledgeBase.update({where:{id:release.baseId},data:{enabled:false}});
 await assert.rejects(service.openSource(access(),hit));
 assert.equal((await service.retrieve(access(),{query:'合同'})).status,'FORBIDDEN');
 assert.ok(await db.knowledgeRelease.findUnique({where:{id:releaseId}}));
 await db.knowledgeBase.update({where:{id:release.baseId},data:{enabled:true}});
 assert.equal((await service.openSource(access(),hit)).chunkId,hit.chunkId);
});
test('same revision adjacency contributes context inside final6 even when more ranked hits exist',async()=>{
 const release=await core.getRelease(releaseId,{type:'PLATFORM'}),indexId=release.items[0].indexRevisionId;
 const chunks=await db.knowledgeChunk.findMany({where:{indexRevisionId:indexId},orderBy:{ordinal:'asc'}});
 const tail=chunks.at(-1)!,previous=chunks.at(-2)!;
 const scope={releaseId,scope:{type:'PLATFORM'} as const,indexIds:[indexId]};
 const ranked=await Promise.all([tail,...chunks.slice(0,6)].map(async row=>(await store.exact(scope,row.id))[0]));
 const boundedStore={lexical:async()=>[],dense:async()=>ranked,exact:store.exact.bind(store),neighbors:store.neighbors.bind(store)} as any;
 const scoped=new KnowledgeRetrievalService(db,core,adapter,boundedStore);
 const result=await scoped.retrieve(access(),{query:'MMP-CN-2026-0909',mode:'required'});
 assert.equal(result.status,'READY');assert.ok(result.evidence.length<=6);
 assert.ok(result.evidence.some(row=>row.chunkId===previous.id));
 assert.ok(result.evidence.every(row=>row.indexRevisionId===indexId&&row.knowledgeReleaseId===releaseId));
});
test('real tenant membership and active tenant are required for TENANT release content',async()=>{
 const tenant=await db.tenant.create({data:{name:'RAG3 tenant',slug:`r3-${randomUUID()}`,type:'ENTERPRISE'}});
 await db.orgMember.create({data:{userId,tenantId:tenant.id,role:'MEMBER'}});
 const base=await core.createBase({type:'TENANT',tenantId:tenant.id},'RAG3 tenant scope');
 const job=await core.upload(base.id,{type:'TENANT',tenantId:tenant.id},{bytes:Buffer.from('企业资料编号 MMP-TENANT-009'),originalName:'tenant.txt',profileId,idempotencyKey:randomUUID()});
 await worker.runOnce();const release=await core.createRelease(base.id,{type:'TENANT',tenantId:tenant.id},[job.indexRevisionId]);
 const tenantAccess=()=>access({tenantId:tenant.id,authorize:async()=>[{releaseId:release.id,scope:{type:'TENANT',tenantId:tenant.id}}]});
 const good=await service.retrieve(tenantAccess(),{query:'MMP-TENANT-009',mode:'required'});assert.equal(good.status,'READY');
 await db.tenant.update({where:{id:tenant.id},data:{status:'disabled'}});
 assert.equal((await service.retrieve(tenantAccess(),{query:'MMP-TENANT-009'})).status,'FORBIDDEN');
 await db.tenant.update({where:{id:tenant.id},data:{status:'active'}});
 await db.orgMember.delete({where:{userId_tenantId:{userId,tenantId:tenant.id}}});
 await assert.rejects(service.openSource(tenantAccess(),good.evidence[0]));
 const outsider=await db.user.create({data:{phone:`r3-outsider-${randomUUID()}`,name:'Outsider',passwordHash:'unused'}});
 assert.equal((await service.retrieve({...tenantAccess(),actorUserId:outsider.id},{query:'MMP-TENANT-009'})).status,'FORBIDDEN');
});

test('globally ranks same-profile releases before RRF and batches subquery embeddings once',async()=>{
 const weakReleases:string[]=[];
 for(let n=0;n<19;n++){
  const base=await core.createBase({type:'PLATFORM'},`weak-${n}`);
  const job=await core.upload(base.id,{type:'PLATFORM'},{bytes:Buffer.from(`WEAK 常规 第${n}条`),originalName:`weak${n}.txt`,profileId,idempotencyKey:randomUUID()});
  await worker.runOnce();weakReleases.push((await core.createRelease(base.id,{type:'PLATFORM'},[job.indexRevisionId])).id);
 }
 const selected=[...weakReleases,releaseId];embedCalls.length=0;
 const calls:{dense:{scopes:number;rows:number}[];lexical:{scopes:number;rows:number}[]}={dense:[],lexical:[]};
 const observedStore={exact:store.exact.bind(store),neighbors:store.neighbors.bind(store),
  dense:async(scopes:any[],vector:number[])=>{const rows=await store.dense(scopes,vector);calls.dense.push({scopes:Array.isArray(scopes)?scopes.length:1,rows:rows.length});return rows;},
  lexical:async(scopes:any[],query:string)=>{const rows=await store.lexical(scopes,query);calls.lexical.push({scopes:Array.isArray(scopes)?scopes.length:1,rows:rows.length});return rows;}} as any;
 const observed=new KnowledgeRetrievalService(db,core,adapter,observedStore);
 const result=await observed.retrieve(access({authorize:async()=>selected.map(id=>({releaseId:id,scope:{type:'PLATFORM'}}))}),{
  query:'常规说明',context:[{conversationId:'unused',role:'user',text:'unused'}],mode:'required'});
 assert.equal(result.status,'READY');assert.ok(result.evidence.filter(e=>e.knowledgeReleaseId===releaseId).length>=2,'strong rank2 must survive nineteen weaker release rank1 hits');
 assert.equal(embedCalls.length,1,'same profile must embed once, not once per release');
 assert.equal(calls.dense.length,1);assert.equal(calls.lexical.length,1);assert.equal(calls.dense[0].scopes,20);assert.equal(calls.lexical[0].scopes,20);assert.ok(calls.dense[0].rows<=40);assert.ok(calls.lexical[0].rows<=30);
 calls.dense.length=0;calls.lexical.length=0;
 const contextAccess=access({authorize:async()=>selected.map(id=>({releaseId:id,scope:{type:'PLATFORM'}}))});embedCalls.length=0;
 const contextual=await observed.retrieve(contextAccess,{query:'常规说明',context:[
  {conversationId:contextAccess.conversationId,role:'user',text:'具体常规说明'},
  {conversationId:contextAccess.conversationId,role:'assistant',visible:true,text:'继续常规说明'},
 ]});
 assert.equal(contextual.queries.length,3);assert.equal(embedCalls.length,1);assert.equal(embedCalls[0].length,3);
 assert.equal(calls.dense.length,3);assert.equal(calls.lexical.length,3);assert.ok(calls.dense.reduce((n,row)=>n+row.rows,0)<=120);assert.ok(calls.lexical.reduce((n,row)=>n+row.rows,0)<=90);
});

test('caps heterogeneous embedding profiles before calls and preserves mixed-profile failure completeness',async t=>{
 const inventory=await core.getReleaseInventory(releaseId,{type:'PLATFORM'});
 const manyCore={getReleaseInventory:async()=>Array.from({length:5},(_,i)=>({...inventory[0],profileId:`p${i}`,profile:{...inventory[0].profile,id:`p${i}`}}))} as any;
 embedCalls.length=0;
 await t.test('excess profile fanout rejects before embedding',async()=>{
 const excess=await new KnowledgeRetrievalService(db,manyCore,adapter,store).retrieve(access(),{query:'常规说明'});
 assert.equal(excess.status,'NOT_READY');assert.ok(excess.degradation.includes('PROFILE_FANOUT_LIMIT'));assert.equal(embedCalls.length,0);
 });
 await t.test('one successful empty profile cannot hide another failed profile',async()=>{
 const twoCore={getReleaseInventory:async()=>Array.from({length:2},(_,i)=>({...inventory[0],profileId:`p${i}`,profile:{...inventory[0].profile,id:`p${i}`}}))} as any;
 const mixedAdapter={embed:async(id:string,texts:string[])=>{if(id==='p1')throw new KnowledgeCoreError('PROVIDER_HTTP_ERROR');return {vectors:texts.map(()=>[1,0])};}} as any;
 const emptyStore={lexical:async()=>[],dense:async()=>[]} as any;
 const mixed=await new KnowledgeRetrievalService(db,twoCore,mixedAdapter,emptyStore).retrieve(access(),{query:'empty',mode:'optional'});
 assert.equal(mixed.status,'FAILED');assert.deepEqual(mixed.evidence,[]);
 mixedAdapter.embed=async(id:string,texts:string[])=>{if(id==='p1')throw new KnowledgeCoreError('PROFILE_UNCONFIGURED');return {vectors:texts.map(()=>[1,0])};};
 const missing=await new KnowledgeRetrievalService(db,twoCore,mixedAdapter,emptyStore).retrieve(access(),{query:'empty',mode:'optional'});assert.equal(missing.status,'NOT_CONFIGURED');assert.deepEqual(missing.evidence,[]);
 });
 await t.test('four dimensions stay isolated with bounded calls',async()=>{
 const fourCore={getReleaseInventory:async()=>Array.from({length:4},(_,i)=>({...inventory[0],profileId:`p${i}`,profile:{...inventory[0].profile,id:`p${i}`,dimension:i+1}}))} as any;
 const counts={embedding:0,dense:0,lexical:0};
 const boundedAdapter={embed:async(id:string,texts:string[])=>{counts.embedding++;assert.equal(texts.length,3);return {vectors:texts.map(()=>Array(Number(id.slice(1))+1).fill(1))};}} as any;
 const boundedStore={lexical:async()=>{counts.lexical++;return [];},dense:async(scopes:any[],vector:number[])=>{counts.dense++;assert.equal(new Set(scopes.map(row=>row.profileId)).size,1);assert.equal(vector.length,Number(scopes[0].profileId.slice(1))+1);return [];}} as any;
 const boundedAccess=access();const bounded=await new KnowledgeRetrievalService(db,fourCore,boundedAdapter,boundedStore).retrieve(boundedAccess,{query:'empty',context:[{conversationId:boundedAccess.conversationId,role:'user',text:'one'},{conversationId:boundedAccess.conversationId,role:'assistant',visible:true,text:'two'}]});
 assert.equal(bounded.status,'NO_EVIDENCE');assert.deepEqual(counts,{embedding:4,dense:12,lexical:3});
 });

});

test('cancellation at final neighbor, final authorization, empty dense or trace persistence discards all evidence',async t=>{
 for(const phase of ['neighbor','authorization','empty','persistence'])await t.test(phase,async()=>{
  const abort=new AbortController();let finishing=false;
  const scopedStore={
   lexical:async()=>[],
   dense:async(...args:any[])=>{const rows=(await (store.dense as any)(...args)).slice(0,1);if(phase==='empty'){abort.abort();return [];}return rows;},
   exact:store.exact.bind(store),
   neighbors:async(...args:any[])=>{const rows=await (store.neighbors as any)(...args);finishing=true;if(phase==='neighbor')abort.abort();return rows;},
  } as any;
  if(phase==='empty')scopedStore.lexical=async()=>[];
  const wrappedDb=new Proxy(db,{get(target,key){if(key==='knowledgeRetrievalTrace')return new Proxy(target.knowledgeRetrievalTrace,{get(delegate,method){if(method==='update')return async(input:any)=>{const result=await delegate.update(input);if(phase==='persistence')abort.abort();return result;};const value=(delegate as any)[method];return typeof value==='function'?value.bind(delegate):value;}});const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}});
  const scopedAccess=access({authorize:async()=>{if(phase==='authorization'&&finishing)abort.abort();return [{releaseId,scope:{type:'PLATFORM'}}];}});
  const result=await new KnowledgeRetrievalService(wrappedDb,core,adapter,scopedStore).retrieve(scopedAccess,{query:'常规说明',signal:abort.signal});
  assert.equal(result.status,'CANCELLED',phase);assert.deepEqual(result.evidence,[],phase);assert.equal(result.context.context,'',phase);
  const persisted=await db.knowledgeRetrievalTrace.findUniqueOrThrow({where:{id:result.retrievalId}});assert.equal(persisted.status,'CANCELLED',phase);assert.deepEqual(persisted.evidence,[],phase);
 });
});
