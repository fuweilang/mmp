/** Real local Postgres + HTTP guard/validation and retry-safe cloud history writes. */
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { PrismaModule } = require('../dist/prisma/prisma.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { SessionHistoryModule } = require('../dist/session-history/session-history.module.js');
try { process.loadEnvFile(require('node:path').join(__dirname, '../.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
class TestRoot {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PrismaModule, SessionHistoryModule] })(TestRoot);

test('isolates accounts and enterprises; rejects forged ownership and safely retries batched sync', { timeout: 30000 }, async () => {
  const app = await NestFactory.create(TestRoot, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(), prisma = app.get(PrismaService), jwt = app.get(JwtService);
  const tag = `history-test-${randomUUID()}`, users = [], tenants = [];
  try {
    for (const suffix of ['a', 'b']) {
      users.push(await prisma.user.create({ data: { name: `${tag}-${suffix}`, phone: `${tag}-${suffix}`, passwordHash: 'test-only-not-a-password' } }));
      tenants.push(await prisma.tenant.create({ data: { name: `${tag}-${suffix}`, slug: `${tag}-${suffix}`, type: 'ENTERPRISE' } }));
    }
    for (const [user, tenant] of [[users[0], tenants[0]], [users[1], tenants[0]], [users[0], tenants[1]]]) {
      await prisma.orgMember.create({ data: { userId: user.id, tenantId: tenant.id, role: 'MEMBER' } });
    }
    const tokens = {
      a: jwt.sign({ sub: users[0].id, tenantId: tenants[0].id }), b: jwt.sign({ sub: users[1].id, tenantId: tenants[0].id }),
      other: jwt.sign({ sub: users[0].id, tenantId: tenants[1].id }), removed: jwt.sign({ sub: users[1].id, tenantId: tenants[1].id }),
    };
    const call = async (token, path, body) => {
      const response = await fetch(`${base}/api/session-history${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await call(null, '')).status, 401);
    const body = { accountId: users[0].id, tenantId: tenants[0].id, deviceId: 'device-a', sessionId: 'session-new',
      deviceName: 'Integration device', clientKind: 'desktop', title: 'New conversation', projectName: 'Sample project',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 3, state: 'completed', final: false,
      messages: [{ seq: 1, role: 'user', text: 'hello', time: new Date().toISOString() }], files: ['result.docx'] };
    assert.equal((await call(tokens.b, '/sync', body)).status, 403);
    assert.equal((await call(tokens.other, '/sync', body)).status, 403);
    assert.equal((await call(tokens.a, '/sync', { ...body, tenantScope: 'forged' })).status, 400);
    assert.equal((await call(tokens.a, '/sync', { ...body, messages: [{ ...body.messages[0], role: 'tool' }] })).status, 400);
    const first = await call(tokens.a, '/sync', body);
    assert.equal(first.status, 201);
    const id = first.body.id;
    assert.equal((await call(tokens.b, '')).body.items.length, 0);
    assert.equal((await call(tokens.other, '')).body.items.length, 0);
    assert.equal((await call(tokens.b, `/${id}`)).status, 404);
    assert.equal((await call(tokens.other, `/${id}`)).status, 404);
    assert.equal((await call(tokens.removed, '')).status, 403);
    const final = { ...body, final: true, visibleSeqs: [1, 3], messages: [{ seq: 3, role: 'assistant', text: 'task result', time: new Date().toISOString() }] };
    assert.ok((await Promise.all([call(tokens.a, '/sync', final), call(tokens.a, '/sync', final)])).every(result => result.status === 201));
    let detail = (await call(tokens.a, `/${id}`)).body;
    assert.equal(detail.messages.length, 2);
    assert.equal(detail.conversation.syncing, false);
    assert.deepEqual(detail.conversation.files, [{ name: 'result.docx', access: 'source-device-only' }]);
    assert.ok(detail.conversation.lastSyncedAt);
    // A delayed first batch must not reopen or mutate a completed revision.
    assert.equal((await call(tokens.a, '/sync', { ...body, title: 'late partial retry' })).body.accepted, false);
    detail = (await call(tokens.a, `/${id}`)).body;
    assert.equal(detail.conversation.syncing, false);
    assert.equal(detail.conversation.title, 'New conversation');
    assert.equal(detail.messages.length, 2);
    assert.equal((await call(tokens.a, '/sync', { ...body, title: 'stale retry', revision: 1 })).body.accepted, false);
    assert.equal((await call(tokens.a, `/${id}`)).body.conversation.title, 'New conversation');
    assert.equal((await call(tokens.a, '/sync', { ...final, revision: 5, messages: [], visibleSeqs: [1, 3, 5] })).status, 409);
    assert.equal((await call(tokens.a, `/${id}`)).body.conversation.sourceRevision, 3);
    const offline = { ...final, revision: 5, visibleSeqs: [1, 3, 5], messages: [{ seq: 5, role: 'assistant', text: 'uploaded after reconnect', time: new Date().toISOString() }] };
    assert.equal((await call(tokens.a, '/sync', offline)).status, 201);
    assert.deepEqual((await call(tokens.a, `/${id}?after=3`)).body.messages.map(message => message.sourceSeq), [5]);
    assert.equal((await call(tokens.a, '/sync', { ...offline, revision: 6, visibleSeqs: [1, 5], messages: [] })).status, 201);
    assert.deepEqual((await call(tokens.a, `/${id}`)).body.messages.map(message => message.sourceSeq), [1, 5]);
    assert.equal((await call(tokens.a, '?q=Sample')).body.items.length, 1);
    assert.equal((await call(tokens.a, '?q=missing')).body.items.length, 0);
    assert.equal((await call(tokens.b, `?cursor=${id}`)).status, 400);
  } finally {
    await prisma.syncedConversation.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
    await prisma.orgMember.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants.map(tenant => tenant.id) } } });
    await app.close();
  }
});
