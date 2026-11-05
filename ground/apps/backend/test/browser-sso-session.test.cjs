/** Real HTTP/Postgres regression: a console handoff preserves an existing same-identity Web grant. */
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const runLoginPage = require('./browser-sso-login-harness.cjs');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigModule, ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const cookieParser = require('cookie-parser');
const { PrismaModule } = require('../dist/prisma/prisma.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { AuthModule } = require('../dist/auth/auth.module.js');
process.loadEnvFile(require('node:path').join(__dirname, '../.env'));
class Root {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PrismaModule, AuthModule] })(Root);

test('console and admin handoffs preserve matching browser sessions and replace missing, invalid or different identities', { timeout: 30000 }, async () => {
  const app = await NestFactory.create(Root, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl(), prisma = app.get(PrismaService), jwt = app.get(JwtService);
  const cookieName = app.get(ConfigService).get('COOKIE_NAME') || 'mammothai_access_token';
  const tag = `sso-session-${randomUUID()}`, users = [], tenants = [], roles = [];
  const call = async (path, token, body) => {
    const r = await fetch(origin + '/api/auth/' + path, { method: body ? 'POST' : 'GET',
      headers: { ...(token ? { cookie: `${cookieName}=${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  try {
    for (const suffix of ['a', 'b']) {
      users.push(await prisma.user.create({ data: { name: `${tag}-${suffix}`, phone: `${tag}-${suffix}`, passwordHash: 'test-only' } }));
      tenants.push(await prisma.tenant.create({ data: { name: `${tag}-${suffix}`, slug: `${tag}-${suffix}`, type: 'ENTERPRISE' } }));
    }
    for (const tenant of tenants) await prisma.orgMember.create({ data: { userId: users[0].id, tenantId: tenant.id, role: 'OWNER' } });
    for (const [index, permission] of [[0, 'portal.console.access'], [1, 'portal.admin.access']]) {
      const role = await prisma.role.create({ data: { key: `${tag}-${index}`, name: `${tag}-${index}`,
        scope: index === 0 ? 'ORG_CUSTOM' : 'PLATFORM', tenantId: index === 0 ? tenants[0].id : null,
        permissions: { create: { permKey: permission } } } });
      roles.push(role);
      await prisma.userRole.create({ data: { userId: users[index].id, roleId: role.id } });
    }
    const scope = { sub: users[0].id, tenantId: tenants[0].id };
    const existing = jwt.sign({ ...scope, iat: Math.floor(Date.now() / 1000) - 60 });
    const ticket = () => jwt.sign({ ...scope, purpose: 'browser-sso', jti: randomUUID() }, { expiresIn: '60s' });
    const issued = await call('browser-sso-ticket', existing, {});
    assert.equal(issued.status, 200);
    assert.equal(issued.body.next, '/console/');
    const same = await call('browser-sso-consume', existing, { ticket: issued.body.ticket });
    assert.equal(same.status, 200);
    assert.equal(same.cookie, null, 'opening a console tab must not rotate the Web cookie');
    assert.equal(same.body.user.id, users[0].id);
    assert.equal(same.body.currentTenant.id, tenants[0].id);
    assert.equal((await call('me', existing)).status, 200);
    // Run the actual login page and store, not only the consume endpoint.
    const enterprisePage = await runLoginPage({ origin, ticket: ticket(), next: '/console/', cookieName, cookie: existing });
    assert.deepEqual(enterprisePage.calls, ['/api/auth/browser-sso-consume']);
    assert.equal(enterprisePage.cookie, existing);
    assert.equal(enterprisePage.destination, '/console/');
    assert.equal(enterprisePage.session.currentTenant.id, tenants[0].id);
    assert.deepEqual(enterprisePage.errors, []);
    const desktopPage = await runLoginPage({ origin, ticket: ticket(), next: '/console/', cookieName });
    assert.deepEqual(desktopPage.calls, ['/api/auth/browser-sso-consume']);
    assert.ok(desktopPage.cookie);
    assert.equal(desktopPage.session.user.id, users[0].id);
    const otherAccountCookie = jwt.sign({ sub: users[1].id, tenantId: null });
    const desktopSwitch = await runLoginPage({ origin, ticket: ticket(), next: '/console/', cookieName, cookie: otherAccountCookie });
    assert.deepEqual(desktopSwitch.calls, ['/api/auth/browser-sso-consume']);
    assert.equal(desktopSwitch.session.user.id, users[0].id);
    assert.equal(jwt.verify(desktopSwitch.cookie).sub, users[0].id);

    const invalidPage = await runLoginPage({ origin, ticket: 'invalid-ticket', next: '/console/', cookieName, cookie: existing });
    assert.equal(invalidPage.cookie, existing);
    assert.equal(invalidPage.session, null);
    assert.equal(invalidPage.errors.length, 1);

    assert.equal((await call('browser-sso-consume', existing, { ticket: issued.body.ticket })).status, 401);
    const cases = [undefined, 'forged', jwt.sign({ sub: users[1].id, tenantId: tenants[0].id }),
      jwt.sign({ ...scope, tenantId: tenants[1].id }), jwt.sign(scope, { expiresIn: -1 }), ticket()];
    for (const current of cases) {
      const result = await call('browser-sso-consume', current, { ticket: ticket() });
      assert.equal(result.status, 200);
      assert.ok(result.cookie, 'missing or different identity needs a new verified grant');
      const token = result.cookie.split(';')[0].slice(cookieName.length + 1);
      const payload = jwt.verify(token);
      assert.equal(payload.sub, users[0].id);
      assert.equal(payload.tenantId, tenants[0].id);
      assert.equal(payload.purpose, undefined);
    }
    await prisma.user.update({ where: { id: users[1].id }, data: { isPlatformAdmin: true } });
    const admin = jwt.sign({ sub: users[1].id, tenantId: null, iat: Math.floor(Date.now() / 1000) - 60 });
    const adminTicket = await call('browser-sso-ticket', admin, {});
    assert.equal(adminTicket.body.next, '/admin');
    const adminResult = await call('browser-sso-consume', admin, { ticket: adminTicket.body.ticket });
    assert.equal(adminResult.status, 200);
    assert.equal(adminResult.cookie, null);
    assert.equal(adminResult.body.user.isPlatformAdmin, true);
    const adminPageTicket = await call('browser-sso-ticket', admin, {});
    const adminPage = await runLoginPage({ origin, ticket: adminPageTicket.body.ticket, next: '/admin', cookieName, cookie: admin });
    assert.deepEqual(adminPage.calls, ['/api/auth/browser-sso-consume']);
    assert.equal(adminPage.cookie, admin);
    assert.equal(adminPage.destination, '/admin');
    assert.equal(adminPage.session.user.isPlatformAdmin, true);
    assert.deepEqual(adminPage.errors, []);
    const desktopAdminTicket = await call('browser-sso-ticket', admin, {});
    const desktopAdmin = await runLoginPage({ origin, ticket: desktopAdminTicket.body.ticket, next: '/admin', cookieName });
    assert.deepEqual(desktopAdmin.calls, ['/api/auth/browser-sso-consume']);
    assert.equal(desktopAdmin.destination, '/admin');
    assert.equal(jwt.verify(desktopAdmin.cookie).sub, users[1].id);


  } finally {
    await prisma.role.deleteMany({ where: { id: { in: roles.map(role => role.id) } } });
    await prisma.orgMember.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants.map(tenant => tenant.id) } } });
    await app.close();
  }
});
