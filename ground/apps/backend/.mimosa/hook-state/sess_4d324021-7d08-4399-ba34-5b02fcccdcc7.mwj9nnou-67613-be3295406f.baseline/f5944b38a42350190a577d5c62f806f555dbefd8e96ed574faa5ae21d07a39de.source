import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { TenantModule } from '../tenant/tenant.module';
import { AlipayClient } from './alipay.client';
import { AdminRechargeController } from './admin-recharge.controller';
import { PayNotifyController } from './pay-notify.controller';
import { RechargeController } from './recharge.controller';
import { RechargeOrderService } from './recharge-order.service';
import { RechargeService } from './recharge.service';
import { RechargeSettleService } from './recharge-settle.service';
import { WechatPayClient } from './wechat-pay.client';

@Module({
  imports: [AuthModule, TenantModule, BillingModule],
  controllers: [RechargeController, PayNotifyController, AdminRechargeController],
  providers: [RechargeSettleService, RechargeOrderService, RechargeService, WechatPayClient, AlipayClient],
  exports: [RechargeService, WechatPayClient, AlipayClient],
})
export class PayModule {}
