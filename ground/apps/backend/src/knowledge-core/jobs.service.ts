import { Injectable } from '@nestjs/common';
import type { Prisma, KnowledgeIngestionJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeCoreError } from './errors';
function leaseDuration(ms: number) {
  if (!Number.isInteger(ms) || ms < 100 || ms > 300000)
    throw new KnowledgeCoreError('INVALID_LEASE_DURATION');
  return ms;
}
/** PostgreSQL is the durable queue; token fences every state promotion. */
@Injectable()
export class KnowledgeJobsService {
  constructor(private readonly prisma: PrismaService) {}
  async claim(leaseMs = 60000): Promise<KnowledgeIngestionJob | null> {
    leaseDuration(leaseMs);
    const token = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const exhausted = await tx.$queryRaw<
        { index_revision_id: string }[]
      >`UPDATE kc_ingestion_job SET status='FAILED',stage='FAILED',error_code='INGESTION_LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='RUNNING' AND lease_until<=now() AND attempts>=4 RETURNING index_revision_id`;
      for (const row of exhausted)
        await tx.knowledgeIndexRevision.updateMany({
          where: { id: row.index_revision_id, status: 'PENDING' },
          data: { status: 'FAILED', reasonCode: 'INGESTION_LEASE_EXHAUSTED' },
        });
      const rows = await tx.$queryRaw<{ id: string }[]>`WITH candidate AS (
        SELECT id FROM kc_ingestion_job WHERE cancelled_at IS NULL AND attempts<4 AND ((status='QUEUED' AND available_at<=now()) OR (status='RUNNING' AND lease_until<=now())) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE kc_ingestion_job j SET status='RUNNING',stage='PARSING',attempts=attempts+1,lease_token=${token},lease_until=now()+${leaseMs}*interval '1 millisecond',heartbeat_at=now(),updated_at=now() FROM candidate c WHERE j.id=c.id RETURNING j.id`;
      return rows.length
        ? tx.knowledgeIngestionJob.findUniqueOrThrow({
            where: { id: rows[0].id },
          })
        : null;
    });
  }
  async heartbeat(id: string, token: string, leaseMs = 60000): Promise<void> {
    leaseDuration(leaseMs);
    const count = await this.prisma
      .$executeRaw`UPDATE kc_ingestion_job SET lease_until=now()+${leaseMs}*interval '1 millisecond',heartbeat_at=now(),updated_at=now() WHERE id=${id} AND lease_token=${token} AND status='RUNNING' AND cancelled_at IS NULL AND lease_until>now()`;
    if (count !== 1) throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
  }
  async withLease<T>(
    id: string,
    token: string,
    fn: (
      tx: Prisma.TransactionClient,
      job: KnowledgeIngestionJob,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string; lease_until: Date }[]
        >`SELECT id,lease_until FROM kc_ingestion_job WHERE id=${id} AND lease_token=${token} AND status='RUNNING' AND cancelled_at IS NULL AND lease_until>now() FOR UPDATE`;
        if (rows.length !== 1)
          throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
        const result = await fn(
          tx,
          await tx.knowledgeIngestionJob.findUniqueOrThrow({ where: { id } }),
        );
        // clock_timestamp is wall time, unlike transaction-stable now(). Roll back all candidate writes if the lease expired while persisting.
        const valid = await tx.$queryRaw<
          { valid: boolean }[]
        >`SELECT clock_timestamp()<${rows[0].lease_until} AS valid`;
        if (!valid[0].valid)
          throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
        return result;
      },
      { timeout: 30000 },
    );
  }
  async setStage(
    id: string,
    token: string,
    stage: 'PARSING' | 'CHUNKING' | 'EMBEDDING' | 'INDEXING',
  ): Promise<void> {
    await this.withLease(id, token, async (tx) => {
      await tx.knowledgeIngestionJob.update({ where: { id }, data: { stage } });
    });
  }
  async fail(
    id: string,
    token: string,
    error: KnowledgeCoreError,
  ): Promise<void> {
    await this.withLease(id, token, async (tx, job) => {
      const retry = error.transient && job.attempts < 4;
      await tx.knowledgeIngestionJob.update({
        where: { id },
        data: {
          status: retry ? 'QUEUED' : 'FAILED',
          stage: retry ? 'UPLOADED' : 'FAILED',
          availableAt: new Date(
            Date.now() + Math.min(60000, 1000 * 2 ** (job.attempts - 1)),
          ),
          leaseToken: null,
          leaseUntil: null,
          errorCode: error.code,
        },
      });
      if (!retry)
        await tx.knowledgeIndexRevision.update({
          where: { id: job.indexRevisionId },
          data: { status: 'FAILED', reasonCode: error.code },
        });
    });
  }
}
