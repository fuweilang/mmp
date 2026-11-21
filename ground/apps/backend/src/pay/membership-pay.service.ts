import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantType, User } from '@prisma/client';
import QRCode from 'qrcode';
import { loadMembershipView } from '../membership/access';
import { MembershipService } from '../membership/membership.service';
import { planRank, type MembershipPlanName, type PaidMembershipPlan } from '../membership/plan';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AlipayClient, createAlipayOutTradeNo } from './alipay.client';
import {
  CHANNEL_NOT_CONFIGURED_MESSAGE,
  PAY_CHANNEL_ALIPAY,
  PAY_CHANNEL_WECHAT,
  QR_EXPIRE_MINUTES,
  QUERY_MIN_INTERVAL_MS,
} from './pay.constants';
import { RechargeSettleService } from './recharge-settle.service';
import { WechatPayClient, createWechatOutTradeNo } from './wechat-pay.client';

const PLAN_LABEL: Record<PaidMembershipPlan, string> = { pro: '专业版', flagship: '旗舰版' };

@Injectable()
export class MembershipPayService {
  private readonly recent = new Map<string, { at: number; paid: boolean }>();

  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
    private settle: RechargeSettleService,
    private membership: MembershipService,
    private wechat: WechatPayClient,
    private alipay: AlipayClient,
  ) {}

  async offer(user: User, tenantId: string | null) {
    const tid = await this.tenants.requireTenant(user, tenantId);
    return this.present(user, tid);
  }

  async createQr(user: User, tenantId: string | null, body: { plan?: string; provider?: string }) {
    const tid = await this.requirePayer(user, tenantId);
    const plan = body.plan === 'pro' || body.plan === 'flagship' ? body.plan : null;
    const provider = body.provider === PAY_CHANNEL_WECHAT || body.provider === PAY_CHANNEL_ALIPAY ? body.provider : null;
    if (!plan || !provider) throw new BadRequestException('请选择专业版或旗舰版，以及微信或支付宝');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
    if (!tenant) throw new NotFoundException('企业不存在');
    if (tenant.type === TenantType.PLATFORM) throw new BadRequestException('猛犸总部不能购买会员');
    const view = await loadMembershipView(this.prisma, tid);
    if (planRank(view.plan) > planRank(plan)) throw new BadRequestException('MEMBERSHIP_DOWNGRADE_UNSUPPORTED');
    const catalog = await this.membership.getCatalog();
    const amountYuan = plan === 'pro' ? catalog.proPriceYuan : catalog.flagshipPriceYuan;
    if (!Number.isInteger(amountYuan) || amountYuan < 1) throw new BadRequestException('年费未设置');
    const amountCents = amountYuan * 100;
    if (!Number.isSafeInteger(amountCents) || amountCents > 2147483647) throw new BadRequestException('年费超出可支付范围');
    if (provider === PAY_CHANNEL_WECHAT && !this.wechat.isConfigured()) throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    if (provider === PAY_CHANNEL_ALIPAY && !this.alipay.isConfigured()) throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);

    const outTradeNo = provider === PAY_CHANNEL_WECHAT ? createWechatOutTradeNo() : createAlipayOutTradeNo();
    const expireAt = new Date(Date.now() + QR_EXPIRE_MINUTES * 60 * 1000);
    const subject = `猛犸${PLAN_LABEL[plan]}年费`;
    const codeUrl = provider === PAY_CHANNEL_WECHAT
      ? (await this.wechat.createNativeOrder({ outTradeNo, description: subject, amountFen: amountCents, expireAt })).codeUrl
      : (await this.alipay.createPrecreate({ outTradeNo, subject, amount: new Prisma.Decimal(amountYuan), expireAt })).codeUrl;
    await this.membership.createCheckout({ outTradeNo, tenantId: tid, plan, amountCents, provider, codeUrl });
    const qrDataUrl = await QRCode.toDataURL(codeUrl, { errorCorrectionLevel: 'M', margin: 1, width: 188 });
    return { outTradeNo, qrDataUrl, plan, amountYuan, provider };
  }

  async status(user: User, tenantId: string | null, outTradeNo: string) {
    const tid = await this.requirePayer(user, tenantId);
    const tradeNo = outTradeNo.trim();
    const row = await this.prisma.membershipCheckout.findFirst({ where: { outTradeNo: tradeNo, tenantId: tid } });
    if (!row) throw new NotFoundException('付款码不存在');
    const cached = this.recent.get(tradeNo);
    const now = Date.now();
    if (cached && now - cached.at < QUERY_MIN_INTERVAL_MS) {
      const view = await loadMembershipView(this.prisma, tid);
      return { paid: cached.paid, plan: view.plan, expiresAt: view.expiresAt };
    }
    const paid = await this.queryPaid(row);
    this.recent.set(tradeNo, { at: now, paid });
    const view = await loadMembershipView(this.prisma, tid);
    return { paid, plan: view.plan, expiresAt: view.expiresAt };
  }

  private async present(user: User, tenantId: string) {
    const [view, catalog, tenant] = await Promise.all([
      loadMembershipView(this.prisma, tenantId),
      this.membership.getCatalog(),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } }),
    ]);
    return {
      plan: view.plan as MembershipPlanName,
      expiresAt: view.expiresAt,
      enforced: view.enforced,
      canPay: Boolean(tenant) && tenant?.type !== TenantType.PLATFORM && await this.payer(user, tenantId),
      proPriceYuan: catalog.proPriceYuan,
      flagshipPriceYuan: catalog.flagshipPriceYuan,
      standardSummary: catalog.standardSummary,
      proSummary: catalog.proSummary,
      flagshipSummary: catalog.flagshipSummary,
      wechatConfigured: this.wechat.isConfigured(),
      alipayConfigured: this.alipay.isConfigured(),
    };
  }

  private async payer(user: User, tenantId: string) {
    try {
      await this.settle.requireOrgAdminTenant(user, tenantId);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  private async requirePayer(user: User, tenantId: string | null) {
    try {
      return await this.settle.requireOrgAdminTenant(user, tenantId);
    } catch (error) {
      if (error instanceof ForbiddenException) throw new ForbiddenException('只有企业管理员可以购买套餐');
      throw error;
    }
  }

  private async queryPaid(row: { outTradeNo: string; provider: string }) {
    if (row.provider === PAY_CHANNEL_WECHAT) {
      if (!this.wechat.isConfigured()) return false;
      const found = await this.wechat.queryByOutTradeNo(row.outTradeNo);
      if (!found || found.tradeState !== 'SUCCESS' || found.amountFen == null) return false;
      await this.membership.settleCheckout({
        outTradeNo: row.outTradeNo,
        provider: 'wechat',
        providerTradeNo: found.transactionId,
        amountCents: found.amountFen,
        paidAt: found.successTime ? new Date(found.successTime) : new Date(),
      });
      return true;
    }
    if (!this.alipay.isConfigured()) return false;
    const found = await this.alipay.queryByOutTradeNo(row.outTradeNo);
    if (!found || (found.tradeStatus !== 'TRADE_SUCCESS' && found.tradeStatus !== 'TRADE_FINISHED')) return false;
    await this.membership.settleCheckout({
      outTradeNo: row.outTradeNo,
      provider: 'alipay',
      providerTradeNo: found.tradeNo,
      amountCents: yuanToCents(found.totalAmount),
      paidAt: new Date(),
    });
    return true;
  }
}

function yuanToCents(yuan: string) {
  const cents = new Prisma.Decimal(yuan).mul(100);
  if (!cents.isInteger()) throw new BadRequestException('支付金额无效');
  const value = cents.toNumber();
  if (!Number.isSafeInteger(value) || value <= 0) throw new BadRequestException('支付金额无效');
  return value;
}
