import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {KnowledgeRetrievalService} from '../../src/knowledge-core/retrieval.service';
import {ExpertRuntimeService} from '../../src/official-agent/expert-runtime.service';
import {KnowledgeCoreError} from '../../src/knowledge-core/errors';

test('runtime revalidates actual Core evidence after terminal trace persistence',async t=>{
 for(const kind of ['document','profile','base','cancellation','final-inventory-cancellation','revocation-status-cancellation'])await t.test(kind,async()=>{
  let revoked=false,postTerminalInventoryReads=0;const abort=new AbortController(),traceRows=new Map<string,any>();
  const row={chunkId:'c',documentId:'d',revisionId:'rev',indexRevisionId:'i',knowledgeReleaseId:'r',text:'REVOKED DOCUMENT CONTENT',locator:{paragraph:1},sourceTitle:'secret',contentHash:'h',ordinal:0,score:1,sourceStart:0,sourceEnd:24};
  const trace={count:async()=>0,create:async({data}:any)=>{traceRows.set(data.id,{...data});return data;},update:async({where,data}:any)=>{Object.assign(traceRows.get(where.id),data);if(data.status==='READY'){revoked=true;if(kind==='cancellation')abort.abort();}return traceRows.get(where.id);},updateMany:async({where,data}:any)=>{Object.assign(traceRows.get(where.id),data);if(kind==='revocation-status-cancellation'&&data.status==='FORBIDDEN')abort.abort();return{count:1};}};
  const config={route:'KNOWLEDGE_CORE',retrievalPolicy:'REQUIRED',budgetTokens:8000,generationModel:{mode:'AUTO'},builtinToolRevision:'ground-builtins-v1',knowledge:[{releaseId:'r',indexes:[{indexRevisionId:'i'}]}],skillPackages:[]};
  const db:any={user:{findUnique:async()=>({status:'active'})},officialAgent:{findUnique:async()=>({id:'a',status:'PUBLISHED',onlineVersionId:'v'})},officialAgentVersion:{findFirst:async()=>({id:'v',systemPrompt:'p',expertDefinition:{},executionConfig:config})},knowledgeRetrievalTrace:trace,$transaction:async(work:any)=>work({$queryRaw:async()=>[{locked:true}],knowledgeRetrievalTrace:trace})};
  const inventory={getReleaseInventory:async()=>{if(revoked){postTerminalInventoryReads++;if(kind==='final-inventory-cancellation'&&postTerminalInventoryReads===2)abort.abort();}if(revoked&&kind==='base')throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');return[{id:'i',profileId:'p',status:'READY',revision:{id:'rev',document:{id:'d',enabled:!(revoked&&(kind==='document'||kind==='revocation-status-cancellation'))}},profile:{enabled:!(revoked&&kind==='profile')}}];}};
  const store={lexical:async()=>[row],dense:async()=>[row],exact:async()=>[row],neighbors:async()=>[]};
  const provider={embed:async()=>({vectors:[[1,0]]})};
  const core=new KnowledgeRetrievalService(db,inventory as any,provider as any,store as any);
  const runtime=new ExpertRuntimeService(db,core,inventory as any);
  const result=await runtime.retrieve({id:'u'} as any,null,{agentId:'a',versionId:'v'},{sessionId:'native',turnId:'t'},'query',abort.signal);
  assert.equal(revoked,true);assert.equal(result.status,kind.includes('cancellation')?'CANCELLED':'FORBIDDEN');assert.deepEqual(result.evidence,[]);assert.equal(result.context.context,'');assert.deepEqual(result.context.evidence,[]);assert.ok(!JSON.stringify(result).includes('REVOKED DOCUMENT CONTENT'));
  const persisted=traceRows.get(result.retrievalId);assert.equal(persisted.status,result.status);assert.deepEqual(persisted.evidence,[]);assert.deepEqual(persisted.releaseIds,[]);
 });
});

test('one final disclosure snapshot covers actor preview and material authority together',async t=>{
 for(const kind of ['account','membership','tenant','expert','preview-role','preview-expiry','material-at-decision','allowed','cancel-at-decision'])await t.test(kind,async()=>{
  let terminal=false,reads=0,decisionMade=false,active=true,member=true,tenant=true,published=true,superRole=true,expired=false,material=true;
  const abort=new AbortController(),traceRows=new Map<string,any>();
  const checkNoLaterRead=()=>{assert.equal(decisionMade,false,'positive disclosure must not add an async authorization/material read after its atomic decision');};
  const row={chunkId:'c',documentId:'d',revisionId:'rev',indexRevisionId:'i',knowledgeReleaseId:'r',text:'PRIVATE FINAL BODY',locator:{paragraph:1},sourceTitle:'s',contentHash:'h',ordinal:0,score:1,sourceStart:0,sourceEnd:18};
  const trace={count:async()=>0,create:async({data}:any)=>{traceRows.set(data.id,{...data});return data;},update:async({where,data}:any)=>{Object.assign(traceRows.get(where.id),data);if(data.status==='READY')terminal=true;return traceRows.get(where.id);},updateMany:async({where,data}:any)=>{Object.assign(traceRows.get(where.id),data);return{count:1};}};
  const config={route:'KNOWLEDGE_CORE',retrievalPolicy:'REQUIRED',budgetTokens:8000,generationModel:{mode:'AUTO'},builtinToolRevision:'ground-builtins-v1',knowledge:[{releaseId:'r',baseId:'b',indexes:[{indexRevisionId:'i',documentId:'d',revisionId:'rev',profileId:'p',configHash:'hash'}]}],skillPackages:[]};
  const db:any={user:{findUnique:async()=>{checkNoLaterRead();return{status:active?'active':'disabled'};}},orgMember:{findUnique:async()=>{checkNoLaterRead();return member?{tenant:{status:tenant?'active':'disabled'}}:null;}},userRole:{findFirst:async()=>{checkNoLaterRead();return superRole?{roleId:'super'}:null;}},officialAgent:{findUnique:async()=>({id:'a',status:published?'PUBLISHED':'OFFLINE',onlineVersionId:'v'})},officialAgentVersion:{findFirst:async()=>({id:'v',systemPrompt:'p',expertDefinition:{},executionConfig:config})},officialExpertPreview:{findUnique:async()=>({id:'pv',agentId:'a',actorUserId:'u',expiresAt:new Date(Date.now()+(expired?-1000:60000)),snapshot:{executionConfig:config}})},knowledgeRetrievalTrace:trace,$transaction:async(work:any)=>work({$queryRaw:async()=>[{locked:true}],knowledgeRetrievalTrace:trace}),$queryRaw:async()=>{
   if(kind==='material-at-decision')material=false;
   if(kind==='cancel-at-decision')abort.abort();
   const allowed=active&&member&&tenant&&published&&superRole&&!expired&&material;decisionMade=true;return[{allowed}];
  }};
  const inventory={getReleaseInventory:async()=>{checkNoLaterRead();if(terminal&&++reads===2){if(kind==='account')active=false;if(kind==='membership')member=false;if(kind==='tenant')tenant=false;if(kind==='expert')published=false;if(kind==='preview-role')superRole=false;if(kind==='preview-expiry')expired=true;}
   return[{id:'i',profileId:'p',status:'READY',revision:{id:'rev',document:{id:'d',enabled:true}},profile:{enabled:true}}];}};
  const core=new KnowledgeRetrievalService(db,inventory as any,{embed:async()=>({vectors:[[1,0]]})} as any,{lexical:async()=>[row],dense:async()=>[row],exact:async()=>[row],neighbors:async()=>[]} as any);
  const runtime=new ExpertRuntimeService(db,core,inventory as any),preview=kind.startsWith('preview');
  const result=await runtime.retrieve({id:'u'} as any,'tenant',preview?{agentId:'a',previewId:'pv'}:{agentId:'a',versionId:'v'},{sessionId:'s',turnId:'t'},'query',abort.signal);
  assert.equal(reads,2);
  const status=kind==='allowed'?'READY':kind==='cancel-at-decision'?'CANCELLED':'FORBIDDEN';assert.equal(result.status,status);assert.equal(traceRows.get(result.retrievalId).status,status);assert.equal(decisionMade,true);
  if(kind==='allowed')assert.ok(result.context.context.includes('PRIVATE FINAL BODY'));
  else{assert.deepEqual(result.evidence,[]);assert.equal(result.context.context,'');assert.deepEqual(traceRows.get(result.retrievalId).evidence,[]);assert.deepEqual(traceRows.get(result.retrievalId).releaseIds,[]);}
 });
});
