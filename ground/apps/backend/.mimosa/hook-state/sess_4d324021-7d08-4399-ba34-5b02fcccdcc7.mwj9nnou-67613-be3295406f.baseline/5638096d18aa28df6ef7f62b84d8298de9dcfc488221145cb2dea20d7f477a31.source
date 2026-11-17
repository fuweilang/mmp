export const CONFIG_ID = 'default';
export const DEFAULT_TOKENS_PER_AI_COIN = 1; // 遗留 Token 计价兼容字段；模型成本计价不使用。
export const DEFAULT_SELL_PRICE_MULTIPLIER = 1.5;
export const DEFAULT_AI_COINS_PER_YUAN = 10000; // 固定货币面值；旧面额由迁移等值转换。
/** 新企业开户赠送默认金额（元）；0 = 关闭赠送 */
export const DEFAULT_WELCOME_GIFT_YUAN = 5;

/**
 * 有官网参考的厂商价（元 / 100万 token）。内置静态表；可选「刷新参考」重读本表（MVP 不爬官网）。未列厂商由 Octop models 同步出空槽，手填或待补参考。
 * 核对 2026-11-01；不接厂商 Admin API。模型启停仍在 /agent/admin/models。
 */
export const OFFICIAL_REF_VENDOR_PRICES: Record<
  string,
  { input: number; output: number; hintInput: string; hintOutput: string; label: string }
> = {
  deepseek: {
    input: 2,
    output: 8,
    label: 'DeepSeek',
    hintInput: '参考约 ¥2（$0.3×7 · flash 高峰）',
    hintOutput: '参考约 ¥8（$1.2×7 · flash 高峰）',
  },
  kimi: {
    input: 13,
    output: 68,
    label: 'Kimi',
    hintInput: '官网参考 ¥13（kimi-k3.1-pro）',
    hintOutput: '官网参考 ¥68（kimi-k3.1-pro）',
  },
  // 智谱旗舰 GLM-5.3 公开牌价（docs.bigmodel.cn，核对 2026-10-31）；仅粗算参考
  zhipu: {
    input: 8,
    output: 28,
    label: '智谱',
    hintInput: '官网参考 ¥8（GLM-5.3）',
    hintOutput: '官网参考 ¥28（GLM-5.3）',
  },
  // 通义：按当前启用档 qwen3.8-flash（百炼北京，核对 2026-11-01）；厂商级粗算
  qwen: {
    input: 0.8,
    output: 2.7,
    label: '通义千问',
    hintInput: '官网参考 ¥0.8（qwen3.8-flash）',
    hintOutput: '官网参考 ¥2.7（qwen3.8-flash）',
  },
  // 豆包：均衡档 seed-2.1-turbo（火山方舟，核对 2026-11-01）
  doubao: {
    input: 3,
    output: 15,
    label: '豆包',
    hintInput: '官网参考 ¥3（doubao-seed-2.1-turbo）',
    hintOutput: '官网参考 ¥15（doubao-seed-2.1-turbo）',
  },
  // MiniMax：M3 ≤512K 五折执行价（platform.minimax.cn，核对 2026-11-01）
  minimax: {
    input: 2.1,
    output: 8.4,
    label: 'MiniMax',
    hintInput: '官网参考 ¥2.1（M3 ≤512K 五折）',
    hintOutput: '官网参考 ¥8.4（M3 ≤512K 五折）',
  },
  // 混元：Hy3 腰部主力（腾讯云 TokenHub，核对 2026-11-01）
  hunyuan: {
    input: 1,
    output: 4,
    label: '混元',
    hintInput: '官网参考 ¥1（Hy3 · TokenHub）',
    hintOutput: '官网参考 ¥4（Hy3 · TokenHub）',
  },
};

/** @deprecated 兼容旧按 modelId 参考图；迁移/对账回退用 */
export const OFFICIAL_REF_MODEL_PRICES: Record<
  string,
  { input: number; output: number; hintInput: string; hintOutput: string }
> = {
  'deepseek-flash': {
    input: 2,
    output: 8,
    hintInput: OFFICIAL_REF_VENDOR_PRICES.deepseek.hintInput,
    hintOutput: OFFICIAL_REF_VENDOR_PRICES.deepseek.hintOutput,
  },
  'deepseek-v4-flash': {
    input: 2,
    output: 8,
    hintInput: OFFICIAL_REF_VENDOR_PRICES.deepseek.hintInput,
    hintOutput: OFFICIAL_REF_VENDOR_PRICES.deepseek.hintOutput,
  },
  'kimi-k3.1-pro': {
    input: 13,
    output: 68,
    hintInput: OFFICIAL_REF_VENDOR_PRICES.kimi.hintInput,
    hintOutput: OFFICIAL_REF_VENDOR_PRICES.kimi.hintOutput,
  },
  'kimi-k3.1-pro-highspeed': {
    input: 13,
    output: 68,
    hintInput: OFFICIAL_REF_VENDOR_PRICES.kimi.hintInput,
    hintOutput: OFFICIAL_REF_VENDOR_PRICES.kimi.hintOutput,
  },
};

export type VendorUnitPricePair = { input: number; output: number };
/** 厂商级采购单价（动态键：deepseek / kimi / zhipu / …），单位 ¥/1M tokens */
export type VendorUnitPrices = Record<string, VendorUnitPricePair>;

export const DEFAULT_VENDOR_UNIT_PRICES: Record<string, VendorUnitPricePair> = {
  deepseek: {
    input: OFFICIAL_REF_VENDOR_PRICES.deepseek.input,
    output: OFFICIAL_REF_VENDOR_PRICES.deepseek.output,
  },
  kimi: {
    input: OFFICIAL_REF_VENDOR_PRICES.kimi.input,
    output: OFFICIAL_REF_VENDOR_PRICES.kimi.output,
  },
  zhipu: {
    input: OFFICIAL_REF_VENDOR_PRICES.zhipu.input,
    output: OFFICIAL_REF_VENDOR_PRICES.zhipu.output,
  },
  qwen: {
    input: OFFICIAL_REF_VENDOR_PRICES.qwen.input,
    output: OFFICIAL_REF_VENDOR_PRICES.qwen.output,
  },
  doubao: {
    input: OFFICIAL_REF_VENDOR_PRICES.doubao.input,
    output: OFFICIAL_REF_VENDOR_PRICES.doubao.output,
  },
  minimax: {
    input: OFFICIAL_REF_VENDOR_PRICES.minimax.input,
    output: OFFICIAL_REF_VENDOR_PRICES.minimax.output,
  },
  hunyuan: {
    input: OFFICIAL_REF_VENDOR_PRICES.hunyuan.input,
    output: OFFICIAL_REF_VENDOR_PRICES.hunyuan.output,
  },
};

/** @deprecated 同 DEFAULT_VENDOR_UNIT_PRICES */
export const LEGACY_VENDOR_UNIT_PRICES = DEFAULT_VENDOR_UNIT_PRICES;

export type PricingVendorCatalogEntry = {
  vendor: string;
  label: string;
  modelIds: string[];
};

export type PricingVendorView = {
  vendor: string;
  label: string;
  input: number;
  output: number;
  hintInput: string;
  hintOutput: string;
  hasOfficialRef: boolean;
  officialInput: number | null;
  officialOutput: number | null;
  /** 是否为 ActiveModelPool 星标模型所属厂商 */
  isPreferred?: boolean;
};

/** @deprecated 旧按 model 行；API 仍可返回空数组，计价页已改为厂商级 */
export type PricingModelView = {
  modelId: string;
  modelName: string;
  providerId: number;
  providerName: string;
  providerKind: string;
  input: number;
  output: number;
  hintInput: string;
  hintOutput: string;
  hasOfficialRef: boolean;
  officialInput: number | null;
  officialOutput: number | null;
};

export type BillingConfigView = {
  modelUnitPrices: import('./model-pricing').ModelPurchasePrices;
  modelCatalog: Array<{ ref: string; name: string; provider: string; price?: import('./official-model-prices').OfficialPrice | null }>;

  /** 默认售价倍率；每个模型可单独覆盖。 */
  sellPriceMultiplier: number;
  /** 遗留兼容字段，不参与当前模型成本计费。 */
  tokensPerAiCoin: number;
  aiCoinsPerYuan: number;
  /**
   * 新企业开户赠送金额（元）。0 = 不赠送。
   * giftCoins = floor(welcomeGiftYuan * aiCoinsPerYuan)
   */
  welcomeGiftYuan: number;
  /**
   * 建议充值 N：有效星标厂商 mid → 否则 model_pool_order 首个可用聊天模型厂商 mid → 否则 0。
   * 不对全厂商 / DeepSeek 取均值。
   */
  suggestedAiCoinsPerYuan: number;
  vendorUnitPrices: VendorUnitPrices;
  /** 厂商级档位：来自 Octop /agent/admin/models 已启用聊天厂商；目录空时可为历史单价 */
  pricingVendors: PricingVendorView[];
  /** 兼容旧前端：恒为空数组；模型列表仍在 /agent/admin/models */
  pricingModels: PricingModelView[];
  modelsSource: { dbPath: string; error?: string };
  /** ActiveModelPool 星标 preferred_model（provider/model） */
  preferredModelRef: string | null;
  /** 星标模型映射到的厂商键；无有效星标为 null（★ 徽章用） */
  preferredVendor: string | null;
  /**
   * 建议 N 所用厂商键：有效星标厂商，否则池序首个可用聊天模型厂商，否则 null。
   * 前端改价时本地重算建议 N 用此键。
   */
  suggestVendor: string | null;
  /** Octop 已启用聊天目录为空 */
  catalogEmpty: boolean;
  /** 目录空但仍返回 DB 历史单价（只读展示） */
  historicalPricesOnly: boolean;
  updatedAt: string;
};

/** 历史核心厂商；新厂商由 Octop catalog 同步追加 */
export const PROVIDER_VENDOR_KEYS = ['deepseek', 'kimi'] as const;
export const NO_OFFICIAL_REF_HINT = '暂无官网参考，请按采购单价手填';

/** 内置官网参考快照（MVP 静态；刷新接口直接返回此表，失败时前端保留上次）。 */
export function listOfficialVendorReferences(): Array<{
  vendor: string;
  label: string;
  input: number;
  output: number;
  hintInput: string;
  hintOutput: string;
}> {
  return Object.entries(OFFICIAL_REF_VENDOR_PRICES).map(([vendor, ref]) => ({
    vendor,
    label: ref.label,
    input: ref.input,
    output: ref.output,
    hintInput: ref.hintInput,
    hintOutput: ref.hintOutput,
  }));
}

