import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategoryItems } from '../src/catalog-category/catalog-category';

test('category rename/reorder keeps immutable keys and appends server-generated keys', () => {
  const result = normalizeCategoryItems([{ key: 'sales', name: ' 销售 ' }, { key: 'common', name: '常用' }, { name: '新分类' }], ['common', 'sales']);
  assert.deepEqual(result.slice(0, 2), [{ key: 'sales', name: '销售', sortOrder: 0 }, { key: 'common', name: '常用', sortOrder: 1 }]);
  assert.match(result[2].key, /^cat-/);
});
test('category submissions reject duplicates, reserved labels or invented keys', () => {
  for (const items of [[{ key: 'common', name: '全部' }], [{ key: 'common', name: ' ' }], [{ key: 'common', name: 'a'.repeat(33) }], [{ key: 'common', name: '常用' }, { name: ' 常用 ' }], [{ key: 'alien', name: '新增' }]]) {
    assert.throws(() => normalizeCategoryItems(items, ['common']));
  }
});
test('omitted keys are eligible for deletion after usage validation', () => {
 assert.deepEqual(normalizeCategoryItems([], ['common']), []);
});

import { CatalogCategoryService } from '../src/catalog-category/catalog-category.service';
import { assertCategoryKeys, categoryKind } from '../src/catalog-category/catalog-category';

test('unknown keys cannot be assigned even if well formed', async () => {
  const prisma = { catalogCategory: { count: async () => 0 } } as any;
  await assert.rejects(() => assertCategoryKeys(prisma, 'skill', ['cat-00000000-0000-0000-0000-000000000000']), /分类不存在/);
});
test('invalid directory domains cannot reach the database', () => {
  assert.throws(() => categoryKind('other'), /分类类型无效/);
});
test('stale version aborts before modifying category rows', async () => {
  const tx = { catalogCategoryDirectory: { updateMany: async () => ({ count: 0 }) } };
  const service = new CatalogCategoryService({ $transaction: (run: any) => run(tx) } as any);
  await assert.rejects(() => service.save('expert', { version: 0, items: [] }, 'actor'), /其他管理员/);
});
test('deleting an assigned category is rejected with reference count', async () => {
  const tx = {
    catalogCategoryDirectory: { updateMany: async () => ({ count: 1 }) },
    $queryRaw: async () => [],
    catalogCategory: { findMany: async () => [{ key: 'common', name: '常用', sortOrder: 0 }] },
    officialAgent: { count: async () => 3 },
  };
  const service = new CatalogCategoryService({ $transaction: (run: any) => run(tx) } as any);
  await assert.rejects(() => service.save('expert', { version: 0, items: [] }, 'actor'), /3个专家/);
});

import { AdminCatalogCategoryController, CatalogCategoryController } from '../src/catalog-category/catalog-category.controller';

test('disabled accounts cannot read or mutate catalog directories', async () => {
  const actor = { id: 'disabled', status: 'disabled', isPlatformAdmin: true } as any;
  const publicController = new CatalogCategoryController({} as any);
  assert.throws(() => publicController.read(actor, 'expert'), /账号已停用/);
  const adminController = new AdminCatalogCategoryController({} as any, {} as any, {} as any);
  await assert.rejects(() => adminController.save(actor, 'skill', { version: 0, items: [] }), /账号已停用/);
});
test('platform access does not grant expert category author authority', async () => {
  const actor = { id: 'operator', status: 'active', isPlatformAdmin: true } as any;
  const prisma = { user: { findUnique: async () => ({ status: 'active' }) }, userRole: { findFirst: async () => null } };
  const controller = new AdminCatalogCategoryController({} as any, { adminScope: async () => null } as any, prisma as any);
  await assert.rejects(() => controller.save(actor, 'expert', { version: 0, items: [] }), /SUPER_ADMIN_REQUIRED/);
});


test('category names reject invisible-only, controls and malformed Unicode', () => {
  for (const name of ['\u200b', ' \u200d\ufe0f ', '\u00ad', '\u2060', '财\u0000务', '财\n务', '\t财务', '\ud800']) {
    assert.throws(() => normalizeCategoryItems([{ name }], []), /分类名称/);
  }
});
test('category names preserve visible multilingual text and emoji joiners', () => {
  for (const name of ['财务管理', '👩‍💻', 'می\u200cروم', '翻译 / 写作', '💼'.repeat(32)]) {
    assert.equal(normalizeCategoryItems([{ name }], [])[0].name, name);
  }
});
test('invalid version numbers are rejected before accessing the database', async () => {
  let accessed = false;
  const service = new CatalogCategoryService({ $transaction: () => { accessed = true; throw new Error('unexpected database access'); } } as any);
  for (const version of [-1, 0.5, '1', null, 2147483647, 2147483648, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(() => service.save('expert', { version, items: [] }, 'actor'), /分类版本无效/);
  }
  assert.equal(accessed, false);
});

test('deletion preflight checks expert references before a draft can remove the category', async () => {
 const service = new CatalogCategoryService({catalogCategory:{findUnique:async()=>({key:'common'})},officialAgent:{count:async()=>3}} as any);
 assert.deepEqual(await service.usage('expert','common'),{count:3});
});
