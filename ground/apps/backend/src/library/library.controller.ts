import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MemberRole, User } from '@prisma/client';
import type { Response } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { IsString, IsNotEmpty } from 'class-validator';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { completeLibraryTurn } from './library.llm';
import {
  AskDto,
  BatchDto,
  SearchQuery,
  CreateFolderDto,
  CreateLinkDto,
  GrantCustodyDto,
  libraryUploadLimit,
  ListQuery,
  MoveNodeDto,
  OpenCitationDto,
  RenameNodeDto,
  ScopeNodeDto,
  ScopeImpactQuery,
  UploadFilesDto,
} from './library.dto';
import { LibraryError } from './library.errors';
import { LibraryService } from './library.service';
import type { Actor } from './library.types';
import { LlmChatGatewayService } from '../llm/llm-chat.gateway.service';
import { PrismaService } from '../prisma/prisma.service';

class MemberContextDto {
  @IsString() @IsNotEmpty() tenantId!: string;
}

type UploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

import { uploadedName } from '../common/uploaded-name';

@Controller('library')
@UseGuards(JwtGuard)
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly prisma: PrismaService,
    private readonly gateway: LlmChatGatewayService,
    private readonly jwt: JwtService,
  ) {}

  /** Actual memberships only; Admin tenant discovery remains unchanged. */
  @Get('context')
  @Header('Cache-Control', 'no-store')
  async context(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    const rows = await this.prisma.orgMember.findMany({
      where: { userId: user.id, tenant: { status: 'active' } },
      select: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const tenants = rows.map(row => row.tenant);
    return { tenants, selectedTenantId: tenants.some(t => t.id === tenantId) ? tenantId : null };
  }

  /** Host-only scoped credential; never changes the Admin/browser login cookie. */
  @Post('context')
  @Header('Cache-Control', 'no-store')
  async selectContext(@CurrentUser() user: User, @Body() body: MemberContextDto) {
    const context = await this.context(user, body.tenantId);
    if (!context.selectedTenantId) throw new ForbiddenException('只能选择本人已加入的有效企业');
    return { ...context, token: this.jwt.sign({ sub: user.id, tenantId: body.tenantId, purpose: 'library-member' }) };
  }

  @Get('config')
  async config(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.run(async () => this.library.config(await this.actor(user, tenantId)));
  }

  @Get('search')
  async search(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query() query: SearchQuery,
  ) {
    const actor = await this.actor(user, tenantId);
    return this.run(async () => this.library.searchQuotes(actor, query.q));
  }

  @Get('members')
  async members(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    const actor = await this.actor(user, tenantId);
    if (!actor.isOrgAdmin || !actor.activeMember) throw new ForbiddenException('只有企业管理员可以查看成员资料');
    return this.run(async () => {
      const [rows, counts] = await Promise.all([
        this.prisma.orgMember.findMany({
          where: { tenantId: actor.tenantId },
          include: { user: { select: { id: true, name: true, phone: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.library.ownerCounts(actor),
      ]);
      return {
        members: rows.filter((row) => row.user.status === 'active').map((row) => ({
          userId: row.user.id,
          name: row.user.name,
          phone: row.user.phone,
          itemCount: counts[row.user.id] ?? 0,
        })),
      };
    });
  }

  @Get('items')
  async items(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query() query: ListQuery,
  ) {
    const actor = await this.actor(user, tenantId);
    if (query.catalog === '1') return this.run(async () => this.library.catalog(actor, query.q, query.page ?? 1, query.pageSize ?? 10));
    const view = query.view ?? 'mine';
    return this.run(async () => this.library.list(actor, view, query.parentId ?? null, query.q, query.flat === '1', query.page, query.pageSize, query.status, query.fileType, view === 'members' ? query.owner : undefined, query.agent === '1'));
  }

  @Post('folders')
  async folder(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateFolderDto,
  ) {
    return this.run(async () => this.library.createFolder(await this.actor(user, tenantId), dto.name, dto.parentId, dto));
  }

  @Post('links')
  async link(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateLinkDto,
  ) {
    return this.run(async () => this.library.createLink(await this.actor(user, tenantId), dto.name, dto.url, dto.parentId, dto));
  }

  @Post('files')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: libraryUploadLimit } }))
  async files(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @UploadedFiles() files: UploadFile[] | undefined,
    @Body() dto: UploadFilesDto,
  ) {
    const actor = await this.actor(user, tenantId);
    const items = [];
    const failed: { name: string; message: string }[] = [];
    for (const file of files ?? []) {
      try {
        items.push(await this.library.upload(actor, {
          originalName: uploadedName(file.originalname),
          mimeType: file.mimetype,
          bytes: file.buffer,
          parentId: dto.parentId || null,
          scope: dto.scope,
          confirmShare: dto.confirmShare,
        }));
      } catch (error) {
        failed.push({
          name: uploadedName(file.originalname),
          message: error instanceof LibraryError ? error.message : '上传失败',
        });
      }
    }
    if (!files?.length) throw new BadRequestException('请选择文件');
    return { items, failed };
  }

  @Post('files/:id/versions')
  @UseInterceptors(FilesInterceptor('files', 1, { limits: { fileSize: libraryUploadLimit } }))
  async replace(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @UploadedFiles() files: UploadFile[] | undefined,
  ) {
    const file = files?.[0];
    if (!file) throw new BadRequestException('请选择文件');
    return this.run(async () => this.library.replaceVersion(
      await this.actor(user, tenantId),
      id,
      uploadedName(file.originalname),
      file.mimetype,
      file.buffer,
    ));
  }

  @Patch('nodes/:id')
  async rename(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: RenameNodeDto,
  ) {
    return this.run(async () => this.library.rename(await this.actor(user, tenantId), id, dto.name));
  }

  @Post('nodes/:id/move')
  async move(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: MoveNodeDto,
  ) {
    return this.run(async () => this.library.move(await this.actor(user, tenantId), id, dto.parentId, dto));
  }

  @Get('nodes/:id/scope-impact')
  async scopeImpact(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string, @Query() query: ScopeImpactQuery) {
    return this.run(async () => this.library.scopeImpact(await this.actor(user, tenantId), id, query.scope));
  }

  @Post('nodes/:id/scope')
  async scope(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ScopeNodeDto,
  ) {
    return this.run(async () => this.library.setScope(await this.actor(user, tenantId), id, dto.scope, dto.confirmShare, dto));
  }

  @Post('nodes/:id/recycle')
  async recycle(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.run(async () => this.library.recycle(await this.actor(user, tenantId), id));
  }

  @Post('nodes/:id/restore')
  async restore(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.run(async () => this.library.restore(await this.actor(user, tenantId), id));
  }

  @Delete('nodes/:id')
  async purge(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.run(async () => this.library.purge(await this.actor(user, tenantId), id));
  }

  @Post('nodes/:id/retry-parse')
  async retry(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.run(async () => this.library.retryParse(await this.actor(user, tenantId), id));
  }

  @Get('nodes/:id/preview')
  async preview(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Query('versionId') versionId?: string,
  ) {
    return this.run(async () => this.library.preview(await this.actor(user, tenantId), id, versionId));
  }

  @Get('nodes/:id/download')
  async download(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('versionId') versionId?: string,
    @Query('inline') inline?: string,
  ) {
    try {
      const file = await this.library.download(await this.actor(user, tenantId), id, versionId, inline === '1');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Content-Disposition', `${inline === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
      res.send(file.bytes);
    } catch (error) {
      throw this.http(error);
    }
  }

  @Get('nodes/:id/source')
  async source(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string, @Query('versionId') versionId: string, @Query('locator') locator?: string) {
    return this.run(async () => this.library.openCitation(await this.actor(user, tenantId), id, versionId, locator));
  }

  @Get('nodes/:id/versions')
  async versions(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.run(async () => this.library.versions(await this.actor(user, tenantId), id));
  }

  @Post('open')
  async open(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: OpenCitationDto,
  ) {
    return this.run(async () => this.library.openCitation(await this.actor(user, tenantId), dto.nodeId, dto.versionId, dto.locator, dto.purpose !== 'prepare'));
  }

  @Post('used')
  async used(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Body() dto: OpenCitationDto) {
    return this.run(async () => this.library.markUsed(await this.actor(user, tenantId), dto.nodeId, dto.versionId));
  }

  @Post('ask')
  async ask(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: AskDto,
  ) {
    const actor = await this.actor(user, tenantId);
    return this.run(async () => this.library.ask(actor, dto.versionIds, dto.question, dto.model, (input) => (
      completeLibraryTurn(this.gateway, user, actor.tenantId, input.messages, input.model)
    )));
  }

  @Post('batch')
  async batch(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: BatchDto,
  ) {
    return this.run(async () => this.library.batch(await this.actor(user, tenantId), dto.ids, dto.action));
  }

  @Get('custody/options')
  async custodyOptions(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    const actor = await this.actor(user, tenantId);
    if (!actor.activeMember) throw new ForbiddenException('须在本企业登录后批准代管');
    return {
      tenantId: actor.tenantId, ownerUserId: actor.userId, canApproveEnterprise: actor.isOrgAdmin,
      grantees: await this.prisma.user.findMany({ where: { isPlatformAdmin: true, status: 'active', id: { not: user.id } }, select: { id: true, name: true } }),
    };
  }

  @Get('admin/custody/:custodyId/items')
  async managedItems(@CurrentUser() user: User, @Param('custodyId') id: string, @Query() query: ListQuery) {
    return this.run(async () => this.library.list(await this.library.managedActor({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }, id), 'managed', query.parentId, query.q));
  }

  @Get('admin/custody/:custodyId/nodes/:nodeId/preview')
  async managedPreview(@CurrentUser() user: User, @Param('custodyId') id: string, @Param('nodeId') nodeId: string, @Query('versionId') versionId?: string) {
    return this.run(async () => this.library.preview(await this.library.managedActor({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }, id), nodeId, versionId));
  }

  @Get('admin/custody/:custodyId/nodes/:nodeId/download')
  async managedDownload(@CurrentUser() user: User, @Param('custodyId') id: string, @Param('nodeId') nodeId: string, @Query('versionId') versionId: string | undefined, @Res() res: Response) {
    const file = await this.run(async () => this.library.download(await this.library.managedActor({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }, id), nodeId, versionId));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.send(file.bytes);
  }

  @Get('admin/stats')
  async stats(@CurrentUser() user: User) {
    return this.run(async () => this.library.adminStats({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }));
  }

  @Get('admin/custody')
  async custodyList(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.run(async () => this.library.listCustody(await this.actor(user, tenantId)));
  }

  @Post('admin/custody')
  async custodyGrant(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Body() dto: GrantCustodyDto) {
    const grantee = await this.prisma.user.findFirst({ where: { id: dto.granteeUserId, isPlatformAdmin: true, status: 'active' }, select: { id: true } });
    if (!grantee || grantee.id === user.id) throw new ForbiddenException('请选择另一位有效平台代管人；平台不能自授权');
    return this.run(async () => this.library.grantCustody(
      await this.actor(user, tenantId),
      { ...dto, expiresAt: new Date(dto.expiresAt).getTime() },
    ));
  }

  @Post('admin/custody/:id/revoke')
  async custodyRevoke(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.run(async () => this.library.revokeCustody(await this.actor(user, tenantId), id));
  }

  /** 企业只来自真实成员关系。加入猛犸总部的平台账号按普通成员使用资料库，不获得企业管理员权限。 */
  private async actor(user: User, tenantId: string | null): Promise<Actor> {
    if (!tenantId) return { userId: user.id, tenantId: '', isPlatformAdmin: user.isPlatformAdmin, isOrgAdmin: false, activeMember: false };
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true, type: true } });
    const activeMember = Boolean(membership && tenant?.status === 'active');
    const isOrgAdmin = Boolean(!user.isPlatformAdmin && activeMember && membership && (membership.role === MemberRole.ADMIN || membership.role === MemberRole.OWNER));
    return {
      userId: user.id,
      tenantId: activeMember ? tenantId : '',
      isPlatformAdmin: user.isPlatformAdmin,
      isOrgAdmin,
      activeMember,
    };
  }

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw this.http(error);
    }
  }

  private http(error: unknown): Error {
    if (error instanceof LibraryError) {
      if (error.status === 404) return new NotFoundException({ message: error.message, code: error.code });
      if (error.status === 403) return new ForbiddenException({ message: error.message, code: error.code });
      if (error.status === 409) return new ConflictException({ message: error.message, code: error.code });
      if (error.status === 410) return new GoneException({ message: error.message, code: error.code });
      if (error.status >= 500) return new InternalServerErrorException({ message: '资料库暂时不可用', code: error.code });
      return new BadRequestException({ message: error.message, code: error.code });
    }
    return new InternalServerErrorException('资料库请求失败');
  }
}
