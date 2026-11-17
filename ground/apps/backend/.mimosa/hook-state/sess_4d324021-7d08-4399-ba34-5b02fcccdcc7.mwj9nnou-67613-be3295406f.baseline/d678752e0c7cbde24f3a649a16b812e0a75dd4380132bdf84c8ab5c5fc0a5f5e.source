import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { CancelRechargeOrderDto, CreateRechargeOrderDto, CreateRechargePayQrDto, RechargeStatusDto } from './dto/recharge.dto';
import { RechargeService } from './recharge.service';

@Controller('billing/recharge')
@UseGuards(JwtGuard)
export class RechargeController {
  constructor(private recharge: RechargeService) {}

  @Get('channels')
  channels() {
    return this.recharge.channelsStatus();
  }

  @Post('create')
  create(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateRechargeOrderDto,
  ) {
    return this.recharge.createOrder(user, tenantId, dto);
  }

  @Post('payQr')
  payQr(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateRechargePayQrDto,
  ) {
    return this.recharge.createPayQr(user, tenantId, dto);
  }

  @Post('status')
  status(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: RechargeStatusDto,
  ) {
    return this.recharge.getStatus(user, tenantId, dto.orderId);
  }


  @Post('cancel')
  cancel(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CancelRechargeOrderDto,
  ) {
    return this.recharge.cancelOrder(user, tenantId, dto.orderId);
  }

  @Get('orders')
  orders(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('createdByUserId') createdByUserId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.recharge.listTenantOrders(user, tenantId, {
      from: from || undefined,
      to: to || undefined,
      status: status || undefined,
      channel: channel || undefined,
      createdByUserId: createdByUserId || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
