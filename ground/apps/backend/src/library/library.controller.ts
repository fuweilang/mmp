import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  GoneException,
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
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { completeLibraryTurn } from './library.llm';
import {
  AskDto,
  BatchDto,
  CreateFolderDto,
  CreateLinkDto,
  GrantCustodyDto,
  libraryUploadLimit,
  ListQuery,
  MoveNodeDto,
  OpenCitationDto,
  RenameNodeDto,
  ScopeNodeDto,
} from './library.dto';
import { LibraryError } from './library.errors';
import { LibraryService } from './library.service';
import type { Actor } from './library.types';
import { LlmChatGatewayService } from '../llm/llm-chat.gateway.service';
import { PrismaService } from '../prisma/prisma.service';

type UploadFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Controller('library')
@UseGuards(JwtGuard)
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly prisma: PrismaService,
    private readonly gateway: LlmChatGatewayService,
  ) {}

  @Get('config')
  async config(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.run(async () => this.library.config(await this.actor(user, tenantId)));
  }

  @Get('items')
  async items(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query() query: ListQuery,
  ) {
    const actor = await this.actor(user, tenantId);
    return this.run(async () => this.library.list(actor, query.view ?? 'mine', query.parentId ?? null, query.q));
  }

  @Post('folders')
  async folder(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateFolderDto,
  ) {
    return this.run(async () => this.library.createFolder(await this.actor(user, tenantId), dto.name, dto.parentId));
  }

  @Post('links')
  async link(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateLinkDto,
  ) {
    return this.run(async () => this.library.createLink(await this.actor(user, tenantId), dto.name, dto.url, dto.parentId));
  }

  @Post('files')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: libraryUploadLimit } }))
  async files(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @UploadedFiles() files: UploadFile[] | undefined,
    @Body('parentId') parentId?: string,
  ) {
    const actor = await this.actor(user, tenantId);
    const items = [];
    const failed: { name: string; message: string }[] = [];
    for (const file of files ?? []) {
      try {
        items.push(await this.library.upload(actor, {
          originalName: file.originalname,
          mimeType: file.mimetype,
          bytes: file.buffer,
          parentId: parentId || null,
        }));
      } catch (error) {
        failed.push({
          name: file.originalname,
          message: error instanceof Error ? error.message : '上传失败',
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
      file.originalname,
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
    return this.run(async () => this.library.move(await this.actor(user, tenantId), id, dto.parentId));
  }

  @Post('nodes/:id/scope')
  async scope(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ScopeNodeDto,
  ) {
    return this.run(async () => this.library.setScope(await this.actor(user, tenantId), id, dto.scope, dto.confirmShare));
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
  ) {
    try {
      const file = await this.library.download(await this.actor(user, tenantId), id, versionId);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
      res.send(file.bytes);
    } catch (error) {
      throw this.http(error);
    }
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
    return this.run(async () => this.library.openCitation(await this.actor(user, tenantId), dto.nodeId, dto.versionId, dto.locator));
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

  @Get('admin/stats')
  async stats(@CurrentUser() user: User) {
    return this.run(async () => this.library.adminStats({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }));
  }

  @Get('admin/custody')
  async custodyList(@CurrentUser() user: User) {
    return this.run(async () => this.library.listCustody({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }));
  }

  @Post('admin/custody')
  async custodyGrant(@CurrentUser() user: User, @Body() dto: GrantCustodyDto) {
    return this.run(async () => this.library.grantCustody(
      { userId: user.id, isPlatformAdmin: user.isPlatformAdmin },
      { ...dto, expiresAt: new Date(dto.expiresAt).getTime() },
    ));
  }

  @Post('admin/custody/:id/revoke')
  async custodyRevoke(@CurrentUser() user: User, @Param('id') id: string) {
    return this.run(async () => this.library.revokeCustody({ userId: user.id, isPlatformAdmin: user.isPlatformAdmin }, id));
  }

  /** 企业只来自登录态。平台管理员不是成员时不能把管理员身份当成资料读权限。 */
  private async actor(user: User, tenantId: string | null): Promise<Actor> {
    if (!tenantId) throw new ForbiddenException('缺少企业上下文');
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    let isOrgAdmin = false;
    if (membership) {
      const roles = await this.prisma.userRole.count({
        where: { userId: user.id, role: { key: 'org_admin' } },
      });
      isOrgAdmin = roles > 0 || membership.role === MemberRole.ADMIN || membership.role === MemberRole.OWNER;
    }
    return {
      userId: user.id,
      tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
      isOrgAdmin,
      activeMember: Boolean(membership),
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
      return new BadRequestException({ message: error.message, code: error.code });
    }
    return error instanceof Error ? error : new BadRequestException('资料库请求失败');
  }
}
