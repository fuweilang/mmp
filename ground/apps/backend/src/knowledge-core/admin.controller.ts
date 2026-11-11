import { BadRequestException, Body, CanActivate, Controller, Delete, ExecutionContext, Get, Header, HttpException, Injectable, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { storedUploadedName, uploadedName } from '../common/uploaded-name';
import { randomUUID } from 'node:crypto';
import { JwtGuard } from '../auth/jwt.guard';
import { assertSuperAdmin } from '../auth/super-admin';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeInspectionService } from './inspection.service';
import { KnowledgeHttpAdapter } from './provider';
import { KnowledgeCoreService } from './knowledge-core.service';
import { KnowledgeProfilesService } from './profiles.service';
import { KnowledgeRetrievalService } from './retrieval.service';
import { KnowledgeCoreError, safeKnowledgeError } from './errors';
import type { KnowledgeAccess } from './retrieval-access';
import { KnowledgeChunkPreviewDto, KnowledgeExtractedPreviewDto, KnowledgeBaseDto, KnowledgeBasePatchDto, KnowledgeEnabledDto, KnowledgeProfileDto, KnowledgeReindexDto, KnowledgeReleaseDto, KnowledgeRetrievalTestDto, KnowledgeSourceDto, KnowledgeUploadDto } from './admin.dto';
const PLATFORM = {
  type: 'PLATFORM'
} as const;
type AdminRequest = Request & {
  user: {
    id: string;
  };
};
@Injectable()
export class KnowledgeSuperAdminGuard implements CanActivate {
  constructor(private readonly db: PrismaService) { }
  async canActivate(context: ExecutionContext) { await assertSuperAdmin(this.db, context.switchToHttp().getRequest<AdminRequest>().user.id); return true; }
}
@Controller('admin/knowledge-core')
@UseGuards(JwtGuard, KnowledgeSuperAdminGuard)
export class KnowledgeAdminController {
  constructor(private readonly inspection: KnowledgeInspectionService, private readonly db: PrismaService, private readonly core: KnowledgeCoreService, private readonly profiles: KnowledgeProfilesService, private readonly adapter: KnowledgeHttpAdapter, private readonly retrieval: KnowledgeRetrievalService) { }
  private async run<T>(work: () => Promise<T>) {
    try {
      return await work();
    }
    catch (error) {
      if (error instanceof HttpException)
        throw error;
      const code = safeKnowledgeError(error).code;
      throw new HttpException({
        code, message: code
      }, code.includes('NOT_FOUND') ? 404 : code.includes('SCOPE') || code.includes('FORBIDDEN') || code === 'KNOWLEDGE_DISABLED' ? 403 : error instanceof KnowledgeCoreError ? 400 : 500);
    }
  }
  private access(userId: string, releaseIds: string[]): KnowledgeAccess {
    return {
      actorUserId: userId, tenantId: null, conversationId: `admin:${randomUUID()}`, turnId: randomUUID(), authorize: async () => {
        await assertSuperAdmin(this.db, userId);
        return releaseIds.map(releaseId => ({
          releaseId, scope: PLATFORM
        }));
      }
    };
  }
  @Get('profiles')
  listProfiles() { return this.run(() => this.profiles.list()); }
  @Post('profiles')
  createProfile(
    @Body()
    dto: KnowledgeProfileDto) { return this.run(() => this.profiles.create(dto)); }
  @Patch('profiles/:id')
  enableProfile(
    @Param('id')
    id: string,
    @Body()
    dto: KnowledgeEnabledDto) { return this.run(() => this.profiles.setEnabled(id, dto.enabled)); }
  /** Configuration health only: no outbound call or fabricated provider availability/usage. */
  @Get('profiles/:id/health')
  async profileHealth(
    @Param('id')
    id: string) {
    return this.run(async () => {
      const profile = await this.profiles.get(id);
      try {
        await this.profiles.resolveForRequest(id, profile.task as 'EMBEDDING' | 'RERANK');
        return {
          profileId: id, configured: true, providerProbed: false
        };
      }
      catch (error) {
        return {
          profileId: id, configured: false, providerProbed: false, errorCode: safeKnowledgeError(error).code
        };
      }
    });
  }
  /** Explicit, potentially billed provider probe. Tiny fixed inputs, no source documents or client supplied prompt. */
  @Post('profiles/:id/probe')
  async probe(
    @Param('id')
    id: string) {
    return this.run(async () => {
      const started = performance.now(), operationId = randomUUID();
      try {
        const profile = await this.profiles.get(id);
        const usage = profile.task === 'EMBEDDING'
          ? await this.adapter.embed(id, ['连接测试'], {
            operationId
          })
          : await this.adapter.rerank(id, '连接测试', ['连接测试'], 1, {
            operationId
          });
        return {
          profileId: id, operationId, providerProbed: true, available: true, estimatedTokens: usage.estimatedTokens,
          actualTokens: usage.actualTokens, durationMs: Math.round(performance.now() - started)
        };
      }
      catch (error) {
        return {
          profileId: id, operationId, providerProbed: true, available: false, errorCode: safeKnowledgeError(error).code,
          durationMs: Math.round(performance.now() - started)
        };
      }
    });
  }
  @Get('bases')
  listBases() { return this.run(() => this.core.listBases(PLATFORM)); }
  @Post('bases')
  createBase(
    @Body()
    dto: KnowledgeBaseDto) { return this.run(() => this.core.createBase(PLATFORM, dto.name, dto.ownerAgentId)); }
  private async baseMetadata(id: string) {
    const base = await this.db.knowledgeBase.findFirst({
      where: {
        id, scope: 'PLATFORM', tenantId: null
      }
    });
    if (!base)
      throw new KnowledgeCoreError('KNOWLEDGE_NOT_FOUND');
    return base;
  }
  @Get('bases/:id')
  detailBase(
    @Param('id')
    id: string) { return this.run(() => this.baseMetadata(id)); }
  /** Archive is a mutable authorization toggle. Immutable revisions/releases are retained and can be restored. */
  @Patch('bases/:id')
  patchBase(
    @Param('id')
    id: string,
    @Body()
    dto: KnowledgeBasePatchDto) {
    return this.run(async () => {
      await this.baseMetadata(id);
      if (dto.name !== undefined && !dto.name.trim())
        throw new KnowledgeCoreError('INVALID_KNOWLEDGE_NAME');
      return this.db.knowledgeBase.update({
        where: {
          id
        }, data: {
          ...(dto.name !== undefined ? {
            name: dto.name.trim()
          } : {}), ...(dto.enabled !== undefined ? {
            enabled: dto.enabled
          } : {})
        }
      });
    });
  }
  @Get('bases/:id/documents')
  listDocuments(
    @Param('id')
    id: string) {
    return this.run(async () => {
      const base = await this.core.getBase(id, PLATFORM);
      const current = base.currentReleaseId ? await this.db.knowledgeRelease.findUnique({ where: { id: base.currentReleaseId }, include: { items: true } }) : null;
      const effective = new Set(current?.items.map(item=>item.indexRevisionId) ?? []);
      const documents = await this.db.knowledgeDocument.findMany({
        where: {
          baseId: id, deletedAt: null,
        }, include: {
          revisions: {
            select: {
              id: true, contentHash: true, originalName: true, parserFormat: true, mediaType: true, sizeBytes: true, createdAt: true, indexes: { include: { profile: { select: { enabled: true } }, job: { select: { id: true, status: true, errorCode: true } } } }
            }
          }
        }, orderBy: {
          createdAt: 'desc'
        }
      });
      return documents.map(document => ({
        ...document, title: storedUploadedName(document.title),
        ...(base.autoUpdate ? { effectiveIndexId: document.revisions.flatMap(r=>r.indexes).find(i=>effective.has(i.id))?.id ?? null } : {}),
        revisions: document.revisions.map(revision => ({
          ...revision, originalName: storedUploadedName(revision.originalName),
        })),
      }));
    });
  }
  @Patch('documents/:id')
  enableDocument(
    @Param('id')
    id: string,
    @Body()
    dto: KnowledgeEnabledDto) {
    return this.run(async () => {
      const document = await this.db.knowledgeDocument.findUnique({
        where: {
          id
        }
      });
      if (!document)
        throw new KnowledgeCoreError('KNOWLEDGE_DOCUMENT_NOT_FOUND');
      if (document.deletedAt) throw new KnowledgeCoreError('KNOWLEDGE_DOCUMENT_NOT_FOUND');
      await this.core.getBase(document.baseId, PLATFORM);
      return this.db.knowledgeDocument.update({
        where: {
          id
        }, data: {
          enabled: dto.enabled
        }
      });
    });
  }
  @Get('documents/:id/usage')
  documentUsage(@Param('id') id: string) { return this.run(() => this.core.fileUsage(id)); }
  @Delete('documents/:id')
  deleteDocument(@Param('id') id: string) { return this.run(() => this.core.deleteFile(id)); }
  @Post('bases/:id/documents')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 20 * 1024 * 1024, files: 1, fields: 4
    }
  }))
  upload(
    @Param('id')
    id: string,
    @Body()
    dto: KnowledgeUploadDto,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    } | undefined) {
    return this.run(async () => {
      if (!file)
        throw new BadRequestException('FILE_REQUIRED');
      return this.core.upload(id, PLATFORM, {
        ...dto, profileId: dto.profileId || await this.core.defaultProfile(id), bytes: file.buffer, originalName: uploadedName(file.originalname), mediaType: file.mimetype
      });
    });
  }
  @Post('revisions/:id/reindex')
  reindex(
    @Param('id')
    id: string,
    @Body()
    dto: KnowledgeReindexDto) { return this.run(() => this.core.reindexRevision(id, PLATFORM, dto)); }
  @Get('jobs/:id')
  inspect(
    @Param('id')
    id: string) { return this.run(() => this.core.inspectJob(id, PLATFORM)); }
  @Post('jobs/:id/retry')
  retry(
    @Param('id')
    id: string) { return this.run(() => this.core.retryJob(id, PLATFORM)); }
  @Post('jobs/:id/cancel')
  cancel(
    @Param('id')
    id: string) { return this.run(() => this.core.cancelJob(id, PLATFORM)); }
  @Get('bases/:id/releases')
  listReleases(
    @Param('id')
    id: string) {
    return this.run(async () => {
      await this.core.getBase(id, PLATFORM);
      return this.db.knowledgeRelease.findMany({
        where: {
          baseId: id, sealed: true
        }, include: {
          items: true
        }, orderBy: {
          version: 'desc'
        }
      });
    });
  }
  @Post('bases/:id/releases')
  release(
    @Param('id')
    id: string,
    @Body()
    dto: KnowledgeReleaseDto) { return this.run(() => this.core.createRelease(id, PLATFORM, dto.indexRevisionIds)); }
  @Get('releases/:id')
  getRelease(
    @Param('id')
    id: string) { return this.run(() => this.core.getRelease(id, PLATFORM)); }
  @Post('retrieval-test')
  test(
    @Req()
    req: AdminRequest,
    @Body()
    dto: KnowledgeRetrievalTestDto) { return this.executeTest(req, dto, false); }
  @Post('retrieval-test/diagnostics')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  diagnosticTest(
    @Req()
    req: AdminRequest,
    @Body()
    dto: KnowledgeRetrievalTestDto) { return this.executeTest(req, dto, true); }
  private executeTest(req: AdminRequest, dto: KnowledgeRetrievalTestDto, diagnostics: boolean) {
    return this.run(async () => {
      const abort = new AbortController(), stop = () => abort.abort();
      req.once('aborted', stop);
      const response = req.res, onClose = () => {
        if (!response?.writableFinished)
          abort.abort();
      };
      response?.once('close', onClose);
      const access = this.access(req.user.id, dto.releaseIds), input = {
        ...dto, signal: abort.signal
      };
      try {
        return diagnostics ? await this.retrieval.retrieveForAdmin(req.user.id, access, input) : await this.retrieval.retrieve(access, input);
      }
      finally {
        req.off('aborted', stop);
        response?.off('close', onClose);
      }
    });
  }
  @Get('documents/:documentId/revisions/:revisionId/original')
  original(
    @Req()
    req: AdminRequest,
    @Param('documentId')
    documentId: string,
    @Param('revisionId')
    revisionId: string,
    @Res()
    response: Response,
    @Query('inline')
    inline?: string) {
    return this.run(async () => {
      const source = await this.inspection.original(req.user.id, documentId, revisionId);
      const filename = encodeURIComponent(source.originalName).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
      const previewPdf = inline === '1' && source.originalName.toLowerCase().endsWith('.pdf');
      response.setHeader('Content-Type', previewPdf ? 'application/pdf' : 'application/octet-stream');
      response.setHeader('Content-Disposition', `${previewPdf ? 'inline' : 'attachment'}; filename="knowledge-source"; filename*=UTF-8''${filename}`);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Length', source.bytes.length);
      response.send(source.bytes);
    });
  }
  @Get('documents/:documentId/revisions/:revisionId/indexes/:indexId/chunks')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  chunks(
    @Req()
    req: AdminRequest,
    @Param('documentId')
    documentId: string,
    @Param('revisionId')
    revisionId: string,
    @Param('indexId')
    indexId: string,
    @Query()
    query: KnowledgeChunkPreviewDto) {
    return this.run(() => this.inspection.chunks(req.user.id, documentId, revisionId, indexId, query.offset, query.limit));
  }
  @Get('documents/:documentId/revisions/:revisionId/indexes/:indexId/extracted')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  extracted(
    @Req()
    req: AdminRequest,
    @Param('documentId')
    documentId: string,
    @Param('revisionId')
    revisionId: string,
    @Param('indexId')
    indexId: string,
    @Query()
    query: KnowledgeExtractedPreviewDto) {
    return this.run(() => this.inspection.extracted(req.user.id, documentId, revisionId, indexId, query.offset, query.limit));
  }
  /** Exact pinned chunk preview only. Public session/expert-bound route is intentionally deferred to Task4. */
  @Post('sources/open')
  open(
    @Req()
    req: AdminRequest,
    @Body()
    dto: KnowledgeSourceDto) { return this.run(() => this.retrieval.openSource(this.access(req.user.id, [dto.knowledgeReleaseId]), dto)); }
}
