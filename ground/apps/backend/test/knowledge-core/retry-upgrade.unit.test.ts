import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {KnowledgeCoreService} from '../../src/knowledge-core/knowledge-core.service';
import {KNOWLEDGE_PARSER_VERSION,KNOWLEDGE_CHUNKER_VERSION} from '../../src/knowledge-core/index-config';
const scope={type:'PLATFORM' as const};
function fixture(){const calls:any[]=[];const service=new KnowledgeCoreService({$transaction:async()=>{throw Error('old jobs must not be reset in-place');},knowledgeDocumentRevision:{findUnique:async()=>({id:'rev',documentId:'doc',originalName:'scan.pdf',mediaType:'application/pdf',storageKey:'blob',document:{id:'doc',baseId:'base',enabled:true,deletedAt:null,requestedIndexId:'old-index'}})}} as any,{resolveForRequest:async()=>({maxInputTokens:8192})} as any,{read:async()=>Buffer.from('%PDF-test')} as any,{} as any);
 (service as any).inspectJob=async()=>({id:'old-job',baseId:'base',status:'FAILED',index:{id:'old-index',revisionId:'rev',profileId:'profile',parserVersion:'knowledge-parser-v8',chunkerVersion:KNOWLEDGE_CHUNKER_VERSION,chunkerConfig:{targetTokens:600,maxTokens:900,overlapTokens:80}}});
 (service as any).getBase=async()=>({id:'base',enabled:true});
 (service as any).acceptUpload=async(...args:any[])=>{calls.push(args);return {id:'new-job',indexRevisionId:'new-index',status:'QUEUED'};};
 return {service,calls};}
test('an obsolete failed job is upgraded without mutating the old immutable index',async()=>{const f=fixture();const result=await f.service.retryJob('old-job',scope);assert.equal(result.id,'new-job');assert.equal(f.calls.length,1);const [,passedScope,input,intent,expected]=f.calls[0];assert.deepEqual(passedScope,scope);assert.equal(input.originalName,'scan.pdf');assert.equal(input.indexConfig.parseMode,'auto');assert.equal(input.indexConfig.targetTokens,600);assert.equal(input.documentId,'doc');assert.equal(intent,'reprocess');assert.equal(expected,'old-index');});
test('repeated upgrade retries use the same request identity',async()=>{const f=fixture();await f.service.retryJob('old-job',scope);await f.service.retryJob('old-job',scope);assert.equal(f.calls[0][2].idempotencyKey,f.calls[1][2].idempotencyKey);});

test('a current-version failed job retries in place and retains the existing checkpoint identity',async()=>{
 let status='FAILED';const writes:any[]=[];const index={id:'current-index',profileId:'profile',parserVersion:KNOWLEDGE_PARSER_VERSION,chunkerVersion:KNOWLEDGE_CHUNKER_VERSION};
 const tx={$queryRaw:async()=>[],knowledgeIngestionJob:{findUniqueOrThrow:async()=>({id:'job',status,indexRevisionId:index.id}),update:async({data}:any)=>{writes.push(data);status=data.status;}},knowledgeIndexRevision:{update:async({data}:any)=>writes.push(data)}};
 const service=new KnowledgeCoreService({$transaction:async(fn:any)=>fn(tx)} as any,{resolveForRequest:async()=>({maxInputTokens:8192})} as any,{} as any,{} as any);(service as any).inspectJob=async()=>({id:'job',status,index});
 const result=await service.retryJob('job',scope);assert.equal(result.id,'job');assert.equal(result.status,'QUEUED');assert.deepEqual(writes[0],{status:'PENDING',reasonCode:null});assert.ok(!('parserVersion' in writes[0]));
});
test('a stale upgrade retry cannot replace a newer requested index',async()=>{
 const base={id:'base',scope:'PLATFORM',tenantId:null,enabled:true};const tx={$queryRaw:async()=>[],knowledgeBase:{findUniqueOrThrow:async()=>base},knowledgeIngestionRequest:{findUnique:async()=>null},knowledgeDocument:{findUnique:async()=>({id:'doc',baseId:'base',enabled:true,deletedAt:null,requestedIndexId:'newer-index'})}};
 const service=new KnowledgeCoreService({$transaction:async(fn:any)=>fn(tx)} as any,{resolveForRequest:async()=>({maxInputTokens:8192})} as any,{put:async()=>({storageKey:'a'.repeat(64),contentHash:'a'.repeat(64),sizeBytes:3})} as any,{} as any);(service as any).getBase=async()=>base;
 await assert.rejects(()=>(service as any).acceptUpload('base',scope,{originalName:'scan.pdf',bytes:Buffer.from('PDF'),profileId:'profile',idempotencyKey:'upgrade',documentId:'doc'},'reprocess','old-index'),(e:any)=>e.code==='INGESTION_RETRY_SUPERSEDED');
});
