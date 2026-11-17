import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
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
import { RechargeSettleService } from './recharge-settle.service';

@Injectable()
export class RechargeOrderService {
  private readonly logger = new Logger(RechargeOrderService.name);

  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
    private billing: BillingService,
    private wechat: WechatPayClient,
    private alipay: AlipayClient,
    private settle: RechargeSettleService,
  ) {}

  async createOrder(
    user: User,
    tenantId: string | null,
    dto: { amountYuan: number; idempotencyKey?: string },
  ) {
    const tid = await this.settle.requireOrgAdminTenant(user, tenantId);
    const amount = new Prisma.Decimal(Number(dto.amountYuan).toFixed(2));
    if (amount.lte(0)) throw new BadRequestException('充值金额必须大于 0');
    if (amount.gt(WALLET_RECHARGE_MAX_AMOUNT)) {
      throw new BadRequestException(`单笔充值不能超过 ${WALLET_RECHARGE_MAX_AMOUNT.toFixed(2)} 元`);
    }

    if (dto.idempotencyKey) {
      const existed = await this.prisma.aiRechargeOrder.findUnique({
        where: { requestIdempotencyKey: dto.idempotencyKey },
      });
      if (existed && existed.tenantId === tid) {
        return this.settle.toOrderPayload(existed, { createdByName: user.name });
      }
    }

    const config = await this.billing.getConfig();
    // 入账公式：实付元 ×（1 元 = N AI币）；售价倍率不参与；下单时锁定 aiCoins，确认时按订单值入账
    const aiCoins = BillingService.yuanToAiCoins(amount.toFixed(2), config.aiCoinsPerYuan);
    if (aiCoins < 1) throw new BadRequestException('换算后 AI 币不足 1，请提高金额');

    const order = await this.prisma.aiRechargeOrder.create({
      data: {
        tenantId: tid,
        orderNo: this.settle.createOrderNo(),
        amountYuan: amount,
        aiCoins,
        status: RECHARGE_STATUS_PENDING,
        createdByUserId: user.id,
        requestIdempotencyKey: dto.idempotencyKey || null,
        remark: `充值 ${amount.toFixed(2)} 元 → ${aiCoins} AI币`,
      },
    });
    return this.settle.toOrderPayload(order, { createdByName: user.name });
  }

  async createPayQr(
    user: User,
    tenantId: string | null,
    dto: { orderId: string; channel: string },
  ) {
    const tid = await this.settle.requireOrgAdminTenant(user, tenantId);
    const channel = String(dto.channel || '').trim();
    if (channel === PAY_CHANNEL_MOCK) {
      return this.settle.simulateMockPay(user, tid, dto.orderId);
    }
    if (channel !== PAY_CHANNEL_WECHAT && channel !== PAY_CHANNEL_ALIPAY) {
      throw new BadRequestException('请选择微信支付、支付宝或本地模拟');
    }

    const order = await this.settle.loadTenantOrder(tid, dto.orderId);
    if (order.status === RECHARGE_STATUS_CONFIRMED) {
      return this.settle.toQrPayload(order);
    }
    if (
      order.status !== RECHARGE_STATUS_PENDING &&
      order.status !== RECHARGE_STATUS_EXPIRED
    ) {
      throw new BadRequestException('当前订单不可支付');
    }

    // 同渠道未过期码复用
    if (
      order.channel === channel &&
      order.codeUrl &&
      order.expireAt &&
      order.expireAt.getTime() > Date.now() + 30_000
    ) {
      return this.settle.toQrPayload(order);
    }

    if (channel === PAY_CHANNEL_WECHAT && !this.wechat.isConfigured()) {
      throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    }
    if (channel === PAY_CHANNEL_ALIPAY && !this.alipay.isConfigured()) {
      throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    }

    const outTradeNo =
      channel === PAY_CHANNEL_WECHAT ? createWechatOutTradeNo() : createAlipayOutTradeNo();
    const expireAt = new Date(Date.now() + QR_EXPIRE_MINUTES * 60 * 1000);
    const amount = new Prisma.Decimal(order.amountYuan);
    const subject = `猛犸AI币充值-${order.orderNo}`;

    let codeUrl = '';
    if (channel === PAY_CHANNEL_WECHAT) {
      const amountFen = Math.round(Number(amount) * 100);
      if (amountFen < 1) throw new BadRequestException('支付金额过小');
      const res = await this.wechat.createNativeOrder({
        outTradeNo,
        description: subject,
        amountFen,
        expireAt,
      });
      codeUrl = res.codeUrl;
    } else {
      const res = await this.alipay.createPrecreate({
        outTradeNo,
        subject,
        amount,
        expireAt,
      });
      codeUrl = res.codeUrl;
    }

    const updated = await this.prisma.aiRechargeOrder.update({
      where: { id: order.id },
      data: {
        status: RECHARGE_STATUS_PENDING,
        channel,
        outTradeNo,
        codeUrl,
        expireAt,
      },
    });
    return this.settle.toQrPayload(updated);
  }

  async getStatus(user: User, tenantId: string | null, orderId: string) {
    const tid = await this.settle.requireOrgAdminTenant(user, tenantId);
    let order = await this.settle.loadTenantOrder(tid, orderId);
    if (
      (order.status === RECHARGE_STATUS_PENDING || order.status === RECHARGE_STATUS_EXPIRED) &&
      this.settle.shouldQueryNow(order.id)
    ) {
      await this.settle.queryAndSettle(order.id, CONFIRMED_BY_QUERY);
      order = await this.settle.loadTenantOrder(tid, orderId);
    }
    return this.settle.toOrderPayload(order);
  }

  async listTenantOrders(
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
    const tid = await this.settle.requireOrgAdminTenant(user, tenantId);
    const where: Prisma.AiRechargeOrderWhereInput = { tenantId: tid };
    const status = (query?.status || '').trim();
    if (status) where.status = status;
    const channel = (query?.channel || '').trim();
    if (channel) where.channel = channel;
    const createdByUserId = (query?.createdByUserId || '').trim();
    if (createdByUserId) where.createdByUserId = createdByUserId;
    if (query?.from || query?.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    const pageSize = Math.min(Math.max(query?.pageSize ?? 20, 10), 50);
    const page = Math.max(query?.page ?? 1, 1);
    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.aiRechargeOrder.count({ where }),
      this.prisma.aiRechargeOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    const creatorIds = [
      ...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => Boolean(id))),
    ];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(creators.map((u) => [u.id, u.name]));
    return {
      items: rows.map((r) =>
        this.settle.toOrderPayload(r, {
          createdByName: r.createdByUserId ? nameById.get(r.createdByUserId) ?? null : null,
        }),
      ),
      page,
      pageSize,
      total,
    };
  }

  async listAdminOrders(
    actor: User,
    query?: { tenantId?: string; status?: string; page?: number; pageSize?: number },
  ) {
    this.billing.assertPlatformAdmin(actor);
    const where: Prisma.AiRechargeOrderWhereInput = {};
    if (query?.tenantId) where.tenantId = query.tenantId;
    if (query?.status) where.status = query.status;
    const pageSize = Math.min(Math.max(query?.pageSize ?? 20, 10), 50);
    const page = Math.max(query?.page ?? 1, 1);
    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.aiRechargeOrder.count({ where }),
      this.prisma.aiRechargeOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        ...this.settle.toOrderPayload(r),
        tenantName: r.tenant.name,
        tenantSlug: r.tenant.slug,
      })),
      page,
      pageSize,
      total,
    };
  }

  async cancelOrder(user: User, tenantId: string | null, orderId: string) {
    const tid = await this.settle.requireOrgAdminTenant(user, tenantId);
    const order = await this.settle.loadTenantOrder(tid, orderId);
    if (order.status === RECHARGE_STATUS_CONFIRMED) {
      return this.settle.toOrderPayload(order);
    }
    if (order.status === RECHARGE_STATUS_CANCELLED || order.status === RECHARGE_STATUS_EXPIRED) {
      return this.settle.toOrderPayload(order);
    }
    if (order.status !== RECHARGE_STATUS_PENDING) {
      throw new BadRequestException('当前充值单不可取消');
    }

    // 关闭前先查单：已付则入账，避免关窗丢单
    if (order.outTradeNo && order.channel) {
      try {
        await this.settle.queryAndSettle(order.id, CONFIRMED_BY_QUERY);
        const again = await this.settle.loadTenantOrder(tid, orderId);
        if (again.status === RECHARGE_STATUS_CONFIRMED) return this.settle.toOrderPayload(again);
      } catch {
        /* ignore query failure, still cancel locally */
      }
      try {
        if (order.channel === PAY_CHANNEL_WECHAT && this.wechat.isConfigured()) {
          await this.wechat.closeByOutTradeNo(order.outTradeNo);
        }
        if (order.channel === PAY_CHANNEL_ALIPAY && this.alipay.isConfigured()) {
          await this.alipay.closeByOutTradeNo(order.outTradeNo);
        }
      } catch {
        /* channel close best-effort */
      }
    }

    await this.prisma.aiRechargeOrder.updateMany({
      where: { id: order.id, tenantId: tid, status: RECHARGE_STATUS_PENDING },
      data: { status: RECHARGE_STATUS_CANCELLED },
    });
    const latest = await this.settle.loadTenantOrder(tid, orderId);
    return this.settle.toOrderPayload(latest);
  }

  channelsStatus() {
    return {
      mockEnabled: isMockPayEnabled(),
      wechatConfigured: this.wechat.isConfigured(),
      alipayConfigured: this.alipay.isConfigured(),
    };
  }

}
