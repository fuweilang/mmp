import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { MembershipPayService } from './membership-pay.service';

@Controller('billing/membership')
@UseGuards(JwtGuard)
export class MembershipPayController {
  constructor(private pay: MembershipPayService) {}

  @Get()
  offer(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.pay.offer(user, tenantId);
  }

  @Post('payQr')
  payQr(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() body: { plan?: string; provider?: string },
  ) {
    return this.pay.createQr(user, tenantId, body);
  }

  @Post('status')
  status(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() body: { outTradeNo?: string },
  ) {
    return this.pay.status(user, tenantId, String(body?.outTradeNo || ''));
  }
}
