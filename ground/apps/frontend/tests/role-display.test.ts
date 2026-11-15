import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  grantedCatalogGroups,
  knownPermissionKeys,
} from '../src/components/admin/roles/roleDisplay.ts';

const catalog = [{
  category: 'console',
  labelZh: '控制台',
  labelEn: 'Console',
  items: [{ key: 'portal.console.roles', labelZh: '角色', labelEn: 'Roles' }],
  pages: [{
    page: 'roles',
    pageZh: '角色',
    pageEn: 'Roles',
    items: [
      { key: 'portal.console.roles', labelZh: '角色', labelEn: 'Roles' },
      { key: 'portal.console.kb', labelZh: '资料', labelEn: 'Library' },
    ],
  }],
}];

test('known permission keys drop stale keys and sort only when asked', () => {
  assert.deepEqual(
    knownPermissionKeys(catalog, ['portal.console.roles', 'portal.console.agents', 'portal.console.kb']),
    ['portal.console.roles', 'portal.console.kb'],
  );
  assert.deepEqual(
    knownPermissionKeys(catalog, ['portal.console.roles', 'portal.console.kb'], true),
    ['portal.console.kb', 'portal.console.roles'],
  );
});

test('granted catalog groups keep only selected permissions', () => {
  const groups = grantedCatalogGroups(catalog, new Set(['portal.console.kb']));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].pages[0].items.map((item) => item.key), ['portal.console.kb']);
});
