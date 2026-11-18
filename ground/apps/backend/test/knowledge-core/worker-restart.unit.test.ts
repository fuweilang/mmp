import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KnowledgeIngestionJob, Prisma } from '@prisma/client';
import { KnowledgeIngestionWorker } from '../../src/knowledge-core/ingestion.worker';
import { KnowledgeJobsService } from '../../src/knowledge-core/jobs.service';
import { KnowledgeCoreError } from '../../src/knowledge-core/errors';
import { normalizeKnowledgeIndexConfig } from '../../src/knowledge-core/index-config';

// Persistent job state with a fenced transaction adapter; the worker and restart operation are real.
class RestartJobs extends KnowledgeJobsService {
  state = { id: 'job', indexRevisionId: 'index', status: 'QUEUED', stage: 'UPLOADED', attempts: 2, leaseToken: null as string | null, leaseUntil: null as Date | null, errorCode: 'UPSTREAM_TIMEOUT' as string | null };
  constructor() { super({} as never); }
  override async claim() {
    this.state.status = 'RUNNING'; this.state.attempts++;
    this.state.leaseToken = 'active'; this.state.leaseUntil = new Date(Date.now() + 60000);
    return { ...this.state } as KnowledgeIngestionJob;
  }
  override async withLease<T>(id: string, token: string, fn: (tx: Prisma.TransactionClient, job: KnowledgeIngestionJob) => Promise<T>): Promise<T> {
    if (id !== this.state.id || token !== this.state.leaseToken || this.state.status !== 'RUNNING') throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
    const tx = { knowledgeIngestionJob: { update: async ({ data }: { data: Record<string, unknown> }) => {
      const attempts = data.attempts as { decrement?: number } | undefined;
      Object.assign(this.state, data, { attempts: attempts?.decrement ? this.state.attempts - attempts.decrement : this.state.attempts });
      return this.state;
    } } };
    return fn(tx as never, { ...this.state } as KnowledgeIngestionJob);
  }
}

test('repeated development restarts requeue in-flight embedding without consuming failure attempts', async () => {
  const jobs = new RestartJobs();
  for (let i = 0; i < 5; i++) {
    let started!: () => void;
    const embedding = new Promise<void>(resolve => { started = resolve; });
    const document = { id: 'doc', enabled: true, base: { enabled: true } };
    const index = { id: 'index', profileId: 'profile', ...normalizeKnowledgeIndexConfig(undefined, 8192), revision: { document, originalName: 'restart.txt', storageKey: 'blob' } };
    const worker = new KnowledgeIngestionWorker(
      { knowledgeIndexRevision: { findUniqueOrThrow: async () => index } } as never,
      { resolveForRequest: async () => ({ id: 'profile', maxInputTokens: 8192, tokenizer: 'cl100k_base' }) } as never,
      { read: async () => Buffer.from('A complete document for development restart testing.') } as never,
      jobs,
      { embed: async (_id: string, _texts: string[], { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new KnowledgeCoreError('INGESTION_LEASE_LOST')), { once: true }); started();
      }) } as never,
    );
    const running = worker.runOnce(); await embedding; worker.stop(); await running;
    assert.equal(jobs.state.status, 'QUEUED');
    assert.equal(jobs.state.attempts, 2, 'previous real failures remain counted; the interrupted claim is refunded');
    assert.equal(jobs.state.leaseToken, null); assert.equal(jobs.state.leaseUntil, null);
    assert.equal(jobs.state.errorCode, null);
  }
});

test('a restarted stale worker cannot requeue a cancelled job or a replacement lease', async () => {
  const jobs = new RestartJobs();
  await jobs.claim();
  jobs.state.leaseToken = 'new-owner';
  await assert.rejects(() => jobs.releaseForRestart('job', 'active'), { code: 'INGESTION_LEASE_LOST' });
  assert.equal(jobs.state.leaseToken, 'new-owner'); assert.equal(jobs.state.attempts, 3);
  jobs.state.status = 'CANCELLED';
  await assert.rejects(() => jobs.releaseForRestart('job', 'new-owner'), { code: 'INGESTION_LEASE_LOST' });
  assert.equal(jobs.state.status, 'CANCELLED');
});
