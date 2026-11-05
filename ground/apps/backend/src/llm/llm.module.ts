import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import {
  AdminLlmModelsController,
  AdminLlmProvidersController,
} from './admin-llm-providers.controller';
import { LlmChatController } from './llm-chat.controller';
import { LlmChatGatewayService } from './llm-chat.gateway.service';
import { LlmConcurrencyService } from './llm-concurrency.service';
import { LlmHealthService } from './llm-health.service';
import { LlmProvidersService } from './llm-providers.service';

@Module({
  imports: [AuthModule, forwardRef(() => BillingModule)],
  controllers: [
    AdminLlmProvidersController,
    AdminLlmModelsController,
    LlmChatController,
  ],
  providers: [LlmHealthService, LlmConcurrencyService, LlmProvidersService, LlmChatGatewayService],
  exports: [LlmProvidersService],
})
export class LlmModule {}
