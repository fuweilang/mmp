import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planKnowledgeQueries, lexicalTerms } from '../../src/knowledge-core/query-plan';
import { assertSuperAdmin } from '../../src/auth/super-admin';

test('query plan preserves original and only bounded same-conversation user context', () => {
 const result = planKnowledgeQueries('它的编号呢？', 'current', [
  {conversationId:'foreign', role:'user', text:'secret foreign'},
  {conversationId:'current', role:'assistant', text:'hidden reasoning'},
  {conversationId:'current', role:'user', text:'猛犸产品 XJ-2026-009'},
 ]);
 assert.equal(result.queries[0], '它的编号呢？');
 assert.ok(result.queries.length <= 3);
 assert.ok(result.queries[1].includes('XJ-2026-009'));
 assert.ok(!JSON.stringify(result).includes('secret foreign'));
 assert.ok(!JSON.stringify(result).includes('hidden reasoning'));
 assert.equal(result.strategy, 'DETERMINISTIC_CONTEXT');
});
test('Chinese lexical terms retain exact ASCII identifiers and Chinese bigrams', () => {
 assert.ok(lexicalTerms('尾部合同 MMP-CN-2026-0909').includes('mmp-cn-2026-0909'));
 assert.ok(lexicalTerms('尾部合同').includes('合同'));
});
test('super_admin assertion rejects platform admin without the actual role and inactive user', async () => {
 const db = (active: boolean, key: string) => ({ user: {findUnique: async()=>({id:'u',status:active?'active':'disabled'})}, userRole: {findFirst: async()=> key==='super_admin'?{role:{key}}:null} });
 await assert.rejects(assertSuperAdmin(db(true,'platform_admin') as any, 'u'));
 await assert.rejects(assertSuperAdmin(db(false,'super_admin') as any, 'u'));
 await assert.doesNotReject(assertSuperAdmin(db(true,'super_admin') as any, 'u'));
});
test('visible assistant context can resolve a follow-up without accepting hidden assistant state',()=>{
 const result=planKnowledgeQueries('那它多少钱？','same',[
  {conversationId:'same',role:'assistant',visible:true,text:'刚才查的是 MMP-PRO 产品'},
  {conversationId:'same',role:'assistant',text:'hidden reasoning secret'},
 ]);
 assert.ok(result.queries.some(q=>q.includes('MMP-PRO')));
 assert.ok(!JSON.stringify(result).includes('hidden reasoning secret'));
});

import { KnowledgeRetrievalService } from '../../src/knowledge-core/retrieval.service';
test('privileged diagnostics independently require actual super_admin and matching actor',async()=>{
 let authorized=false;
 const access={actorUserId:'u',tenantId:null,conversationId:'c',turnId:'t',authorize:async()=>{authorized=true;return [];}};
 const db={user:{findUnique:async()=>({status:'active'})},userRole:{findFirst:async()=>null}} as any;
 const service=new KnowledgeRetrievalService(db,{} as any,{} as any,{} as any);
 await assert.rejects(service.retrieveForAdmin('u',access,{query:'q'}),(error:any)=>error.getStatus?.()===403);assert.equal(authorized,false);
 db.userRole.findFirst=async()=>({roleId:'super'});
 await assert.rejects(service.retrieveForAdmin('another',access,{query:'q'}),(error:any)=>error.code==='KNOWLEDGE_FORBIDDEN');assert.equal(authorized,false);
});

test('diagnostics reauthorize discarded candidate bodies after document/profile/release revocation',async t=>{
 for(const revoke of ['document','profile','release','cancellation'])await t.test(revoke,async()=>{
  let revoked=false,completionPersisted=false;const cancellation=new AbortController();
  const good=Array.from({length:20},(_,i)=>({chunkId:`chunk-${i}`,documentId:`document-${i}`,revisionId:`revision-${i}`,indexRevisionId:`index-${i}`,
   knowledgeReleaseId:'release-good',text:`authorized evidence ${i}`,locator:{paragraph:i+1},sourceTitle:`good-${i}`,contentHash:`hash-${i}`,ordinal:i,score:1-i/100,sourceStart:i*40,sourceEnd:i*40+20}));
  const secret={chunkId:'SECRET_REVOKED_CHUNK',documentId:'SECRET_REVOKED_DOCUMENT',revisionId:'secret-revision',indexRevisionId:'index-secret',
   knowledgeReleaseId:revoke==='release'?'release-secret':'release-good',text:'SECRET_REVOKED_DOCUMENT body must disappear',locator:{paragraph:21},sourceTitle:'SECRET_REVOKED_DOCUMENT',contentHash:'secret-hash',ordinal:21,score:0.01,sourceStart:900,sourceEnd:940};
  const rows=[...good,secret];
  const inventory=(releaseId:string)=>rows.filter(row=>row.knowledgeReleaseId===releaseId).map(row=>({id:row.indexRevisionId,
   profileId:revoke==='profile'&&row===secret?'profile-secret':'profile-good',status:'READY',revision:{document:{id:row.documentId,enabled:!(revoked&&revoke==='document'&&row===secret)}},
   profile:{enabled:!(revoked&&revoke==='profile'&&row===secret)}}));
  const traceRows=new Map<string,any>();
  const trace={count:async()=>0,create:async({data}:any)=>{traceRows.set(data.id,{...data});return data;},
   update:async({where,data}:any)=>{Object.assign(traceRows.get(where.id),data);if(data.status==='READY')completionPersisted=true;return traceRows.get(where.id);},updateMany:async({where,data}:any)=>{const row=traceRows.get(where.id);if(row)Object.assign(row,data);return {count:row?1:0};}};
  const db={user:{findUnique:async()=>({status:'active'})},userRole:{findFirst:async()=>({roleId:'super'})},knowledgeRetrievalTrace:trace,
   $transaction:async(work:any)=>work({$queryRaw:async()=>[{locked:true}],knowledgeRetrievalTrace:trace})} as any;
  const core={getRetrievalInventory:async(id:string)=>inventory(id)} as any;
  const store={lexical:async()=>good,dense:async(scopes:any[])=>{
   const allowed=new Set(scopes.flatMap(scope=>scope.indexIds));const selected=rows.filter(row=>allowed.has(row.indexRevisionId));
   if(selected.includes(secret))revoked=true;
   return selected;
  },exact:async(scope:any,id:string)=>rows.filter(row=>scope.indexIds.includes(row.indexRevisionId)&&row.chunkId===id),neighbors:async()=>[]} as any;
  const adapter={embed:async(_profile:string,queries:string[])=>({vectors:queries.map(()=>[1,0])})} as any;
  const access={actorUserId:'admin',tenantId:null,conversationId:'current',turnId:'current-turn',authorize:async()=>{if(revoke==='cancellation'&&completionPersisted)cancellation.abort();return [
   {releaseId:'release-good',scope:{type:'PLATFORM'} as const},...(revoke==='release'&&!revoked?[{releaseId:'release-secret',scope:{type:'PLATFORM'} as const}]:[])];}};
  const result=await new KnowledgeRetrievalService(db,core,adapter,store).retrieveForAdmin('admin',access,{query:'evidence',mode:'required',signal:cancellation.signal});
  if(revoke==='cancellation'){assert.equal(result.status,'CANCELLED');assert.deepEqual(result.evidence,[]);assert.equal(result.context.context,'');assert.equal(traceRows.get(result.retrievalId).status,'CANCELLED');}
  else{assert.equal(result.status,'READY');assert.ok(result.evidence.length>0);}
  assert.ok(result.evidence.every(row=>row.documentId!=='SECRET_REVOKED_DOCUMENT'));
  assert.ok(!JSON.stringify(result.diagnostics.candidates).includes('SECRET_REVOKED_DOCUMENT'),'discarded candidate body/identity must be reauthorized too');
  assert.ok(!result.diagnostics.candidates.some(row=>row.chunkId===secret.chunkId));
 });
});

import { selectEvidenceWithNeighbors } from '../../src/knowledge-core/retrieval';
test('adjacency reserves distinct same-heading continuation before unrelated neighbors and ranked duplicates',()=>{
 const hit=(id:string,heading:string,index='i')=>({chunkId:id,contentHash:id,indexRevisionId:index,documentId:index,locator:{headingPath:[heading]},text:id}) as any;
 const head=hit('intro','Introduction'),aida=hit('aida-tail','AIDA');
 const ranked=[head,aida,hit('b','Other'),hit('c','Other'),hit('d','Other'),hit('e','Other')];
 const continuation=hit('aida-middle','AIDA');
 const rows=selectEvidenceWithNeighbors(ranked,[head,aida,hit('unrelated','Elsewhere'),continuation,continuation]);
 assert.equal(rows.length,6);assert.equal(new Set(rows.map(row=>row.chunkId)).size,6);
 assert.equal(rows[4].chunkId,'aida-middle');assert.ok(rows.slice(0,4).every((row,i)=>row===ranked[i]));
 assert.ok(!selectEvidenceWithNeighbors(ranked,[{...continuation,contentHash:'intro'}]).some(row=>row.chunkId==='aida-middle'));
});

import { focusNamedHeadings } from '../../src/knowledge-core/retrieval';
test('named acronym headings distinguish exact methods from similar acronyms without changing unrelated ranking',()=>{
 const hit=(id:string,title:string)=>({chunkId:id,locator:{headingPath:[title]}}) as any;
 const rows=[hit('aidma','AIDMA模型'),hit('other','营销理论'),hit('aida','AIDA模型升级版')];
 for(const query of ['按AIDA方法写文案','请解释 AIDA:','请解释 AIDA.'])
  assert.deepEqual(focusNamedHeadings(rows,query).map(x=>x.chunkId),['aida','aidma','other']);
 assert.deepEqual(focusNamedHeadings(rows,'根据知识库解释营销').map(x=>x.chunkId),['aidma','other','aida']);
 assert.deepEqual(focusNamedHeadings(rows,'按AIDMA方法解释').map(x=>x.chunkId),['aidma','other','aida']);
});

test('a batch exact-source reopen authorizes once, preserves tuple order and rejects mismatches',async()=>{
 let authorizations=0;
 const refs=Array.from({length:4},(_,i)=>({chunkId:`c${i}`,documentId:`d${i}`,revisionId:`r${i}`,indexRevisionId:`i${i}`,knowledgeReleaseId:'release'}));
 const db={user:{findUnique:async()=>({status:'active'})}};
 const core={getRetrievalInventory:async()=>refs.map(r=>({id:r.indexRevisionId,profileId:'p',status:'READY',profile:{enabled:true},revision:{document:{id:r.documentId,enabled:true}}}))};
 let forged=false;
 const candidates={exact:async(_s:any,id:string)=>{const ref=refs.find(r=>r.chunkId===id)!;return [{...ref,revisionId:forged?'forged':ref.revisionId,text:'exact',sourceStart:0,sourceEnd:5}];}};
 const service=new KnowledgeRetrievalService(db as any,core as any,{} as any,candidates as any);
 const access={actorUserId:'u',tenantId:null,conversationId:'c',turnId:'t',authorize:async()=>{authorizations++;return [{releaseId:'release',scope:{type:'PLATFORM' as const}}];}};
 const result=await service.openSources(access,refs);
 assert.equal(authorizations,1);assert.deepEqual(result.map(r=>r.chunkId),refs.map(r=>r.chunkId));
 forged=true;await assert.rejects(service.openSources(access,refs),(e:any)=>e.code==='KNOWLEDGE_SOURCE_NOT_FOUND');
});

test('internal search uses one corpus snapshot and revalidates before disclosure without changing evidence',async t=>{
 for(const revoke of [false,true])await t.test(revoke?'revoked during search':'unchanged corpus',async()=>{
  let inventoryReads=0,revoked=false;
  const row={chunkId:'c',documentId:'d',revisionId:'rev',indexRevisionId:'i',knowledgeReleaseId:'r',text:'完整证据，不缩减正文',locator:{paragraph:1},contentHash:'hash',ordinal:0,score:1,sourceStart:0,sourceEnd:11};
  const trace={count:async()=>0,create:async()=>({}),update:async()=>({})};
  const db={user:{findUnique:async()=>({status:'active'})},knowledgeRetrievalTrace:trace,$transaction:async(work:any)=>work({$queryRaw:async()=>[{locked:true}],knowledgeRetrievalTrace:trace})};
  const core={getRetrievalInventory:async()=>{inventoryReads++;return [{id:'i',profileId:'p',status:'READY',profile:{enabled:true},revision:{id:'rev',document:{id:'d',enabled:!revoked}}}];}};
  const store={lexical:async()=>[row],dense:async()=>{revoked=revoke;return [row];},exact:async()=>[row],neighbors:async()=>[]};
  const service=new KnowledgeRetrievalService(db as any,core as any,{embed:async()=>({vectors:[[1,0]]})} as any,store as any);
  const result=await service.retrieve({actorUserId:'u',tenantId:null,conversationId:'c',turnId:'t',authorize:async()=>[{releaseId:'r',scope:{type:'PLATFORM'}}]},{query:'原始问题',mode:'required'});
  assert.equal(result.status,revoke?'FORBIDDEN':'READY');
  assert.deepEqual(result.context.evidence.map(e=>({chunk:e.chunkId,text:e.text})),revoke?[]:[{chunk:'c',text:'完整证据，不缩减正文'}]);
  assert.equal(inventoryReads,2,'internal database-only phases share the corpus snapshot; terminal validation must be fresh');
 });
});

test('lexical database search does not block independent query embedding',async()=>{
 let entered!:()=>void,release!:()=>void,embedded=false;
 const lexicalStarted=new Promise<void>(r=>entered=r),lexicalWait=new Promise<void>(r=>release=r);
 const trace={count:async()=>0,create:async()=>({}),update:async()=>({})};
 const db={user:{findUnique:async()=>({status:'active'})},knowledgeRetrievalTrace:trace,$transaction:async(work:any)=>work({$queryRaw:async()=>[{locked:true}],knowledgeRetrievalTrace:trace})};
 const inventory={getRetrievalInventory:async()=>[{id:'i',profileId:'p',status:'READY',profile:{enabled:true},revision:{id:'rev',document:{id:'d',enabled:true}}}]};
 const service=new KnowledgeRetrievalService(db as any,inventory as any,{embed:async()=>{embedded=true;return{vectors:[[1,0]]};}} as any,{lexical:async()=>{entered();await lexicalWait;return[];},dense:async()=>[]} as any);
 const result=service.retrieve({actorUserId:'u',tenantId:null,conversationId:'c',turnId:'t',authorize:async()=>[{releaseId:'r',scope:{type:'PLATFORM'}}]},{query:'原问题',mode:'required'});
 await lexicalStarted;
 try {await Promise.resolve();assert.equal(embedded,true,'embedding should start while the lexical database request is still pending');} finally {release();await result;}
 assert.equal((await result).status,'NO_EVIDENCE');
});
