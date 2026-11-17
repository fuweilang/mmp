import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { NestFactory } from '@nestjs/core';
import { KnowledgeCoreModule } from './knowledge-core.module';
import { KnowledgeIngestionWorker } from './ingestion.worker';
/** Dedicated process: never imported by HTTP main/AppModule. */
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('KNOWLEDGE_WORKER_DATABASE_UNCONFIGURED');
  const app = await NestFactory.createApplicationContext(KnowledgeCoreModule, {
    logger: ['error', 'warn'],
  });
  const worker = app.get(KnowledgeIngestionWorker);
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    worker.stop();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    await worker.run();
  } finally {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    await app.get(PrismaService).$disconnect();
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('KNOWLEDGE_WORKER_FAILED\n');
  process.exitCode = 1;
});
