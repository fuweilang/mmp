import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportTokenUsageDto } from './dto/billing.dto';
import { shanghaiDayRangeUnix } from './octop-usage.reader';
import { listEnabledChatModels } from './octop-providers.reader';
import { BillingConfigService } from './billing-config.service';
import {
  blendedYuanPer1mForModel,
  classifyVendor,
} from './billing.shared';
import { ledgerCoinsAtCurrentRate } from './billing.pricing';
import { TokenStatsSupport } from './token-stats.support';

export type TokenUsageSettlementMark = {
  status: 'settled' | 'exempt' | 'settlement-failed';
  chargedCoins?: number;
  ledgerId?: string;
  reason?: 'insufficient-ai-coins' | 'charge-failed';
};

@Injectable()
export class TokenUsageService {
  constructor(
    private prisma: PrismaService,
    private config: BillingConfigService,
    private support: TokenStatsSupport,
  ) {}

  async reportTokenUsage(user: User, tenantId: string | null, dto: ReportTokenUsageDto, meta?: Prisma.InputJsonObject) {
    const key = (dto.idempotencyKey || '').trim();
    if (key.length < 8) throw new BadRequestException('idempotencyKey 太短');

    const existing = await this.prisma.tokenUsageTurn.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.userId !== user.id || existing.tenantId !== tenantId) throw new BadRequestException('用量幂等键不属于当前账号或企业');
      return { ok: true, reused: true, turn: this.support.toTurnView(existing) };
    }

    let input = Math.max(0, Math.floor(Number(dto.inputTokens ?? 0) || 0));
    let output = Math.max(0, Math.floor(Number(dto.outputTokens ?? 0) || 0));
    let total = Math.max(0, Math.floor(Number(dto.totalTokens ?? 0) || 0));
    if (total <= 0) total = input + output;
    if (total <= 0 && input <= 0 && output <= 0 && meta?.billingStatus !== 'usage-missing') {
      return { ok: true, skipped: true, reason: 'zero_tokens' };
    }
    if (input <= 0 && output <= 0 && total > 0) {
      // 仅有 total 时记入 total，input/output 保持 0
    }

    let resolvedTenantId: string | null = tenantId || null;
    if (resolvedTenantId) {
      const t = await this.prisma.tenant.findUnique({
        where: { id: resolvedTenantId },
        select: { id: true, type: true },
      });
      if (!t || t.type === 'PLATFORM') resolvedTenantId = null;
    }

    let occurredAt = new Date();
    if (dto.occurredAt) {
      const parsed = new Date(dto.occurredAt);
      if (!Number.isNaN(parsed.getTime())) occurredAt = parsed;
    }

    const clientKind = (dto.clientKind || 'unknown').trim().slice(0, 32) || 'unknown';
    const model = (dto.model || '').trim().slice(0, 128);
    const modelCalls = Math.max(1, Math.floor(Number(dto.modelCalls ?? 1) || 1));

    try {
      const row = await this.prisma.tokenUsageTurn.create({
        data: {
          tenantId: resolvedTenantId,
          ...(meta ? { meta } : {}),
          userId: user.id,
          model,
          inputTokens: input,
          outputTokens: output,
          totalTokens: total,
          modelCalls,
          threadId: (dto.threadId || '').trim().slice(0, 128),
          agentId: (dto.agentId || '').trim().slice(0, 128),
          clientKind,
          source: (dto.source || 'chat').trim().slice(0, 64) || 'chat',
          idempotencyKey: key,
          occurredAt,
        },
      });
      return { ok: true, reused: false, turn: this.support.toTurnView(row) };
    } catch (e) {
      // 并发同键：再读一次
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.tokenUsageTurn.findUnique({ where: { idempotencyKey: key } });
        if (again) return { ok: true, reused: true, turn: this.support.toTurnView(again) };
      }
      throw e;
    }
  }

  /** 将网关最终结算结果回写到同一用量行，保留原始价格快照供对账。 */
  async markTokenUsageSettlement(idempotencyKey: string, mark: TokenUsageSettlementMark) {
    const existing = await this.prisma.tokenUsageTurn.findUnique({ where: { idempotencyKey } });
    if (!existing) return { ok: false as const, reason: 'usage-not-found' as const };
    const previous = existing.meta && typeof existing.meta === 'object' && !Array.isArray(existing.meta)
      ? existing.meta
      : {};
    const now = new Date().toISOString();
    const meta: Prisma.InputJsonObject = {
      ...previous,
      billingStatus: mark.status,
      ...(mark.chargedCoins !== undefined ? { chargedCoins: mark.chargedCoins } : {}),
      ...(mark.ledgerId ? { ledgerId: mark.ledgerId } : {}),
      ...(mark.reason ? { settlementError: mark.reason } : {}),
      ...(mark.status === 'settlement-failed' ? { settlementFailedAt: now } : { settledAt: now }),
    };
    await this.prisma.tokenUsageTurn.update({ where: { id: existing.id }, data: { meta } });
    return { ok: true as const };
  }

  /**
   * Admin 企业 Token 统计（物理用量 ← Ground token_usage_turn）。
   * AI币读取实际结算流水；不按 Token 数臆造扣币，不混用旧面额。
   */
  async consoleTenantTokenUsage(
    tenantId: string,
    query: {
      from?: string;
      to?: string;
      userId?: string;
      model?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    if (!tenantId) throw new BadRequestException('请先选择企业');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, type: true },
    });
    if (!tenant || tenant.type === 'PLATFORM') throw new NotFoundException('企业不存在');

    let range;
    try {
      range = this.support.shanghaiRangeDates(query.from, query.to);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : '日期无效');
    }

    const userId = (query.userId || '').trim() || null;
    const modelFilter = (query.model || '').trim() || null;
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 10), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const skip = (page - 1) * pageSize;

    const where: Prisma.TokenUsageTurnWhereInput = {
      tenantId,
      occurredAt: { gte: range.start, lt: range.end },
    };
    if (userId) where.userId = userId;
    if (modelFilter) where.model = modelFilter;

    const [agg, total, rows, modelRows, memberRows, billedRows] = await Promise.all([
      this.prisma.tokenUsageTurn.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true, modelCalls: true },
        _count: { _all: true },
      }),
      this.prisma.tokenUsageTurn.count({ where }),
      this.prisma.tokenUsageTurn.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          idempotencyKey: true,
          userId: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          modelCalls: true,
          clientKind: true,
          source: true,
          threadId: true,
          occurredAt: true,
        },
      }),
      this.prisma.tokenUsageTurn.findMany({
        where: { tenantId, occurredAt: { gte: range.start, lt: range.end } },
        distinct: ['model'],
        select: { model: true },
        orderBy: { model: 'asc' },
        take: 200,
      }),
      this.prisma.orgMember.findMany({
        where: { tenantId },
        select: { userId: true, user: { select: { id: true, name: true, phone: true } } },
        take: 500,
      }),
      this.prisma.$queryRaw<Array<{ key: string; coins: number; meta: Prisma.JsonValue }>>`
        SELECT t.idempotency_key AS key, l.coins, l.meta
        FROM token_usage_turn t JOIN tenant_ai_ledger l
          ON l.idempotency_key = 'gw-charge-' || substring(t.idempotency_key from 10)
          AND l.tenant_id = t.tenant_id AND l.actor_user_id = t.user_id AND l.type = 'chat_consume'
        WHERE t.tenant_id = ${tenantId} AND t.occurred_at >= ${range.start} AND t.occurred_at < ${range.end}
          AND t.idempotency_key LIKE 'gw-usage-%'
          ${userId ? Prisma.sql`AND t.user_id = ${userId}` : Prisma.empty}
          ${modelFilter ? Prisma.sql`AND t.model = ${modelFilter}` : Prisma.empty}`,
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const actualCoins = new Map(billedRows.map(r => [r.key, ledgerCoinsAtCurrentRate(r.coins,r.meta)]));
    const totalTokens = agg._sum.totalTokens ?? 0;
    const items = rows.map((r) => {
      const u = byId.get(r.userId);
      return {
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        userId: r.userId,
        memberName: u?.name ?? r.userId,
        memberPhone: u?.phone ?? null,
        model: r.model || '(unknown)',
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        aiCoins: actualCoins.get(r.idempotencyKey) ?? 0,
        modelCalls: r.modelCalls,
        clientKind: r.clientKind,
        source: r.source,
        threadId: r.threadId || null,
      };
    });
    const aiCoinsTotal = billedRows.reduce((sum,r) => sum + ledgerCoinsAtCurrentRate(r.coins,r.meta),0);

    return {
      source: 'ground_token_usage_turn',
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      range: {
        from: query.from || null,
        to: query.to || null,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      filters: {
        userId,
        model: modelFilter,
      },
      models: modelRows.map((m) => m.model).filter(Boolean),
      members: memberRows.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        phone: m.user.phone,
      })),
      totals: {
        turns: agg._count._all,
        inputTokens: agg._sum.inputTokens ?? 0,
        outputTokens: agg._sum.outputTokens ?? 0,
        totalTokens,
        modelCalls: agg._sum.modelCalls ?? 0,
        aiCoins: aiCoinsTotal,
      },
      items,
      page,
      pageSize,
      total,
    };
  }


  /**
   * 模型筛选项 = Octop 已启用聊天模型目录 ∪ 时段内有用量的 distinct model。
   * 目录优先列出（含 0 用量）；历史-only 保留可筛，并标 offline。
   */
}
