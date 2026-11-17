
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { BillingModule } from '../src/billing/billing.module';
import { AuthModule } from '../src/auth/auth.module';
import { LlmModule } from '../src/llm/llm.module';
import { OfficialSkillModule } from '../src/official-skill/official-skill.module';
import { LoggingModule } from '../src/logging/logging.module';
import { OfficialSkillService } from '../src/official-skill/official-skill.service';
import { PrismaService } from '../src/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LoggingModule,
    AuthModule,
    BillingModule,
    LlmModule,
    OfficialSkillModule,
  ],
})
class TranslateModule {}

async function run() {
  const dryRun = process.env.TRANSLATE_DRY_RUN === '1';
  const limit = Number(process.env.TRANSLATE_LIMIT || 20);
  const keys = (process.env.TRANSLATE_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const app = await NestFactory.createApplicationContext(TranslateModule, {
    logger: ['error', 'warn', 'log'],
  });
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
