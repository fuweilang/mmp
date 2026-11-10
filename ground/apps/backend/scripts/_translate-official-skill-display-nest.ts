
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OfficialSkillService } from '../src/official-skill/official-skill.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function run() {
  const dryRun = process.env.TRANSLATE_DRY_RUN === '1';
  const limit = Number(process.env.TRANSLATE_LIMIT || 20);
  const keys = (process.env.TRANSLATE_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const skills = app.get(OfficialSkillService);
    const admin = await prisma.user.findFirst({ where: { isPlatformAdmin: true, status: 'active' }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('no platform admin');
    const report = await skills.translateDisplayBatch(admin, {
      dryRun,
      limit,
      ...(keys.length ? { keys } : {}),
      maxAttempts: 3,
    });
    console.log(JSON.stringify({ backup: process.env.TRANSLATE_BACKUP, ...report }, null, 2));
  } finally {
    await app.close();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
