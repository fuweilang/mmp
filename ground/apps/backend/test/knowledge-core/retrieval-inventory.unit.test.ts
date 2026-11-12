import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KnowledgeCoreService } from '../../src/knowledge-core/knowledge-core.service';

// A missing sealed-release/scope/enabled check would disclose an unauthorized inventory.
test('retrieval inventory rejects unsealed, disabled, missing and foreign-scope releases', async t => {
  for (const [name, row, scope, code] of [
    ['missing', undefined, {type:'PLATFORM'}, 'KNOWLEDGE_RELEASE_NOT_FOUND'],
    ['unsealed', {sealed:false,scope:'PLATFORM',tenantId:null,enabled:true}, {type:'PLATFORM'}, 'KNOWLEDGE_RELEASE_NOT_FOUND'],
    ['disabled', {sealed:true,scope:'PLATFORM',tenantId:null,enabled:false}, {type:'PLATFORM'}, 'KNOWLEDGE_DISABLED'],
    ['foreign tenant', {sealed:true,scope:'TENANT',tenantId:'other',enabled:true}, {type:'TENANT',tenantId:'ours'}, 'KNOWLEDGE_SCOPE_MISMATCH'],
    ['platform as tenant', {sealed:true,scope:'PLATFORM',tenantId:null,enabled:true}, {type:'TENANT',tenantId:'ours'}, 'KNOWLEDGE_SCOPE_MISMATCH'],
  ] as const) await t.test(name, async () => {
    const service = new KnowledgeCoreService({$queryRaw:async()=>row?[{...row,inventory:[]}]:[]} as any, undefined as any, undefined as any, undefined as any);
    await assert.rejects(service.getRetrievalInventory('release',scope as any), (error:any)=>error.code===code);
  });
});

// Request-local batching must never become a positive authorization cache.
test('retrieval inventory reads fresh flags on every call and retains exact revision identities', async () => {
  let enabled=true,reads=0;
  const index={id:'i',profileId:'p',indexConfigHash:'hash',status:'READY',profile:{enabled:true},revision:{id:'rev',document:{id:'doc',baseId:'base',enabled:true}}};
  const service=new KnowledgeCoreService({$queryRaw:async()=>{reads++;return [{sealed:true,scope:'TENANT',tenantId:'ours',enabled,inventory:[index]}];}} as any,undefined as any,undefined as any,undefined as any);
  assert.deepEqual(await service.getRetrievalInventory('release',{type:'TENANT',tenantId:'ours'}),[index]);
  enabled=false;
  await assert.rejects(service.getRetrievalInventory('release',{type:'TENANT',tenantId:'ours'}),(error:any)=>error.code==='KNOWLEDGE_DISABLED');
  assert.equal(reads,2);
});
