import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { BillingService } from './billing.service';
import { ChargeBillingDto, PrecheckBillingDto, ReportTokenUsageDto } from './dto/billing.dto';

@Controller('billing')
@UseGuards(JwtGuard)
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('wallet')
  wallet(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.billing.getWalletForTenant(user, tenantId);
  }

  @Get('config')
  config() {
    return this.billing.getPublicConfig();
  }

  @Get('ledger')
  async ledger(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    // 复用 wallet 鉴权：无租户则跳过
    const snap = await this.billing.getWalletForTenant(user, tenantId);
    if (snap.skipped || !tenantId) {
      return { skipped: true, items: [], page: 1, pageSize: 20, total: 0 };
    }
    const size = Math.min(Math.max(Number(pageSize) || 20, 10), 50);
    const current = Math.max(Number(page) || 1, 1);
    const skip = (current - 1) * size;
    // 控制台流水默认只看资金类；对话消耗改去 /console/ai-usage
    const moneyTypes = ['recharge', 'qr_topup', 'manual_adjust', 'signup_gift'];
    const typeFilter = (type || '').trim();
    const ledgerQuery = typeFilter
      ? { tenantId, from, to, actorUserId, type: typeFilter }
      : { tenantId, from, to, actorUserId, types: moneyTypes };
    const [total, items] = await Promise.all([
      this.billing.countLedgers(ledgerQuery),
      this.billing.listLedgers({
        ...ledgerQuery,
        take: size,
        skip,
      }),
    ]);
    return { skipped: false, items, page: current, pageSize: size, total };
  }

  @Get('token-usage')
  async tokenUsage(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('model') model?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const snap = await this.billing.getWalletForTenant(user, tenantId);
    if (snap.skipped || !tenantId) {
      return {
        skipped: true,
        items: [],
        totals: {
          turns: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          modelCalls: 0,
          aiCoins: 0,
        },
        members: [],
        models: [],
        page: 1,
        pageSize: 20,
        total: 0,
      };
    }
    return this.billing.consoleTenantTokenUsage(tenantId, {
      from,
      to,
      userId,
      model,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Post('precheck')
  precheck(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: PrecheckBillingDto,
  ) {
    return this.billing.precheck(user, tenantId, dto.estimatedTokens);
  }

  @Post('charge')
  charge(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: ChargeBillingDto,
  ) {
    return this.billing.charge(user, tenantId, dto);
  }

  @Post('reportTokenUsage')
  reportTokenUsage(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: ReportTokenUsageDto,
  ) {
    return this.billing.reportTokenUsage(user, tenantId, dto);
  }
}
