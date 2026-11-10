require('dotenv').config();
const { ConfigModule } = require('@nestjs/config');
const { NestFactory } = require('@nestjs/core');
const { PrismaModule } = require('../dist/prisma/prisma.module');
const { BillingModule } = require('../dist/billing/billing.module');
const { AuthModule } = require('../dist/auth/auth.module');
const { LlmModule } = require('../dist/llm/llm.module');
const { OfficialSkillModule } = require('../dist/official-skill/official-skill.module');
const { LoggingModule } = require('../dist/logging/logging.module');
const { OfficialSkillService } = require('../dist/official-skill/official-skill.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

class TranslateRoot {}

async function run() {
  const dryRun = process.env.TRANSLATE_DRY_RUN === '1';
  const limit = Number(process.env.TRANSLATE_LIMIT || 20);
  const keys = (process.env.TRANSLATE_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const app = await NestFactory.createApplicationContext(
    {
      module: TranslateRoot,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        LoggingModule,
        AuthModule,
        BillingModule,
        LlmModule,
        OfficialSkillModule,
      ],
    },
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const prisma = app.get(PrismaService);
    const skills = app.get(OfficialSkillService);
    const admin = await prisma.user.findFirst({
      where: { isPlatformAdmin: true, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) throw new Error('no platform admin');
    const report = await skills.translateDisplayBatch(admin, {
      dryRun,
      limit,
      ...(keys.length ? { keys } : {}),
      maxAttempts: 3,
    });
    console.log(JSON.stringify({ backup: process.env.TRANSLATE_BACKUP || null, ...report }, null, 2));
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
