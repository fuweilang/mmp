import { Body, Controller, Get, Param, Put, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { BillingService } from './billing.service';
import { AdjustWalletDto, UpdateBillingConfigDto } from './dto/billing.dto';

@Controller('admin/billing')
@UseGuards(JwtGuard)
export class AdminBillingController {
  constructor(private billing: BillingService) {}

  @Get('config')
  async getConfig(@CurrentUser() user: User) {
    await this.billing.assertPlatformAdmin(user);
    return this.billing.getConfig();
  }

  @Put('config')
  putConfig(@CurrentUser() user: User, @Body() dto: UpdateBillingConfigDto) {
    return this.billing.updateConfig(user, dto);
  }

  /** 内置官网参考价（静态）；前端「刷新参考」用。失败时前端保留上次，不阻塞保存。 */
  @Get('config/reference-prices')
  async getReferencePrices(@CurrentUser() user: User) {
    await this.billing.assertPlatformAdmin(user);
    return this.billing.getReferencePrices();
  }

  @Get('wallets')
  listWallets(@CurrentUser() user: User) {
    return this.billing.listWallets(user);
  }

  @Get('wallets/:tenantId')
  getWallet(@CurrentUser() user: User, @Param('tenantId') tenantId: string) {
    return this.billing.getWalletAdmin(user, tenantId);
  }

  @Post('wallets/adjust')
  adjust(@CurrentUser() user: User, @Body() dto: AdjustWalletDto) {
    return this.billing.adjustWallet(user, dto);
  }

  @Get('enterprise-funds')
  enterpriseFunds(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
  ) {
    if (!tenantId) {
      return this.billing.listWallets(user);
    }
    const pageNum = page ? Number(page) : undefined;
    const sizeNum = pageSize ? Number(pageSize) : undefined;
    return this.billing.enterpriseFundsReport(user, tenantId, {
      page: Number.isFinite(pageNum) ? pageNum : undefined,
      pageSize: Number.isFinite(sizeNum) ? sizeNum : undefined,
      ledgerType: type,
    });
  }


  /**
   * @deprecated 旧 ledger 口径；薄封装到 enterprise-token-stats，避免双口径。
   * 前端路由 /admin/enterprise-usage 已重定向到 token-stats 页。
   */
  @Get('enterprise-usage')
  enterpriseUsage(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('model') model?: string,
  ) {
    return this.billing.enterpriseTokenStatsOverview(user, { from, to, model });
  }

  /**
   * 企业 Token 统计（物理用量 ← Ground token_usage_turn）。
   * 前端统一在本页展示 Token + 折算 AI币（按 tokensPerAiCoin）。
   */
  @Get('enterprise-token-stats')
  enterpriseTokenStats(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('model') model?: string,
  ) {
    return this.billing.enterpriseTokenStatsOverview(user, { from, to, model });
  }

  @Get('enterprise-token-stats/detail')
  enterpriseTokenStatsDetail(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('model') model?: string,
  ) {
    return this.billing.enterpriseTokenStatsDetail(user, { tenantId, from, to, model });
  }

  /** DeepSeek/Kimi 用量合计 + 采购成本估算（本系统 ledger；对照 Octop TokenUsage）。 */
  @Get('usage-reconcile')
  usageReconcile(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.billing.usageReconcile(user, { from, to, tenantId });
  }
}
