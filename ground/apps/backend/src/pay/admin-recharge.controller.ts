import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { BillingService } from '../billing/billing.service';
import { RechargeService } from './recharge.service';

@Controller('admin/billing')
@UseGuards(JwtGuard)
export class AdminRechargeController {
  constructor(
    private billing: BillingService,
    private recharge: RechargeService,
  ) {}

  @Get('recharge-orders')
  list(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = page ? Number(page) : undefined;
    const sizeNum = pageSize ? Number(pageSize) : undefined;
    return this.recharge.listAdminOrders(user, {
      tenantId,
      status,
      page: Number.isFinite(pageNum) ? pageNum : undefined,
      pageSize: Number.isFinite(sizeNum) ? sizeNum : undefined,
    });
  }

  @Get('pay-channels')
  channels(@CurrentUser() user: User) {
    this.billing.assertPlatformAdmin(user);
    return this.recharge.channelsStatus();
  }
}
