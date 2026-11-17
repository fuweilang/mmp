import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeProfilesService } from './profiles.service';
import { KnowledgeBlobStorage } from './storage';
import { KnowledgeJobsService } from './jobs.service';
import { KnowledgeCoreService } from './knowledge-core.service';
import { KnowledgeHttpAdapter } from './provider';
import { KnowledgeCoreError, safeKnowledgeError } from './errors';
import { parseKnowledgeBytes } from './parser';
import { chunkSections } from './chunking';
import { chunkEmbeddingInput } from './embedding-input';
import {
  normalizeKnowledgeIndexConfig,
  KNOWLEDGE_PARSER_VERSION,
  KNOWLEDGE_CHUNKER_VERSION,
  type KnowledgeIndexConfiguration,
} from './index-config';
import { createTokenCounter } from './tokenizer';
/** No timer starts in Nest HTTP lifecycle. Only standalone worker main invokes run(). */
@Injectable()
export class KnowledgeIngestionWorker {
  private readonly logger = new Logger(KnowledgeIngestionWorker.name);
  private stopping = false;
  private active: AbortController | undefined;
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: KnowledgeProfilesService,
    private readonly blobs: KnowledgeBlobStorage,
    private readonly jobs: KnowledgeJobsService,
    private readonly adapter: KnowledgeHttpAdapter,
    private readonly core?: KnowledgeCoreService,
  ) {}
  stop() {
    this.stopping = true;
    this.active?.abort();
  }
  async runOnce(): Promise<boolean> {
    const job = await this.jobs.claim();
    if (!job) return false;
    const token = job.leaseToken!;
    const controller = new AbortController();
    this.active = controller;
    let heartbeatBusy = false;
    const timer = setInterval(() => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      void this.jobs
        .heartbeat(job.id, token)
        .catch(() => controller.abort())
        .finally(() => (heartbeatBusy = false));
    }, 10000);
    try {
      const index = await this.prisma.knowledgeIndexRevision.findUniqueOrThrow({
        where: { id: job.indexRevisionId },
        include: {
          revision: { include: { document: { include: { base: true } } } },
        },
      });
      if (
        !index.revision.document.enabled ||
        !index.revision.document.base.enabled
      )
        throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
      const profile = await this.profiles.resolveForRequest(
        index.profileId,
        'EMBEDDING',
      );
      if (
        index.parserVersion !== KNOWLEDGE_PARSER_VERSION ||
        index.chunkerVersion !== KNOWLEDGE_CHUNKER_VERSION
      )
        throw new KnowledgeCoreError('INDEX_VERSION_UNSUPPORTED');
      const configuration = normalizeKnowledgeIndexConfig(
        index.chunkerConfig as KnowledgeIndexConfiguration,
        profile.maxInputTokens,
      );
      if (configuration.indexConfigHash !== index.indexConfigHash)
        throw new KnowledgeCoreError('INDEX_CONFIGURATION_MISMATCH');
      const parsed = await parseKnowledgeBytes(
        index.revision.originalName,
        await this.blobs.read(index.revision.storageKey),
      );
      if (parsed.status !== 'READY') {
        await this.jobs.withLease(job.id, token, async (tx) => {
          await tx.knowledgeIndexRevision.update({
            where: { id: index.id },
            data: { status: parsed.status, reasonCode: parsed.reason },
          });
          await tx.knowledgeIngestionJob.update({
            where: { id: job.id },
            data: {
              status: parsed.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
              stage: parsed.status,
              errorCode: parsed.reason,
              leaseToken: null,
              leaseUntil: null,
            },
          });
        });
        return true;
      }
      const counter = createTokenCounter(
        profile.tokenizer as 'cl100k_base' | 'o200k_base',
      );
      await this.jobs.setStage(job.id, token, 'CHUNKING');
      const { maxTokens, targetTokens, overlapTokens } =
        configuration.chunkerConfig;
      let chunks;
      try {
        chunks = chunkSections(parsed.sections, {
          tokenCounter: counter,
          maxTokens,
          targetTokens,
          overlapTokens,
        });
      } catch {
        throw new KnowledgeCoreError('DOCUMENT_CHUNK_LIMIT');
      }
      const tokenCount = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
      if (chunks.length > 10000 || tokenCount > 500000) {
        await this.jobs.withLease(job.id, token, async (tx) => {
          await tx.knowledgeIndexRevision.update({
            where: { id: index.id },
            data: { status: 'PARTIAL', reasonCode: 'EXTRACTION_TOKEN_LIMIT' },
          });
          await tx.knowledgeIngestionJob.update({
            where: { id: job.id },
            data: {
              status: 'SUCCEEDED',
              stage: 'PARTIAL',
              errorCode: 'EXTRACTION_TOKEN_LIMIT',
              leaseToken: null,
              leaseUntil: null,
            },
          });
        });
        return true;
      }
      await this.jobs.setStage(job.id, token, 'EMBEDDING');
      const result = await this.adapter.embed(
        profile.id,
        chunks.map((c) => chunkEmbeddingInput(c, counter, profile.maxInputTokens)),
        { signal: controller.signal, operationId: job.id },
      );
      // Credentials/config disable is checked again after slow upstream work; lease/cancellation is DB-fenced below.
      await this.profiles.resolveForRequest(profile.id, 'EMBEDDING');
      if (controller.signal.aborted)
        throw new KnowledgeCoreError('INGESTION_LEASE_LOST');
      await this.jobs.setStage(job.id, token, 'INDEXING');
      await this.jobs.withLease(job.id, token, async (tx) => {
        const current = await tx.knowledgeDocument.findUniqueOrThrow({
          where: { id: index.revision.documentId },
          include: { base: true },
        });
        if (!current.enabled || !current.base.enabled)
          throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
        for (let n = 0; n < chunks.length; n++) {
          const chunk = chunks[n],
            id = randomUUID();
          await tx.knowledgeChunk.create({
            data: {
              id,
              indexRevisionId: index.id,
              ...chunk,
              locator: chunk.locator as PrismaJson,
            },
          });
          const vector = JSON.stringify(result.vectors[n]);
          await tx.$executeRaw`INSERT INTO kc_embedding (chunk_id,dimension,vector) VALUES (${id},${profile.dimension},${vector}::vector)`;
        }
        await tx.knowledgeIndexRevision.update({
          where: { id: index.id },
          data: {
            status: 'READY',
            chunkCount: chunks.length,
            tokenCount,
            readyAt: new Date(),
          },
        });
        await tx.knowledgeIngestionJob.update({
          where: { id: job.id },
          data: {
            status: 'SUCCEEDED',
            stage: 'READY',
            errorCode: null,
            leaseToken: null,
            leaseUntil: null,
          },
        });
        if (current.base.autoUpdate) await (this.core ?? new KnowledgeCoreService(this.prisma, this.profiles, this.blobs, this.jobs)).synchronizeLiveRelease(current.baseId, tx);
      });
    } catch (error) {
      const safe = safeKnowledgeError(error);
      if (safe.code !== 'INGESTION_LEASE_LOST') {
        try {
          await this.jobs.fail(job.id, token, safe);
        } catch (failure) {
          if (safeKnowledgeError(failure).code !== 'INGESTION_LEASE_LOST')
            this.logger.error('INGESTION_STATE_WRITE_FAILED');
        }
      }
    } finally {
      clearInterval(timer);
      if (this.active === controller) this.active = undefined;
    }
    return true;
  }
  async run(): Promise<void> {
    while (!this.stopping) {
      const worked = await this.runOnce();
      if (!worked) await new Promise<void>((r) => setTimeout(r, 1000));
    }
  }
}
type PrismaJson = import('@prisma/client').Prisma.InputJsonObject;
