/** Ephemeral local integration server; credentials travel only over the child IPC channel. */
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { PrismaModule } = require('../dist/prisma/prisma.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { SessionHistoryModule } = require('../dist/session-history/session-history.module.js');
process.loadEnvFile(require('node:path').join(__dirname, '../.env'));
class Root {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PrismaModule, SessionHistoryModule] })(Root);
(async () => {
  if (!process.send) throw new Error('Integration fixture requires IPC');
  const app = await NestFactory.create(Root, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  const prisma = app.get(PrismaService), jwt = app.get(JwtService);
  const tag = `history-flow-${randomUUID()}`, users = [];
  const tenant = await prisma.tenant.create({ data: { name: tag, slug: tag, type: 'ENTERPRISE' } });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await prisma.syncedConversation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.orgMember.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await app.close();
    process.exit(0);
  };
  process.on('disconnect', stop);
  process.on('message', message => { if (message === 'stop') void stop(); });
  try {
    for (const suffix of ['a', 'b']) {
      const user = await prisma.user.create({ data: { name: `${tag}-${suffix}`, phone: `${tag}-${suffix}`, passwordHash: 'integration-only' } });
      users.push(user);
      await prisma.orgMember.create({ data: { userId: user.id, tenantId: tenant.id, role: 'MEMBER' } });
    }
    await app.listen(0, '127.0.0.1');
    process.send({ origin: await app.getUrl(), tenantId: tenant.id, accounts: users.map(user => ({ id: user.id, token: jwt.sign({ sub: user.id, tenantId: tenant.id }) })) });
  } catch (error) { console.error(error); await stop(); }
})().catch(error => { console.error(error); process.exit(1); });
