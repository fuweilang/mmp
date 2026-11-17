import { Injectable } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { ReportTokenUsageDto } from './dto/billing.dto';
import { EnterpriseTokenStatsService } from './enterprise-token-stats.service';
import { TokenUsageService, type TokenUsageSettlementMark } from './token-usage.service';

/**
 * 薄门面：BillingService / module 仍注入 TokenStatsService。
 */
@Injectable()
export class TokenStatsService {
  constructor(
    private enterprise: EnterpriseTokenStatsService,
    private usage: TokenUsageService,
  ) {}

  usageReconcile(actor: User, query: { from?: string; to?: string; tenantId?: string }) {
    return this.enterprise.usageReconcile(actor, query);
  }

  enterpriseTokenStatsOverview(
    actor: User,
    query: { from?: string; to?: string; model?: string },
  ) {
    return this.enterprise.enterpriseTokenStatsOverview(actor, query);
  }

  enterpriseTokenStatsDetail(
    actor: User,
    query: { tenantId: string; from?: string; to?: string; model?: string },
  ) {
    return this.enterprise.enterpriseTokenStatsDetail(actor, query);
  }

  reportTokenUsage(user: User, tenantId: string | null, dto: ReportTokenUsageDto, meta?: Prisma.InputJsonObject) {
    return this.usage.reportTokenUsage(user, tenantId, dto, meta);
  }

  markTokenUsageSettlement(idempotencyKey: string, mark: TokenUsageSettlementMark) {
    return this.usage.markTokenUsageSettlement(idempotencyKey, mark);
  }

  consoleTenantTokenUsage(
    tenantId: string,
    query: {
      from?: string;
      to?: string;
      userId?: string;
      model?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.usage.consoleTenantTokenUsage(tenantId, query);
  }
}
