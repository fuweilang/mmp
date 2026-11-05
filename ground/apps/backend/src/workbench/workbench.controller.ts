import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { WorkbenchService } from './workbench.service';

@Controller('workbench')
@UseGuards(JwtGuard)
export class WorkbenchController {
  constructor(private workbench: WorkbenchService) {}

  @Get()
  summary(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.workbench.summary(user, tenantId);
  }
}
