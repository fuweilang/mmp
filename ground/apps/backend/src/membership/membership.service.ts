import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipPlan, Prisma, TenantType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  effectivePlan,
  expiryAfterPayment,
  isMembershipPlan,
  planRank,
  type MembershipPlanName,
  type PaidMembershipPlan,
} from './plan';

export type PaymentSuccessInput = {
  tenantId: string;
  plan: PaidMembershipPlan;
  amountCents: number;
  provider: 'wechat' | 'alipay';
  providerTradeNo: string;
  paidAt?: Date;
};

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === 'P2002'
    : typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class MembershipService {
  constructor(private prisma: PrismaService) {}

  async setEnterprise(
    actorUserId: string,
    tenantId: string,
    input: { plan: MembershipPlanName; expiresAt?: string | null },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('企业不存在');
    if (tenant.type === TenantType.PLATFORM) throw new BadRequestException('猛犸总部没有会员版本');
    const expiresAt = input.plan === 'standard'
      ? null
      : input.expiresAt
        ? new Date(input.expiresAt)
        : null;
    if (input.plan !== 'standard' && (!expiresAt || Number.isNaN(expiresAt.getTime()))) {
      throw new BadRequestException('专业版和旗舰版要填到期日');
    }
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { membershipPlan: input.plan as MembershipPlan, membershipExpiresAt: expiresAt },
      select: { id: true, membershipPlan: true, membershipExpiresAt: true },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actorUserId,
        tenantId,
        action: 'admin_set_membership',
        meta: { plan: input.plan, expiresAt: expiresAt?.toISOString() ?? null },
      },
    });
    return {
      id: updated.id,
      membershipPlan: updated.membershipPlan,
      membershipExpiresAt: updated.membershipExpiresAt?.toISOString() ?? null,
    };
  }

  async getCatalog() {
    const row = await this.prisma.membershipCatalog.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return this.presentCatalog(row);
  }

  async saveCatalog(
    actorUserId: string,
    input: {
      proPriceYuan: number;
      flagshipPriceYuan: number;
      standardSummary: string;
      proSummary: string;
      flagshipSummary: string;
    },
  ) {
    const data = {
      proPriceYuan: input.proPriceYuan,
      flagshipPriceYuan: input.flagshipPriceYuan,
      standardSummary: input.standardSummary.trim(),
      proSummary: input.proSummary.trim(),
      flagshipSummary: input.flagshipSummary.trim(),
    };
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.length > 200) throw new BadRequestException('说明不能超过 200 字');
      if (key.endsWith('Yuan') && (!Number.isInteger(value) || (value as number) < 1)) {
        throw new BadRequestException('年费要填正整数');
      }
    }
    const row = await this.prisma.membershipCatalog.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });
    await this.prisma.auditLog.create({
      data: { userId: actorUserId, action: 'admin_set_membership_catalog', meta: data },
    });
    return this.presentCatalog(row);
  }

  private presentCatalog(row: {
    proPriceYuan: number;
    flagshipPriceYuan: number;
    standardSummary: string;
    proSummary: string;
    flagshipSummary: string;
    updatedAt: Date;
  }) {
    return {
      proPriceYuan: row.proPriceYuan,
      flagshipPriceYuan: row.flagshipPriceYuan,
      standardSummary: row.standardSummary,
      proSummary: row.proSummary,
      flagshipSummary: row.flagshipSummary,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async setAgentMinPlan(actorUserId: string, agentId: string, minPlan: MembershipPlanName) {
    const agent = await this.prisma.officialAgent.findUnique({ where: { id: agentId }, select: { id: true } });
    if (!agent) throw new NotFoundException('官方专家不存在');
    const updated = await this.prisma.officialAgent.update({
      where: { id: agentId },
      data: { minPlan: minPlan as MembershipPlan },
      select: { id: true, minPlan: true },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'admin_set_agent_min_plan',
        meta: { agentId, minPlan },
      },
    });
    return updated;
  }

  /** 钱到了才调用。同一 providerTradeNo 只升级一次。未支付不写订单。 */
  async applyPaymentSuccess(input: PaymentSuccessInput) {
    const providerTradeNo = input.providerTradeNo.trim();
    if (!providerTradeNo) throw new BadRequestException('缺少支付单号');
    if (input.provider !== 'wechat' && input.provider !== 'alipay') throw new BadRequestException('只支持微信和支付宝');
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new BadRequestException('金额无效');
    if (input.plan !== 'pro' && input.plan !== 'flagship') throw new BadRequestException('只能购买专业版或旗舰版');
    const paidAt = input.paidAt ?? new Date();
    try {
      return await this.prisma.$transaction((tx) => this.applyInTx(tx, { ...input, providerTradeNo, paidAt }));
    } catch (error) {
      if (!isUnique(error)) throw error;
      const existing = await this.prisma.membershipOrder.findUnique({ where: { providerTradeNo } });
      if (!existing) throw error;
      return { applied: false as const, order: existing };
    }
  }

  private async applyInTx(
    tx: Prisma.TransactionClient,
    input: PaymentSuccessInput & { providerTradeNo: string; paidAt: Date },
  ) {
    const existing = await tx.membershipOrder.findUnique({ where: { providerTradeNo: input.providerTradeNo } });
    if (existing) return { applied: false as const, order: existing };
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundException('企业不存在');
    if (tenant.type === TenantType.PLATFORM) throw new BadRequestException('猛犸总部不能购买会员');
    const stored = isMembershipPlan(tenant.membershipPlan) ? tenant.membershipPlan : 'standard';
    const target = input.plan;
    const current = effectivePlan(stored, tenant.membershipExpiresAt, input.paidAt);
    if (planRank(current) > planRank(target)) throw new BadRequestException('MEMBERSHIP_DOWNGRADE_UNSUPPORTED');
    const expiresAt = expiryAfterPayment({
      currentPlan: stored,
      currentExpiresAt: tenant.membershipExpiresAt,
      target,
      paidAt: input.paidAt,
    });
    await tx.tenant.update({
      where: { id: tenant.id },
      data: { membershipPlan: target as MembershipPlan, membershipExpiresAt: expiresAt },
    });
    const order = await tx.membershipOrder.create({
      data: {
        tenantId: tenant.id,
        plan: target as MembershipPlan,
        amountCents: input.amountCents,
        provider: input.provider,
        providerTradeNo: input.providerTradeNo,
        paidAt: input.paidAt,
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'membership_paid',
        meta: {
          plan: target,
          amountCents: input.amountCents,
          provider: input.provider,
          providerTradeNo: input.providerTradeNo,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
    return { applied: true as const, order };
  }

  /** 扫码前记下商户单号。这不是订单，未支付不表示失败。 */
  async createCheckout(input: {
    outTradeNo: string;
    tenantId: string;
    plan: PaidMembershipPlan;
    amountCents: number;
    provider: 'wechat' | 'alipay';
    codeUrl: string;
  }) {
    return this.prisma.membershipCheckout.create({ data: input });
  }

  /**
   * 回调或轮询发现这笔商户单号已付款时调用。
   * 找不到绑定就交给 AI 币充值。金额不一致不入账。
   */
  async settleCheckout(input: {
    outTradeNo: string;
    provider: 'wechat' | 'alipay';
    providerTradeNo: string;
    amountCents: number;
    paidAt: Date;
  }) {
    const outTradeNo = input.outTradeNo.trim();
    if (!outTradeNo) return { handled: false as const };
    const row = await this.prisma.membershipCheckout.findUnique({ where: { outTradeNo } });
    if (!row) return { handled: false as const };
    if (row.provider !== input.provider) throw new BadRequestException('支付渠道不一致');
    if (!Number.isInteger(input.amountCents) || row.amountCents !== input.amountCents) {
      throw new BadRequestException('支付金额与订单不一致');
    }
    const plan = row.plan === 'pro' || row.plan === 'flagship' ? row.plan : null;
    if (!plan) throw new BadRequestException('只能购买专业版或旗舰版');
    const result = await this.applyPaymentSuccess({
      tenantId: row.tenantId,
      plan,
      amountCents: row.amountCents,
      provider: input.provider,
      providerTradeNo: input.providerTradeNo,
      paidAt: input.paidAt,
    });
    return { handled: true as const, applied: result.applied };
  }
}
