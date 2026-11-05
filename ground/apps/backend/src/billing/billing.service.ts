import type { ModelPricingSnapshot } from './model-pricing';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AdjustWalletDto, ChargeBillingDto, ReportTokenUsageDto, UpdateBillingConfigDto } from './dto/billing.dto';
import { BillingConfigService } from './billing-config.service';
import { ChargeService } from './charge.service';
import type { FreezeDto, SettleFrozenDto } from './charge.service';
import { TokenStatsService } from './token-stats.service';
import { WalletService } from './wallet.service';
import {
  BillingConfigView,
  PricingModelView,
  PricingVendorView,
  VendorUnitPricePair,
  VendorUnitPrices,
  DEFAULT_AI_COINS_PER_YUAN,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  DEFAULT_TOKENS_PER_AI_COIN,
  DEFAULT_VENDOR_UNIT_PRICES,
  LEGACY_VENDOR_UNIT_PRICES,
  OFFICIAL_REF_MODEL_PRICES,
  OFFICIAL_REF_VENDOR_PRICES,
  blendedYuanPer1mForModel,
  buildPricingModels,
  buildPricingVendors,
  chargeCoins,
  classifyVendor,
  mergeVendorPrices,
  parsePricePair,
  resolveModelPrice,
  roundMoney2,
  suggestAiCoinsPerYuan,
  yuanToAiCoins,
} from './billing.shared';
import type { OctopEnabledChatModel } from './octop-providers.reader';
import type { TokenUsageSettlementMark } from './token-usage.service';

// Re-export public symbols previously exported from this file (compat).
export type {
  BillingConfigView,
  PricingModelView,
  PricingVendorView,
  VendorUnitPricePair,
  VendorUnitPrices,
};
export {
  DEFAULT_AI_COINS_PER_YUAN,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  DEFAULT_TOKENS_PER_AI_COIN,
  DEFAULT_VENDOR_UNIT_PRICES,
  LEGACY_VENDOR_UNIT_PRICES,
  OFFICIAL_REF_MODEL_PRICES,
  OFFICIAL_REF_VENDOR_PRICES,
};

/**
 * 薄门面：保持既有控制器 / 充值服务注入点不变。
 * 实现已拆到 BillingConfigService / WalletService / ChargeService / TokenStatsService。
 */
@Injectable()
export class BillingService {
  constructor(
    private config: BillingConfigService,
    private wallet: WalletService,
    private chargeSvc: ChargeService,
    private tokenStats: TokenStatsService,
  ) {}

  static chargeCoins(tokens: number, _multiplier?: number, tokensPerAiCoin?: number): number {
    return chargeCoins(tokens, _multiplier, tokensPerAiCoin);
  }

  static yuanToAiCoins(amountYuan: number | string, aiCoinsPerYuan: number): number {
    return yuanToAiCoins(amountYuan, aiCoinsPerYuan);
  }

  static roundMoney2(n: number): number {
    return roundMoney2(n);
  }

  static suggestAiCoinsPerYuan(
    prices: VendorUnitPrices | Record<string, VendorUnitPricePair>,
    sellPriceMultiplier: number,
    preferredVendor?: string | string[] | null,
  ): number {
    return suggestAiCoinsPerYuan(prices, sellPriceMultiplier, preferredVendor);
  }

  static parsePricePair(raw: unknown): VendorUnitPricePair | null {
    return parsePricePair(raw);
  }

  static mergeVendorPrices(
    stored: Prisma.JsonValue | null | undefined,
    patch?: Record<string, { input: number; output: number } | undefined> | null,
  ): VendorUnitPrices {
    return mergeVendorPrices(stored, patch);
  }

  static buildPricingVendors(prices: VendorUnitPrices): PricingVendorView[] {
    return buildPricingVendors(prices);
  }

  static resolveModelPrice(modelId: string, prices: VendorUnitPrices): VendorUnitPricePair {
    return resolveModelPrice(modelId, prices);
  }

  static buildPricingModels(
    models: OctopEnabledChatModel[],
    prices: VendorUnitPrices,
  ): PricingModelView[] {
    return buildPricingModels(models, prices);
  }

  static blendedYuanPer1mForModel(
    model: string | null | undefined,
    provider: string | null | undefined,
    prices: VendorUnitPrices,
  ): number | null {
    return blendedYuanPer1mForModel(model, provider, prices);
  }

  static classifyVendor(provider?: string | null, model?: string | null): string {
    return classifyVendor(provider, model);
  }

  getConfig(): Promise<BillingConfigView> {
    return this.config.getConfig();
  }

  updateConfig(actor: User, dto: UpdateBillingConfigDto): Promise<BillingConfigView> {
    return this.config.updateConfig(actor, dto);
  }

  getReferencePrices() {
    return this.config.getReferencePrices();
  }

  ensureWallet(tenantId: string) {
    return this.wallet.ensureWallet(tenantId);
  }

  listWallets(actor: User) {
    return this.wallet.listWallets(actor);
  }

  getWalletAdmin(actor: User, tenantId: string) {
    return this.wallet.getWalletAdmin(actor, tenantId);
  }

  async getPublicConfig() {
    const config = await this.config.getConfig();
    return { aiCoinsPerYuan: config.aiCoinsPerYuan, welcomeGiftYuan: config.welcomeGiftYuan,
      updatedAt: config.updatedAt, pricingMode: 'model-cost-v1' as const };
  }

  getWalletForTenant(user: User, tenantId: string | null) {
    return this.wallet.getWalletForTenant(user, tenantId);
  }

  adjustWallet(actor: User, dto: AdjustWalletDto) {
    return this.wallet.adjustWallet(actor, dto);
  }

  precheck(user: User, tenantId: string | null, estimatedTokens?: number) {
    return this.chargeSvc.precheck(user, tenantId, estimatedTokens);
  }

  quoteModel(provider: string, model: string) { return this.config.quoteModel(provider, model); }

  charge(user: User, tenantId: string | null, dto: ChargeBillingDto, snapshot?: ModelPricingSnapshot) {
    return this.chargeSvc.charge(user, tenantId, dto, snapshot);
  }

  freeze(user: User, tenantId: string | null, dto: FreezeDto) {
    return this.chargeSvc.freeze(user, tenantId, dto);
  }

  settleFrozen(user: User, tenantId: string | null, dto: SettleFrozenDto, snapshot: ModelPricingSnapshot) {
    return this.chargeSvc.settleFrozen(user, tenantId, dto, snapshot);
  }

  releaseFrozen(user: User, tenantId: string | null, dto: { freezeKey: string; unfreezeKey: string; reason: string }) {
    return this.chargeSvc.releaseFrozen(user, tenantId, dto);
  }

  creditQrTopup(
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
    return this.wallet.creditQrTopup(params, txClient);
  }

  listLedgers(params: {
    tenantId: string;
    from?: string;
    to?: string;
    actorUserId?: string;
    type?: string;
    types?: string[];
    take?: number;
    skip?: number;
  }) {
    return this.wallet.listLedgers(params);
  }

  countLedgers(params: {
    tenantId: string;
    from?: string;
    to?: string;
    actorUserId?: string;
    type?: string;
    types?: string[];
  }) {
    return this.wallet.countLedgers(params);
  }

  enterpriseFundsReport(
    actor: User,
    tenantId: string,
    opts?: { page?: number; pageSize?: number; ledgerType?: string },
  ) {
    return this.wallet.enterpriseFundsReport(actor, tenantId, opts);
  }

  estimateCoinsFromTokens(tokens: number, multiplier?: number, tokensPerAiCoin?: number) {
    return this.chargeSvc.estimateCoinsFromTokens(tokens, multiplier, tokensPerAiCoin);
  }

  assertPlatformAdmin(actor: User) {
    this.config.assertPlatformAdmin(actor);
  }

  usageReconcile(actor: User, query: { from?: string; to?: string; tenantId?: string }) {
    return this.tokenStats.usageReconcile(actor, query);
  }

  reportTokenUsage(user: User, tenantId: string | null, dto: ReportTokenUsageDto, meta?: Prisma.InputJsonObject) {
    return this.tokenStats.reportTokenUsage(user, tenantId, dto, meta);
  }

  markTokenUsageSettlement(idempotencyKey: string, mark: TokenUsageSettlementMark) {
    return this.tokenStats.markTokenUsageSettlement(idempotencyKey, mark);
  }

  enterpriseTokenStatsOverview(
    actor: User,
    query: { from?: string; to?: string; model?: string } = {},
  ) {
    return this.tokenStats.enterpriseTokenStatsOverview(actor, query);
  }

  enterpriseTokenStatsDetail(
    actor: User,
    query: { tenantId: string; from?: string; to?: string; model?: string },
  ) {
    return this.tokenStats.enterpriseTokenStatsDetail(actor, query);
  }


  consoleTenantTokenUsage(
    tenantId: string,
    query: {
      from?: string;
      to?: string;
      userId?: string;
      model?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.tokenStats.consoleTenantTokenUsage(tenantId, query);
  }
}
