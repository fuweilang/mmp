import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OcrPageStore} from '../../src/knowledge-core/ocr-progress';
test('page checkpoints survive a new store instance, keep blank pages, and bind immutable source identity',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ocr-progress-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const first=new OcrPageStore(root);await first.initialize('index',{identity:'a'.repeat(64),totalPages:120});
 await first.writePage('index',1,{text:'page one',partial:false});await first.writePage('index',2,{text:'',partial:false});
 const restored=new OcrPageStore(root);assert.equal((await restored.progress('index'))?.completedPages,2);assert.equal((await restored.readPage('index',2))?.text,'');
 assert.equal((await restored.progress('index'))?.nextPage,3);
 await assert.rejects(()=>restored.initialize('index',{identity:'b'.repeat(64),totalPages:120}),(e:any)=>e.code==='OCR_CHECKPOINT_MISMATCH');
 await assert.rejects(()=>restored.writePage('index',3,{text:'unclear',partial:true}));
});

import {KnowledgeJobsService} from '../../src/knowledge-core/jobs.service';
test('successful batch yield is lease fenced and does not consume the failure retry allowance',async()=>{
 let valid=true;const writes:any[]=[];
 const tx={$queryRaw:async(strings:any)=>String(strings).includes('clock_timestamp')?[{valid:true}]:valid?[{id:'job',lease_until:new Date(Date.now()+60000)}]:[],knowledgeIngestionJob:{findUniqueOrThrow:async()=>({id:'job'}),update:async(args:any)=>writes.push(args)}};
 const jobs=new KnowledgeJobsService({$transaction:async(fn:any)=>fn(tx)} as any);
 await jobs.yieldBatch('job','token');assert.equal(writes[0].data.status,'QUEUED');assert.equal(writes[0].data.attempts,0);assert.equal(writes[0].data.leaseToken,null);
 valid=false;await assert.rejects(()=>jobs.yieldBatch('job','stale'),(e:any)=>e.code==='INGESTION_LEASE_LOST');assert.equal(writes.length,1);
});
test('concurrent valid page writers use the first completed result without overwriting or failing the next claim',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ocr-progress-race-'));t.after(()=>rm(root,{recursive:true,force:true}));const a=new OcrPageStore(root),b=new OcrPageStore(root);await a.initialize('index',{identity:'a'.repeat(64),totalPages:1});
 const values=await Promise.all([a.writePage('index',1,{text:'first transcription',partial:false}),b.writePage('index',1,{text:'second transcription',partial:false})]);assert.deepEqual(values[0],values[1]);assert.deepEqual(await a.readPage('index',1),values[0]);
});

test('native PDF page checkpoints allow dense text without relaxing vision response limits',async t=>{
 const root=await mkdtemp(join(tmpdir(),'native-page-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new OcrPageStore(root);await store.initialize('native',{identity:'a'.repeat(64),totalPages:1});
 const text='Native text '.repeat(6000);await store.writePage('native',1,{text,partial:false,method:'text'});assert.equal((await store.readPage('native',1))?.text,text);
 await assert.rejects(()=>store.writePage('native',1,{text,partial:false,method:'ocr'}));
});
