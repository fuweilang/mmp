/** Real HTTP inheritance, recursive sharing and wire validation against the isolated local DB. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withLibraryHttpFixture } = require('./library.http-fixture.cjs');

test('shared creation, recursive confirmation, member access and rollback over real HTTP', { timeout: 45000 }, async t => {
  await withLibraryHttpFixture(async ({ request, prisma }) => {
    let shared, folder, child;
    await t.test('ordinary member creates shared root directly, multipart children inherit and cannot be edited by a peer', async () => {
      const root = await request('owner', 'folders', 'POST', { name: 'HTTP共享', scope: 'ENTERPRISE', confirmShare: true });
      assert.equal(root.status, 201); shared = root.body;
      assert.equal(shared.scope, 'ENTERPRISE');
      assert.equal((await request('mate', 'items?view=shared')).body.items.some(row => row.id === shared.id), true);
      const nested = await request('mate', 'folders', 'POST', { name: '同事子目录', parentId: shared.id });
      assert.equal(nested.body.scope, 'ENTERPRISE');
      const form = new FormData(); form.append('files', new Blob(['HTTP共享正文']), 'inherited.md'); form.append('parentId', nested.body.id);
      const upload = await request('owner', 'files', 'POST', form);
      assert.equal(upload.body.failed.length, 0); const file = upload.body.items[0];
      assert.equal(file.scope, 'ENTERPRISE');
      assert.match((await request('mate', `nodes/${file.id}/preview`)).body.text, /HTTP共享正文/);
      assert.equal((await request('mate', `nodes/${file.id}`, 'PATCH', { name: '越权修改' })).status, 403);
      assert.equal((await request('other', `nodes/${file.id}/preview`)).status, 404);
      assert.equal((await request('owner', 'folders', 'POST', { name: '陈旧范围', parentId: shared.id, scope: 'PRIVATE' })).status, 409);
    });
    await t.test('root multipart scope is parsed and invalid or unconfirmed values are rejected', async () => {
      for (const confirm of ['true', 'false', 'nonsense']) {
        const form = new FormData(); form.append('files', new Blob(['root']), 'root.md'); form.append('scope', 'ENTERPRISE'); form.append('confirmShare', confirm);
        const result = await request('owner', 'files', 'POST', form);
        if (confirm === 'true') assert.equal(result.body.items[0].scope, 'ENTERPRISE');
        else if (confirm === 'false') assert.equal(result.body.failed.length, 1);
        else assert.equal(result.status, 400);
      }
    });
    await t.test('recursive sharing uses the impact revision and rejects an out-of-date confirmation', async () => {
      folder = (await request('owner', 'folders', 'POST', { name: '历史目录' })).body;
      child = (await request('owner', 'links', 'POST', { name: '历史链接', url: 'https://example.test', parentId: folder.id })).body;
      const stale = (await request('owner', `nodes/${folder.id}/scope-impact?scope=ENTERPRISE`)).body;
      await request('owner', 'folders', 'POST', { name: '新子项', parentId: folder.id });
      assert.equal((await request('owner', `nodes/${folder.id}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true, expectedTreeRevision: stale.treeRevision })).status, 409);
      const impact = (await request('owner', `nodes/${folder.id}/scope-impact?scope=ENTERPRISE`)).body;
      assert.equal(impact.total, 3);
      assert.equal((await request('owner', `nodes/${folder.id}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true, expectedTreeRevision: impact.treeRevision })).status, 201);
      assert.equal((await request('mate', `items?view=shared&parentId=${folder.id}`)).body.items.length, 2);
      assert.equal((await request('owner', `nodes/${child.id}/scope`, 'POST', { scope: 'PRIVATE' })).status, 409);
      assert.equal((await request('owner', `nodes/${folder.id}/scope`, 'POST', { scope: 'PRIVATE' })).body.code, 'CONFIRM_UNSHARE');
      assert.equal((await request('owner', `nodes/${folder.id}/scope`, 'POST', { scope: 'PRIVATE', confirmUnshare: true })).status, 201);
      assert.equal((await request('mate', `nodes/${child.id}/preview`)).status, 404);
    });
    await t.test('moving a private subtree requires confirmation and shares descendants in the same operation', async () => {
      assert.equal((await request('owner', `nodes/${folder.id}/move`, 'POST', { parentId: shared.id })).body.code, 'CONFIRM_SHARE');
      assert.equal((await request('owner', `nodes/${folder.id}/move`, 'POST', { parentId: shared.id, confirmShare: true })).status, 201);
      assert.equal((await prisma.libraryNode.findUnique({ where: { id: child.id } })).scope, 'ENTERPRISE');
    });
  });
});
