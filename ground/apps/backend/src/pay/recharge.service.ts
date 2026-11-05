import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { RechargeOrderService } from './recharge-order.service';
import { RechargeSettleService } from './recharge-settle.service';

/**
 * 薄门面：控制器仍注入 RechargeService。
 */
@Injectable()
export class RechargeService {
  constructor(
    private orders: RechargeOrderService,
    private settle: RechargeSettleService,
  ) {}

  createOrder(user: User, tenantId: string | null, dto: { amountYuan: number; idempotencyKey?: string }) {
    return this.orders.createOrder(user, tenantId, dto);
  }

  createPayQr(
    user: User,
    tenantId: string | null,
    dto: { orderId: string; channel: string },
  ) {
    return this.orders.createPayQr(user, tenantId, dto);
  }

  getStatus(user: User, tenantId: string | null, orderId: string) {
    return this.orders.getStatus(user, tenantId, orderId);
  }

  listTenantOrders(
    user: User,
    tenantId: string | null,
    query?: {
      from?: string;
      to?: string;
      status?: string;
      channel?: string;
      createdByUserId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.orders.listTenantOrders(user, tenantId, query);
  }

  listAdminOrders(
    actor: User,
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      tenantId?: string;
      channel?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.orders.listAdminOrders(actor, query);
  }

  cancelOrder(user: User, tenantId: string | null, orderId: string) {
    return this.orders.cancelOrder(user, tenantId, orderId);
  }

  channelsStatus() {
    return this.orders.channelsStatus();
  }

  handleWechatNotify(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>) {
    return this.settle.handleWechatNotify(rawBody, headers);
  }

  handleAlipayNotify(body: Record<string, unknown>) {
    return this.settle.handleAlipayNotify(body);
  }
}
