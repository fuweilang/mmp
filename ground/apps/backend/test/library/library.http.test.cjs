/** Real Auth/JwtGuard/LibraryController/Postgres tests, isolated on 55439; no .env, user session, or model key. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withLibraryHttpFixture } = require('./library.http-fixture.cjs');
const hiddenTitle = '仅所有者的中文验收资料.md';
const secretText = '海鸥项目保留期为7天。';
const deny = response => {
  assert.ok([400, 403, 404, 409, 410].includes(response.status), `Expected authorization/state rejection, got ${response.status}`);
  const text = response.bytes.toString('utf8');
  assert.ok(!text.includes(hiddenTitle)); assert.ok(!text.includes(secretText));
};

test('real HTTP authorization, immutable versions, recycle, file failures', { timeout: 45000 }, async t => {
  await withLibraryHttpFixture(async ({ request, upload, prisma, users, tenants }) => {
    const created = await upload('owner', hiddenTitle, secretText);
    assert.equal(created.status, 201);
    assert.equal(created.body.failed.length, 0);
    const item = created.body.items[0], id = item.id, v1 = item.currentVersion.id;
    assert.equal(item.name, hiddenTitle); assert.equal(item.currentVersion.parseStatus, 'READY');
    const one = await request('owner', 'open', 'POST', { nodeId: id, versionId: v1 });
    assert.equal(one.status, 201); assert.equal(one.body.quote, secretText); assert.equal(one.body.locator, 'paragraph:1');

    await t.test('all private read/mutation paths reject peers, foreign tenant, tenant admin and ungranted platform without title/body leaks', async () => {
      for (const who of ['mate', 'other', 'tenantAdmin', 'platform']) {
        for (const route of [`nodes/${id}/preview?versionId=${v1}`, `nodes/${id}/download?versionId=${v1}`, `nodes/${id}/source?versionId=${v1}`, `nodes/${id}/versions`]) deny(await request(who, route));
        deny(await request(who, 'open', 'POST', { nodeId: id, versionId: v1 }));
        for (const [suffix, method, body] of [['', 'PATCH', { name: 'no' }], ['/move', 'POST', { parentId: null }], ['/scope', 'POST', { scope: 'ENTERPRISE', confirmShare: true }], ['/retry-parse', 'POST', {}], ['/recycle', 'POST', {}], ['/restore', 'POST', {}], ['', 'DELETE', undefined]]) deny(await request(who, `nodes/${id}${suffix}`, method, body));
        deny(await upload(who, 'override.md', '不得覆盖', id));
        for (const view of ['mine', 'shared', 'recent', 'trash']) {
          const result = await request(who, `items?view=${view}&q=${encodeURIComponent(hiddenTitle)}`);
          if (result.status === 200) assert.ok(!result.bytes.toString().includes(hiddenTitle)); else deny(result);
        }
      }
      deny(await request('other', 'open', 'POST', { nodeId: id, versionId: v1, tenantId: tenants[0].id }));
      assert.equal((await request(null, `nodes/${id}/preview`)).status, 401);
    });
    await t.test('sharing is explicit and revocation removes visible titles as well as source access', async () => {
      assert.equal((await request('owner', `nodes/${id}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true })).status, 201);
      const visible = await request('mate', 'items?view=shared'); assert.ok(visible.body.items.some(row => row.id === id));
      assert.equal((await request('mate', 'open', 'POST', { nodeId: id, versionId: v1 })).body.quote, secretText);
      deny(await request('other', `nodes/${id}/preview?versionId=${v1}`));
      deny(await request('platform', `nodes/${id}/preview?versionId=${v1}`));
      assert.equal((await request('owner', `nodes/${id}/scope`, 'POST', { scope: 'PRIVATE' })).status, 201);
      assert.ok(!(await request('mate', 'items?view=shared')).bytes.toString().includes(hiddenTitle));
      deny(await request('mate', 'open', 'POST', { nodeId: id, versionId: v1 }));
    });
    await t.test('platform defaults to stats; private approval is owner-only, grants are singly scoped, revocable and expiring', async () => {
      const stats = await request('platform', 'admin/stats'); assert.equal(stats.status, 200); assert.ok(!stats.bytes.toString().includes(hiddenTitle));
      const privateInput = { tenantId: tenants[0].id, granteeUserId: users[4].id, contentScope: 'PRIVATE_OWNER', ownerUserId: users[0].id, powers: 'READ', expiresAt: new Date(Date.now() + 60000).toISOString(), reason: 'isolated synthetic acceptance approval' };
      deny(await request('tenantAdmin', 'admin/custody', 'POST', privateInput));
      deny(await request('platform', 'admin/custody', 'POST', { ...privateInput, ownerUserId: users[4].id }));
      const grantResponse = await request('owner', 'admin/custody', 'POST', privateInput); assert.equal(grantResponse.status, 201);
      const grant = grantResponse.body;
      const peerPrivate = (await upload('mate', '其他成员私有.md', '不在本授权内')).body.items[0];
      const peerShared = (await upload('mate', '共享授权样本.md', '明确共享样本')).body.items[0];
      await request('mate', `nodes/${peerShared.id}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true });
      const sharedGrantResponse = await request('tenantAdmin', 'admin/custody', 'POST', { ...privateInput, contentScope: 'ENTERPRISE', ownerUserId: undefined });
      assert.equal(sharedGrantResponse.status, 201);
      const visible = await request('platform', `admin/custody/${grant.id}/items`); assert.equal(visible.status, 200);
      assert.ok(visible.body.items.some(row => row.id === id));
      assert.ok(!visible.body.items.some(row => [peerPrivate.id, peerShared.id].includes(row.id)));
      const sharedVisible = await request('platform', `admin/custody/${sharedGrantResponse.body.id}/items`);
      assert.deepEqual(sharedVisible.body.items.map(row => row.id), [peerShared.id]);
      deny(await request('platform', `admin/custody/${grant.id}/nodes/${peerPrivate.id}/preview`));
      assert.equal((await request('platform', `admin/custody/${grant.id}/nodes/${id}/preview?versionId=${v1}`)).status, 200);
      assert.equal((await request('owner', `admin/custody/${grant.id}/revoke`, 'POST')).status, 201);
      deny(await request('platform', `admin/custody/${grant.id}/items`));
      deny(await request('platform', `admin/custody/${grant.id}/nodes/${id}/download?versionId=${v1}`));
      await prisma.libraryCustody.update({ where: { id: sharedGrantResponse.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      deny(await request('platform', `admin/custody/${sharedGrantResponse.body.id}/items`));
    });
    await t.test('replacement appends v2 while v1 quote/locator stay immutable; ready retry does not duplicate chunks', async () => {
      const replaced = await upload('owner', '版本二.md', '海鸥项目保留期为11天。', id);
      assert.equal(replaced.status, 201);
      const v2 = replaced.body.currentVersion.id;
      assert.notEqual(v1, v2);
      const old = await request('owner', 'open', 'POST', { nodeId: id, versionId: v1 });
      assert.equal(old.body.quote, secretText); assert.equal(old.body.versionId, v1);
      assert.equal((await request('owner', 'open', 'POST', { nodeId: id, versionId: v2 })).body.quote, '海鸥项目保留期为11天。');
      const before = await prisma.libraryChunk.findMany({ where: { versionId: v2 }, orderBy: { id: 'asc' } });
      await request('owner', `nodes/${id}/retry-parse`, 'POST'); await request('owner', `nodes/${id}/retry-parse`, 'POST');
      const after = await prisma.libraryChunk.findMany({ where: { versionId: v2 }, orderBy: { id: 'asc' } });
      assert.deepEqual(after, before);
    });
    await t.test('ZIP has zero chunks, malformed DOCX remains retryable without duplicate index, unsupported extension is rejected', async () => {
      const zip = await upload('owner', '仅保存.zip', Buffer.from('synthetic archive bytes'));
      assert.equal(zip.body.items[0].currentVersion.parseStatus, 'DOWNLOAD_ONLY');
      const z = zip.body.items[0];
      assert.equal(await prisma.libraryChunk.count({ where: { versionId: z.currentVersion.id } }), 0);
      const zipOpen = await request('owner', 'open', 'POST', { nodeId: z.id, versionId: z.currentVersion.id });
      assert.equal(zipOpen.status, 201); assert.equal(zipOpen.body.quote, null); assert.equal(zipOpen.body.locator, null);
      assert.equal((await request('owner', `nodes/${z.id}/download?versionId=${z.currentVersion.id}`)).bytes.toString(), 'synthetic archive bytes');
      const broken = await upload('owner', '失败.docx', Buffer.from('not a docx archive'));
      const b = broken.body.items[0]; assert.equal(b.currentVersion.parseStatus, 'FAILED');
      for (let i = 0; i < 2; i++) assert.equal((await request('owner', `nodes/${b.id}/retry-parse`, 'POST')).status, 201);
      assert.equal(await prisma.libraryChunk.count({ where: { versionId: b.currentVersion.id } }), 0);
      const preview = await request('owner', `nodes/${b.id}/preview`); assert.ok(preview.body.parseReason);
      const rejected = await upload('owner', '禁止.exe', 'binary'); assert.equal(rejected.body.items.length, 0); assert.equal(rejected.body.failed.length, 1);
    });
    await t.test('recycle/purge reject old citations; restore keeps the same version lineage', async () => {
      assert.equal((await request('owner', `nodes/${id}/recycle`, 'POST')).status, 201);
      deny(await request('owner', 'open', 'POST', { nodeId: id, versionId: v1 }));
      assert.equal((await request('owner', `nodes/${id}/restore`, 'POST')).status, 201);
      assert.equal((await request('owner', 'open', 'POST', { nodeId: id, versionId: v1 })).body.quote, secretText);
      assert.equal((await request('owner', `nodes/${id}`, 'DELETE')).status, 400);
      assert.equal((await request('owner', `nodes/${id}/recycle`, 'POST')).status, 201);
      assert.equal((await request('owner', `nodes/${id}`, 'DELETE')).status, 200);
      deny(await request('owner', 'open', 'POST', { nodeId: id, versionId: v1 }));
      assert.ok(!(await request('owner', 'items?view=recent')).bytes.toString().includes(hiddenTitle));
    });
    await t.test('link preview reauthorizes after sharing is revoked and unsupported/empty uploads do not create nodes', async () => {
      const link = await request('owner', 'links', 'POST', { name: '受权链接', url: 'https://example.com/non-sensitive-fixture' });
      assert.equal(link.status, 201);
      const linkId = link.body.id;
      await request('owner', `nodes/${linkId}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true });
      assert.equal((await request('mate', `nodes/${linkId}/preview`)).body.linkUrl, 'https://example.com/non-sensitive-fixture');
      await request('owner', `nodes/${linkId}/scope`, 'POST', { scope: 'PRIVATE' });
      const blocked = await request('mate', `nodes/${linkId}/preview`); deny(blocked); assert.ok(!blocked.bytes.toString().includes('https://example.com/non-sensitive-fixture'));
      assert.equal((await request('owner', `nodes/${linkId}/recycle`, 'POST')).status, 201);
      const recycled = await request('owner', `nodes/${linkId}/preview`);
      assert.equal(recycled.status, 200);
      assert.equal(recycled.body.linkUrl, null);
      const before = await prisma.libraryNode.count({ where: { tenantId: tenants[0].id } });
      const empty = await upload('owner', 'empty.md', ''); assert.equal(empty.body.items.length, 0); assert.equal(empty.body.failed.length, 1); assert.equal(empty.body.failed[0].message, '空文件');
      assert.equal(await prisma.libraryNode.count({ where: { tenantId: tenants[0].id } }), before);
    });
    await t.test('t188 media bytes, scoped mine/shared, paging, real recent receipts and prepare exclusions', async () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
      const image = (await upload('owner', 'QA_t188.png', png)).body.items[0];
      assert.equal(image.currentVersion.parseStatus, 'DOWNLOAD_ONLY'); assert.equal(image.currentVersion.mimeType, 'image/png');
      const version = image.currentVersion.id;
      assert.equal(await prisma.libraryChunk.count({ where: { versionId: version } }), 0);
      const metadata = await request('owner', `nodes/${image.id}/preview`);
      assert.equal(metadata.body.previewKind, 'image');
      assert.ok(!(await request('owner', 'items?view=recent')).body.items.some(row => row.id === image.id));
      const inline = await request('owner', `nodes/${image.id}/download?versionId=${version}&inline=1`);
      assert.equal(inline.status, 200); assert.equal(inline.headers.get('content-type'), 'image/png');
      assert.equal(inline.headers.get('x-content-type-options'), 'nosniff'); assert.deepEqual(inline.bytes, png);
      assert.ok((await request('owner', 'items?view=recent')).body.items.some(row => row.id === image.id));
      assert.ok(!(await request('mate', 'items?view=recent')).body.items.some(row => row.id === image.id));
      deny(await request('mate', `nodes/${image.id}/download?inline=1`));
      await request('owner', `nodes/${image.id}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true });
      assert.ok((await request('owner', 'items?view=mine')).body.items.some(row => row.id === image.id));
      assert.ok((await request('owner', 'items?view=shared')).body.items.some(row => row.id === image.id));
      assert.equal((await request('mate', `nodes/${image.id}/download?inline=1`)).status, 200);
      deny(await request('other', `nodes/${image.id}/download?inline=1`));
      await request('owner', `nodes/${image.id}/scope`, 'POST', { scope: 'PRIVATE' });
      deny(await request('mate', `nodes/${image.id}/download?inline=1`));
      assert.ok(!(await request('mate', 'items?view=recent')).body.items.some(row => row.id === image.id));
      const spoofed = await upload('owner', 'QA_fake.png', '<svg onload=alert(1)>');
      assert.equal(spoofed.body.items.length, 0); assert.equal(spoofed.body.failed.length, 1);
      assert.equal((await upload('owner', 'QA_active.svg', '<svg/>')).body.failed.length, 1);
      const media = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from('ftypisom'), Buffer.alloc(4), Buffer.from('isommp42')]);
      const video = (await upload('owner', 'QA_t188.mp4', media)).body.items[0];
      assert.equal(video.currentVersion.parseStatus, 'DOWNLOAD_ONLY');
      assert.equal((await request('owner', `nodes/${video.id}/preview`)).body.previewKind, 'video');
      const movie = await request('owner', `nodes/${video.id}/download?inline=1`); assert.equal(movie.headers.get('content-type'), 'video/mp4'); assert.deepEqual(movie.bytes, media);
      // Header-valid synthetic MP4 verifies storage/type/auth; it is deliberately not a codec playback test.
      const draft = (await upload('owner', 'QA_prepare.md', 'isolated prepared excerpt')).body.items[0];
      await request('owner', 'open', 'POST', { nodeId: draft.id, versionId: draft.currentVersion.id, purpose: 'prepare' });
      assert.ok(!(await request('owner', 'items?view=recent')).body.items.some(row => row.id === draft.id));
      const attached = await request('owner', 'used', 'POST', { nodeId: draft.id, versionId: draft.currentVersion.id }); assert.equal(attached.status, 201);
      assert.ok((await request('owner', 'items?view=recent')).body.items.some(row => row.id === draft.id));
      deny(await request('other', 'used', 'POST', { nodeId: draft.id, versionId: draft.currentVersion.id }));
      const folder = (await request('owner', 'folders', 'POST', { name: 'QA_pages' })).body;
      for (let i = 0; i < 23; i++) await request('owner', 'links', 'POST', { name: `QA_${i}`, url: 'https://example.test/', parentId: folder.id });
      const first = await request('owner', `items?view=mine&parentId=${folder.id}&page=1&pageSize=20`);
      const second = await request('owner', `items?view=mine&parentId=${folder.id}&page=2&pageSize=20`);
      assert.equal(first.body.total, 23); assert.equal(first.body.items.length, 20); assert.equal(second.body.items.length, 3);
      assert.equal(new Set([...first.body.items, ...second.body.items].map(row => row.id)).size, 23);
      assert.deepEqual(second.body.breadcrumb, [{ id: folder.id, name: 'QA_pages' }]);
      assert.equal((await request('owner', 'items?view=mine&pageSize=101')).status, 400);
      assert.equal((await request('owner', 'items?view=mine&page=0&pageSize=20')).status, 400);
    });
    await t.test('t191 all-level management is server-paged, authorized, typed and independent of directory queries', async () => {
      const root = (await request('owner', 'folders', 'POST', { name: 'QA_t191_owner_Apple' })).body;
      const inner = (await request('owner', 'folders', 'POST', { name: 'QA_t191_owner_Inner', parentId: root.id })).body;
      const ids = new Set([root.id, inner.id]); let shared;
      for (let i = 0; i < 22; i++) {
        const result = await request('owner', 'links', 'POST', { name: `QA_t191_owner_nested_${i}`, url: 'https://example.test/', parentId: inner.id });
        assert.equal(result.status, 201); ids.add(result.body.id); if (!i) shared = result.body;
      }
      await request('owner', `nodes/${shared.id}/scope`, 'POST', { scope: 'ENTERPRISE', confirmShare: true });
      const first = await request('owner', 'items?view=mine&flat=1&q=QA_t191_owner&pageSize=20&page=1');
      const second = await request('owner', 'items?view=mine&flat=1&q=QA_t191_owner&pageSize=20&page=2');
      assert.equal(first.status, 200); assert.equal(first.body.total, 24); assert.equal(first.body.items.length, 20); assert.equal(second.body.items.length, 4);
      const rows = [...first.body.items, ...second.body.items]; assert.deepEqual(new Set(rows.map(row => row.id)), ids);
      assert.deepEqual(rows.find(row => row.id === shared.id).parentPath, [{ id: root.id, name: root.name }, { id: inner.id, name: inner.name }]);
      assert.ok(rows.some(row => row.id === shared.id && row.scope === 'ENTERPRISE'));
      const search = await request('owner', 'items?view=mine&flat=1&q=QA_t191_owner_nested_21&page=1&pageSize=20'); assert.equal(search.body.total, 1);
      const terminal = await request('owner', 'items?view=mine'); assert.ok(terminal.body.items.some(row => row.id === root.id)); assert.ok(!terminal.body.items.some(row => row.id === shared.id));
      const directory = await request('owner', `items?view=mine&parentId=${root.id}`); assert.deepEqual(directory.body.items.map(row => row.id), [inner.id]);
      for (const who of ['mate', 'other', 'tenantAdmin', 'platform']) {
        const list = await request(who, 'items?view=mine&flat=1&q=QA_t191_owner&pageSize=20'); if (list.status === 200) assert.equal(list.body.total, 0); else deny(list); assert.ok(!list.bytes.toString().includes(root.name));
      }
    });
    await t.test('t193 isolated serial upload contract saves each good file, keeps partial failure and private defaults', async () => {
      const ids = [];
      for (const name of ['QA_t193_one.md', 'QA_t193_invalid.exe', 'QA_t193_two.md']) {
        const result = await upload('owner', name, 'isolated t193 fixture'); assert.equal(result.status, 201);
        if (name.endsWith('.exe')) { assert.equal(result.body.items.length, 0); assert.equal(result.body.failed.length, 1); }
        else { assert.equal(result.body.items.length, 1); assert.equal(result.body.items[0].scope, 'PRIVATE'); ids.push(result.body.items[0].id); }
      }
      const mine = await request('owner', 'items?view=mine&flat=1&q=QA_t193_&pageSize=20'); assert.equal(mine.body.total, 2); assert.deepEqual(new Set(mine.body.items.map(row => row.id)), new Set(ids));
      assert.equal((await request('mate', 'items?view=shared&q=QA_t193_')).body.total, 0);
    });
    await t.test('membership removal invalidates the still-signed session for enterprise content', async () => {
      const fresh = (await upload('owner', '离开企业后不可读.md', '仅有效成员可读')).body.items[0];
      await prisma.orgMember.delete({ where: { userId_tenantId: { userId: users[0].id, tenantId: tenants[0].id } } });
      deny(await request('owner', 'open', 'POST', { nodeId: fresh.id, versionId: fresh.currentVersion.id }));
    });
  });
});
