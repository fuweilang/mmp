/** Barrel: 保持既有 `from ./billing.shared` 导入兼容。 */
export {
  CONFIG_ID,
  DEFAULT_TOKENS_PER_AI_COIN,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  DEFAULT_AI_COINS_PER_YUAN,
  DEFAULT_WELCOME_GIFT_YUAN,
  OFFICIAL_REF_VENDOR_PRICES,
  OFFICIAL_REF_MODEL_PRICES,
  DEFAULT_VENDOR_UNIT_PRICES,
  LEGACY_VENDOR_UNIT_PRICES,
  PROVIDER_VENDOR_KEYS,
  NO_OFFICIAL_REF_HINT,
  listOfficialVendorReferences,
} from './billing.constants';
export type {
  VendorUnitPricePair,
  VendorUnitPrices,
  PricingVendorCatalogEntry,
  PricingVendorView,
  PricingModelView,
  BillingConfigView,
} from './billing.constants';
export {
  classifyVendor,
  vendorKeyFromProviderName,
  vendorDisplayLabel,
  deriveVendorCatalog,
} from './billing.vendor';
export {
  chargeCoins,
  yuanToAiCoins,
  roundMoney2,
  suggestAiCoinsPerYuan,
  parsePricePair,
  mergeVendorPrices,
  buildPricingVendors,
  resolveModelPrice,
  buildPricingModels,
  blendedYuanPer1mForModel,
} from './billing.pricing';
