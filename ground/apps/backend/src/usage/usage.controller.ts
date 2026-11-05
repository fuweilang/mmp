import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { CreateUsageEventDto, PatchQuotaDto, PatchUserTokenQuotaDto } from './usage.dto';
import { UsageService } from './usage.service';

@Controller('usage')
@UseGuards(JwtGuard)
export class UsageController {
  constructor(private usage: UsageService) {}

  @Get('quota')
  quota(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.usage.quota(user, tenantId);
  }

  @Patch('quota')
  patchQuota(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: PatchQuotaDto,
  ) {
    return this.usage.patchQuota(user, tenantId, dto);
  }

  @Get('summary')
  summary(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.usage.summary(user, tenantId);
  }

  @Get('token-quotas')
  listUserTokenQuotas(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.usage.listUserTokenQuotas(user, tenantId);
  }

  @Patch('token-quotas')
  patchUserTokenQuota(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: PatchUserTokenQuotaDto,
  ) {
    return this.usage.patchUserTokenQuota(user, tenantId, dto);
  }

  @Post('events')
  record(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateUsageEventDto,
  ) {
    return this.usage.record(user, tenantId, dto.kind);
  }
}
