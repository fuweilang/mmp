import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query() query: AuditQueryDto,
  ) {
    return this.audit.list(user, tenantId, query);
  }
}
