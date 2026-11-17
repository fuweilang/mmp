import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { AdminBillingController } from './admin-billing.controller';
import { BillingController } from './billing.controller';
import { BillingConfigService } from './billing-config.service';
import { BillingService } from './billing.service';
import { ChargeService } from './charge.service';
import { EnterpriseTokenStatsService } from './enterprise-token-stats.service';
import { OfficialPriceRefreshService } from './official-price-refresh.service';
import { TokenStatsService } from './token-stats.service';
import { TokenStatsSupport } from './token-stats.support';
import { TokenUsageService } from './token-usage.service';
import { WalletService } from './wallet.service';

@Module({
  imports: [AuthModule, forwardRef(() => LlmModule)],
  controllers: [BillingController, AdminBillingController],
  providers: [
    BillingConfigService,
    WalletService,
    ChargeService,
    TokenStatsSupport,
    EnterpriseTokenStatsService,
    OfficialPriceRefreshService,
    TokenUsageService,
    TokenStatsService,
    BillingService,
  ],
  exports: [BillingService, BillingConfigService, WalletService, ChargeService, TokenStatsService],
})
export class BillingModule {}
