import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { MembershipModule } from '../membership/membership.module';
import { TenantModule } from '../tenant/tenant.module';
import { AlipayClient } from './alipay.client';
import { AdminRechargeController } from './admin-recharge.controller';
import { MembershipPayController } from './membership-pay.controller';
import { MembershipPayService } from './membership-pay.service';
import { PayNotifyController } from './pay-notify.controller';
import { RechargeController } from './recharge.controller';
import { RechargeOrderService } from './recharge-order.service';
import { RechargeService } from './recharge.service';
import { RechargeSettleService } from './recharge-settle.service';
import { WechatPayClient } from './wechat-pay.client';

@Module({
  imports: [AuthModule, TenantModule, BillingModule, MembershipModule],
  controllers: [RechargeController, PayNotifyController, AdminRechargeController, MembershipPayController],
  providers: [RechargeSettleService, RechargeOrderService, RechargeService, MembershipPayService, WechatPayClient, AlipayClient],
  exports: [RechargeService, WechatPayClient, AlipayClient],
})
export class PayModule {}
