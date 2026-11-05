import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessScope, User } from '@prisma/client';
import { createReadStream } from 'fs';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { CreateFolderDto, PatchDocumentDto } from './dto/knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@Controller('kb')
@UseGuards(JwtGuard)
export class KnowledgeController {
  constructor(private knowledge: KnowledgeService) {}

  @Get('search')
  search(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query('q') q?: string,
  ) {
    return this.knowledge.search(user, tenantId, q ?? '');
  }

  @Get('folders')
  folders(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.knowledge.folders(user, tenantId);
  }

  @Post('folders')
  createFolder(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateFolderDto,
  ) {
    return this.knowledge.createFolder(user, tenantId, dto);
  }

  @Delete('folders/:id')
  deleteFolder(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.knowledge.deleteFolder(user, tenantId, id);
  }

  @Get('documents')
  documents(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query('folderId') folderId?: string,
  ) {
    return this.knowledge.documents(user, tenantId, folderId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() body: { folderId?: string; visibility?: AccessScope; userIds?: string },
  ) {
    const userIds = parseUserIds(body.userIds);
    return this.knowledge.upload(user, tenantId, file, body.folderId, body.visibility, userIds);
  }

  @Patch('documents/:id')
  patch(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: PatchDocumentDto,
  ) {
    return this.knowledge.patch(user, tenantId, id, dto);
  }

  @Delete('documents/:id')
  remove(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.knowledge.remove(user, tenantId, id);
  }

  @Get('documents/:id/file')
  async file(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    const info = await this.knowledge.file(user, tenantId, id);
    const encoded = encodeURIComponent(info.name);
    return new StreamableFile(createReadStream(info.abs), {
      type: info.mime,
      disposition: `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    });
  }
}

function parseUserIds(raw?: string) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((id) => typeof id === 'string');
  } catch {
    return raw.split(',').map((id) => id.trim()).filter(Boolean);
  }
  return undefined;
}
