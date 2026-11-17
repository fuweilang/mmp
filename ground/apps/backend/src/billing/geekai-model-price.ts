/** Account prices from 极客智坊 domestic model detail. Never convert USD, and never apply discounts[]. */
import { createHash } from 'node:crypto';
import type { OfficialPrice } from './official-model-prices';

const DAY = 86_400_000;
const SOURCE = 'https://geekai.co/api/v1/models';
const cache = new Map<string, Extract<GeekAiModelLoad, { ok: true }>>();

export function clearGeekAiPriceCache(): void {
  cache.clear();
}

/** Domestic chat base only. The server calls this host; overseas geekai.dev is a different channel. */
export function geekAiChatBase(baseUrl: string | null | undefined): URL | null {
  let url: URL;
  try { url = new URL(baseUrl || ''); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return null;
  if (url.hostname !== 'geekai.co' || !['/api/v1', '/api/v1/'].includes(url.pathname)) return null;
  return url;
}

export function geekAiModelUrl(baseUrl: string | null | undefined, model: string): string | null {
  const base = geekAiChatBase(baseUrl);
  if (!base || !/^[\w.:+-]{1,128}$/.test(model)) return null;
  const root = base.pathname.endsWith('/') ? base.href : `${base.href}/`;
  return new URL(`models/${encodeURIComponent(model)}`, root).href;
}

export type GeekAiModelLoad =
  | { ok: true; modelId: string; price: OfficialPrice; contextWindow?: number; displayName?: string }
  | { ok: false; modelId: string; reason: string };

function finitePrice(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) return null;
  return value;
}

function detailBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const data = row.data;
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof (data as { id?: unknown }).id === 'string') {
    return data as Record<string, unknown>;
  }
  return row;
}

/** CNY per million tokens for a chat model. cache_read of 0 means cache hits cost the same as input. */
export function parseGeekAiModelDetail(modelId: string, body: unknown, now = new Date()): GeekAiModelLoad {
  const row = detailBody(body);
  if (!row) return { ok: false, modelId, reason: '极客智坊没有返回这个模型的价格' };
  if (row.type !== 'chat') return { ok: false, modelId, reason: '不是对话模型，不能用于聊天' };
  const raw = row.price;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, modelId, reason: '没有可用的输入或输出价格' };
  const price = raw as Record<string, unknown>;
  if (price.currency === 'USD') return { ok: false, modelId, reason: '标价是美元，不能按人民币计费' };
  if (price.currency !== 'CNY' || price.unit !== 'mtokens') return { ok: false, modelId, reason: '标价不是人民币/百万 tokens，不能用于企业计费' };
  const input = finitePrice(price.input, 1e6);
  const output = finitePrice(price.output, 1e6);
  if (input == null || output == null) return { ok: false, modelId, reason: '没有可用的输入或输出价格' };
  let cachedInput = input;
  if (price.cache_read != null && price.cache_read !== 0) {
    const cached = finitePrice(price.cache_read, input);
    if (cached == null) return { ok: false, modelId, reason: '缓存读取价格无效' };
    cachedInput = cached;
  }
  const context = row.context;
  const contextWindow = typeof context === 'number' && Number.isSafeInteger(context) && context >= 1024 && context <= 10_000_000
    ? context : undefined;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  return {
    ok: true,
    modelId,
    contextWindow,
    displayName: name && name.length <= 128 ? name : undefined,
    price: {
      source: SOURCE,
      input,
      output,
      cachedInput,
      checkedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DAY).toISOString(),
      tier: '账户价',
    },
  };
}

export async function loadGeekAiModel(providerName: string, baseUrl: string | null | undefined, model: string, apiKey: string, now = new Date()): Promise<GeekAiModelLoad> {
  const url = geekAiModelUrl(baseUrl, model);
  const key = apiKey.trim();
  if (!url || !key) return { ok: false, modelId: model, reason: '极客智坊地址或密钥不可用' };
  const cacheKey = `${providerName}\n${model}\n${createHash('sha256').update(key).digest('base64url').slice(0, 12)}`;
  const fresh = (hit: Extract<GeekAiModelLoad, { ok: true }> | undefined) =>
    hit && now.getTime() < Date.parse(hit.price.expiresAt) ? hit : undefined;
  const hit = fresh(cache.get(cacheKey));
  if (hit) return hit;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) return { ok: false, modelId: model, reason: '极客智坊没有接受这把密钥' };
    if (response.status === 404) return { ok: false, modelId: model, reason: '极客智坊没有这个模型' };
    if (!response.ok) return fresh(cache.get(cacheKey)) ?? { ok: false, modelId: model, reason: '极客智坊暂时没有返回价格' };
    const parsed = parseGeekAiModelDetail(model, await response.json(), now);
    if (parsed.ok) cache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return fresh(cache.get(cacheKey)) ?? { ok: false, modelId: model, reason: '极客智坊暂时没有返回价格' };
  }
}
