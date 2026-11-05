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
    const where: Prisma.TenantAiLedgerWhereInput = { type: 'chat_consume' };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    const rows = await this.prisma.tenantAiLedger.findMany({
      where,
      select: { tokens: true, coins: true, meta: true, tenantId: true },
      take: 20000,
    });

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

    for (const r of rows) {
      const meta = (r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)
        ? (r.meta as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const provider = typeof meta.provider === 'string' ? meta.provider : '';
      const model = typeof meta.model === 'string' ? meta.model : '';
      const vendor = toBucket(classifyVendor(provider, model));
      const tokens = Math.max(0, r.tokens ?? 0);
      const coins = Math.max(0, ledgerCoinsAtCurrentRate(r.coins, r.meta));
      buckets[vendor].tokens += tokens;
      buckets[vendor].coins += coins;
      buckets[vendor].turns += 1;
      const key = `${vendor}|${provider}|${model}`;
      let m = modelMap.get(key);
      if (!m) {
        m = { vendor, provider: provider || '-', model: model || '-', tokens: 0, coins: 0, turns: 0, legacyTokens: 0 };
        modelMap.set(key, m);
        modelRows.push(m);
      }
      const recordedCost = typeof meta.purchaseCostYuan === 'string' ? Number(meta.purchaseCostYuan) : NaN;
      if (Number.isFinite(recordedCost) && recordedCost >= 0) buckets[vendor].estimatedCostYuan += recordedCost;
      else m.legacyTokens += tokens;
      m.tokens += tokens;
      m.coins += coins;
      m.turns += 1;
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
        turns: rows.length,
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

    const turns = await this.prisma.tokenUsageTurn.findMany({
      where,
      select: {
        tenantId: true,
        userId: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        modelCalls: true,
      },
    });

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
    const memberSeen = new Map<string, Set<string>>();
    const byModelMap = new Map<
      string,
      { model: string; inputTokens: number; outputTokens: number; totalTokens: number; turns: number }
    >();
    const platform = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      turns: 0,
      modelCalls: 0,
    };

    const tenantIds = [...new Set(turns.map((t) => t.tenantId!).filter(Boolean))];
    const tenantRows = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, type: true, status: true },
        })
      : [];
    const tenantInfo = new Map(tenantRows.map((t) => [t.id, t]));

    for (const row of turns) {
      const tid = row.tenantId!;
      const info = tenantInfo.get(tid);
      if (!info || info.type === 'PLATFORM') continue;

      platform.inputTokens += row.inputTokens;
      platform.outputTokens += row.outputTokens;
      platform.totalTokens += row.totalTokens;
      platform.turns += 1;
      platform.modelCalls += row.modelCalls;

      const modelName = row.model || '(unknown)';
      const bm = byModelMap.get(modelName) ?? {
        model: modelName,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        turns: 0,
      };
      bm.inputTokens += row.inputTokens;
      bm.outputTokens += row.outputTokens;
      bm.totalTokens += row.totalTokens;
      bm.turns += 1;
      byModelMap.set(modelName, bm);

      let ent = entMap.get(tid);
      if (!ent) {
        ent = {
          tenantId: info.id,
          tenantName: info.name,
          tenantSlug: info.slug,
          tenantType: info.type,
          tenantStatus: info.status,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turns: 0,
          modelCalls: 0,
          memberCount: 0,
        };
        entMap.set(tid, ent);
        memberSeen.set(tid, new Set());
      }
      ent.inputTokens += row.inputTokens;
      ent.outputTokens += row.outputTokens;
      ent.totalTokens += row.totalTokens;
      ent.turns += 1;
      ent.modelCalls += row.modelCalls;
      memberSeen.get(tid)!.add(row.userId);
    }

    for (const [tid, set] of memberSeen) {
      const ent = entMap.get(tid);
      if (ent) ent.memberCount = set.size;
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
    const ledgerWhere: Prisma.TenantAiLedgerWhereInput = {
      type: 'chat_consume',
      createdAt: { gte: range.start, lt: range.end },
      // TenantAiLedger 无 tenant 关联；用非 PLATFORM 企业 id 列表收口
      tenantId: allTenantIds.length ? { in: allTenantIds } : { in: ['__none__'] },
    };
    if (modelFilter) {
      ledgerWhere.meta = { path: ['model'], equals: modelFilter };
    }
    const ledgerRows = await this.prisma.tenantAiLedger.findMany({
      where: ledgerWhere,
      select: { tenantId: true, coins: true, tokens: true, meta: true },
      take: 50000,
    });
    const coinsByTenant = new Map<string, number>();
    const ledgerTokensByTenant = new Map<string, number>();
    const coinsByModel = new Map<string, number>();
    let platformConsumedAiCoins = 0;
    let platformLedgerTokens = 0;
    for (const row of ledgerRows) {
      const coins = Math.max(0, ledgerCoinsAtCurrentRate(row.coins || 0, row.meta));
      const tokens = Math.max(0, row.tokens ?? 0);
      platformConsumedAiCoins += coins;
      platformLedgerTokens += tokens;
      coinsByTenant.set(row.tenantId, (coinsByTenant.get(row.tenantId) ?? 0) + coins);
      ledgerTokensByTenant.set(
        row.tenantId,
        (ledgerTokensByTenant.get(row.tenantId) ?? 0) + tokens,
      );
      const meta =
        row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
          ? (row.meta as Record<string, unknown>)
          : {};
      const modelName =
        typeof meta.model === 'string' && meta.model.trim()
          ? meta.model.trim()
          : '(unknown)';
      coinsByModel.set(modelName, (coinsByModel.get(modelName) ?? 0) + coins);
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

    const overview = await this.enterpriseTokenStatsOverview(actor, {
      from: query.from,
      to: query.to,
      model: query.model,
    });

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

    const turns = await this.prisma.tokenUsageTurn.findMany({
      where,
      select: {
        userId: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        modelCalls: true,
      },
    });

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

    const missingUserIds = [...new Set(turns.map((t) => t.userId).filter((id) => !memMap.has(id)))];
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

    for (const row of turns) {
      let acc = memMap.get(row.userId);
      if (!acc) continue;
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.totalTokens += row.totalTokens;
      acc.turns += 1;
      acc.modelCalls += row.modelCalls;
      let mm = modelByUser.get(row.userId);
      if (!mm) {
        mm = new Map();
        modelByUser.set(row.userId, mm);
      }
      const modelName = row.model || '(unknown)';
      const cur = mm.get(modelName) ?? { model: modelName, totalTokens: 0, turns: 0 };
      cur.totalTokens += row.totalTokens;
      cur.turns += 1;
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

    const detailLedgerWhere: Prisma.TenantAiLedgerWhereInput = {
      tenantId: tenant.id,
      type: 'chat_consume',
      createdAt: { gte: range.start, lt: range.end },
    };
    if (modelFilter) {
      detailLedgerWhere.meta = { path: ['model'], equals: modelFilter };
    }
    const detailLedgers = await this.prisma.tenantAiLedger.findMany({
      where: detailLedgerWhere,
      select: { actorUserId: true, coins: true, tokens: true, meta: true },
      take: 50000,
    });
    const coinsByActor = new Map<string, number>();
    const tokensByActor = new Map<string, number>();
    let detailConsumed = 0;
    let detailLedgerTokens = 0;
    for (const row of detailLedgers) {
      const coins = Math.max(0, ledgerCoinsAtCurrentRate(row.coins || 0, row.meta));
      const tokens = Math.max(0, row.tokens ?? 0);
      detailConsumed += coins;
      detailLedgerTokens += tokens;
      if (!row.actorUserId) continue;
      coinsByActor.set(row.actorUserId, (coinsByActor.get(row.actorUserId) ?? 0) + coins);
      tokensByActor.set(row.actorUserId, (tokensByActor.get(row.actorUserId) ?? 0) + tokens);
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

    const entRow = overview.enterprises.find((e) => e.tenantId === tenant.id);

    return {
      source: overview.source,
      tenant,
      range: overview.range,
      model: overview.model,
      models: overview.models,
      offlineModels: overview.offlineModels,
      modelsSource: overview.modelsSource,
      tokensPerAiCoin: overview.tokensPerAiCoin,
      aiCoinSource: overview.aiCoinSource,
      totals: entRow
        ? {
            inputTokens: entRow.inputTokens,
            outputTokens: entRow.outputTokens,
            totalTokens: entRow.totalTokens,
            turns: entRow.turns,
            modelCalls: entRow.modelCalls,
            consumedAiCoins: entRow.consumedAiCoins,
            ledgerTokens: entRow.ledgerTokens,
          }
        : {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            turns: 0,
            modelCalls: 0,
            consumedAiCoins: detailConsumed,
            ledgerTokens: detailLedgerTokens,
          },
      members: memberRows,
      related: overview.related,
    };
  }


  /**
   * 企业控制台 AI 币/Token 用量：本企业 token_usage_turn 明细。
   * AI币按 floor(tokens / tokensPerAiCoin)（tokens>0 至少 1）与扣费一致。
   */
}
