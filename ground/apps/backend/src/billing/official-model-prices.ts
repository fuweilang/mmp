/** RMB/MTok reference catalogue. Never infer a price from a provider display name. */
import type { ModelPurchasePrice } from './model-pricing';
export const COINS_PER_YUAN = 10_000;
const DAY = 86_400_000;
export type OfficialPrice = ModelPurchasePrice & {
  source: string; checkedAt: string; expiresAt: string; tier?: string;
  peak?: { input: number; output: number; cachedInput: number };
  cacheWrite5m?: number; cacheWrite1h?: number;
};
const DS = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const KIMI = 'https://platform.kimi.com/docs/pricing/chat';
const verified = '2026-11-04T00:00:00.000Z';
function reference(source: string, input: number, output: number, cachedInput: number): OfficialPrice {
  return { source, input, output, cachedInput, checkedAt: verified, expiresAt: new Date(Date.parse(verified) + 7 * DAY).toISOString() };
}
const bundled: Record<string, OfficialPrice> = {
  'deepseek-flash': { ...reference(DS, 1, 4, 0.02), peak: { input: 2, output: 8, cachedInput: 0.04 } },
  'deepseek-v4-pro': { ...reference(DS, 4.5, 13.5, 0.15), peak: { input: 9, output: 27, cachedInput: 0.3 } },
  'kimi-k3.1-pro': { ...reference(KIMI, 13, 68, 1.3), cacheWrite5m: 13, cacheWrite1h: 26 },
  'kimi-k3.1-pro-highspeed': { ...reference(KIMI, 26, 136, 1.3), cacheWrite5m: 26, cacheWrite1h: 52 },
  'kimi-k3': { ...reference(KIMI, 20, 100, 2), cacheWrite5m: 20, cacheWrite1h: 40 },
};
/** Official 2026 holiday schedule; weekends remain off-peak even when marked as make-up working days. */
const holidays2026 = [[1,1,3],[2,15,23],[4,4,6],[5,1,5],[6,19,21],[9,25,27],[10,1,7]];
export function deepseekPeak(now: Date): boolean | undefined {
  const local = new Date(now.getTime() + 8 * 3_600_000);
  if (local.getUTCFullYear() !== 2026) return undefined; // refuse an unknown holiday calendar
  const month = local.getUTCMonth() + 1, day = local.getUTCDate(), weekday = local.getUTCDay();
  if (weekday === 0 || weekday === 6 || holidays2026.some(([m,a,b]) => month === m && day >= a && day <= b)) return false;
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return (minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080);
}
function clean(html: string) { return html.replace(/<[^>]*>/g, '').replace(/\s+/g, '').replace(/&[^;]+;/g, ''); }
/** Fail closed on a changed official table rather than evaluating embedded JavaScript. */
export function parseOfficialPrices(source: string, html: string, now: Date): Record<string, OfficialPrice> {
  const found: Record<string, OfficialPrice> = {};
  const stamped = (p: OfficialPrice) => ({ ...p, checkedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * DAY).toISOString() });
  if (source === DS) {
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m =>
      [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(cell => clean(cell[1])));
    const table = rows.slice(0, 24);
    if (!table[0]?.[1]?.startsWith('deepseek-flash') || table[0]?.[2] !== 'deepseek-v4-pro') throw new Error('DeepSeek model columns changed');
    const start = table.findIndex(row => row.some(c => c.includes('缓存命中')) && row.some(c => c === '空闲时段'));
    const prices = table.slice(start, start + 6).map(row => row.filter(c => /^\d+(\.\d+)?元$/.test(c)).map(c => Number(c.slice(0,-1))));
    if (start < 0 || prices.length !== 6 || prices.some(row => row.length !== 2)) throw new Error('DeepSeek price table changed');
    for (const [i, id] of ['deepseek-flash','deepseek-v4-pro'].entries()) {
      found[id] = stamped({ ...reference(DS, prices[2][i], prices[4][i], prices[0][i]), peak: { input: prices[3][i], output: prices[5][i], cachedInput: prices[1][i] } });
    }
  } else if (source === KIMI) {
    // Mintlify includes the published MDX component props in its response. Read only numeric literal rows.
    for (const id of ['kimi-k3.1-pro','kimi-k3.1-pro-highspeed','kimi-k3']) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const row = html.match(new RegExp('children:`' + escaped + '`\\}\\),((?:`¥[0-9.]+ / MTok`,?){5})'));
      if (!row) throw new Error(`Kimi official price row unavailable: ${id}`);
      const p = [...row[1].matchAll(/¥([0-9.]+)/g)].map(m => Number(m[1]));
      found[id] = stamped({ ...reference(KIMI, p[0], p[1], p[2]), cacheWrite5m: p[3], cacheWrite1h: p[4] });
    }
  }
  for (const p of Object.values(found)) {
    if (![p.input,p.output,p.cachedInput,...Object.values(p.peak ?? {}), ...[p.cacheWrite5m,p.cacheWrite1h].filter(n => n != null)].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e6)) throw new Error('Invalid official price');
  }
  return found;
}
let catalogue = structuredClone(bundled), nextRefresh = 0;
let refreshing: Promise<void> | undefined;
/** 同一时刻只刷新一次；失败保留最近有效价格，次日再试。 */
export async function refreshOfficialPrices(now = new Date()): Promise<void> {
  if (now.getTime() < nextRefresh) return;
  refreshing ??= refresh(now).finally(() => { refreshing = undefined; });
  await refreshing;
}
async function refresh(now: Date) {
  await Promise.all([DS,KIMI].map(async source => {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(4000), redirect: 'error' });
      if (!response.ok) throw new Error('Official pricing unavailable');
      Object.assign(catalogue, parseOfficialPrices(source, await response.text(), now));
    } catch { /* Preserve last verified prices until their seven-day expiry. Never substitute zero. */ }
  }));
  nextRefresh = now.getTime() + DAY;
}
export async function officialModelPrice(baseUrl: string | null, model: string, now = new Date()): Promise<OfficialPrice | null> {
  let url: URL;
  try { url = new URL(baseUrl || ''); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const vendor = url.hostname === 'api.deepseek.com' && ['','/','/v1','/v1/'].includes(url.pathname) ? DS
    : url.hostname === 'api.moonshot.cn' && ['/v1','/v1/'].includes(url.pathname) ? KIMI : null;
  if (!vendor) return null;
  await refreshOfficialPrices(now);
  const alias = ['deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(model) ? 'deepseek-flash' : model;
  const price = catalogue[alias];
  if (!price || price.source !== vendor || now.getTime() >= Date.parse(price.expiresAt)) return null;
  if (price.peak) {
    const peak = deepseekPeak(now);
    if (peak === undefined) return null;
    return { ...price, ...(peak ? price.peak : {}), tier: peak ? '高峰时段' : '空闲时段' };
  }
  return { ...price, tier: '标准价' };
}

/** Reload verified raw tariffs after restart, retaining only known, valid reference records. */
export function seedOfficialPriceCatalogue(stored: unknown, now = new Date()): void {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
  for (const [id, value] of Object.entries(stored)) {
    if (!value || typeof value !== 'object' || !bundled[id]) continue;
    const p = value as OfficialPrice;
    const numbers = [p.input,p.output,p.cachedInput,...Object.values(p.peak ?? {}), ...[p.cacheWrite5m,p.cacheWrite1h].filter(n => n != null)];
    if (p.source !== bundled[id].source || numbers.some(n => typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1e6)
      || !Number.isFinite(Date.parse(p.checkedAt)) || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.checkedAt) > now.getTime()
      || Date.parse(p.expiresAt) <= now.getTime() || Date.parse(p.expiresAt) > Date.parse(p.checkedAt) + 7 * DAY) continue;
    if (Date.parse(p.checkedAt) > Date.parse(catalogue[id].checkedAt)) catalogue[id] = structuredClone(p);
  }
}
export function officialPriceCatalogue(): Record<string, OfficialPrice> { return structuredClone(catalogue); }
