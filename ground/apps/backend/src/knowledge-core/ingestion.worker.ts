import { OcrPageStore } from './ocr-progress';
import { KnowledgeOcrService } from './vision-ocr';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeProfilesService } from './profiles.service';
import { KnowledgeBlobStorage } from './storage';
import { KnowledgeJobsService } from './jobs.service';
import { KnowledgeCoreService } from './knowledge-core.service';
import { KnowledgeHttpAdapter } from './provider';
import { KnowledgeCoreError, safeKnowledgeError } from './errors';
import { configureLibraryAsr } from '../library/library.asr-setup';
import { embedPendingLibraryChunks } from '../library/library.embed';
import type { PrismaLibraryStore } from '../library/library.prisma-store';
import { transcribeOnePendingVideo } from '../library/library.video-backfill';
import { chunkEmbeddingInput } from './embedding-input';
import {
  normalizeKnowledgeIndexConfig,
  KNOWLEDGE_PARSER_VERSION,
  KNOWLEDGE_CHUNKER_VERSION,
  type KnowledgeIndexConfiguration,
} from './index-config';
import { prepareKnowledgeDocument } from './preparation';
import { createTokenCounter } from './tokenizer';
/** No timer starts in Nest HTTP lifecycle. Only standalone worker main invokes run(). */
@Injectable()
export class KnowledgeIngestionWorker {
  private readonly logger = new Logger(KnowledgeIngestionWorker.name);
  private stopping = false;
  private active: AbortController | undefined;
  private readonly ocrPages = new OcrPageStore();
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: KnowledgeProfilesService,
    private readonly blobs: KnowledgeBlobStorage,
    private readonly jobs: KnowledgeJobsService,
    private readonly adapter: KnowledgeHttpAdapter,
    private readonly core?: KnowledgeCoreService,
    private readonly ocr?: KnowledgeOcrService,
    @Optional() private readonly library?: PrismaLibraryStore,
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
      const isOcr=(index.chunkerConfig as KnowledgeIndexConfiguration).parseMode==='ocr'||(index.chunkerConfig as KnowledgeIndexConfiguration).parseMode==='auto';
      await this.jobs.setStage(job.id, token, isOcr?'PARSING':'CHUNKING');
      const prepared = await prepareKnowledgeDocument({
        name: index.revision.originalName,
        bytes: await this.blobs.read(index.revision.storageKey),
        tokenizer: profile.tokenizer as 'cl100k_base' | 'o200k_base',
        maxInputTokens: profile.maxInputTokens,
        config: index.chunkerConfig as KnowledgeIndexConfiguration,
        signal: controller.signal,
        ...(isOcr?{ocrWork:{indexId:index.id,store:this.ocrPages}}:{}),
        ...('parseMode' in configuration.chunkerConfig && (index.chunkerConfig as KnowledgeIndexConfiguration).ocrModelId && (configuration.chunkerConfig.parseMode==='ocr'||(index.chunkerConfig as KnowledgeIndexConfiguration).ocrRouteHash) ? {ocrRecognizer:(name:string,bytes:Buffer,signal?:AbortSignal)=>this.ocr!.recognize(name,bytes,(index.chunkerConfig as KnowledgeIndexConfiguration).ocrModelId!,signal,(index.chunkerConfig as KnowledgeIndexConfiguration).ocrRouteHash)} : {}),
      });
      if(prepared.ocrPending){await this.jobs.yieldBatch(job.id,token);return true;}
      if (prepared.parseStatus !== 'READY') {
        await this.jobs.withLease(job.id, token, async (tx) => {
          await tx.knowledgeIndexRevision.update({
            where: { id: index.id },
            data: { status: prepared.parseStatus, reasonCode: prepared.failureReason ?? prepared.whyPartial },
          });
          await tx.knowledgeIngestionJob.update({
            where: { id: job.id },
            data: {
              status: prepared.parseStatus === 'FAILED' || (isOcr && prepared.parseStatus === 'PARTIAL') ? 'FAILED' : 'SUCCEEDED',
              stage: prepared.parseStatus,
              errorCode: prepared.failureReason ?? prepared.whyPartial ?? null,
              leaseToken: null,
              leaseUntil: null,
            },
          });
        });
        return true;
      }
      const chunks = prepared.chunks;
      const tokenCount = prepared.totalChunkTokens;
      const counter = createTokenCounter(
        profile.tokenizer as 'cl100k_base' | 'o200k_base',
      );
      await this.jobs.setStage(job.id, token, 'EMBEDDING');
      const result = await this.adapter.embed(
        profile.id,
        chunks.map((c) => chunkEmbeddingInput(c, counter, profile.maxInputTokens)),
        { signal: controller.signal, operationId: job.id },
      );
      // Credentials/config disable is checked again after slow upstream work; lease/cancellation is DB-fenced below.
      await this.profiles.resolveForRequest(profile.id, 'EMBEDDING');
      const ocrConfig = index.chunkerConfig as KnowledgeIndexConfiguration;
      if (ocrConfig.parseMode === 'ocr'||prepared.usedOcr) await this.ocr!.assertRoute(ocrConfig.ocrModelId!,ocrConfig.ocrRouteHash);
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
      if (this.stopping && controller.signal.aborted) {
        try {
          await this.jobs.releaseForRestart(job.id, token);
        } catch (failure) {
          if (safeKnowledgeError(failure).code !== 'INGESTION_LEASE_LOST')
            this.logger.error('INGESTION_STATE_WRITE_FAILED');
        }
        return true;
      }
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
    await configureLibraryAsr(this.prisma).catch(() => undefined);
    while (!this.stopping) {
      const worked = await this.runOnce();
      if (worked) continue;
      const embedded = await embedPendingLibraryChunks(this.prisma, this.adapter).catch(() => 0);
      const transcribed = this.library ? await transcribeOnePendingVideo(this.prisma, this.library).catch(() => false) : false;
      if (!embedded && !transcribed) await new Promise<void>((r) => setTimeout(r, 1000));
    }
  }
}
type PrismaJson = import('@prisma/client').Prisma.InputJsonObject;
