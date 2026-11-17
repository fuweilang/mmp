import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadedName, storedUploadedName } from '../../src/common/uploaded-name';
import { KnowledgeAdminController } from '../../src/knowledge-core/admin.controller';
import { KnowledgeInspectionService } from '../../src/knowledge-core/inspection.service';
import { KnowledgeCandidateStore } from '../../src/knowledge-core/candidate-store';

const name='本地验收资料🦣.md';
const mojibake=Buffer.from(name,'utf8').toString('latin1');

test('multipart UTF8 bytes are decoded once before new upload persistence',()=>{
  assert.equal(uploadedName(mojibake),name);
  assert.equal(uploadedName(name),name);
  assert.equal(uploadedName('café.md'),'café.md');
});
test('historical upload names with recoverable C1 byte markers are restored idempotently',()=>{
  assert.equal(storedUploadedName(mojibake),name);
  assert.equal(storedUploadedName(storedUploadedName(mojibake)),name);
});
test('ordinary Unicode, ASCII, ambiguous accents and undecodable names are preserved',()=>{
  for(const value of [name,'plain.md','café.md','Ã© literal.md','invalid\u009c.md','中文\u009c.md']) assert.equal(storedUploadedName(value),value);
});
test('document API projects readable names without mutating immutable stored revisions',async()=>{
  const stored=[{id:'doc',title:mojibake,revisions:[{id:'revision',originalName:mojibake,contentHash:'hash',indexes:[{id:'index',status:'READY'}]}]}];
  const before=structuredClone(stored);
  const db={knowledgeDocument:{findMany:async()=>stored}};
  const controller=new KnowledgeAdminController({} as any,db as any,{getBase:async()=>({})} as any,{} as any,{} as any,{} as any);
  const result=await controller.listDocuments('base');
  assert.equal(result[0].title,name);assert.equal(result[0].revisions[0].originalName,name);
  assert.deepEqual(result[0].revisions[0].indexes,[{id:'index',status:'READY'}]);assert.deepEqual(stored,before);
});
test('original download uses the same recovered name while retaining exact file bytes',async()=>{
  const bytes=Buffer.from('原文不变');
  const revision={id:'revision',documentId:'doc',originalName:mojibake,storageKey:'blob',contentHash:'hash',document:{enabled:true,base:{scope:'PLATFORM',tenantId:null,enabled:true}}};
  const db={user:{findUnique:async()=>({status:'active'})},userRole:{findFirst:async()=>({roleId:'super'})},knowledgeDocumentRevision:{findUnique:async()=>revision}};
  const result=await new KnowledgeInspectionService(db as any,{read:async()=>bytes} as any).original('super','doc','revision');
  assert.equal(result.originalName,name);assert.equal(result.bytes,bytes);assert.equal(revision.originalName,mojibake);
});
test('retrieval citations project the same readable source title without changing identities or source text',async()=>{
  const row={sourceTitle:mojibake,scopeType:'PLATFORM',tenantId:null,score:0,chunkId:'chunk',text:'保留原文',revisionId:'revision',contentHash:'hash'};
  const store=new KnowledgeCandidateStore({$queryRaw:async()=>[row]} as any);
  const result=await store.exact({releaseId:'release',scope:{type:'PLATFORM'},indexIds:['index']},'chunk');
  assert.equal(result[0].sourceTitle,name);assert.equal(result[0].text,row.text);assert.equal(result[0].revisionId,'revision');assert.equal(result[0].contentHash,'hash');assert.equal(row.sourceTitle,mojibake);
});
