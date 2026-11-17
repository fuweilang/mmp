import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminAuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('admin/audit')
@UseGuards(JwtGuard)
export class AdminAuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: AdminAuditQueryDto) {
    return this.audit.adminList(user, query);
  }
}
