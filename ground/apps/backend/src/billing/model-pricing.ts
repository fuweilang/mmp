/** Per-model RMB costs and auditable AI-coin settlement. Prices are RMB per million tokens. */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ModelPurchasePrice = {
  input: number;
  output: number;
  cachedInput?: number;
  multiplier?: number;
}
export type ModelPurchasePrices = Record<string, ModelPurchasePrice>;
export type ModelPricingSnapshot = {
  source?: string; checkedAt?: string; expiresAt?: string; tier?: string;
  cacheWrite5m?: number; cacheWrite1h?: number;
  version: 'model-cost-v1';
  modelRef: string;
  input: number;
  output: number;
  cachedInput: number;
  multiplier: number;
  aiCoinsPerYuan: number;
}

/** Validate the complete replacement map; omitted cached price uses the normal input price. */
export function parseModelPurchasePrices(value: unknown): ModelPurchasePrices {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('模型采购价必须为对象');
  const result: ModelPurchasePrices = {};
  for (const [ref, raw] of Object.entries(value)) {
    if (!ref.includes('/') || ref.length > 256 || typeof raw !== 'object' || !raw || Array.isArray(raw)) {
      throw new BadRequestException(`模型采购价无效：${ref}`);
    }
    const row = raw as Record<string, unknown>;
    const price: ModelPurchasePrice = { input: Number(row.input), output: Number(row.output) };
    for (const key of ['input', 'output', 'cachedInput', 'multiplier'] as const) {
      if ((key === 'cachedInput' || key === 'multiplier') && row[key] == null) continue;
      const n = Number(row[key]);
      if (typeof row[key] !== 'number' || !Number.isFinite(n) || n < (key === 'multiplier' ? 1 : 0) || n > 1_000_000) {
        throw new BadRequestException(`${ref} 的${key}无效（倍率至少为 1）`);
      }
      price[key] = n;
    }
    result[ref] = price;
  }
  return result;
}

/** Missing prices block billable requests rather than guessing a vendor average. */
export function modelPricingSnapshot(ref: string, prices: unknown, multiplier: number, aiCoinsPerYuan: number): ModelPricingSnapshot {
  const price = parseModelPurchasePrices(prices)[ref];
  if (!price) throw new BadRequestException(`模型 ${ref} 尚未配置采购价，请联系平台管理员`);
  if (!Number.isFinite(multiplier) || multiplier < 1 || !Number.isSafeInteger(aiCoinsPerYuan) || aiCoinsPerYuan < 1) {
    throw new BadRequestException('计价倍率或充值汇率无效');
  }
  return { version: 'model-cost-v1', modelRef: ref, input: price.input, output: price.output,
    cachedInput: price.cachedInput ?? price.input, multiplier: price.multiplier ?? multiplier, aiCoinsPerYuan };
}

/** Cached tokens are a subset of input, never an additional charge. Round once per settled request. */
export function settleModelPrice(snapshot: ModelPricingSnapshot, inputTokens: number, outputTokens: number, cachedInputTokens = 0, cacheWrite5mTokens = 0, cacheWrite1hTokens = 0) {
  if (![inputTokens, outputTokens, cachedInputTokens, cacheWrite5mTokens, cacheWrite1hTokens].every(n => Number.isSafeInteger(n) && n >= 0)
    || cachedInputTokens > inputTokens) throw new BadRequestException('输入、输出或缓存 Token 用量无效');
  if (cacheWrite5mTokens + cacheWrite1hTokens > inputTokens - cachedInputTokens) throw new BadRequestException('缓存写入用量超出未命中输入');
  if ((cacheWrite5mTokens > 0 && snapshot.cacheWrite5m == null) || (cacheWrite1hTokens > 0 && snapshot.cacheWrite1h == null)) throw new BadRequestException('缺少缓存写入价格');
  const cost = new Prisma.Decimal(inputTokens - cachedInputTokens).mul(snapshot.input)
    .plus(new Prisma.Decimal(cachedInputTokens).mul(snapshot.cachedInput))
    .plus(new Prisma.Decimal(outputTokens).mul(snapshot.output))
    .plus(new Prisma.Decimal(cacheWrite5mTokens).mul(snapshot.cacheWrite5m ?? 0))
    .plus(new Prisma.Decimal(cacheWrite1hTokens).mul(snapshot.cacheWrite1h ?? 0)).div(1_000_000);
  const sell = cost.mul(snapshot.multiplier);
  const coins = sell.mul(snapshot.aiCoinsPerYuan).ceil().toNumber();
  if (!Number.isSafeInteger(coins) || coins > 2_147_483_647) throw new BadRequestException('本次扣费超出支持范围');
  return { chargedCoins: coins, purchaseCostYuan: cost.toFixed(), sellAmountYuan: sell.toFixed(),
    inputTokens, outputTokens, cachedInputTokens, cacheWrite5mTokens, cacheWrite1hTokens, pricing: snapshot };
}
