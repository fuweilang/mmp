import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveFileIndexes, restrictFileInventory } from '../../src/knowledge-core/live-files';

const index = (id: string, documentId: string, revisionTime: number, status = 'READY', indexTime = revisionTime) => ({
  id, status, createdAt: new Date(indexTime), profile: { enabled: true },
  revision: { id: `revision-${id}`, createdAt: new Date(revisionTime), document: { id: documentId, enabled: true } },
});
test('replacement keeps the previous ready file while the newer revision is processing or failed', () => {
  const old = index('old', 'a', 1), pending = index('pending', 'a', 2, 'PENDING');
  assert.deepEqual(effectiveFileIndexes([pending, old]).map(i => i.id), ['old']);
  pending.status = 'FAILED';
  assert.deepEqual(effectiveFileIndexes([old, pending]).map(i => i.id), ['old']);
  pending.status = 'READY';
  assert.deepEqual(effectiveFileIndexes([old, pending]).map(i => i.id), ['pending']);
});
test('late completion of an older revision cannot roll back a newer ready revision', () => {
  assert.deepEqual(effectiveFileIndexes([index('old-late', 'a', 1, 'READY', 99), index('new', 'a', 2)]).map(i => i.id), ['new']);
});
test('deleted, disabled and unconfigured files cannot become effective', () => {
  const removed = index('removed', 'a', 1), disabled = index('disabled', 'b', 1), provider = index('provider', 'c', 1);
  (removed.revision.document as any).deletedAt = new Date();
  disabled.revision.document.enabled = false;
  provider.profile.enabled = false;
  assert.deepEqual(effectiveFileIndexes([removed, disabled, provider]), []);
});
test('an expert selecting one file never receives other files from the same folder', () => {
  const inventory = [index('a', 'selected', 1), index('b', 'unselected', 1)];
  assert.deepEqual(restrictFileInventory(inventory, ['selected']).map(i => i.id), ['a']);
  assert.deepEqual(restrictFileInventory(inventory, []), []);
  assert.equal(restrictFileInventory(inventory).length, 2);
});
test('deduplicated restoration follows requested contents, while a pending request preserves the current successful revision',()=>{
  const old=index('old','a',1),newer=index('new','a',2);
  (old.revision.document as any).requestedIndexId='old';(newer.revision.document as any).requestedIndexId='old';
  assert.equal(effectiveFileIndexes([old,newer],['new'])[0].id,'old');
  (old.revision.document as any).requestedIndexId='pending';(newer.revision.document as any).requestedIndexId='pending';
  assert.equal(effectiveFileIndexes([old,newer],['old'])[0].id,'old');
});
