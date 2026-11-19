import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryDraftError, moveCategory } from '../src/utils/catalog-categories';
test('category names reject blanks, duplicates after trim and reserved labels', () => {
  assert.ok(categoryDraftError([{ name: '  ' }]));
  assert.ok(categoryDraftError([{ name: '财务' }, { name: ' 财务 ' }]));
  assert.ok(categoryDraftError([{ name: '全部' }]));
  assert.ok(categoryDraftError([{ name: '未分类' }]));
  assert.equal(categoryDraftError([{ key: 'custom', name: ' 财务管理 ' }]), '');
});
test('moving categories preserves keys and boundaries', () => {
 const rows = [{key:'a',name:'甲'},{key:'b',name:'乙'}];
 moveCategory(rows,1,-1); assert.deepEqual(rows.map(x=>x.key), ['b','a']);
 moveCategory(rows,0,-1); assert.deepEqual(rows.map(x=>x.key), ['b','a']);
});

test('category names reject invisible-only and control characters before sending', () => {
  for (const name of ['\u200b', ' \u200d\ufe0f ', '\u00ad', '财\u0000务', '\t财务', '\ud800']) assert.ok(categoryDraftError([{ name }]));
});
test('category names enforce the same case-insensitive duplicates and reserved words as the server', () => {
  assert.ok(categoryDraftError([{name:'AbC'},{name:' abc '}]));
  for (const name of ['ALL',' unCategorized ','全部']) assert.ok(categoryDraftError([{name}]));
});
test('category names retain legitimate multilingual format characters', () => {
  for (const name of ['财务管理','👩‍💻','می\u200cروم','翻译 / 写作','💼'.repeat(32)]) assert.equal(categoryDraftError([{name}]), '');
});
