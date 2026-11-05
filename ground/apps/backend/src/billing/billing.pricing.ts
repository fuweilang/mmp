import { Prisma } from '@prisma/client';
import type { OctopEnabledChatModel } from './octop-providers.reader';
import {
  DEFAULT_TOKENS_PER_AI_COIN,
  DEFAULT_VENDOR_UNIT_PRICES,
  NO_OFFICIAL_REF_HINT,
  OFFICIAL_REF_MODEL_PRICES,
  OFFICIAL_REF_VENDOR_PRICES,
  type PricingModelView,
  type PricingVendorCatalogEntry,
  type PricingVendorView,
  type VendorUnitPricePair,
  type VendorUnitPrices,
} from './billing.constants';
import { classifyVendor, slugVendorKey, vendorDisplayLabel, vendorKeyFromProviderName } from './billing.vendor';

/**
 * 对话扣费：floor(tokens / tokensPerAiCoin)；产品暂定 tokensPerAiCoin=1 → 1 AI币=1 token。
 * - tokens<=0 → 0
 * - tokens>0 但不足 1 币 → 至少扣 1（与 precheck「有用量则 required≥1」一致，避免零头白嫖）
 * - sellPriceMultiplier 不参与企业扣币（参数保留兼容，已忽略）
 */
export function chargeCoins(tokens: number, _multiplier?: number, tokensPerAiCoin?: number): number {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  if (t <= 0) return 0;
  const raw = Math.floor(Number(tokensPerAiCoin) || 0);
  const per = raw >= 1 ? raw : DEFAULT_TOKENS_PER_AI_COIN;
  return Math.max(1, Math.floor(t / per));
}

/** 充值入账：实付人民币 ×「1 元 = N AI币」→ 入账 AI币（向下取整）。售价倍率不参与。 */
export function yuanToAiCoins(amountYuan: number | string, aiCoinsPerYuan: number): number {
  const yuan = Number(amountYuan);
  const rate = Math.floor(Number(aiCoinsPerYuan) || 0);
  if (!(yuan > 0) || rate < 1) return 0;
  return new Prisma.Decimal(amountYuan).mul(rate).floor().toNumber();
}

/** 配置小数统一保留两位（售价倍率、采购单价）。 */
export function roundMoney2(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function midOfPair(pair: VendorUnitPricePair): number | null {
  const input = Number(pair.input);
  const output = Number(pair.output);
  if (!(input > 0) && !(output > 0)) return null;
  const vals = [input, output].filter((v) => Number.isFinite(v) && v >= 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * 按指定厂商采购 mid 估算充值 N（不对全厂商 / DeepSeek 取均值）：
 * mid = (input+output)/2；
 * suggestedN = floor(1e6 / mid)。
 * vendor 为空或该厂商无有效采购价 → 0。
 * 调用方传入的 vendor 优先级：有效星标 → model_pool_order 首个可用聊天模型厂商 → 不传（0）。
 * @param sellPriceMultiplier deprecated：兼容旧调用方，已忽略。
 * @param vendorOrLegacy 建议所用厂商键；数组视为无（旧 ignoredModelIds 兼容）。
 */
export function suggestAiCoinsPerYuan(
  prices: VendorUnitPrices | Record<string, VendorUnitPricePair>,
  _sellPriceMultiplier?: number,
  vendorOrLegacy?: string | string[] | null,
): number {
  const vendor =
    typeof vendorOrLegacy === 'string' ? vendorOrLegacy.trim() : '';
  if (!vendor) return 0;
  const pair = (prices || {})[vendor];
  if (!pair) return 0;
  const mid = midOfPair(pair);
  if (mid == null || !(mid > 0)) return 0;
  // 用 1e6/mid 避免 1/(mid/1e6) 浮点落到 199999.999…
  const n = Math.floor(1_000_000 / mid);
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

/** 解析 JSON 中的 {input,output} 对；非法则 null。 */
export function parsePricePair(raw: unknown): VendorUnitPricePair | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as { input?: unknown; output?: unknown };
  const input = Number(src.input);
  const output = Number(src.output);
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) return null;
  return { input, output };
}

function hintForPrice(
  kind: 'input' | 'output',
  pair: VendorUnitPricePair,
  ref?: (typeof OFFICIAL_REF_VENDOR_PRICES)[string],
): string {
  if (ref) return kind === 'input' ? ref.hintInput : ref.hintOutput;
  const v = kind === 'input' ? Number(pair.input) : Number(pair.output);
  if (Number.isFinite(v) && v > 0) {
    const label = kind === 'input' ? '提问' : '回复';
    return `按采购单价提醒：当前${label}价 ¥${roundMoney2(v)} / 100万 token`;
  }
  return NO_OFFICIAL_REF_HINT;
}

/**
 * 合并采购单价 → 厂商级动态键。
 * - 读库时旧 modelId 键按 classifyVendor 迁入对应厂商（已有厂商键优先）。
 * - patch 可写任意厂商键。
 * - ensureKeys 保证目录中的厂商至少有 {0,0} 或默认档。
 */
export function mergeVendorPrices(
  stored: Prisma.JsonValue | null | undefined,
  patch?: Record<string, { input: number; output: number } | undefined> | null,
  ensureKeys: string[] = [],
): VendorUnitPrices {
  const fromDb =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  const result: VendorUnitPrices = {};
  const legacyBuckets = new Map<string, VendorUnitPricePair[]>();

  for (const [key, raw] of Object.entries(fromDb)) {
    const pair = parsePricePair(raw);
    if (!pair) continue;
    if (key === 'deepseek' || key === 'kimi' || key === 'zhipu' || key === 'qwen' || key === 'doubao' || key === 'minimax' || key === 'hunyuan' || !key.includes('-')) {
      // 直接厂商键：无连字符的 slug，或已知键
      const vendor = key === 'deepseek' || key === 'kimi' || key === 'zhipu' || key === 'qwen' || key === 'doubao' || key === 'minimax' || key === 'hunyuan' ? key : classifyVendor(key, '');
      if (!result[vendor]) result[vendor] = pair;
      continue;
    }
    // 旧 modelId 键
    const vendor = classifyVendor('', key);
    if (vendor === 'other') continue;
    const list = legacyBuckets.get(vendor) || [];
    list.push(pair);
    legacyBuckets.set(vendor, list);
  }

  for (const [vendor, pairs] of legacyBuckets) {
    if (result[vendor]) continue;
    const input = pairs.reduce((s, p) => s + Number(p.input), 0) / pairs.length;
    const output = pairs.reduce((s, p) => s + Number(p.output), 0) / pairs.length;
    result[vendor] = { input, output };
  }

  if (patch && typeof patch === 'object') {
    for (const [key, raw] of Object.entries(patch)) {
      const pair = parsePricePair(raw);
      if (!pair) continue;
      const vendor = key === 'deepseek' || key === 'kimi' || key === 'zhipu' || key === 'qwen' || key === 'doubao' || key === 'minimax' || key === 'hunyuan' ? key : classifyVendor(key, '');
      if (vendor === 'other' && key) {
        result[slugVendorKey(key) || key] = pair;
      } else if (vendor !== 'other') {
        result[vendor] = pair;
      }
    }
  }

  // 空 ensureKeys = 不补默认厂商（避免目录空时静默塞 deepseek/kimi 假价）
  for (const key of ensureKeys) {
    if (!key || key === 'other') continue;
    if (result[key]) continue;
    result[key] = { input: 0, output: 0 };
  }

  const rounded: VendorUnitPrices = {};
  for (const [k, pair] of Object.entries(result)) {
    rounded[k] = {
      input: roundMoney2(pair.input),
      output: roundMoney2(pair.output),
    };
  }
  return rounded;
}

export function buildPricingVendors(
  prices: VendorUnitPrices,
  catalog?: PricingVendorCatalogEntry[] | null,
  preferredVendor?: string | null,
): PricingVendorView[] {
  const keys: string[] = [];
  const labels = new Map<string, string>();
  const preferred = (preferredVendor || '').trim();

  if (catalog && catalog.length) {
    for (const c of catalog) {
      if (!c.vendor || c.vendor === 'other') continue;
      if (!keys.includes(c.vendor)) keys.push(c.vendor);
      labels.set(c.vendor, c.label || vendorDisplayLabel(c.vendor));
    }
    // 不插入池外星标厂商（无孤儿行）；★ 仅在目录内命中时由 isPreferred 标记
  } else {
    // 目录空：仅展示已存历史单价键，不再静默补 deepseek/kimi
    for (const key of Object.keys(prices || {})) {
      if (!keys.includes(key) && key !== 'other') keys.push(key);
    }
  }

  return keys.map((vendor) => {
    const ref = OFFICIAL_REF_VENDOR_PRICES[vendor];
    const pair = prices[vendor] || { input: 0, output: 0 };
    return {
      vendor,
      label: labels.get(vendor) || vendorDisplayLabel(vendor),
      input: roundMoney2(pair.input),
      output: roundMoney2(pair.output),
      hintInput: hintForPrice('input', pair, ref),
      hintOutput: hintForPrice('output', pair, ref),
      hasOfficialRef: Boolean(ref),
      officialInput: ref ? ref.input : null,
      officialOutput: ref ? ref.output : null,
      isPreferred: Boolean(preferred && vendor === preferred),
    };
  });
}

/** @deprecated 计价已改为厂商级；保留供旧调用方 */
export function resolveModelPrice(
  modelId: string,
  prices: VendorUnitPrices,
): VendorUnitPricePair {
  const vendor = classifyVendor('', modelId);
  if (vendor !== 'other' && prices[vendor]) {
    const pair = prices[vendor];
    return { input: Number(pair.input) || 0, output: Number(pair.output) || 0 };
  }
  const ref = OFFICIAL_REF_MODEL_PRICES[modelId];
  if (ref) return { input: ref.input, output: ref.output };
  return { input: 0, output: 0 };
}

/** @deprecated */
export function buildPricingModels(
  models: OctopEnabledChatModel[],
  prices: VendorUnitPrices,
): PricingModelView[] {
  return models.map((m) => {
    const pair = resolveModelPrice(m.modelId, prices);
    const ref = OFFICIAL_REF_MODEL_PRICES[m.modelId];
    return {
      modelId: m.modelId,
      modelName: m.modelName,
      providerId: m.providerId,
      providerName: m.providerName,
      providerKind: m.providerKind,
      input: roundMoney2(pair.input),
      output: roundMoney2(pair.output),
      hintInput: ref?.hintInput || NO_OFFICIAL_REF_HINT,
      hintOutput: ref?.hintOutput || NO_OFFICIAL_REF_HINT,
      hasOfficialRef: Boolean(ref),
      officialInput: ref ? ref.input : null,
      officialOutput: ref ? ref.output : null,
    };
  });
}

/** 对账用：按厂商键均价。 */
export function blendedYuanPer1mForModel(
  model: string | null | undefined,
  provider: string | null | undefined,
  prices: VendorUnitPrices,
): number | null {
  const vendor = classifyVendor(provider, model);
  if (vendor !== 'other' && prices[vendor]) {
    return (Number(prices[vendor].input) + Number(prices[vendor].output)) / 2;
  }
  return null;
}

/** Display historic entries in today's fixed denomination without rewriting their original accounting values. */
export function ledgerCoinsAtCurrentRate(coins: number, meta: unknown): number {
  const data = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : {};
  const rate = Number(data.originalAiCoinsPerYuan ?? 10000);
  return new Prisma.Decimal(coins).mul(10000).div(Number.isFinite(rate) && rate > 0 ? rate : 10000).toNumber();
}
/** Only migration-generated metadata is cast; ordinary records already use the fixed denomination. */
export const currentLedgerCoinsSql = Prisma.sql`coins::numeric * 10000 / COALESCE((meta->>'originalAiCoinsPerYuan')::numeric, 10000)`;
