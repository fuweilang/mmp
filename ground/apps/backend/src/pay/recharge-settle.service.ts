import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeEffectivePermissions } from '../permissions/effective';
import { TenantService } from '../tenant/tenant.service';
import { AlipayClient, createAlipayOutTradeNo } from './alipay.client';
import {
  CHANNEL_NOT_CONFIGURED_MESSAGE,
  CONFIRMED_BY_ALIPAY,
  CONFIRMED_BY_MOCK,
  CONFIRMED_BY_QUERY,
  CONFIRMED_BY_WECHAT,
  isMockPayEnabled,
  MOCK_PAY_DISABLED_MESSAGE,
  PAY_CHANNEL_ALIPAY,
  PAY_CHANNEL_MOCK,
  PAY_CHANNEL_WECHAT,
  QR_EXPIRE_MINUTES,
  QUERY_MIN_INTERVAL_MS,
  RECHARGE_STATUS_CANCELLED,
  RECHARGE_STATUS_CONFIRMED,
  RECHARGE_STATUS_EXPIRED,
  RECHARGE_STATUS_PENDING,
  WALLET_RECHARGE_MAX_AMOUNT,
  type PayChannel,
} from './pay.constants';
import { WechatPayClient, createWechatOutTradeNo } from './wechat-pay.client';

const lastQueryAt = new Map<string, number>();

/** 下单时锁定的汇率（aiCoins / 元），用于 ledger.meta */
function lockedRate(o: { aiCoins: number; amountYuan: Prisma.Decimal | string | number }) {
  const y = Number(new Prisma.Decimal(o.amountYuan as any).toFixed(2));
  return y > 0 ? Math.round(o.aiCoins / y) : 0;
}

@Injectable()
export class RechargeSettleService {
  private readonly logger = new Logger(RechargeSettleService.name);

  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
    private billing: BillingService,
    private wechat: WechatPayClient,
    private alipay: AlipayClient,
  ) {}

  async markExpired(orderId: string) {
    await this.prisma.aiRechargeOrder.updateMany({
      where: { id: orderId, status: RECHARGE_STATUS_PENDING },
      data: { status: RECHARGE_STATUS_EXPIRED },
    });
  }

  shouldQueryNow(orderId: string) {
    const now = Date.now();
    const prev = lastQueryAt.get(orderId) ?? 0;
    if (now - prev < QUERY_MIN_INTERVAL_MS) return false;
    lastQueryAt.set(orderId, now);
    return true;
  }

  /**
   * 充值写/读相关：要求 portal.console.billing；
   * 平台管理员代运营直通；isOrgAdmin（含 OWNER/ADMIN 成员档）兜底，便于旧库企管未回填 billing。
   */
  async requireOrgAdminTenant(user: User, tenantId: string | null) {
    const tid = await this.tenants.requireTenant(user, tenantId);
    if (user.isPlatformAdmin) return tid;
    const eff = await computeEffectivePermissions(this.prisma, user.id, tid);
    if (eff.effectivePermissions.includes('portal.console.billing')) return tid;
    try {
      await this.tenants.assertOrgAdmin(user, tid);
      return tid;
    } catch {
      throw new ForbiddenException('没有充值权限（需要 portal.console.billing）');
    }
  }

  async loadTenantOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.aiRechargeOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('充值单不存在');
    return order;
  }

  createOrderNo() {
    const ts = new Date();
    const stamp = [
      ts.getFullYear(),
      String(ts.getMonth() + 1).padStart(2, '0'),
      String(ts.getDate()).padStart(2, '0'),
      String(ts.getHours()).padStart(2, '0'),
      String(ts.getMinutes()).padStart(2, '0'),
      String(ts.getSeconds()).padStart(2, '0'),
    ].join('');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `AIC${stamp}${rand}`;
  }

  toOrderPayload(
    order: {
      id: string;
      tenantId: string;
      orderNo: string;
      amountYuan: Prisma.Decimal;
      aiCoins: number;
      status: string;
      channel: string;
      outTradeNo: string;
      codeUrl: string;
      expireAt: Date | null;
      transactionId: string;
      paidAt: Date | null;
      confirmedAt: Date | null;
      confirmedBy: string;
      createdByUserId?: string | null;
      remark: string;
      createdAt: Date;
      updatedAt: Date;
    },
    opts?: { createdByName?: string | null },
  ) {
    return {
      id: order.id,
      tenantId: order.tenantId,
      orderNo: order.orderNo,
      amountYuan: new Prisma.Decimal(order.amountYuan).toFixed(2),
      aiCoins: order.aiCoins,
      status: order.status,
      channel: order.channel,
      outTradeNo: order.outTradeNo,
      codeUrl: order.codeUrl,
      expireAt: order.expireAt?.toISOString() ?? null,
      transactionId: order.transactionId,
      paidAt: order.paidAt?.toISOString() ?? null,
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      confirmedBy: order.confirmedBy,
      createdByUserId: order.createdByUserId ?? null,
      createdByName: opts?.createdByName ?? null,
      remark: order.remark,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  toQrPayload(order: any) {
    const base = this.toOrderPayload(order);
    return {
      ...base,
      channels: this.channelsStatus(),
    };
  }

  channelsStatus() {
    return {
      mockEnabled: isMockPayEnabled(),
      wechatConfigured: this.wechat.isConfigured(),
      alipayConfigured: this.alipay.isConfigured(),
    };
  }

  async handleWechatNotify(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>) {
    const payload = await this.wechat.parseNotify(rawBody, headers);
    if (payload.tradeState !== 'SUCCESS') {
      return { code: 'SUCCESS', message: '成功' };
    }
    await this.settleByOutTradeNo({
      outTradeNo: payload.outTradeNo,
      channel: PAY_CHANNEL_WECHAT,
      paidAmountFen: payload.amountFen,
      paidAmountYuan: null,
      transactionId: payload.transactionId,
      confirmedBy: CONFIRMED_BY_WECHAT,
      paidAt: payload.successTime ? new Date(payload.successTime) : new Date(),
    });
    return { code: 'SUCCESS', message: '成功' };
  }

  async handleAlipayNotify(body: Record<string, unknown>) {
    const payload = this.alipay.parseNotify(body);
    if (payload.tradeStatus !== 'TRADE_SUCCESS' && payload.tradeStatus !== 'TRADE_FINISHED') {
      return 'success';
    }
    await this.settleByOutTradeNo({
      outTradeNo: payload.outTradeNo,
      channel: PAY_CHANNEL_ALIPAY,
      paidAmountFen: null,
      paidAmountYuan: payload.totalAmount,
      transactionId: payload.tradeNo,
      confirmedBy: CONFIRMED_BY_ALIPAY,
      paidAt: payload.gmtPayment ? new Date(payload.gmtPayment) : new Date(),
    });
    return 'success';
  }

  async simulateMockPay(user: User, tenantId: string, orderId: string) {
    if (!isMockPayEnabled()) throw new BadRequestException(MOCK_PAY_DISABLED_MESSAGE);
    const order = await this.loadTenantOrder(tenantId, orderId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ai_recharge_order WHERE id = ${order.id} FOR UPDATE`);
      const locked = await tx.aiRechargeOrder.findUnique({ where: { id: order.id } });
      if (!locked) throw new NotFoundException('充值单不存在');
      if (locked.status === RECHARGE_STATUS_CONFIRMED) return;
      if (
        locked.status !== RECHARGE_STATUS_PENDING &&
        locked.status !== RECHARGE_STATUS_EXPIRED &&
        locked.status !== RECHARGE_STATUS_CANCELLED
      ) {
        throw new BadRequestException('当前充值单状态不可入账');
      }
      const credit = await this.billing.creditQrTopup(
        {
          tenantId,
          coins: locked.aiCoins,
          orderNo: locked.orderNo,
          amountYuan: new Prisma.Decimal(locked.amountYuan).toFixed(2),
          channel: PAY_CHANNEL_MOCK,
          operatorId: user.id,
          orderId: locked.id,
          aiCoinsPerYuan: lockedRate(locked),
          remark: '本地模拟扫码充值',
        },
        tx,
      );
      await tx.aiRechargeOrder.update({
        where: { id: locked.id },
        data: {
          status: RECHARGE_STATUS_CONFIRMED,
          channel: PAY_CHANNEL_MOCK,
          outTradeNo: locked.outTradeNo || `MOCK${locked.orderNo}`,
          codeUrl: '',
          transactionId: `mock_${locked.orderNo}`,
          paidAt: new Date(),
          confirmedAt: locked.confirmedAt ?? new Date(),
          confirmedBy: locked.confirmedBy || CONFIRMED_BY_MOCK,
          confirmIdempotencyKey: credit.alreadyApplied
            ? locked.confirmIdempotencyKey
            : credit.idempotencyKey,
          remark: locked.remark ? `${locked.remark}；本地模拟` : '本地模拟',
        },
      });
    });
    const latest = await this.loadTenantOrder(tenantId, orderId);
    return this.toQrPayload(latest);
  }

  async queryAndSettle(orderId: string, confirmedBy: string) {
    const order = await this.prisma.aiRechargeOrder.findUnique({ where: { id: orderId } });
    if (!order || !order.outTradeNo || !order.channel) return;
    if (order.status === RECHARGE_STATUS_CONFIRMED) return;
    if (order.channel === PAY_CHANNEL_WECHAT) {
      if (!this.wechat.isConfigured()) return;
      const q = await this.wechat.queryByOutTradeNo(order.outTradeNo);
      if (!q) return;
      if (q.tradeState === 'SUCCESS') {
        await this.settleByOutTradeNo({
          outTradeNo: order.outTradeNo,
          channel: PAY_CHANNEL_WECHAT,
          paidAmountFen: q.amountFen,
          paidAmountYuan: null,
          transactionId: q.transactionId,
          confirmedBy,
          paidAt: q.successTime ? new Date(q.successTime) : new Date(),
        });
      } else if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(q.tradeState)) {
        await this.markExpired(order.id);
      }
      return;
    }
    if (order.channel === PAY_CHANNEL_ALIPAY) {
      if (!this.alipay.isConfigured()) return;
      const q = await this.alipay.queryByOutTradeNo(order.outTradeNo);
      if (!q) return;
      if (q.tradeStatus === 'TRADE_SUCCESS' || q.tradeStatus === 'TRADE_FINISHED') {
        await this.settleByOutTradeNo({
          outTradeNo: order.outTradeNo,
          channel: PAY_CHANNEL_ALIPAY,
          paidAmountFen: null,
          paidAmountYuan: q.totalAmount,
          transactionId: q.tradeNo,
          confirmedBy,
          paidAt: new Date(),
        });
      } else if (q.tradeStatus === 'TRADE_CLOSED') {
        await this.markExpired(order.id);
      }
    }
  }

  async settleByOutTradeNo(input: {
    outTradeNo: string;
    channel: PayChannel;
    paidAmountFen: number | null;
    paidAmountYuan: string | null;
    transactionId: string;
    confirmedBy: string;
    paidAt: Date;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.aiRechargeOrder.findFirst({
        where: { outTradeNo: input.outTradeNo },
      });
      if (!order) {
        this.logger.warn(`settle miss outTradeNo=${input.outTradeNo}`);
        return;
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ai_recharge_order WHERE id = ${order.id} FOR UPDATE`);
      const locked = await tx.aiRechargeOrder.findUnique({ where: { id: order.id } });
      if (!locked) return;
      if (locked.status === RECHARGE_STATUS_CONFIRMED) return;

      const expectYuan = new Prisma.Decimal(locked.amountYuan);
      if (input.paidAmountFen != null) {
        const paidYuan = new Prisma.Decimal(input.paidAmountFen).div(100);
        if (!paidYuan.equals(expectYuan)) {
          throw new BadRequestException('支付金额与订单不一致');
        }
      } else if (input.paidAmountYuan) {
        if (!new Prisma.Decimal(input.paidAmountYuan).equals(expectYuan)) {
          throw new BadRequestException('支付金额与订单不一致');
        }
      }

      const credit = await this.billing.creditQrTopup(
        {
          tenantId: locked.tenantId,
          coins: locked.aiCoins,
          orderNo: locked.orderNo,
          amountYuan: expectYuan.toFixed(2),
          channel: input.channel,
          operatorId: input.confirmedBy,
          orderId: locked.id,
          aiCoinsPerYuan: lockedRate(locked),
          remark: `扫码充值入账 ¥${expectYuan.toFixed(2)}`,
        },
        tx,
      );

      await tx.aiRechargeOrder.update({
        where: { id: locked.id },
        data: {
          status: RECHARGE_STATUS_CONFIRMED,
          channel: input.channel,
          transactionId: input.transactionId,
          paidAt: input.paidAt,
          confirmedAt: locked.confirmedAt ?? input.paidAt,
          confirmedBy: locked.confirmedBy || input.confirmedBy,
          confirmIdempotencyKey: credit.alreadyApplied
            ? locked.confirmIdempotencyKey
            : credit.idempotencyKey,
        },
      });
    });
  }


}
