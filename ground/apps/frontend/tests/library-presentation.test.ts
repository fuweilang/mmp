import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { libraryFileType, libraryFileTypeColor, libraryFileTypeOptions, libraryFolderLabel, libraryFolderTree, libraryListLocation, libraryParseStatusOption, libraryParseStatusOptions, libraryPreviewIsPdf } from '../src/utils/libraryPresentation';
import { listLibrary } from '../src/api/library';

test('mine drills into the current folder and searches every owned item flat', async () => {
  const previous = globalThis.fetch; const urls: URL[] = [];
  globalThis.fetch = async (url, options) => { urls.push(new URL(String(url), 'http://fixture.invalid')); assert.equal(options?.credentials, 'include'); return Response.json({ items: [], total: 0, breadcrumb: [], page: 2, pageSize: 20 }); };
  try {
    const drilled = libraryListLocation('mine', 'folder-a'); assert.deepEqual(drilled, { flat: false, parentId: 'folder-a' });
    await listLibrary('mine', drilled.parentId, '', 1, drilled.flat, 10);
    const searching = libraryListLocation('mine', 'folder-a', true); assert.deepEqual(searching, { flat: true, parentId: null });
    await listLibrary('mine', searching.parentId, ' all levels ', 2, searching.flat);
    const shared = libraryListLocation('shared', 'apple'); await listLibrary('shared', shared.parentId, '', 1, shared.flat);
    assert.deepEqual(libraryListLocation('recent', 'folder-a'), { flat: false, parentId: null });
    assert.deepEqual(libraryListLocation('trash', 'folder-a'), { flat: false, parentId: null });
    assert.equal(urls[0]!.pathname, '/console/api/library/items'); assert.equal(urls[0]!.searchParams.get('flat'), null); assert.equal(urls[0]!.searchParams.get('parentId'), 'folder-a');
    assert.equal(urls[0]!.searchParams.get('pageSize'), '10');
    assert.equal(urls[1]!.searchParams.get('flat'), '1'); assert.equal(urls[1]!.searchParams.get('parentId'), null);
    assert.equal(urls[1]!.searchParams.get('q'), 'all levels'); assert.equal(urls[1]!.searchParams.get('page'), '2');
    assert.equal(urls[2]!.searchParams.get('flat'), null); assert.equal(urls[2]!.searchParams.get('parentId'), 'apple');
    await listLibrary('mine', null, '', 1, true, 10, 'pdf');
    assert.equal(urls[3]!.searchParams.get('pageSize'), '10'); assert.equal(urls[3]!.searchParams.get('fileType'), 'pdf');
    assert.equal(urls[3]!.searchParams.get('status'), null);
    await listLibrary('recent', null, '', 1, false, 20, undefined, 'ready');
    assert.equal(urls[4]!.searchParams.get('status'), 'ready'); assert.equal(urls[4]!.searchParams.get('view'), 'recent');
  } finally { globalThis.fetch = previous; }
});
test('folder choices show the root and every ancestor', () => {
  const folders = [
    { id: 'a', name: 'aaaa', parentId: null, scope: 'PRIVATE' as const },
    { id: 'b', name: 'bbb', parentId: 'a', scope: 'PRIVATE' as const },
    { id: 's', name: '共享夹', parentId: null, scope: 'ENTERPRISE' as const },
  ];
  assert.equal(libraryFolderLabel(folders[0]!, folders), '我的资料 / aaaa');
  assert.equal(libraryFolderLabel(folders[1]!, folders), '我的资料 / aaaa / bbb');
  assert.equal(libraryFolderLabel({ ...folders[1]!, parentPath: [{ name: 'aaaa' }] }, folders), '我的资料 / aaaa / bbb');
  assert.equal(libraryFolderLabel(folders[2]!, folders), '企业共享 / 共享夹');
  assert.deepEqual(libraryFolderTree(folders, 'PRIVATE', new Set(['b'])), [{ id: 'a', label: 'aaaa', scope: 'PRIVATE', children: [] }]);
  assert.deepEqual(libraryFolderTree(folders, 'PRIVATE'), [{ id: 'a', label: 'aaaa', scope: 'PRIVATE', children: [{ id: 'b', label: 'bbb', scope: 'PRIVATE', children: [] }] }]);
  assert.deepEqual(libraryFolderTree(folders, 'ENTERPRISE'), [{ id: 's', label: '共享夹', scope: 'ENTERPRISE', children: [] }]);
  assert.deepEqual(libraryFolderTree(folders, null).map((node) => node.id).sort(), ['a', 's']);
});
test('type labels use kind/server MIME, not display extensions; unknown types stay honest', () => {
  assert.equal(libraryFileType({ kind: 'FOLDER' }), '文件夹'); assert.equal(libraryFileType({ kind: 'LINK' }), '链接');
  for (const [mimeType, label] of [['image/png','图片'], ['video/mp4','视频'], ['APPLICATION/PDF; charset=binary','PDF'], ['application/msword','Word'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','Word'], ['application/vnd.ms-excel','Excel'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Excel'], ['application/vnd.ms-powerpoint','PPT'], ['application/vnd.openxmlformats-officedocument.presentationml.presentation','PPT'], ['text/plain','文本'], ['application/octet-stream','其他'], ['','其他']]) assert.equal(libraryFileType({kind:'FILE',currentVersion:{mimeType}}),label);
  assert.equal(libraryFileType({kind:'FILE'}),'其他');
  assert.equal(new Set(libraryFileTypeOptions.map((option) => option.color)).size, libraryFileTypeOptions.length);
  assert.equal(libraryFileTypeColor('PDF'), libraryFileTypeOptions.find((option) => option.label === 'PDF')?.color);
  assert.equal(libraryPreviewIsPdf({ mimeType: 'application/pdf', name: '说明.pdf' }), true);
  assert.equal(libraryPreviewIsPdf({ mimeType: 'application/octet-stream', originalName: '扫描.PDF' }), true);
  assert.equal(libraryPreviewIsPdf({ mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', name: '稿.pptx' }), false);
  assert.equal(libraryPreviewIsPdf({ mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: '表.xlsx' }), false);
});
test('parse status dropdown labels are the table labels, each with its own color', () => {
  assert.deepEqual(libraryParseStatusOptions.map((option) => option.label), ['可供 AI 引用', '仅保存', '处理中', '失败']);
  assert.equal(new Set(libraryParseStatusOptions.map((option) => option.color)).size, libraryParseStatusOptions.length);
  assert.equal(libraryParseStatusOption('READY')?.label, '可供 AI 引用');
  assert.equal(libraryParseStatusOption('DOWNLOAD_ONLY')?.label, '仅保存');
  assert.equal(libraryParseStatusOption('PENDING')?.label, '处理中');
  assert.equal(libraryParseStatusOption('PROCESSING')?.label, libraryParseStatusOption('PENDING')?.label);
  assert.equal(libraryParseStatusOption('PROCESSING')?.color, libraryParseStatusOption('PENDING')?.color);
  assert.equal(libraryParseStatusOption('FAILED')?.label, '失败');
  assert.equal(libraryParseStatusOption('NOT_APPLICABLE'), undefined);
});
test('Console no tree/folder preview; four scopes share a white page and namespaced scroll-safe dialogs', () => {
  const page = readFileSync(new URL('../src/views/Library.vue', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../src/layouts/AppShell.vue', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/libraryDialogs.css', import.meta.url), 'utf8');
  assert.match(shell,/\.workspace\.library-workspace \{ background:#fff;/);
  assert.doesNotMatch(shell,/LibraryNavTree|libraryTreeExpanded|library-tree-toggle/); assert.match(page,/label="文件类型"/); assert.match(page,/placeholder="处理状态"/); assert.match(page,/<el-select v-model="parseStatus"/); assert.match(page,/libraryParseStatusOptions/); assert.match(page,/parseStatusMark\(row\)!\.label/); assert.match(page,/libraryParentPath\(row\)/);
  assert.match(page,/<el-tree/); assert.doesNotMatch(page,/class="library-path"/);
  assert.match(page,/v-if="row.kind !== 'FOLDER'" text type="primary" @click="openPreview\(row\)">预览/);
  assert.match(page,/\.library-page \{[^}]*background:#fff;/);
  assert.doesNotMatch(page,/\.library-page \{[^}]*padding:15px/);
  assert.doesNotMatch(page,/代管授权|LibraryCustodyApproval/);
  const dialogs=[...page.matchAll(/<el-dialog\b[^>]*>/g)]; assert.equal(dialogs.length,4);
  for(const [dialog] of dialogs) { assert.match(dialog,/align-center/); assert.match(dialog,/class="library-modal"/); }
  assert.doesNotMatch(page,/<el-drawer/);
  for(const [call] of page.matchAll(/ElMessageBox\.(?:prompt|confirm|alert)\([^;]+/g)) assert.match(call,/customClass: 'library-message-box'/);
  assert.match(css,/max-height: calc\(100dvh/); assert.match(css,/el-dialog__body \{[^}]*overflow-y: auto/);
  assert.match(css,/--library-dialog-gap: 24px/); assert.match(css,/--library-dialog-gap: 16px/); assert.match(css,/overflow-wrap: anywhere/);
  assert.ok(!/^\.el-dialog\s*\{/m.test(css));
});
