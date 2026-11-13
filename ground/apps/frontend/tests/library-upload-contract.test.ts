import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runLibraryUploads, type UploadRow } from '../src/utils/libraryUploadQueue';
test('queue keeps actual progress, continues partial failures, retries failed only and never replays saved items', async () => {
  const rows: UploadRow[]=['a.md','b.md','c.md'].map((name,i)=>({id:String(i),file:new File(['fixture'],name),status:'queued'}));
  const calls:string[]=[]; let failed=false, active=0, max=0;
  const transport=async(file:File,progress:(ratio:number)=>void)=>{ calls.push(file.name); active++;max=Math.max(max,active);progress(.5);await Promise.resolve();active--;if(file.name==='b.md'&&!failed){failed=true;throw new Error('403 rejected');}return '已保存';};
  const limits={maxFileBytes:100,allowedExtensions:['.md']};
  assert.equal(await runLibraryUploads(rows,limits,transport),2);assert.deepEqual(rows.map(row=>row.status),['success','failed','success']);assert.equal(max,1);
  assert.equal(rows[0]?.progress,.5);assert.equal(rows[1]?.message,'403 rejected');
  assert.equal(await runLibraryUploads(rows,limits,transport),1);assert.deepEqual(calls,['a.md','b.md','c.md','b.md']);
});
test('new and replacement upload entrypoints retain their original auth/API contracts, not avatars/imports',()=>{
  for(const name of ['../src/views/Library.vue','../src/views/Knowledge.vue','../src/views/admin/AdminOfficialKnowledge.vue']) {
    const source=readFileSync(new URL(name,import.meta.url),'utf8');assert.match(source,/<LibraryUploadDialog/);assert.doesNotMatch(source,/<input[^>]*type="file"/);
  }
  const kb=readFileSync(new URL('../src/views/Knowledge.vue',import.meta.url),'utf8');assert.match(kb,/form.append\('visibility', context.visibility\)/);assert.match(kb,/form.append\('userIds'/);
  const official=readFileSync(new URL('../src/views/admin/AdminOfficialKnowledge.vue',import.meta.url),'utf8');assert.match(official,/body.append\('agentId', context.agentId\)/);assert.match(official,/adminOfficialKnowledgeApi.replace\(context.replacementId, body\)/);
  const admin=readFileSync(new URL('../src/views/admin/AdminLibrary.vue',import.meta.url),'utf8');assert.match(admin,/<LibraryUploadDialog/);assert.doesNotMatch(admin,/<input[^>]*type="file"/);
});
