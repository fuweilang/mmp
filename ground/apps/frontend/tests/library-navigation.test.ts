import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { consoleLibraryEntry, consoleLibraryMenuTarget, consoleLibraryNav, consoleLibraryView, consoleLibraryViews, memberLibraryView } from '../src/utils/libraryNavigation';

test('four existing scopes use child URLs without inventing new business views', () => {
  assert.deepEqual(consoleLibraryViews.map(item => item.id), ['recent', 'mine', 'shared', 'trash']);
  assert.deepEqual(consoleLibraryNav('MEMBER').map(item => item.id), ['recent', 'mine', 'shared', 'trash']);
  assert.deepEqual(consoleLibraryNav('ADMIN').map(item => item.id), ['recent', 'mine', 'shared', 'trash', 'members']);
  assert.equal(consoleLibraryView(memberLibraryView.path), 'members');
  assert.equal(consoleLibraryEntry('members'), '/console/library/mine');
  for (const item of consoleLibraryViews) {
    assert.equal(consoleLibraryView(item.path), item.id);
    assert.equal(consoleLibraryEntry(item.id), item.path);
    assert.ok(item.path.startsWith('/console/library/'));
  }
});
test('library menu opens each page at its first item', () => {
  assert.deepEqual(consoleLibraryMenuTarget(memberLibraryView.path), { path: '/console/library/members' });
  for (const item of consoleLibraryViews) assert.deepEqual(consoleLibraryMenuTarget(item.path), { path: item.path });
});
test('legacy entry defaults to private mine and cannot redirect to arbitrary URLs', () => {
  for (const bad of [undefined, null, '', 'https://evil.invalid', ['shared'], 'admin']) {
    assert.equal(consoleLibraryEntry(bad), '/console/library/mine');
  }
});
test('Console route source keeps AppShell/permissions and query/hash-preserving legacy redirects', () => {
  const source = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8');
  const consoleStart = source.indexOf("path: '/console'");
  assert.ok(consoleStart >= 0);
  const children = source.slice(consoleStart);
  assert.match(children, /component: AppShell/);
  assert.match(children, /consoleLibraryViews\.map/);
  assert.match(children, /perm: 'portal\.console\.access'/);
  assert.match(source, /path: '\/library', redirect: to => \({ path: consoleLibraryEntry\(to.query.view\), query: to.query, hash: to.hash }\)/);
});
test('parent menu only expands and Console content has no duplicate category navigation', () => {
  const shell = readFileSync(new URL('../src/layouts/AppShell.vue', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/views/Library.vue', import.meta.url), 'utf8');
  assert.match(shell, /@click="toggleLibraryGroup"/);
  assert.match(shell, /aria-controls="console-library-subnav"/);
  assert.match(shell, /children: consoleLibraryViews/);
  assert.match(shell, /consoleLibraryNav\(session\.value\?\.currentRole\)/);
  assert.match(shell, /consoleLibraryMenuTarget\(path\)/);
  assert.equal(shell.includes('libraryLocations'), false);
  assert.match(page, /aria-label="文件夹"/);
  assert.match(page, /route\.query\.folder/);
  assert.match(page, /route\.query\.q/);
  assert.ok(page.indexOf('let listSequence = 0;') < page.indexOf('watch([view,'));
});
