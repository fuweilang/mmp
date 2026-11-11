import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableKnowledgeFile, knowledgeFileStatus, selectedKnowledgeFiles } from '../src/utils/knowledge-files';
const document: any = {id:'doc',title:'资料',enabled:true,revisions:[
  {id:'old',createdAt:'2026-11-09',indexes:[{id:'old-index',status:'READY'}]},
  {id:'new',createdAt:'2026-11-10',indexes:[{id:'new-index',status:'PENDING'}]},
]};
test('a pending replacement remains selectable through its previous successful content',()=>{
  assert.equal(availableKnowledgeFile(document)?.index.id,'old-index');
  assert.equal(knowledgeFileStatus(document),'更新中 · 当前内容可用');
});
test('a new file without successful chunks cannot be selected',()=>{
  assert.equal(availableKnowledgeFile({...document,revisions:[document.revisions[1]]}),undefined);
});
test('selection follows document identity when a file is replaced',()=>{
  assert.deepEqual(selectedKnowledgeFiles([document],[{id:'release',items:[{indexRevisionId:'old-index'}]}] as any,['release']),['doc']);
  const replaced=structuredClone(document);replaced.revisions[1].indexes[0].status='READY';
  assert.equal(availableKnowledgeFile(replaced)?.index.id,'new-index');
  assert.deepEqual(selectedKnowledgeFiles([replaced],[{id:'release',items:[{indexRevisionId:'old-index'}]}] as any,['release']),['doc']);
});
test('the effective file and requested revision take precedence over immutable revision age',()=>{
  const restored={...document,effectiveIndexId:'old-index',requestedIndexId:'old-index'};
  assert.equal(availableKnowledgeFile(restored)?.index.id,'old-index');
  assert.equal(knowledgeFileStatus(restored),'可用');
});
