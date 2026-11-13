import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readExpertKnowledgeCatalog } from '../../src/knowledge-core/editor-catalog';

test('editor catalog batches metadata for many bases and excludes document bodies and other scopes', async () => {
  const queries: Array<{table:string;query:any}> = [];
  const bases=Array.from({length:67},(_,i)=>({id:`base-${i}`,name:`资料${i}`,enabled:i!==66,currentReleaseId:`release-${i}`}));
  const db={
    knowledgeBase:{findMany:async(query:any)=>{queries.push({table:'base',query});return bases;}},
    knowledgeDocument:{findMany:async(query:any)=>{queries.push({table:'document',query});return [{id:'document',baseId:'base-0',title:'资料.md',enabled:true,revisions:[{id:'revision',originalName:'资料.md',indexes:[{id:'index',status:'READY'}]}]}];}},
    knowledgeRelease:{findMany:async(query:any)=>{queries.push({table:'release',query});return [{id:'release-0',baseId:'base-0',version:1,items:[{indexRevisionId:'index'}]}];}},
  };
  const result=await readExpertKnowledgeCatalog(db as never);
  assert.equal(queries.length,3);
  assert.equal(result.length,67);
  assert.equal(result[0].documents[0].effectiveIndexId,undefined); // immutable base
  assert.equal(result[0].releases[0].items[0].indexRevisionId,'index');
  assert.deepEqual(result[66].documents,[]);
  assert.deepEqual(queries[0].query.where,{scope:'PLATFORM',tenantId:null});
  for (const row of queries.slice(1)) assert.deepEqual(row.query.where.base,{scope:'PLATFORM',tenantId:null,enabled:true});
  const docQuery=queries.find(q=>q.table==='document')!.query;
  assert.equal(docQuery.where.deletedAt,null);
  assert.equal(docQuery.select.revisions.select.blobKey,undefined);
  assert.equal(docQuery.select.revisions.select.text,undefined);
  assert.equal(docQuery.select.revisions.select.indexes.select.vector,undefined);
  assert.equal(queries.find(q=>q.table==='release')!.query.where.sealed,true);
});
