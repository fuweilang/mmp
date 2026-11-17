import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, Prisma, User } from '@prisma/client';
import { computeEffectivePermissions } from '../permissions/effective';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustWalletDto } from './dto/billing.dto';
import { ledgerCoinsAtCurrentRate, currentLedgerCoinsSql } from './billing.pricing';
import { BillingConfigService } from './billing-config.service';

function requireTenantIdOrThrow(tenantId: string | null): string {
  if (!tenantId) throw new BadRequestException('请先选择企业');
  return tenantId;
}


/** Admin/Console 流水类型筛选：充值含旧 qr_topup；调账统一 manual_adjust */
export function resolveLedgerTypeFilter(type?: string): { type?: string; types?: string[] } {
  const t = (type || '').trim();
  if (!t) return {};
  if (t === 'recharge') return { types: ['recharge', 'qr_topup'] };
  if (t === 'adjust' || t === 'manual_adjust') return { type: 'manual_adjust' };
  return { type: t };
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private config: BillingConfigService,
  ) {}

  async ensureWallet(tenantId: string) {
    const existing = await this.prisma.tenantAiWallet.findUnique({ where: { tenantId } });
    if (existing) return existing;
    try {
      return await this.prisma.tenantAiWallet.create({
        data: { tenantId, balanceCoins: 0 },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.tenantAiWallet.findUniqueOrThrow({ where: { tenantId } });
      }
      throw err;
    }
  }

  async listWallets(actor: User) {
    this.requirePlatformAdmin(actor);
    const rows = await this.prisma.tenantAiWallet.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true, slug: true, type: true, status: true } },
      },
      take: 500,
    });
    return rows.map((w) => ({
      tenantId: w.tenantId,
      tenantName: w.tenant.name,
      tenantSlug: w.tenant.slug,
      tenantType: w.tenant.type,
      tenantStatus: w.tenant.status,
      balanceCoins: w.balanceCoins,
      totalCredited: w.totalCredited,
      totalDebited: w.totalDebited,
      updatedAt: w.updatedAt.toISOString(),
    }));
  }

  async getWalletAdmin(actor: User, tenantId: string) {
    this.requirePlatformAdmin(actor);
    return this.walletDetail(tenantId);
  }

  async getWalletForTenant(user: User, tenantId: string | null) {
    if (user.isPlatformAdmin && !tenantId) {
      return {
        skipped: true as const,
        reason: 'platform_admin_no_tenant',
        unlimited: true,
        balanceCoins: null,
        canRecharge: false,
        hasConsoleAccess: false,
        isPlatformAdmin: true,
      };
    }
    const id = requireTenantIdOrThrow(tenantId);
    const detail = await this.walletDetail(id);
    const flags = await this.userWalletAccessFlags(user, id);
    return { skipped: false as const, ...flags, ...detail, config: { aiCoinsPerYuan: detail.config.aiCoinsPerYuan }, unlimited: flags.isPlatformAdmin };
  }

  /**
   * Agent/Console 入口显隐：canRecharge（billing）、hasConsoleAccess（console.access）、
   * isPlatformAdmin。平台管可进 Admin；企业用户需 console.access 才显示控制台入口。
   */
  private async userWalletAccessFlags(user: User, tenantId: string): Promise<{
    canRecharge: boolean;
    hasConsoleAccess: boolean;
    isPlatformAdmin: boolean;
  }> {
    if (user.isPlatformAdmin) {
      return { canRecharge: true, hasConsoleAccess: true, isPlatformAdmin: true };
    }
    const eff = await computeEffectivePermissions(this.prisma, user.id, tenantId);
    const isPlatformAdmin = eff.isPlatformAdmin;
    const hasConsoleAccess = eff.effectivePermissions.includes('portal.console.access');
    if (eff.effectivePermissions.includes('portal.console.billing') || isPlatformAdmin) {
      return { canRecharge: true, hasConsoleAccess, isPlatformAdmin };
    }
    // 企业管理员只看当前租户成员档，不能复用另一企业的全局 org_admin 角色。
    const membership = await this.prisma.orgMember.findFirst({
      where: {
        userId: user.id,
        tenantId,
        role: { in: [MemberRole.ADMIN, MemberRole.OWNER] },
      },
      select: { id: true },
    });
    return {
      canRecharge: Boolean(membership),
      hasConsoleAccess,
      isPlatformAdmin,
    };
  }

  async adjustWallet(actor: User, dto: AdjustWalletDto) {
    this.requirePlatformAdmin(actor);
    if (dto.deltaCoins === 0) throw new BadRequestException('调账数量不能为 0');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('企业不存在');
    if (tenant.type === 'PLATFORM') throw new BadRequestException('平台租户不设企业钱包');

    const existing = await this.prisma.tenantAiLedger.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      const wallet = await this.ensureWallet(dto.tenantId);
      return {
        reused: true,
        ledgerId: existing.id,
        balanceCoins: wallet.balanceCoins,
        deltaCoins: existing.direction === 'in' ? existing.coins : -existing.coins,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.tenantAiWallet.findUnique({ where: { tenantId: dto.tenantId } });
      if (!wallet) {
        wallet = await tx.tenantAiWallet.create({
          data: { tenantId: dto.tenantId, balanceCoins: 0 },
        });
      }

      if (dto.deltaCoins > 0) {
        const updated = await tx.tenantAiWallet.update({
          where: { id: wallet.id },
          data: {
            balanceCoins: { increment: dto.deltaCoins },
            totalCredited: { increment: dto.deltaCoins },
          },
        });
        const ledger = await tx.tenantAiLedger.create({
          data: {
            tenantId: dto.tenantId,
            walletId: wallet.id,
            type: 'manual_adjust',
            direction: 'in',
            coins: dto.deltaCoins,
            balanceAfter: updated.balanceCoins,
            idempotencyKey: dto.idempotencyKey,
            remark: dto.remark ?? '超管手动入账',
            operatorUserId: actor.id,
            actorUserId: actor.id,
          },
        });
        return { ledger, balanceCoins: updated.balanceCoins };
      }

      const debit = Math.abs(dto.deltaCoins);
      const updated = await tx.tenantAiWallet.updateMany({
        where: { id: wallet.id, balanceCoins: { gte: debit } },
        data: {
          balanceCoins: { decrement: debit },
          totalDebited: { increment: debit },
        },
      });
      if (updated.count === 0) {
        throw new HttpException({ message: '企业 AI 币余额不足', code: 'INSUFFICIENT_AI_COINS' }, HttpStatus.PAYMENT_REQUIRED);
      }
      const fresh = await tx.tenantAiWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const ledger = await tx.tenantAiLedger.create({
        data: {
          tenantId: dto.tenantId,
          walletId: wallet.id,
          type: 'manual_adjust',
          direction: 'out',
          coins: debit,
          balanceAfter: fresh.balanceCoins,
          idempotencyKey: dto.idempotencyKey,
          remark: dto.remark ?? '超管手动扣减',
          operatorUserId: actor.id,
          actorUserId: actor.id,
        },
      });
      return { ledger, balanceCoins: fresh.balanceCoins };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: dto.tenantId,
        action: 'billing_manual_adjust',
        meta: { deltaCoins: dto.deltaCoins, ledgerId: result.ledger.id },
      },
    });

    return {
      reused: false,
      ledgerId: result.ledger.id,
      balanceCoins: result.balanceCoins,
      deltaCoins: dto.deltaCoins,
    };
  }
  async walletDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, type: true, status: true },
    });
    if (!tenant) throw new NotFoundException('企业不存在');
    const wallet = await this.ensureWallet(tenantId);
    const recent = await this.prisma.tenantAiLedger.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        type: true,
        direction: true,
        coins: true,
        balanceAfter: true,
        meta: true,
        tokens: true,
        remark: true,
        createdAt: true,
      },
    });
    const config = await this.config.getConfig();
    return {
      tenant,
      balanceCoins: wallet.balanceCoins,
      totalCredited: wallet.totalCredited,
      totalDebited: wallet.totalDebited,
      config,
      recent: recent.map((r) => ({ ...r, meta: undefined, coins: ledgerCoinsAtCurrentRate(r.coins,r.meta), balanceAfter: ledgerCoinsAtCurrentRate(r.balanceAfter,r.meta), createdAt: r.createdAt.toISOString() })),
    };
  }
  async creditQrTopup(
    params: {
      tenantId: string;
      coins: number;
      orderNo: string;
      amountYuan: string;
      channel: string;
      operatorId?: string;
      remark?: string;
      orderId?: string;
      aiCoinsPerYuan?: number;
    },
    txClient?: Prisma.TransactionClient,
  ) {
    const coins = Math.floor(params.coins);
    if (coins <= 0) throw new BadRequestException('入账 AI 币必须为正整数');
    const idempotencyKey = `recharge:${params.orderNo}:confirm`;
    const db = txClient ?? this.prisma;

    const existing = await db.tenantAiLedger.findUnique({ where: { idempotencyKey } });
    if (existing) {
      const wallet = await db.tenantAiWallet.findUnique({ where: { tenantId: params.tenantId } });
      return {
        alreadyApplied: true as const,
        idempotencyKey,
        ledgerId: existing.id,
        balanceCoins: wallet?.balanceCoins ?? existing.balanceAfter,
      };
    }

    let wallet = await db.tenantAiWallet.findUnique({ where: { tenantId: params.tenantId } });
    if (!wallet) {
      wallet = await db.tenantAiWallet.create({
        data: { tenantId: params.tenantId, balanceCoins: 0 },
      });
    }
    const updated = await db.tenantAiWallet.update({
      where: { id: wallet.id },
      data: {
        balanceCoins: { increment: coins },
        totalCredited: { increment: coins },
      },
    });
    const ledger = await db.tenantAiLedger.create({
      data: {
        tenantId: params.tenantId,
        walletId: wallet.id,
        type: 'recharge',
        direction: 'in',
        coins,
        balanceAfter: updated.balanceCoins,
        idempotencyKey,
        remark: params.remark ?? `扫码充值 ¥${params.amountYuan}`,
        operatorUserId: params.operatorId,
        actorUserId: params.operatorId,
        meta: {
          orderId: params.orderId ?? null,
          orderNo: params.orderNo,
          yuan: params.amountYuan,
          amountYuan: params.amountYuan,
          aiCoinsPerYuan: params.aiCoinsPerYuan ?? null,
          channel: params.channel,
        },
      },
    });
    return {
      alreadyApplied: false as const,
      idempotencyKey,
      ledgerId: ledger.id,
      balanceCoins: updated.balanceCoins,
    };
  }

  
  private ledgerWhere(params: {
    tenantId: string;
    from?: string;
    to?: string;
    actorUserId?: string;
    type?: string;
    types?: string[];
  }) {
    const where: Prisma.TenantAiLedgerWhereInput = { tenantId: params.tenantId };
    if (params.type) where.type = params.type;
    else if (params.types?.length) where.type = { in: params.types };
    if (params.actorUserId) {
      // 资金类流水写 operatorUserId，对话消耗写 actorUserId；筛选两者任一命中
      where.OR = [
        { actorUserId: params.actorUserId },
        { operatorUserId: params.actorUserId },
      ];
    }
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }
    return where;
  }

  async countLedgers(params: {
    tenantId: string;
    from?: string;
    to?: string;
    actorUserId?: string;
    type?: string;
    types?: string[];
  }) {
    return this.prisma.tenantAiLedger.count({ where: this.ledgerWhere(params) });
  }

  /** 租户流水（可按时间 / 员工筛选）。caller 已鉴权。支持 skip/take 分页，勿一次拉全量。 */
  async listLedgers(params: {
    tenantId: string;
    from?: string;
    to?: string;
    actorUserId?: string;
    type?: string;
    types?: string[];
    take?: number;
    skip?: number;
  }) {
    const where = this.ledgerWhere(params);
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    const skip = Math.max(params.skip ?? 0, 0);
    const rows = await this.prisma.tenantAiLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.actorUserId, r.operatorUserId])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const meta =
        r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)
          ? (r.meta as Record<string, unknown>)
          : {};
      const yuanRaw = meta.yuan ?? meta.amountYuan;
      const amountYuan =
        typeof yuanRaw === 'string' || typeof yuanRaw === 'number'
          ? String(yuanRaw)
          : null;
      // 对话消耗用 actorUserId；充值/调账用 operatorUserId
      const resolvedUserId = r.actorUserId ?? r.operatorUserId ?? null;
      const user = resolvedUserId ? byId.get(resolvedUserId) : undefined;
      const provider = metaString(meta, 'provider');
      const model = metaString(meta, 'model');
      const orderNo = metaString(meta, 'orderNo');
      const orderId = metaString(meta, 'orderId');
      const channel = metaString(meta, 'channel');
      return {
        id: r.id,
        type: r.type,
        direction: r.direction,
        originalCoins: r.coins,
        originalAiCoinsPerYuan: metaNumber(meta, 'originalAiCoinsPerYuan') ?? 10000,
        coins: ledgerCoinsAtCurrentRate(r.coins, r.meta),
        deltaCoins: r.direction === 'in' ? ledgerCoinsAtCurrentRate(r.coins, r.meta) : -ledgerCoinsAtCurrentRate(r.coins, r.meta),
        balanceAfter: ledgerCoinsAtCurrentRate(r.balanceAfter, r.meta),
        tokens: r.tokens,
        amountYuan,
        remark: r.remark,
        actorUserId: resolvedUserId,
        actorName: user?.name ?? null,
        actorPhone: user?.phone ?? null,
        createdAt: r.createdAt.toISOString(),
        // meta 关键字段（Admin 流水展示；与任务2/3 写入对齐）
        provider,
        model,
        orderId,
        orderNo,
        channel,
        yuan: amountYuan,
        tokensPerAiCoin: metaNumber(meta, 'tokensPerAiCoin'),
        sellPriceMultiplier: metaNumber(meta, 'sellPriceMultiplier'),
        aiCoinsPerYuan: 10000,
        meta: {
          provider,
          model,
          tokensPerAiCoin: metaNumber(meta, 'tokensPerAiCoin'),
          sellPriceMultiplier: metaNumber(meta, 'sellPriceMultiplier'),
          orderId,
          orderNo,
          yuan: amountYuan,
          aiCoinsPerYuan: 10000,
          channel,
        },
      };
    });
  }

  private async normalizedLedgerAggregate(tenantId: string, direction: string) {
    const [row] = await this.prisma.$queryRaw<Array<{ coins: Prisma.Decimal; count: bigint }>>`
      SELECT COALESCE(SUM(${currentLedgerCoinsSql}),0) AS coins, COUNT(*) AS count
      FROM tenant_ai_ledger WHERE tenant_id = ${tenantId} AND direction = ${direction} AND type <> 'denomination_conversion'`;
    return { _sum: { coins: Number(row.coins) }, _count: Number(row.count) };
  }

  /** Admin 企业资金：余额 + 统一流水（充值/消耗/调账）+ 充值单。流水分页，不一次拉全量。 */
  async enterpriseFundsReport(
    actor: User,
    tenantId: string,
    opts?: { page?: number; pageSize?: number; ledgerType?: string },
  ) {
    this.requirePlatformAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, type: true, status: true },
    });
    if (!tenant) throw new NotFoundException('企业不存在');
    const wallet = await this.ensureWallet(tenantId);
    const config = await this.config.getConfig();

    // 抽屉流水：每页 20–50
    const pageSize = Math.min(Math.max(opts?.pageSize ?? 20, 20), 50);
    const page = Math.max(opts?.page ?? 1, 1);
    const skip = (page - 1) * pageSize;

    const typeFilter = resolveLedgerTypeFilter(opts?.ledgerType);
    const ledgerQuery = { tenantId, ...typeFilter };

    const [rechargeAgg, consumeAgg, topups, ledger, ledgerTotal, recentConsumes, byActorRaw, freezeRecon] =
      await Promise.all([
        this.normalizedLedgerAggregate(tenantId, 'in'),
        this.normalizedLedgerAggregate(tenantId, 'out'),
        this.prisma.aiRechargeOrder.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        this.listLedgers({ ...ledgerQuery, take: pageSize, skip }),
        this.countLedgers(ledgerQuery),
        this.listLedgers({ tenantId, type: 'chat_consume', take: 50 }),
        this.prisma.$queryRaw<Array<{ actorUserId: string; coins: Prisma.Decimal; tokens: bigint; turns: bigint }>>`
          SELECT actor_user_id AS "actorUserId", SUM(${currentLedgerCoinsSql}) AS coins,
            COALESCE(SUM(tokens),0)::bigint AS tokens, COUNT(*) AS turns
          FROM tenant_ai_ledger WHERE tenant_id = ${tenantId} AND type = 'chat_consume' AND actor_user_id IS NOT NULL
          GROUP BY actor_user_id ORDER BY coins DESC LIMIT 50`,
        // 对账：净冻结额与残留冻结（冻结后既未解冻也未结算 = 进程中断泄漏）
        this.prisma.$queryRaw<Array<{ frozenNet: bigint; dangling: bigint }>>`
          SELECT
            COALESCE(SUM(CASE WHEN type='chat_freeze' THEN coins WHEN type='chat_unfreeze' THEN -coins ELSE 0 END),0)::bigint AS "frozenNet",
            COALESCE(SUM(CASE WHEN type='chat_freeze'
              AND NOT EXISTS (SELECT 1 FROM tenant_ai_ledger u WHERE u.idempotency_key = 'gw-unfreeze-' || substring(tenant_ai_ledger.idempotency_key from 11))
              AND NOT EXISTS (SELECT 1 FROM tenant_ai_ledger c WHERE c.idempotency_key = 'gw-charge-' || substring(tenant_ai_ledger.idempotency_key from 11))
              THEN 1 ELSE 0 END),0)::bigint AS dangling
          FROM tenant_ai_ledger WHERE tenant_id = ${tenantId} AND type IN ('chat_freeze','chat_unfreeze')`,
      ]);

    const actorIds = byActorRaw.map((r) => r.actorUserId).filter(Boolean) as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const actorMap = new Map(actors.map((u) => [u.id, u]));

    return {
      tenant,
      config,
      wallet: {
        balanceCoins: wallet.balanceCoins,
        totalCredited: wallet.totalCredited,
        totalDebited: wallet.totalDebited,
      },
      summary: {
        inflowCoins: rechargeAgg._sum.coins ?? 0,
        inflowCount: rechargeAgg._count,
        outflowCoins: consumeAgg._sum.coins ?? 0,
        outflowCount: consumeAgg._count,
      },
      /** 统一流水：充值 / 对话消耗 / 调账；充值行可带实付金额（分页） */
      ledger,
      ledgerPage: { page, pageSize, total: ledgerTotal },
      /** 按操作者汇总的对话消耗（企业资金页成员拆分） */
      byEmployee: byActorRaw.map((r) => ({
        userId: r.actorUserId,
        name: r.actorUserId ? actorMap.get(r.actorUserId)?.name ?? '未知' : '未知',
        phone: r.actorUserId ? actorMap.get(r.actorUserId)?.phone ?? null : null,
        consumedCoins: Number(r.coins),
        tokens: Number(r.tokens),
        turns: Number(r.turns),
      })),
      recentConsumes,
      rechargeOrders: topups.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        amountYuan: Number(o.amountYuan).toFixed(2),
        aiCoins: Number(new Prisma.Decimal(o.amountYuan).mul(10000)),
        status: o.status,
        channel: o.channel,
        createdAt: o.createdAt.toISOString(),
        confirmedAt: o.confirmedAt?.toISOString() ?? null,
      })),
      notes: {
        chargeRule:
          '扣费 = ceil((输入非缓存成本 + 缓存输入成本 + 输出成本) × 售价倍率 × 每元AI币数)。每笔使用请求开始时的价格快照；AI币以 chat_consume 实扣为准。',
        legacyLedger:
          '历史流水可能按旧公式记账，不回填；对账请以 ledger 合计为准（余额应≈入账合计−出账合计）。',
      },
      ledgerType: opts?.ledgerType?.trim() || null,
      /** 对账：余额应 = 入账 − 出账 − 净冻结；danglingFreezes > 0 说明有进程中断泄漏待人工解冻 */
      consistency: (() => {
        const frozenNet = Number(freezeRecon[0]?.frozenNet ?? 0);
        const dangling = Number(freezeRecon[0]?.dangling ?? 0);
        const expected = wallet.totalCredited - wallet.totalDebited - frozenNet;
        return {
          balanceCoins: wallet.balanceCoins,
          expectedCoins: expected,
          frozenNetCoins: frozenNet,
          danglingFreezes: dangling,
          ok: wallet.balanceCoins === expected && dangling === 0,
        };
      })(),
    };
  }

  private requirePlatformAdmin(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可操作');
  }
}
