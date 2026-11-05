import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { modelPricingSnapshot, parseModelPurchasePrices } from './model-pricing';
import { COINS_PER_YUAN, officialModelPrice, seedOfficialPriceCatalogue, officialPriceCatalogue } from './official-model-prices';
import { UpdateBillingConfigDto } from './dto/billing.dto';
import { listEnabledChatModels } from './octop-providers.reader';
import { LlmProvidersService } from '../llm/llm-providers.service';
import {
  BillingConfigView,
  CONFIG_ID,
  DEFAULT_AI_COINS_PER_YUAN,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  DEFAULT_TOKENS_PER_AI_COIN,
  DEFAULT_WELCOME_GIFT_YUAN,
  buildPricingVendors,
  deriveVendorCatalog,
  listOfficialVendorReferences,
  mergeVendorPrices,
  roundMoney2,
  vendorKeyFromProviderName,
} from './billing.shared';

@Injectable()
export class BillingConfigService {
  constructor(
    private prisma: PrismaService,
    private llmProviders: LlmProvidersService,
  ) {}

  async getConfig(): Promise<BillingConfigView> {
    const row = await this.ensureConfig();
    return await this.toConfigView(row);
  }

  async updateConfig(actor: User, dto: UpdateBillingConfigDto): Promise<BillingConfigView> {
    this.requirePlatformAdmin(actor);
    const existing = await this.ensureConfig();
    if (dto.modelUnitPrices !== undefined || dto.vendorUnitPrices !== undefined || dto.tokensPerAiCoin !== undefined
      || (dto.aiCoinsPerYuan !== undefined && dto.aiCoinsPerYuan !== COINS_PER_YUAN)) {
      throw new BadRequestException('模型价格与 AI币面值由系统维护，仅可设置售价倍率和开户赠送金额');
    }
    const modelUnitPrices = parseModelPurchasePrices(existing.modelUnitPrices);
    const sellRaw =
      dto.sellPriceMultiplier !== undefined && dto.sellPriceMultiplier !== null
        ? Number(dto.sellPriceMultiplier)
        : Number(existing.sellPriceMultiplier);
    if (!(sellRaw >= 1)) throw new BadRequestException('售价倍率至少为 1');
    const sellPriceMultiplier = roundMoney2(sellRaw);
    if (sellPriceMultiplier < 1) throw new BadRequestException('售价倍率至少为 1');
    const aiCoinsPerYuan = COINS_PER_YUAN;
    if (existing.aiCoinsPerYuan !== COINS_PER_YUAN) throw new BadRequestException('请先运行 AI币面值等值转换迁移');
    if (aiCoinsPerYuan < 1) throw new BadRequestException('aiCoinsPerYuan 至少为 1');
    const tokensPerAiCoin = Math.floor(
      Number(dto.tokensPerAiCoin ?? existing.tokensPerAiCoin ?? DEFAULT_TOKENS_PER_AI_COIN) || 0,
    );
    if (tokensPerAiCoin < 1) throw new BadRequestException('tokensPerAiCoin 至少为 1');
    const welcomeGiftYuan =
      dto.welcomeGiftYuan !== undefined
        ? roundMoney2(dto.welcomeGiftYuan)
        : roundMoney2(Number(existing.welcomeGiftYuan ?? DEFAULT_WELCOME_GIFT_YUAN));
    if (welcomeGiftYuan < 0) throw new BadRequestException('welcomeGiftYuan 不能为负');
    const listed = await this.resolveChatCatalog();
    const catalog = deriveVendorCatalog(listed.models as any);
    const preferredVendor = this.resolvePreferredVendor(listed as any);
    // 仅 ensure 启用聊天目录中的厂商；禁止因过期星标插入池外孤儿行（如 Kimi）
    const ensureKeys = catalog.map((c) => c.vendor);
    // 未传 vendorUnitPrices 时不改采购价（只读参考场景）
    const vendorUnitPrices = mergeVendorPrices(
      existing.vendorUnitPrices,
      dto.vendorUnitPrices,
      ensureKeys,
    );
    const row = await this.prisma.platformBillingConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        sellPriceMultiplier: new Prisma.Decimal(sellPriceMultiplier),
        tokensPerAiCoin,
        aiCoinsPerYuan,
        welcomeGiftYuan: new Prisma.Decimal(welcomeGiftYuan),
        vendorUnitPrices,
        modelUnitPrices: modelUnitPrices,
        updatedByUserId: actor.id,
      },
      update: {
        sellPriceMultiplier: new Prisma.Decimal(sellPriceMultiplier),
        tokensPerAiCoin,
        aiCoinsPerYuan,
        welcomeGiftYuan: new Prisma.Decimal(welcomeGiftYuan),
        vendorUnitPrices,
        modelUnitPrices: modelUnitPrices,
        updatedByUserId: actor.id,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'billing_update_config',
        meta: {
          sellPriceMultiplier,
          tokensPerAiCoin,
          aiCoinsPerYuan,
          welcomeGiftYuan,
          vendorUnitPrices,
        modelUnitPrices: modelUnitPrices,
          preferredVendor,
          preferredModelRef: listed.preferred?.ref ?? null,
        },
      },
    });
    return await this.toConfigView(row);
  }

  async ensureConfig() {
    const existing = await this.prisma.platformBillingConfig.findUnique({ where: { id: CONFIG_ID } });
    if (existing) return existing;
    try {
      return await this.prisma.platformBillingConfig.create({
        data: {
          id: CONFIG_ID,
          sellPriceMultiplier: new Prisma.Decimal(DEFAULT_SELL_PRICE_MULTIPLIER),
          tokensPerAiCoin: DEFAULT_TOKENS_PER_AI_COIN,
          aiCoinsPerYuan: DEFAULT_AI_COINS_PER_YUAN,
          welcomeGiftYuan: new Prisma.Decimal(DEFAULT_WELCOME_GIFT_YUAN),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.platformBillingConfig.findUniqueOrThrow({ where: { id: CONFIG_ID } });
      }
      throw err;
    }
  }

  async toConfigView(row: {
    sellPriceMultiplier: Prisma.Decimal;
    tokensPerAiCoin: number;
    aiCoinsPerYuan: number;
    welcomeGiftYuan: Prisma.Decimal;
    vendorUnitPrices?: Prisma.JsonValue | null;
    modelUnitPrices?: Prisma.JsonValue | null;
    systemPriceCatalog?: Prisma.JsonValue | null;
    updatedAt: Date;
  }): Promise<BillingConfigView> {
    const listed = await this.resolveChatCatalog();
    const catalog = deriveVendorCatalog(listed.models as any);
    const preferredModelRef = listed.preferred?.ref ?? null;
    const preferredVendor = this.resolvePreferredVendor(listed as any);
    const suggestVendor = this.resolveSuggestVendor(listed as any, preferredVendor);
    const catalogEmpty = catalog.length === 0;
    const ensureKeys = catalogEmpty ? [] : catalog.map((c) => c.vendor);
    // 目录空时不 ensure 默认厂商；仅保留 DB 已存键供历史只读展示
    const vendorUnitPrices = mergeVendorPrices(row.vendorUnitPrices, undefined, ensureKeys);
    const historicalPricesOnly =
      catalogEmpty && Object.keys(vendorUnitPrices).some((k) => k && k !== 'other');
    const pricingVendors = buildPricingVendors(
      vendorUnitPrices,
      catalogEmpty ? [] : catalog,
      preferredVendor,
    );
    const sellPriceMultiplier = Number(row.sellPriceMultiplier);
    const storedPrices = await this.readSystemPrices();
    seedOfficialPriceCatalogue(storedPrices);
    const providers = await this.prisma.llmProvider.findMany({ select: { name: true, baseUrl: true } });
    const models = await Promise.all(listed.models.map(async model => {
      const price = await officialModelPrice(providers.find(p => p.name === model.providerName)?.baseUrl ?? null, model.modelId);
      return { ref: `${model.providerName}/${model.modelId}`, name: model.modelName, provider: model.providerName, price };
    }));
    await this.persistSystemPrices(storedPrices);
    return {
      modelUnitPrices: Object.fromEntries(models.filter(m => m.price).map(m => [m.ref, m.price!])),
      modelCatalog: models,
      sellPriceMultiplier,
      tokensPerAiCoin: Math.max(1, Math.floor(Number(row.tokensPerAiCoin) || DEFAULT_TOKENS_PER_AI_COIN)),
      aiCoinsPerYuan: row.aiCoinsPerYuan,
      welcomeGiftYuan: roundMoney2(Number(row.welcomeGiftYuan ?? DEFAULT_WELCOME_GIFT_YUAN)),
      suggestedAiCoinsPerYuan: 10000,
      vendorUnitPrices,
      pricingVendors,
      pricingModels: [],
      modelsSource: {
        dbPath: listed.dbPath,
        ...(listed.error ? { error: listed.error } : {}),
      },
      preferredModelRef,
      preferredVendor,
      suggestVendor,
      catalogEmpty,
      historicalPricesOnly,
      updatedAt: row.updatedAt.toISOString(),
    };
  }


  /** Capture prices before upstream execution so in-flight requests retain their agreed price. */
  async quoteModel(provider: string, model: string) {
    const row = await this.ensureConfig();
    if (row.aiCoinsPerYuan !== COINS_PER_YUAN) throw new BadRequestException('AI币面值转换尚未完成');
    const upstream = await this.prisma.llmProvider.findUnique({ where: { name: provider }, select: { baseUrl: true } });
    const storedPrices = await this.readSystemPrices();
    seedOfficialPriceCatalogue(storedPrices);
    const price = await officialModelPrice(upstream?.baseUrl ?? null, model);
    await this.persistSystemPrices(storedPrices);
    if (!price) throw new BadRequestException(`模型 ${provider}/${model} 暂无有效的系统参考价，暂不可用于企业计费`);
    return { ...modelPricingSnapshot(`${provider}/${model}`, { [`${provider}/${model}`]: price }, Number(row.sellPriceMultiplier), COINS_PER_YUAN),
      source: price.source, checkedAt: price.checkedAt, expiresAt: price.expiresAt, tier: price.tier,
      cacheWrite5m: price.cacheWrite5m, cacheWrite1h: price.cacheWrite1h };
  }

  /** Read the cache independently of generated scalar selections, including a development watcher opened before generation. */
  private async readSystemPrices(): Promise<unknown> {
    const [row] = await this.prisma.$queryRaw<Array<{ catalogue: Prisma.JsonValue | null }>>`
      SELECT system_price_catalog AS catalogue FROM platform_billing_config WHERE id = ${CONFIG_ID}`;
    return row?.catalogue;
  }

  private async persistSystemPrices(previous: unknown) {
    const catalogue = officialPriceCatalogue();
    if (JSON.stringify(previous) === JSON.stringify(catalogue)) return;
    await this.prisma.$executeRaw`UPDATE platform_billing_config SET system_price_catalog = ${JSON.stringify(catalogue)}::jsonb WHERE id = ${CONFIG_ID}`;
  }

  /**
   * 星标模型 → 厂商键。仅当 preferred 落在启用聊天目录内才标 ★；
   * 池外/过期星标不推断厂商（避免孤儿 Kimi 行与错误建议 N）。
   */
  private resolvePreferredVendor(listed: ReturnType<typeof listEnabledChatModels>): string | null {
    const preferred = listed.preferred;
    if (!preferred) return null;
    const matched = listed.models.find(
      (m) =>
        m.modelId === preferred.modelId &&
        (m.providerName === preferred.providerName ||
          m.providerName.toLowerCase() === preferred.providerName.toLowerCase()),
    );
    if (!matched) return null;
    const vendor = vendorKeyFromProviderName(matched.providerName);
    return vendor && vendor !== 'other' ? vendor : null;
  }

  /**
   * 建议 N 厂商：有效星标 → 否则 model_pool_order 排序后首个可用聊天模型厂商 → null。
   * listed.models 已按池序排好。
   */
  private resolveSuggestVendor(
    listed: ReturnType<typeof listEnabledChatModels>,
    preferredVendor: string | null,
  ): string | null {
    if (preferredVendor) return preferredVendor;
    const first = listed.models[0];
    if (!first) return null;
    const vendor = vendorKeyFromProviderName(first.providerName);
    return vendor && vendor !== 'other' ? vendor : null;
  }

  /**
   * 内置官网参考价（静态表）。MVP 不爬官网；失败由前端保留上次参考，不阻塞保存。
   */
  getReferencePrices(): {
    source: 'built-in';
    checkedAt: string;
    vendors: ReturnType<typeof listOfficialVendorReferences>;
  } {
    return {
      source: 'built-in',
      checkedAt: new Date().toISOString(),
      vendors: listOfficialVendorReferences(),
    };
  }


  /** Ground 有启用模型则优先；否则回落废弃 Octop sqlite（兼容过渡）。 */
  private async resolveChatCatalog(): Promise<{
    models: Array<{
      providerId: number | string;
      providerName: string;
      providerKind: string;
      modelId: string;
      modelName: string;
    }>;
    preferred: { ref: string; providerName: string; modelId: string } | null;
    dbPath: string;
    error?: string;
  }> {
    const ground = await this.llmProviders.listEnabledChatCatalog();
    if (ground.models.length > 0) {
      let preferred: { ref: string; providerName: string; modelId: string } | null = null;
      if (ground.preferredRef && ground.preferredRef.includes('/')) {
        const slash = ground.preferredRef.indexOf('/');
        preferred = {
          ref: ground.preferredRef,
          providerName: ground.preferredRef.slice(0, slash),
          modelId: ground.preferredRef.slice(slash + 1),
        };
      }
      return {
        models: ground.models,
        preferred,
        dbPath: 'ground:llm_provider',
      };
    }
    const listed = listEnabledChatModels();
    return {
      models: listed.models,
      preferred: listed.preferred,
      dbPath: listed.dbPath,
      ...(listed.error ? { error: listed.error } : {}),
    };
  }

  assertPlatformAdmin(actor: User) {
    this.requirePlatformAdmin(actor);
  }

  private requirePlatformAdmin(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可操作');
  }
}
