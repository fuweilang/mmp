/** Isolated real-HTTP fixture. Auth issues sessions through normal password login; tests never sign tokens. */
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { PrismaModule } = require('../../dist/prisma/prisma.module.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');
const { LoggingModule } = require('../../dist/logging/logging.module.js');
const { AuthModule } = require('../../dist/auth/auth.module.js');
const { LibraryModule } = require('../../dist/library/library.module.js');

/** Own all temporary identities, blobs, HTTP port and DB rows in the dedicated acceptance database. */
async function withLibraryHttpFixture(work) {
  const url = process.env.LIBRARY_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/mmp_library_acceptance';
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || parsed.pathname !== '/mmp_library_acceptance') throw new Error('Refusing non-isolated library HTTP fixture');
  const directory = await mkdtemp(join(tmpdir(), 'library-http-'));
  process.env.DATABASE_URL = url;
  process.env.LIBRARY_DIR = directory;
  process.env.LOG_DIR = join(directory, 'logs');
  // Ephemeral application configuration, unrelated to any running Host or user account.
  const signingConfiguration = randomUUID() + randomUUID();
  process.env.JWT_SECRET = signingConfiguration;
  process.env.COOKIE_NAME = 'library_http_fixture';
  process.env.PUBLIC_ORIGIN = 'http://127.0.0.1';
  class Root {}
  Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true,
    load: [() => ({ JWT_SECRET: signingConfiguration, COOKIE_NAME: 'library_http_fixture' })] }), LoggingModule, PrismaModule, AuthModule, LibraryModule] })(Root);
  let app;
  let prisma;
  const users = [], tenants = [], roles = [];
  try {
    app = await NestFactory.create(Root, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api'); app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const target = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
    if (target[0]?.name !== 'mmp_library_acceptance') throw new Error('Refusing fixture on unexpected actual database');
    const origin = await app.getUrl();
    const marker = 'library-http-' + randomUUID();
    for (const suffix of ['a', 'b']) tenants.push(await prisma.tenant.create({ data: { name: marker + '-' + suffix, slug: marker + '-' + suffix, type: 'ENTERPRISE' } }));
    // Synthetic fixture credentials stay only in this process and are destroyed with these rows.
    const fixturePassword = randomUUID() + randomUUID();
    const passwordHash = await bcrypt.hash(fixturePassword, 4);
    const suffix = String(Date.now()).slice(-7);
    for (const [i, name] of ['owner', 'mate', 'other', 'tenantAdmin', 'platform'].entries()) {
      users.push(await prisma.user.create({ data: { phone: `189${suffix}${i}`, name: marker + '-' + name, passwordHash, isPlatformAdmin: name === 'platform' } }));
      if (name !== 'platform') await prisma.orgMember.create({ data: { userId: users[i].id, tenantId: tenants[name === 'other' ? 1 : 0].id, role: name === 'tenantAdmin' ? 'ADMIN' : 'MEMBER' } });
    }
    const platformRole = await prisma.role.create({ data: { key: marker + '-platform-role', name: 'isolated fixture platform role', scope: 'PLATFORM', permissions: { create: { permKey: 'portal.admin.access' } } } });
    roles.push(platformRole);
    await prisma.userRole.create({ data: { userId: users[4].id, roleId: platformRole.id } });
    const sessions = {};
    for (const [index, name] of ['owner', 'mate', 'other', 'tenantAdmin', 'platform'].entries()) {
      const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: users[index].phone, password: fixturePassword }) });
      if (response.status !== 200) throw new Error('Fixture normal login failed for ' + name + ': HTTP ' + response.status);
      const ownCookie = response.headers.getSetCookie().find(value => value.startsWith('library_http_fixture='));
      if (!ownCookie) throw new Error('Normal login fixture cookie-name mismatch: ' + response.headers.getSetCookie().map(value => value.split('=')[0]).join(','));
      sessions[name] = ownCookie.split(';')[0];
      await response.arrayBuffer();
    }
    const request = async (who, path, method = 'GET', body) => {
      const multipart = body instanceof FormData;
      const response = await fetch(origin + '/api/library/' + path, { method, headers: { ...(who ? { cookie: sessions[who] } : {}), ...(body === undefined || multipart ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
      const bytes = Buffer.from(await response.arrayBuffer());
      let json; try { json = JSON.parse(bytes.toString('utf8')); } catch { /* Binary downloads are intentionally not JSON. */ }
      return { status: response.status, body: json, bytes, headers: response.headers };
    };
    const upload = async (who, name, content, replacement) => {
      const form = new FormData(); form.append('files', new Blob([content]), name);
      return request(who, replacement ? `files/${replacement}/versions` : 'files', 'POST', form);
    };
    await work({ app, prisma, origin, directory, request, upload, users, tenants });
  } finally {
    try { if (prisma) {
      await prisma.role.deleteMany({ where: { id: { in: roles.map(row => row.id) } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenants.map(row => row.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    } } finally {
      try { if (app) await app.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
}
module.exports = { withLibraryHttpFixture };
