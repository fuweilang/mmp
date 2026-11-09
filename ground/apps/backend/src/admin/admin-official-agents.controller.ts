import { UpdateCatalogDiscoveryDto } from './dto/official-agent.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminOfficialAgentsService } from './admin-official-agents.service';
import {
  BulkGrantOfficialAgentDto,
  BulkOfflineOfficialAgentsDto,
  BulkRevokeOfficialAgentDto,
  CreateOfficialAgentDto,
  GrantOfficialAgentDto,
  ListOfficialAgentsDto,
  UpdateOfficialAgentDto,
} from './dto/official-agent.dto';
import { ImportOfficialAgentsDto } from './dto/import-official-agents.dto';

@Controller('admin/official-agents')
@UseGuards(JwtGuard)
export class AdminOfficialAgentsController {
  constructor(private agents: AdminOfficialAgentsService) {}

  @Get(':id/discovery')
  discovery(@CurrentUser() actor:User,@Param('id') id:string){return this.agents.discovery(actor,id);}

  @Put(':id/discovery')
  saveDiscovery(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateCatalogDiscoveryDto) { return this.agents.saveDiscovery(actor,id,dto); }

  @Get()
  list(@CurrentUser() actor: User, @Query() query: ListOfficialAgentsDto) {
    return this.agents.list(actor, query);
  }

  /** 仓内资产目录（无提示词正文），供 Admin 勾选导入。 */
  @Get('asset-catalog')
  assetCatalog(@CurrentUser() actor: User) {
    return this.agents.listAssetCatalog(actor);
  }

  @Post()
  create(@CurrentUser() actor: User, @Body() dto: CreateOfficialAgentDto) {
    return this.agents.create(actor, dto);
  }

  /** 从仓内 assets 幂等导入草稿；不自动发布。可传 keys 批量选择。 */
  @Post('import-assets')
  @HttpCode(200)
  importAssets(@CurrentUser() actor: User, @Body() dto: ImportOfficialAgentsDto) {
    return this.agents.importAssets(actor, dto.keys);
  }

  /** 批量下架已发布智能体；非 PUBLISHED 记为 skipped。 */
  @Post('bulk-offline')
  @HttpCode(200)
  bulkOffline(@CurrentUser() actor: User, @Body() dto: BulkOfflineOfficialAgentsDto) {
    return this.agents.bulkOffline(actor, dto.ids);
  }

  @Get(':id')
  detail(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.agents.detail(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: UpdateOfficialAgentDto,
  ) {
    return this.agents.update(actor, id, dto);
  }

  /** Upload / replace custom avatar; persists immediately, does not publish draft. */
  @Post(':id/avatar')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadAvatar(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    return this.agents.uploadAvatar(actor, id, file);
  }

  @Delete(':id/avatar')
  removeAvatar(@CurrentUser() actor:User,@Param('id') id:string){return this.agents.removeAvatar(actor,id);}

  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.agents.publish(actor, id);
  }

  @Post(':id/offline')
  @HttpCode(200)
  offline(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.agents.offline(actor, id);
  }

  /** Permanent physical delete; confirm in Admin UI. Cascades owned config only. */
  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.agents.remove(actor, id);
  }

  @Put(':id/grants')
  grant(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: GrantOfficialAgentDto,
  ) {
    return this.agents.grant(actor, id, dto);
  }

  @Post(':id/grants/bulk')
  @HttpCode(200)
  bulkGrant(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: BulkGrantOfficialAgentDto,
  ) {
    return this.agents.bulkGrant(actor, id, dto.tenantIds, dto.versionId);
  }

  @Post(':id/grants/bulk-revoke')
  @HttpCode(200)
  bulkRevoke(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() dto: BulkRevokeOfficialAgentDto,
  ) {
    return this.agents.bulkRevoke(actor, id, dto.tenantIds);
  }

  @Delete(':id/grants/:tenantId')
  revoke(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.agents.revoke(actor, id, tenantId);
  }
}

// avatar-upload-route-reload-touch
