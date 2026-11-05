import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import { createReadStream } from 'fs';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { PatchEnterpriseDto } from './enterprise.dto';
import { EnterpriseService } from './enterprise.service';

@Controller('enterprise')
@UseGuards(JwtGuard)
export class EnterpriseController {
  constructor(private enterprise: EnterpriseService) {}

  @Get()
  get(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.enterprise.get(user, tenantId);
  }

  @Patch()
  patch(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: PatchEnterpriseDto,
  ) {
    return this.enterprise.patch(user, tenantId, dto);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadLogo(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    return this.enterprise.uploadLogo(user, tenantId, file);
  }

  @Get('logo')
  async logo(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    const info = await this.enterprise.logoFile(user, tenantId);
    return new StreamableFile(createReadStream(info.abs), { type: info.mime });
  }
}
