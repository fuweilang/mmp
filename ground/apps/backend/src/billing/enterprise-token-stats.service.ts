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
import { TokenStatsSupport } from './token-stats.support';

const LEDGER_COINS = Prisma.raw(`GREATEST(COALESCE(coins, 0), 0)::numeric * 10000 / (CASE WHEN (meta->>'originalAiCoinsPerYuan') ~ '^[0-9]+([.][0-9]+)?$' AND (meta->>'originalAiCoinsPerYuan')::numeric > 0 THEN (meta->>'originalAiCoinsPerYuan')::numeric ELSE 10000 END)`);
const RECORDED_COST = Prisma.raw(`CASE WHEN jsonb_typeof(meta->'purchaseCostYuan') = 'string' AND btrim(meta->>'purchaseCostYuan') ~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' THEN (meta->>'purchaseCostYuan')::numeric WHEN jsonb_typeof(meta->'purchaseCostYuan') = 'string' AND btrim(meta->>'purchaseCostYuan') = '' THEN 0 ELSE NULL END`);

@Injectable()
export class EnterpriseTokenStatsService {
  constructor(
    private prisma: PrismaService,
    private config: BillingConfigService,
    private support: TokenStatsSupport,
  ) {}

  async usageReconcile(
    actor: User,
    query: { from?: string; to?: string; tenantId?: string },
  ) {
    this.support.requirePlatformAdmin(actor);
    const config = await this.config.getConfig();
    const filters = [Prisma.sql`type = 'chat_consume'`];
    if (query.tenantId) filters.push(Prisma.sql`tenant_id = ${query.tenantId}`);
    if (query.from) filters.push(Prisma.sql`created_at >= ${new Date(query.from)}`);
    if (query.to) filters.push(Prisma.sql`created_at <= ${new Date(query.to)}`);
    const rows = await this.prisma.$queryRaw<Array<{
      provider: string;
      model: string;
      tokens: number;
      coins: number;
      turns: number;
      recorded_cost: number | null;
      legacy_tokens: number;
    }>>`
      SELECT COALESCE(meta->>'provider', '') AS provider,
             COALESCE(meta->>'model', '') AS model,
             COALESCE(SUM(GREATEST(COALESCE(tokens, 0), 0)), 0)::float8 AS tokens,
             COALESCE(SUM(${LEDGER_COINS}), 0)::float8 AS coins,
             COUNT(*)::int AS turns,
             SUM(${RECORDED_COST})::float8 AS recorded_cost,
             COALESCE(SUM(CASE WHEN ${RECORDED_COST} IS NULL THEN GREATEST(COALESCE(tokens, 0), 0) ELSE 0 END), 0)::float8 AS legacy_tokens
      FROM tenant_ai_ledger
      WHERE ${Prisma.join(filters, ' AND ')}
      GROUP BY 1, 2
    `;

    type VendorBucket = 'deepseek' | 'kimi' | 'zhipu' | 'other';
    type Acc = {
      vendor: VendorBucket;
      tokens: number;
      coins: number;
      turns: number;
      estimatedCostYuan: number;
    };
    const buckets: Record<VendorBucket, Acc> = {
      deepseek: { vendor: 'deepseek', tokens: 0, coins: 0, turns: 0, estimatedCostYuan: 0 },
      kimi: { vendor: 'kimi', tokens: 0, coins: 0, turns: 0, estimatedCostYuan: 0 },
      zhipu: { vendor: 'zhipu', tokens: 0, coins: 0, turns: 0, estimatedCostYuan: 0 },
      other: { vendor: 'other', tokens: 0, coins: 0, turns: 0, estimatedCostYuan: 0 },
    };
    const toBucket = (v: string): VendorBucket =>
      v === 'deepseek' || v === 'kimi' || v === 'zhipu' ? v : 'other';
    const modelRows: Array<{
      vendor: string;
      provider: string;
      model: string;
      tokens: number;
      coins: number;
      turns: number;
      legacyTokens: number;
    }> = [];
    const modelMap = new Map<string, (typeof modelRows)[number]>();

    let turnCount = 0;
    for (const r of rows) {
      const provider = r.provider || '';
      const model = r.model || '';
      const vendor = toBucket(classifyVendor(provider, model));
      const tokens = Math.max(0, Number(r.tokens) || 0);
      const coins = Math.max(0, Number(r.coins) || 0);
      const turns = Math.max(0, Number(r.turns) || 0);
      turnCount += turns;
      buckets[vendor].tokens += tokens;
      buckets[vendor].coins += coins;
      buckets[vendor].turns += turns;
      const key = `${vendor}|${provider}|${model}`;
      let m = modelMap.get(key);
      if (!m) {
        m = { vendor, provider: provider || '-', model: model || '-', tokens: 0, coins: 0, turns: 0, legacyTokens: 0 };
        modelMap.set(key, m);
        modelRows.push(m);
      }
      const recordedCost = r.recorded_cost == null ? NaN : Number(r.recorded_cost);
      if (Number.isFinite(recordedCost) && recordedCost >= 0) buckets[vendor].estimatedCostYuan += recordedCost;
      m.legacyTokens += Number(r.legacy_tokens) || 0;
      m.tokens += tokens;
      m.coins += coins;
      m.turns += turns;
    }

    const prices = config.vendorUnitPrices;
    // 按模型累计成本后再汇总到厂商桶（厂商级单价）
    for (const m of modelRows) {
      const blended = blendedYuanPer1mForModel(m.model, m.provider, prices);
      if (blended == null) continue;
      const cost = (m.legacyTokens / 1_000_000) * blended;
      const vendor = toBucket(m.vendor);
      buckets[vendor].estimatedCostYuan += cost;
    }

    const totalTokens = buckets.deepseek.tokens + buckets.kimi.tokens + buckets.zhipu.tokens + buckets.other.tokens;
    const totalCoins = buckets.deepseek.coins + buckets.kimi.coins + buckets.zhipu.coins + buckets.other.coins;
    const totalCost =
      buckets.deepseek.estimatedCostYuan + buckets.kimi.estimatedCostYuan + buckets.zhipu.estimatedCostYuan + buckets.other.estimatedCostYuan;

    const vendorBlended = (v: VendorBucket): number | null => {
      if (v === 'other') return null;
      const pair = prices[v];
      if (!pair) return null;
      return (Number(pair.input) + Number(pair.output)) / 2;
    };

    return {
      source: 'ground_ledger_chat_consume',
      assumption:
        '新账单读取记录的实际模型采购成本快照；只有没有快照的历史账单按厂商输入/输出均价估算。',
      disclaimer:
        '上游缺失用量、历史估算和账单取整可能造成差异，请定期与厂商账单核对。',
      range: { from: query.from ?? null, to: query.to ?? null, tenantId: query.tenantId ?? null },
      config: {
        sellPriceMultiplier: config.sellPriceMultiplier,
        tokensPerAiCoin: config.tokensPerAiCoin,
        vendorUnitPrices: prices,
      },
      totals: {
        tokens: totalTokens,
        coins: totalCoins,
        turns: turnCount,
        estimatedCostYuan: Number(totalCost.toFixed(4)),
      },
      byVendor: (['deepseek', 'kimi', 'zhipu', 'other'] as VendorBucket[]).map((v) => {
        const blended = vendorBlended(v);
        return {
          ...buckets[v],
          estimatedCostYuan: Number(buckets[v].estimatedCostYuan.toFixed(4)),
          blendedYuanPer1m: blended == null ? null : Number(blended.toFixed(4)),
        };
      }),
      byModel: modelRows
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 100),
      octopHint: {
        path: '/agent/control/token-usage（或侧栏 Token 统计）',
        api: 'GET /api/admin/usage/summary?granularity=by_model&window=last_30d',
        note: 'Octop by_model 含 input/output，可按同单价精确估算；与本页 ledger 合计交叉核对。',
      },
    };
  }
  async enterpriseTokenStatsOverview(
    actor: User,
    query: { from?: string; to?: string; model?: string } = {},
  ) {
    this.support.requirePlatformAdmin(actor);
    let range;
    try {
      range = this.support.shanghaiRangeDates(query.from, query.to);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : '日期无效');
    }
    const modelFilter = (query.model || '').trim() || null;

    const where: Prisma.TokenUsageTurnWhereInput = {
      occurredAt: { gte: range.start, lt: range.end },
      tenantId: { not: null },
      tenant: { type: { not: 'PLATFORM' } },
    };
    if (modelFilter) where.model = modelFilter;

    const [turnTotals, turnByTenant, turnByModel, turnMembers] = await Promise.all([
      this.prisma.tokenUsageTurn.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true, modelCalls: true },
        _count: { _all: true },
      }),
      this.prisma.tokenUsageTurn.groupBy({
        by: ['tenantId'],
        where,
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true, modelCalls: true },
        _count: { _all: true },
      }),
      this.prisma.tokenUsageTurn.groupBy({
        by: ['model'],
        where,
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
        _count: { _all: true },
      }),
      this.prisma.tokenUsageTurn.groupBy({
        by: ['tenantId', 'userId'],
        where,
      }),
    ]);

    const modelRows = await this.prisma.tokenUsageTurn.findMany({
      where: {
        occurredAt: { gte: range.start, lt: range.end },
        tenantId: { not: null },
        tenant: { type: { not: 'PLATFORM' } },
      },
      distinct: ['model'],
      select: { model: true },
      orderBy: { model: 'asc' },
      take: 200,
    });
    const modelFilterOptions = this.support.buildModelFilterOptions(modelRows.map((m) => m.model || '(unknown)'));

    type EntAcc = {
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      tenantType: string;
      tenantStatus: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      turns: number;
      modelCalls: number;
      memberCount: number;
    };
    const entMap = new Map<string, EntAcc>();
    const byModelMap = new Map<
      string,
      { model: string; inputTokens: number; outputTokens: number; totalTokens: number; turns: number }
    >();
    const platform = {
      inputTokens: turnTotals._sum.inputTokens ?? 0,
      outputTokens: turnTotals._sum.outputTokens ?? 0,
      totalTokens: turnTotals._sum.totalTokens ?? 0,
      turns: turnTotals._count._all,
      modelCalls: turnTotals._sum.modelCalls ?? 0,
    };
    const memberCountByTenant = new Map<string, number>();
    for (const pair of turnMembers) {
      if (!pair.tenantId) continue;
      memberCountByTenant.set(pair.tenantId, (memberCountByTenant.get(pair.tenantId) ?? 0) + 1);
    }
    const usageTenantIds = turnByTenant.flatMap(row => row.tenantId ? [row.tenantId] : []);
    const usageTenants = usageTenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: usageTenantIds }, type: { not: 'PLATFORM' } },
          select: { id: true, name: true, slug: true, type: true, status: true },
        })
      : [];
    const usageTenantInfo = new Map(usageTenants.map(row => [row.id, row]));
    for (const row of turnByTenant) {
      if (!row.tenantId) continue;
      const info = usageTenantInfo.get(row.tenantId);
      if (!info) continue;
      entMap.set(info.id, {
        tenantId: info.id,
        tenantName: info.name,
        tenantSlug: info.slug,
        tenantType: info.type,
        tenantStatus: info.status,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
        turns: row._count._all,
        modelCalls: row._sum.modelCalls ?? 0,
        memberCount: memberCountByTenant.get(info.id) ?? 0,
      });
    }
    for (const row of turnByModel) {
      const modelName = row.model || '(unknown)';
      const current = byModelMap.get(modelName) ?? {
        model: modelName,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        turns: 0,
      };
      current.inputTokens += row._sum.inputTokens ?? 0;
      current.outputTokens += row._sum.outputTokens ?? 0;
      current.totalTokens += row._sum.totalTokens ?? 0;
      current.turns += row._count._all;
      byModelMap.set(modelName, current);
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { type: { not: 'PLATFORM' } },
      select: { id: true, name: true, slug: true, type: true, status: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const enterprisesBase = tenants.map((t) => {
      const e = entMap.get(t.id);
      return (
        e ?? {
          tenantId: t.id,
          tenantName: t.name,
          tenantSlug: t.slug,
          tenantType: t.type,
          tenantStatus: t.status,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turns: 0,
          modelCalls: 0,
          memberCount: 0,
        }
      );
    });

    // 钱包余额快照（与筛选时段无关）；直读 tenantAiWallet，不走扣费逻辑
    const allTenantIds = enterprisesBase.map((e) => e.tenantId);
    const wallets = allTenantIds.length
      ? await this.prisma.tenantAiWallet.findMany({
          where: { tenantId: { in: allTenantIds } },
          select: { tenantId: true, balanceCoins: true },
        })
      : [];
    const balanceByTenant = new Map(wallets.map((w) => [w.tenantId, w.balanceCoins]));

    // AI币实扣：同时间窗 chat_consume ledger（与流水合计对齐；不再写死 1000/1:1）
    const billingConfig = await this.config.getConfig();
    const tokensPerAiCoin = billingConfig.tokensPerAiCoin;
    const ledgerGroups = await this.ledgerByTenantModel(range.start, range.end, allTenantIds, modelFilter);
    const coinsByTenant = new Map<string, number>();
    const ledgerTokensByTenant = new Map<string, number>();
    const coinsByModel = new Map<string, number>();
    let platformConsumedAiCoins = 0;
    let platformLedgerTokens = 0;
    for (const row of ledgerGroups) {
      const coins = Math.max(0, Number(row.coins) || 0);
      const tokens = Math.max(0, Number(row.tokens) || 0);
      platformConsumedAiCoins += coins;
      platformLedgerTokens += tokens;
      coinsByTenant.set(row.tenant_id, (coinsByTenant.get(row.tenant_id) ?? 0) + coins);
      ledgerTokensByTenant.set(row.tenant_id, (ledgerTokensByTenant.get(row.tenant_id) ?? 0) + tokens);
      coinsByModel.set(row.model, (coinsByModel.get(row.model) ?? 0) + coins);
    }

    const enterprises = enterprisesBase.map((e) => ({
      ...e,
      balanceAiCoins: balanceByTenant.get(e.tenantId) ?? 0,
      consumedAiCoins: coinsByTenant.get(e.tenantId) ?? 0,
      ledgerTokens: ledgerTokensByTenant.get(e.tenantId) ?? 0,
    }));
    enterprises.sort(
      (a, b) =>
        b.consumedAiCoins - a.consumedAiCoins ||
        b.totalTokens - a.totalTokens ||
        a.tenantName.localeCompare(b.tenantName, 'zh'),
    );

    const byModel = [...byModelMap.values()]
      .map((m) => ({
        ...m,
        consumedAiCoins: coinsByModel.get(m.model) ?? 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
    // 仅 ledger 有、token_usage_turn 无的模型也补一行（实扣可对账）
    for (const [modelName, coins] of coinsByModel) {
      if (byModelMap.has(modelName)) continue;
      byModel.push({
        model: modelName,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        turns: 0,
        consumedAiCoins: coins,
      });
    }
    byModel.sort((a, b) => b.consumedAiCoins - a.consumedAiCoins || b.totalTokens - a.totalTokens);

    return {
      source: 'ground_token_usage_turn+ledger_chat_consume',
      dbPath: null,
      range: {
        from: query.from ?? null,
        to: query.to ?? null,
        startUnix: range.startUnix,
        endUnix: range.endUnix,
        timezone: 'Asia/Shanghai',
      },
      model: modelFilter,
      models: modelFilterOptions.models,
      offlineModels: modelFilterOptions.offlineModels,
      modelsSource: {
        dbPath: modelFilterOptions.catalogDbPath,
        ...(modelFilterOptions.catalogError
          ? { error: modelFilterOptions.catalogError }
          : {}),
      },
      tokensPerAiCoin,
      aiCoinSource: 'ledger_chat_consume' as const,
      totals: {
        ...platform,
        consumedAiCoins: platformConsumedAiCoins,
        ledgerTokens: platformLedgerTokens,
      },
      byModel,
      enterprises,
      related: {
        ledgerUsagePath: '/admin/enterprise-wallets',
        note:
          'Token 来自 token_usage_turn；AI币来自同时间窗 tenant_ai_ledger.chat_consume 实扣，与企业钱包流水合计对齐。不再使用写死 1000/1:1 旧口径。',
      },
    };
  }

  async enterpriseTokenStatsDetail(
    actor: User,
    query: { tenantId: string; from?: string; to?: string; model?: string },
  ) {
    this.support.requirePlatformAdmin(actor);
    if (!query.tenantId) throw new BadRequestException('缺少 tenantId');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: query.tenantId },
      select: { id: true, name: true, slug: true, type: true, status: true },
    });
    if (!tenant || tenant.type === 'PLATFORM') throw new NotFoundException('企业不存在');

    let range;
    try {
      range = this.support.shanghaiRangeDates(query.from, query.to);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : '日期无效');
    }
    const modelFilter = (query.model || '').trim() || null;
    const where: Prisma.TokenUsageTurnWhereInput = {
      tenantId: tenant.id,
      occurredAt: { gte: range.start, lt: range.end },
    };
    if (modelFilter) where.model = modelFilter;
    const [billingConfig, modelOptionRows, turnTotals, turnByUserModel] = await Promise.all([
      this.config.getConfig(),
      this.prisma.tokenUsageTurn.findMany({
        where: {
          occurredAt: { gte: range.start, lt: range.end },
          tenantId: { not: null },
          tenant: { type: { not: 'PLATFORM' } },
        },
        distinct: ['model'],
        select: { model: true },
        orderBy: { model: 'asc' },
        take: 200,
      }),
      this.prisma.tokenUsageTurn.aggregate({
        where,
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true, modelCalls: true },
        _count: { _all: true },
      }),
      this.prisma.tokenUsageTurn.groupBy({
        by: ['userId', 'model'],
        where,
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true, modelCalls: true },
        _count: { _all: true },
      }),
    ]);
    const modelFilterOptions = this.support.buildModelFilterOptions(modelOptionRows.map(row => row.model || '(unknown)'));

    const members = await this.prisma.orgMember.findMany({
      where: { tenantId: tenant.id },
      select: {
        userId: true,
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    type MemAcc = {
      userId: string;
      name: string;
      phone: string | null;
      octopUserId: number | null;
      username: string | null;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      turns: number;
      modelCalls: number;
      byModel: Array<{ model: string; totalTokens: number; turns: number }>;
    };
    const memMap = new Map<string, MemAcc>();
    for (const m of members) {
      memMap.set(m.userId, {
        userId: m.userId,
        name: m.user.name,
        phone: m.user.phone,
        octopUserId: null,
        username: null,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        turns: 0,
        modelCalls: 0,
        byModel: [],
      });
    }
    const modelByUser = new Map<string, Map<string, { model: string; totalTokens: number; turns: number }>>();

    const missingUserIds = [...new Set(turnByUserModel.map(row => row.userId).filter(id => !memMap.has(id)))];
    if (missingUserIds.length) {
      const extras = await this.prisma.user.findMany({
        where: { id: { in: missingUserIds } },
        select: { id: true, name: true, phone: true },
      });
      for (const u of extras) {
        memMap.set(u.id, {
          userId: u.id,
          name: u.name,
          phone: u.phone,
          octopUserId: null,
          username: null,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turns: 0,
          modelCalls: 0,
          byModel: [],
        });
      }
      for (const id of missingUserIds) {
        if (memMap.has(id)) continue;
        memMap.set(id, {
          userId: id,
          name: id,
          phone: null,
          octopUserId: null,
          username: null,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turns: 0,
          modelCalls: 0,
          byModel: [],
        });
      }
    }

    for (const row of turnByUserModel) {
      let acc = memMap.get(row.userId);
      if (!acc) continue;
      acc.inputTokens += row._sum.inputTokens ?? 0;
      acc.outputTokens += row._sum.outputTokens ?? 0;
      acc.totalTokens += row._sum.totalTokens ?? 0;
      acc.turns += row._count._all;
      acc.modelCalls += row._sum.modelCalls ?? 0;
      let mm = modelByUser.get(row.userId);
      if (!mm) {
        mm = new Map();
        modelByUser.set(row.userId, mm);
      }
      const modelName = row.model || '(unknown)';
      const cur = mm.get(modelName) ?? { model: modelName, totalTokens: 0, turns: 0 };
      cur.totalTokens += row._sum.totalTokens ?? 0;
      cur.turns += row._count._all;
      mm.set(modelName, cur);
    }

    const memberRowsBase = [...memMap.values()].map((m) => {
      const mm = modelByUser.get(m.userId);
      return {
        ...m,
        byModel: mm ? [...mm.values()].sort((a, b) => b.totalTokens - a.totalTokens) : [],
        consumedAiCoins: 0,
        ledgerTokens: 0,
      };
    });

    const detailLedgers = await this.ledgerByActor(range.start, range.end, tenant.id, modelFilter);
    const coinsByActor = new Map<string, number>();
    const tokensByActor = new Map<string, number>();
    let detailConsumed = 0;
    let detailLedgerTokens = 0;
    for (const row of detailLedgers) {
      const coins = Math.max(0, Number(row.coins) || 0);
      const tokens = Math.max(0, Number(row.tokens) || 0);
      detailConsumed += coins;
      detailLedgerTokens += tokens;
      if (!row.actor_user_id) continue;
      coinsByActor.set(row.actor_user_id, (coinsByActor.get(row.actor_user_id) ?? 0) + coins);
      tokensByActor.set(row.actor_user_id, (tokensByActor.get(row.actor_user_id) ?? 0) + tokens);
    }
    const memberById = new Map(memberRowsBase.map((m) => [m.userId, m]));
    const missingActorIds: string[] = [];
    for (const [uid, coins] of coinsByActor) {
      const m = memberById.get(uid);
      if (m) {
        m.consumedAiCoins = coins;
        m.ledgerTokens = tokensByActor.get(uid) ?? 0;
      } else {
        missingActorIds.push(uid);
      }
    }
    if (missingActorIds.length) {
      const extras = await this.prisma.user.findMany({
        where: { id: { in: missingActorIds } },
        select: { id: true, name: true, phone: true },
      });
      const extraMap = new Map(extras.map((u) => [u.id, u]));
      for (const uid of missingActorIds) {
        const u = extraMap.get(uid);
        memberRowsBase.push({
          userId: uid,
          name: u?.name ?? uid,
          phone: u?.phone ?? null,
          octopUserId: null,
          username: null,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turns: 0,
          modelCalls: 0,
          byModel: [],
          consumedAiCoins: coinsByActor.get(uid) ?? 0,
          ledgerTokens: tokensByActor.get(uid) ?? 0,
        });
      }
    }

    const memberRows = memberRowsBase;
    memberRows.sort(
      (a, b) =>
        b.consumedAiCoins - a.consumedAiCoins ||
        b.totalTokens - a.totalTokens ||
        a.name.localeCompare(b.name, 'zh'),
    );

    return {
      source: 'ground_token_usage_turn+ledger_chat_consume',
      tenant,
      range: {
        from: query.from ?? null,
        to: query.to ?? null,
        startUnix: range.startUnix,
        endUnix: range.endUnix,
        timezone: 'Asia/Shanghai',
      },
      model: modelFilter,
      models: modelFilterOptions.models,
      offlineModels: modelFilterOptions.offlineModels,
      modelsSource: {
        dbPath: modelFilterOptions.catalogDbPath,
        ...(modelFilterOptions.catalogError ? { error: modelFilterOptions.catalogError } : {}),
      },
      tokensPerAiCoin: billingConfig.tokensPerAiCoin,
      aiCoinSource: 'ledger_chat_consume' as const,
      totals: {
        inputTokens: turnTotals._sum.inputTokens ?? 0,
        outputTokens: turnTotals._sum.outputTokens ?? 0,
        totalTokens: turnTotals._sum.totalTokens ?? 0,
        turns: turnTotals._count._all,
        modelCalls: turnTotals._sum.modelCalls ?? 0,
        consumedAiCoins: detailConsumed,
        ledgerTokens: detailLedgerTokens,
      },
      members: memberRows,
      related: {
        ledgerUsagePath: '/admin/enterprise-wallets',
        note: 'Token 来自 token_usage_turn；AI币来自同时间窗 tenant_ai_ledger.chat_consume 实扣，与企业钱包流水合计对齐。不再使用写死 1000/1:1 旧口径。',
      },
    };
  }

  private async ledgerByTenantModel(start: Date, end: Date, tenantIds: string[], model: string | null) {
    if (tenantIds.length === 0) return [];
    const modelSql = model ? Prisma.sql`AND meta->>'model' = ${model}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<{ tenant_id: string; model: string; coins: number; tokens: number }>>`
      SELECT tenant_id,
             COALESCE(NULLIF(btrim(meta->>'model'), ''), '(unknown)') AS model,
             COALESCE(SUM(${LEDGER_COINS}), 0)::float8 AS coins,
             COALESCE(SUM(GREATEST(COALESCE(tokens, 0), 0)), 0)::float8 AS tokens
      FROM tenant_ai_ledger
      WHERE type = 'chat_consume'
        AND created_at >= ${start}
        AND created_at < ${end}
        AND tenant_id IN (${Prisma.join(tenantIds)})
        ${modelSql}
      GROUP BY tenant_id, 2
    `;
  }

  private async ledgerByActor(start: Date, end: Date, tenantId: string, model: string | null) {
    const modelSql = model ? Prisma.sql`AND meta->>'model' = ${model}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<{ actor_user_id: string | null; coins: number; tokens: number }>>`
      SELECT actor_user_id,
             COALESCE(SUM(${LEDGER_COINS}), 0)::float8 AS coins,
             COALESCE(SUM(GREATEST(COALESCE(tokens, 0), 0)), 0)::float8 AS tokens
      FROM tenant_ai_ledger
      WHERE type = 'chat_consume'
        AND tenant_id = ${tenantId}
        AND created_at >= ${start}
        AND created_at < ${end}
        ${modelSql}
      GROUP BY actor_user_id
    `;
  }


  /**
   * 企业控制台 AI 币/Token 用量：本企业 token_usage_turn 明细。
   * AI币按 floor(tokens / tokensPerAiCoin)（tokens>0 至少 1）与扣费一致。
   */
}
