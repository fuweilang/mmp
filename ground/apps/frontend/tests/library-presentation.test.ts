import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { libraryFileType, libraryListLocation } from '../src/utils/libraryPresentation';
import { listLibrary } from '../src/api/library';

test('mine all-level query keeps server paging/search/auth and shared directories unchanged', async () => {
  const previous = globalThis.fetch; const urls: URL[] = [];
  globalThis.fetch = async (url, options) => { urls.push(new URL(String(url), 'http://fixture.invalid')); assert.equal(options?.credentials, 'include'); return Response.json({ items: [], total: 0, breadcrumb: [], page: 2, pageSize: 20 }); };
  try {
    const mine = libraryListLocation('mine', 'obsolete-folder'); assert.deepEqual(mine, { flat: true, parentId: null });
    await listLibrary('mine', mine.parentId, ' all levels ', 2, mine.flat);
    const shared = libraryListLocation('shared', 'apple'); await listLibrary('shared', shared.parentId, '', 1, shared.flat);
    assert.equal(urls[0]!.pathname, '/console/api/library/items'); assert.equal(urls[0]!.searchParams.get('flat'), '1'); assert.equal(urls[0]!.searchParams.get('parentId'), null);
    assert.equal(urls[0]!.searchParams.get('q'), 'all levels'); assert.equal(urls[0]!.searchParams.get('page'), '2'); assert.equal(urls[0]!.searchParams.get('pageSize'), '20');
    assert.equal(urls[1]!.searchParams.get('flat'), null); assert.equal(urls[1]!.searchParams.get('parentId'), 'apple');
  } finally { globalThis.fetch = previous; }
});
test('type labels use kind/server MIME, not display extensions; unknown types stay honest', () => {
  assert.equal(libraryFileType({ kind: 'FOLDER' }), '文件夹'); assert.equal(libraryFileType({ kind: 'LINK' }), '链接');
  for (const [mimeType, label] of [['image/png','图片'], ['video/mp4','视频'], ['APPLICATION/PDF; charset=binary','PDF'], ['application/msword','Word'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','Word'], ['application/vnd.ms-excel','Excel'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Excel'], ['application/vnd.ms-powerpoint','PPT'], ['application/vnd.openxmlformats-officedocument.presentationml.presentation','PPT'], ['text/plain','文本'], ['application/octet-stream','其他'], ['','其他']]) assert.equal(libraryFileType({kind:'FILE',currentVersion:{mimeType}}),label);
  assert.equal(libraryFileType({kind:'FILE'}),'其他');
});
test('Console no tree/folder preview; four scopes share white 15px page and namespaced scroll-safe dialogs', () => {
  const page = readFileSync(new URL('../src/views/Library.vue', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../src/layouts/AppShell.vue', import.meta.url), 'utf8');
  const custody = readFileSync(new URL('../src/components/LibraryCustodyApproval.vue', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/libraryDialogs.css', import.meta.url), 'utf8');
  assert.match(shell,/\.workspace\.library-workspace \{ padding:0; background:#fff;/);
  assert.doesNotMatch(shell,/LibraryNavTree|libraryTreeExpanded|library-tree-toggle/); assert.match(page,/label="文件类型"/); assert.match(page,/libraryParentPath\(row\)/);
  assert.match(page,/v-if="row.kind !== 'FOLDER'" text type="primary" @click="openPreview\(row\)">预览/);
  assert.match(page,/\.library-page \{[^}]*padding:15px;[^}]*background:#fff;/);
  const dialogs=[...(page+custody).matchAll(/<el-dialog\b[^>]*>/g)]; assert.equal(dialogs.length,5);
  for(const [dialog] of dialogs) { assert.match(dialog,/align-center/); assert.match(dialog,/class="library-modal"/); }
  assert.doesNotMatch(page,/<el-drawer/);
  for(const [call] of (page+custody).matchAll(/ElMessageBox\.(?:prompt|confirm)\([^;]+/g)) assert.match(call,/customClass: 'library-message-box'/);
  assert.match(css,/max-height: calc\(100dvh/); assert.match(css,/el-dialog__body \{[^}]*overflow-y: auto/);
  assert.match(css,/--library-dialog-gap: 24px/); assert.match(css,/--library-dialog-gap: 16px/); assert.match(css,/overflow-wrap: anywhere/);
  assert.ok(!/^\.el-dialog\s*\{/m.test(css));
});
