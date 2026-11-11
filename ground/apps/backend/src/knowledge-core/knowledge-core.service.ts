import { Injectable } from '@nestjs/common';
import type { KnowledgeBase, Prisma } from '@prisma/client';
import { effectiveFileIndexes } from './live-files';
import type { AuthorizedRelease, KnowledgeSourceReference } from './retrieval-access';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeProfilesService } from './profiles.service';
import { KnowledgeBlobStorage } from './storage';
import { KnowledgeJobsService } from './jobs.service';
import { KnowledgeCoreError } from './errors';
import type { KnowledgeScope } from './types';
import {
  normalizeKnowledgeIndexConfig,
  type KnowledgeIndexConfiguration,
} from './index-config';
export interface KnowledgeUploadInput {
  originalName: string;
  bytes: Buffer;
  profileId: string;
  idempotencyKey: string;
  documentId?: string;
  title?: string;
  mediaType?: string;
  indexConfig?: KnowledgeIndexConfiguration;
}
export function assertKnowledgeScope(
  base: Pick<KnowledgeBase, 'scope' | 'tenantId'>,
  scope: KnowledgeScope,
): void {
  if (
    !scope ||
    !['PLATFORM', 'TENANT'].includes(scope.type) ||
    (scope.type === 'TENANT' && !scope.tenantId?.trim())
  )
    throw new KnowledgeCoreError('KNOWLEDGE_SCOPE_REQUIRED');
  if (
    base.scope !== scope.type ||
    base.tenantId !== (scope.type === 'TENANT' ? scope.tenantId : null)
  )
    throw new KnowledgeCoreError('KNOWLEDGE_SCOPE_MISMATCH');
}
/** Trusted server-owned scope only. Caller must enforce author permissions and current tenant/document ACL. */
@Injectable()
export class KnowledgeCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: KnowledgeProfilesService,
    private readonly blobs: KnowledgeBlobStorage,
    private readonly jobs: KnowledgeJobsService,
  ) {}
  async createBase(
    scope: KnowledgeScope,
    name: string,
    ownerAgentId?: string,
  ): Promise<KnowledgeBase> {
    assertKnowledgeScope(
      {
        scope: scope?.type,
        tenantId: scope?.type === 'TENANT' ? scope.tenantId : null,
      },
      scope,
    );
    if (typeof name !== 'string' || !name.trim() || name.length > 200)
      throw new KnowledgeCoreError('INVALID_KNOWLEDGE_NAME');
    if (ownerAgentId) {
      if (scope.type !== 'PLATFORM') throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
      return this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM official_agent WHERE id=${ownerAgentId} FOR UPDATE`;
        const owner = await tx.officialAgent.findUnique({ where: { id: ownerAgentId } });
        if (!owner) throw new KnowledgeCoreError('EXPERT_NOT_FOUND');
        const existing = await tx.knowledgeBase.findUnique({ where: { ownerAgentId } });
        if (existing) return existing;
        return tx.knowledgeBase.create({ data: { name: name.trim(), scope: 'PLATFORM', tenantId: null, autoUpdate: true, ownerAgentId, ownerAgentName: owner.name } });
      });
    }
    return this.prisma.knowledgeBase.create({
      data: {
        name: name.trim(),
        scope: scope.type,
        tenantId: scope.type === 'TENANT' ? scope.tenantId : null,
      },
    });
  }
  async getBase(id: string, scope: KnowledgeScope): Promise<KnowledgeBase> {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!base) throw new KnowledgeCoreError('KNOWLEDGE_NOT_FOUND');
    assertKnowledgeScope(base, scope);
    if (!base.enabled) throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
    return base;
  }
  async listBases(scope: KnowledgeScope): Promise<KnowledgeBase[]> {
    assertKnowledgeScope(
      {
        scope: scope?.type,
        tenantId: scope?.type === 'TENANT' ? scope.tenantId : null,
      },
      scope,
    );
    return this.prisma.knowledgeBase.findMany({
      where: {
        scope: scope.type,
        tenantId: scope.type === 'TENANT' ? scope.tenantId : null,
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: { where: { deletedAt: null } } } }, ownerAgent: { select: { id: true, name: true } } },
    });
  }
  /** Atomically publish all effective files, keeping old successful revisions during replacement. */
  async synchronizeLiveRelease(baseId: string, transaction?: Prisma.TransactionClient): Promise<void> {
    if (!transaction) { await this.prisma.$transaction(tx => this.synchronizeLiveRelease(baseId, tx)); return; }
    const tx = transaction;
    await tx.$queryRaw`SELECT id FROM kc_base WHERE id=${baseId} FOR UPDATE`;
    const base = await tx.knowledgeBase.findUniqueOrThrow({ where: { id: baseId } });
    if (!base.autoUpdate || !base.enabled || base.scope !== 'PLATFORM' || base.tenantId !== null) return;
    const available = await tx.knowledgeIndexRevision.findMany({
      where: { status: 'READY', revision: { document: { baseId, enabled: true, deletedAt: null } }, profile: { enabled: true } },
      include: { profile: true, revision: { include: { document: true } } },
    });
    const current = base.currentReleaseId ? await tx.knowledgeRelease.findUnique({ where: { id: base.currentReleaseId }, include: { items: true } }) : null;
    const ids = effectiveFileIndexes(available, current?.items.map(i=>i.indexRevisionId)).map(i => i.id).sort();
    if (!ids.length) { await tx.knowledgeBase.update({ where: { id: baseId }, data: { currentReleaseId: null } }); return; }
    if (current?.sealed && current.items.length === ids.length && current.items.every(i => ids.includes(i.indexRevisionId))) return;
    const previous = await tx.knowledgeRelease.findFirst({ where: { baseId }, orderBy: { version: 'desc' } });
    const release = await tx.knowledgeRelease.create({ data: { baseId, version: (previous?.version ?? 0) + 1, items: { create: ids.map(indexRevisionId => ({ indexRevisionId })) } } });
    await tx.knowledgeRelease.update({ where: { id: release.id }, data: { sealed: true } });
    await tx.knowledgeBase.update({ where: { id: baseId }, data: { currentReleaseId: release.id } });
  }
  async defaultProfile(baseId: string): Promise<string> {
    await this.getBase(baseId, { type: 'PLATFORM' });
    const indexes = await this.prisma.knowledgeIndexRevision.findMany({ where: { revision: { document: { baseId } } }, orderBy: { createdAt: 'desc' }, select: { profileId: true } });
    const profiles = await this.profiles.list();
    const ids = [...new Set([...indexes.map(i => i.profileId), ...profiles.filter(p => p.enabled && p.task === 'EMBEDDING').map(p => p.id)])];
    for (const id of ids) { try { await this.profiles.resolveForRequest(id, 'EMBEDDING'); return id; } catch {} }
    throw new KnowledgeCoreError('EMBEDDING_SERVICE_UNCONFIGURED');
  }
  async deleteFile(documentId: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new KnowledgeCoreError('KNOWLEDGE_DOCUMENT_NOT_FOUND');
    await this.getBase(document.baseId, { type: 'PLATFORM' });
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM kc_base WHERE id=${document.baseId} FOR UPDATE`;
      await tx.knowledgeDocument.update({ where: { id: documentId }, data: { enabled: false, deletedAt: new Date() } });
      await this.synchronizeLiveRelease(document.baseId, tx);
    });
    return { id: documentId, deleted: true };
  }
  async fileUsage(documentId: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({ where: { id: documentId }, include: { base: true } });
    if (!document || document.base.scope !== 'PLATFORM' || document.base.tenantId !== null) throw new KnowledgeCoreError('KNOWLEDGE_DOCUMENT_NOT_FOUND');
    const releases = await this.prisma.knowledgeRelease.findMany({ where: { baseId: document.baseId, items: { some: { index: { revision: { documentId } } } } }, select: { id: true } });
    const releaseIds = new Set(releases.map(r => r.id));
    const agents = await this.prisma.officialAgent.findMany({ select: { id: true, name: true, executionConfig: true, onlineVersion: { select: { executionConfig: true } } } });
    return agents.filter(agent => agent.id === document.base.ownerAgentId || [agent.executionConfig, agent.onlineVersion?.executionConfig].some(value => {
      const config = value as { releaseIds?: unknown } | null;
      return Array.isArray(config?.releaseIds) && config.releaseIds.some(id => releaseIds.has(id));
    })).map(({ id, name }) => ({ id, name }));
  }
  /** Immutable expert choices identify files; managed folders supply their current successful contents. */
  async resolveExpertKnowledge(agentId: string, knowledge: Array<{ baseId: string; releaseId: string; indexes: Array<{ documentId: string }> }>, source?: KnowledgeSourceReference, useCurrentSelection = false): Promise<{ releases: AuthorizedRelease[]; ownsKnowledge: boolean; selectionPolicy?: 'REQUIRED'|'AUTO'|'OFF' }> {
    let selectionPolicy: 'REQUIRED'|'AUTO'|'OFF'|undefined;
    if (useCurrentSelection) {
      const agent = await this.prisma.officialAgent.findUnique({ where: { id: agentId }, include: { onlineVersion: true } });
      if (!agent || agent.status !== 'PUBLISHED' || !agent.onlineVersion) throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
      const config = agent.onlineVersion.executionConfig as unknown as {route?:string;retrievalPolicy?:string;knowledge?:typeof knowledge};
      selectionPolicy = config.route === 'KNOWLEDGE_CORE' && ['REQUIRED','AUTO'].includes(config.retrievalPolicy??'') ? config.retrievalPolicy as 'REQUIRED'|'AUTO' : 'OFF';
      knowledge = selectionPolicy !== 'OFF' && Array.isArray(config.knowledge) ? config.knowledge : [];
    }
    const bases = await this.prisma.knowledgeBase.findMany({ where: { scope: 'PLATFORM', tenantId: null, enabled: true, OR: [{ id: { in: knowledge.map(k => k.baseId) } }, { ownerAgentId: agentId }] } });
    const releases: AuthorizedRelease[] = [];
    for (const base of bases) {
      const pinned = knowledge.filter(k => k.baseId === base.id);
      if (!base.autoUpdate) { releases.push(...pinned.map(k => ({ releaseId: k.releaseId, scope: { type: 'PLATFORM' as const } }))); continue; }
      const owned = base.ownerAgentId === agentId;
      const documentIds = [...new Set(pinned.flatMap(k => k.indexes.map(i => i.documentId)))];
      if (source) {
        if (!owned && !documentIds.includes(source.documentId)) continue;
        const historical = await this.prisma.knowledgeRelease.findFirst({ where: { id: source.knowledgeReleaseId, baseId: base.id, sealed: true, items: { some: { indexRevisionId: source.indexRevisionId, index: { revision: { id: source.revisionId, documentId: source.documentId, document: { enabled: true, deletedAt: null } } } } } } });
        if (historical) releases.push({ releaseId: historical.id, scope: { type: 'PLATFORM' }, documentIds: [source.documentId] });
      } else if (base.currentReleaseId) {
        if (owned) {
          const documents = await this.prisma.knowledgeDocument.findMany({ where: { baseId: base.id, enabled: true, deletedAt: null }, select: { id: true } });
          releases.push({ releaseId: base.currentReleaseId, scope: { type: 'PLATFORM' }, documentIds: documents.map(d => d.id) });
        } else if (documentIds.length) releases.push({ releaseId: base.currentReleaseId, scope: { type: 'PLATFORM' }, documentIds });
      }
    }
    return { releases, ownsKnowledge: bases.some(b => b.ownerAgentId === agentId), selectionPolicy };
  }
  async upload(
    baseId: string,
    scope: KnowledgeScope,
    input: KnowledgeUploadInput,
  ) {
    await this.getBase(baseId, scope);
    if (
      !input ||
      typeof input.idempotencyKey !== 'string' ||
      !input.idempotencyKey.trim() ||
      input.idempotencyKey.length > 128 ||
      typeof input.originalName !== 'string' ||
      input.originalName.length > 500
    )
      throw new KnowledgeCoreError('INVALID_UPLOAD_INPUT');
    const profile = await this.profiles.resolveForRequest(
      input.profileId,
      'EMBEDDING',
    );
    const configuration = normalizeKnowledgeIndexConfig(
      input.indexConfig,
      profile.maxInputTokens,
    );
    const originalName = basename(input.originalName.replace(/\\/g, '/'))
      .replace(/[\0-\x1f]/g, '')
      .trim();
    if (!originalName) throw new KnowledgeCoreError('INVALID_UPLOAD_INPUT');
    const parserFormat = extname(originalName).toLowerCase();
    const stored = await this.blobs.put(Buffer.from(input.bytes));
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify([
          stored.contentHash,
          input.profileId,
          input.documentId ?? null,
          originalName,
          input.title ?? null,
          input.mediaType ?? null,
          configuration.indexConfigHash,
        ]),
      )
      .digest('hex');
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kc_base WHERE id=${baseId} FOR UPDATE`;
      const base = await tx.knowledgeBase.findUniqueOrThrow({
        where: { id: baseId },
      });
      assertKnowledgeScope(base, scope);
      if (!base.enabled) throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
      const existing = await tx.knowledgeIngestionRequest.findUnique({
        where: {
          baseId_idempotencyKey: {
            baseId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { job: true },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new KnowledgeCoreError('IDEMPOTENCY_CONFLICT');
        return existing.job;
      }
      let document = input.documentId
        ? await tx.knowledgeDocument.findUnique({
            where: { id: input.documentId },
          })
        : null;
      if (input.documentId && (!document || document.baseId !== baseId))
        throw new KnowledgeCoreError('KNOWLEDGE_DOCUMENT_NOT_FOUND');
      if (document && !document.enabled)
        throw new KnowledgeCoreError('KNOWLEDGE_DOCUMENT_DISABLED');
      if (!document)
        document = await tx.knowledgeDocument.create({
          data: { baseId, title: (input.title ?? originalName).slice(0, 200) },
        });
      let revision = await tx.knowledgeDocumentRevision.findUnique({
        where: {
          documentId_contentHash_parserFormat: {
            documentId: document.id,
            contentHash: stored.contentHash,
            parserFormat,
          },
        },
      });
      if (!revision)
        revision = await tx.knowledgeDocumentRevision.create({
          data: {
            documentId: document.id,
            ...stored,
            parserFormat,
            originalName,
            mediaType: (input.mediaType ?? 'application/octet-stream').slice(
              0,
              200,
            ),
          },
        });
      const index = await tx.knowledgeIndexRevision.findUnique({
        where: {
          revisionId_profileId_indexConfigHash: {
            revisionId: revision.id,
            profileId: input.profileId,
            indexConfigHash: configuration.indexConfigHash,
          },
        },
        include: { job: true },
      });
      let acceptedJob = index?.job;
      if (!acceptedJob) {
        const created =
          index ??
          (await tx.knowledgeIndexRevision.create({
            data: {
              revisionId: revision.id,
              profileId: input.profileId,
              ...configuration,
            },
          }));
        acceptedJob = await tx.knowledgeIngestionJob.create({
          data: {
            baseId,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            indexRevisionId: created.id,
          },
        });
      }
      // Reserve every accepted request in this same base-lock transaction, even when its index/job already exists.
      // The original job key/hash stays unchanged; each alias has its own immutable request hash.
      await tx.knowledgeIngestionRequest.create({
        data: {
          baseId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          jobId: acceptedJob.id,
        },
      });
      await tx.knowledgeDocument.update({ where: { id: document.id }, data: { requestedIndexId: acceptedJob.indexRevisionId } });
      if (index?.status === 'READY') await this.synchronizeLiveRelease(baseId, tx);
      return acceptedJob;
    });
    const { leaseToken: _leaseToken, ...safe } = job;
    return safe;
  }
  async reindexRevision(
    revisionId: string,
    scope: KnowledgeScope,
    input: {
      profileId: string;
      idempotencyKey: string;
      indexConfig?: KnowledgeIndexConfiguration;
    },
  ) {
    const revision = await this.prisma.knowledgeDocumentRevision.findUnique({
      where: { id: revisionId },
      include: { document: true },
    });
    if (!revision) throw new KnowledgeCoreError('KNOWLEDGE_REVISION_NOT_FOUND');
    await this.getBase(revision.document.baseId, scope);
    return this.upload(revision.document.baseId, scope, {
      ...input,
      documentId: revision.documentId,
      originalName: revision.originalName,
      mediaType: revision.mediaType,
      bytes: await this.blobs.read(revision.storageKey),
    });
  }
  async inspectJob(id: string, scope: KnowledgeScope) {
    const job = await this.prisma.knowledgeIngestionJob.findUnique({
      where: { id },
      include: { index: true },
    });
    if (!job) throw new KnowledgeCoreError('INGESTION_JOB_NOT_FOUND');
    await this.getBase(job.baseId, scope);
    // Lease fencing tokens are internal worker capabilities, never part of HTTP/public inspection.
    const { leaseToken: _leaseToken, ...safe } = job;
    return safe;
  }
  async cancelJob(id: string, scope: KnowledgeScope) {
    await this.inspectJob(id, scope);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kc_ingestion_job WHERE id=${id} FOR UPDATE`;
      const job = await tx.knowledgeIngestionJob.findUniqueOrThrow({
        where: { id },
      });
      if (job.status === 'SUCCEEDED')
        throw new KnowledgeCoreError('INGESTION_ALREADY_FINISHED');
      await tx.knowledgeIngestionJob.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          stage: 'CANCELLED',
          cancelledAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          errorCode: 'INGESTION_CANCELLED',
        },
      });
      await tx.knowledgeIndexRevision.update({
        where: { id: job.indexRevisionId },
        data: { status: 'CANCELLED', reasonCode: 'INGESTION_CANCELLED' },
      });
    });
    return this.inspectJob(id, scope);
  }
  async retryJob(id: string, scope: KnowledgeScope) {
    const original = await this.inspectJob(id, scope);
    await this.profiles.resolveForRequest(
      original.index.profileId,
      'EMBEDDING',
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kc_ingestion_job WHERE id=${id} FOR UPDATE`;
      const job = await tx.knowledgeIngestionJob.findUniqueOrThrow({
        where: { id },
      });
      if (!['FAILED', 'CANCELLED'].includes(job.status))
        throw new KnowledgeCoreError('INGESTION_RETRY_NOT_ALLOWED');
      await tx.knowledgeIndexRevision.update({
        where: { id: job.indexRevisionId },
        data: { status: 'PENDING', reasonCode: null },
      });
      await tx.knowledgeIngestionJob.update({
        where: { id },
        data: {
          status: 'QUEUED',
          stage: 'UPLOADED',
          attempts: 0,
          availableAt: new Date(),
          cancelledAt: null,
          errorCode: null,
          leaseToken: null,
          leaseUntil: null,
        },
      });
    });
    return this.inspectJob(id, scope);
  }
  async createRelease(
    baseId: string,
    scope: KnowledgeScope,
    indexRevisionIds: string[],
  ) {
    await this.getBase(baseId, scope);
    if (
      !Array.isArray(indexRevisionIds) ||
      !indexRevisionIds.length ||
      indexRevisionIds.length > 1000 ||
      new Set(indexRevisionIds).size !== indexRevisionIds.length
    )
      throw new KnowledgeCoreError('INVALID_KNOWLEDGE_RELEASE');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kc_base WHERE id=${baseId} FOR UPDATE`;
      const base = await tx.knowledgeBase.findUniqueOrThrow({
        where: { id: baseId },
      });
      assertKnowledgeScope(base, scope);
      if (!base.enabled) throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
      const indexes = await tx.knowledgeIndexRevision.findMany({
        where: { id: { in: indexRevisionIds } },
        include: { revision: { include: { document: true } }, profile: true },
      });
      const documents = new Set<string>();
      if (indexes.length !== indexRevisionIds.length)
        throw new KnowledgeCoreError('INVALID_KNOWLEDGE_RELEASE');
      for (const index of indexes) {
        const document = index.revision.document;
        if (
          index.status !== 'READY' ||
          document.baseId !== baseId ||
          !document.enabled ||
          !index.profile.enabled ||
          documents.has(document.id)
        )
          throw new KnowledgeCoreError('INDEX_NOT_RELEASEABLE');
        documents.add(document.id);
      }
      const previous = await tx.knowledgeRelease.findFirst({
        where: { baseId },
        orderBy: { version: 'desc' },
      });
      const release = await tx.knowledgeRelease.create({
        data: {
          baseId,
          version: (previous?.version ?? 0) + 1,
          items: {
            create: indexRevisionIds.map((indexRevisionId) => ({
              indexRevisionId,
            })),
          },
        },
      });
      return tx.knowledgeRelease.update({
        where: { id: release.id },
        data: { sealed: true },
        include: { items: true },
      });
    });
  }
  async getRelease(id: string, scope: KnowledgeScope) {
    const release = await this.prisma.knowledgeRelease.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!release?.sealed)
      throw new KnowledgeCoreError('KNOWLEDGE_RELEASE_NOT_FOUND');
    await this.getBase(release.baseId, scope);
    return release;
  }
  /** Immutable references plus current enabled flags. Retrieval caller must apply current ACL before candidate SQL. */
  async getReleaseInventory(id: string, scope: KnowledgeScope) {
    await this.getRelease(id, scope);
    return this.prisma.knowledgeIndexRevision.findMany({
      where: { releaseItems: { some: { releaseId: id } } },
      include: { revision: { include: { document: true } }, profile: true },
    });
  }
  async readChunks(
    indexRevisionIds: string[],
    scope: KnowledgeScope,
    offset = 0,
    limit = 100,
  ) {
    if (
      !indexRevisionIds.length ||
      indexRevisionIds.length > 1000 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new KnowledgeCoreError('INVALID_CHUNK_READ');
    const indexes = await this.prisma.knowledgeIndexRevision.findMany({
      where: { id: { in: indexRevisionIds } },
      include: {
        revision: { include: { document: { include: { base: true } } } },
      },
    });
    if (indexes.length !== new Set(indexRevisionIds).size)
      throw new KnowledgeCoreError('KNOWLEDGE_INDEX_NOT_FOUND');
    for (const i of indexes) {
      assertKnowledgeScope(i.revision.document.base, scope);
      if (
        i.status !== 'READY' ||
        !i.revision.document.enabled ||
        !i.revision.document.base.enabled
      )
        throw new KnowledgeCoreError('KNOWLEDGE_DISABLED');
    }
    return this.prisma.knowledgeChunk.findMany({
      where: { indexRevisionId: { in: indexRevisionIds } },
      orderBy: [{ indexRevisionId: 'asc' }, { ordinal: 'asc' }],
      skip: offset,
      take: limit,
    });
  }
}
