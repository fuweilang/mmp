import type { OctopEnabledChatModel } from './octop-providers.reader';
import type { PricingVendorCatalogEntry } from './billing.constants';
import { OFFICIAL_REF_VENDOR_PRICES } from './billing.constants';

export function slugVendorKey(raw: string): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return s;
}

/**
 * 将 provider/model 归类为稳定厂商键（deepseek / kimi / zhipu / other / slug）。
 * 对账与计价 UI 共用。
 */
export function classifyVendor(provider?: string | null, model?: string | null): string {
  const blob = `${provider || ''} ${model || ''}`.toLowerCase();
  if (blob.includes('deepseek')) return 'deepseek';
  if (blob.includes('kimi') || blob.includes('moonshot')) return 'kimi';
  if (blob.includes('zhipu') || blob.includes('智谱') || blob.includes('glm')) return 'zhipu';
  if (
    blob.includes('qwen') ||
    blob.includes('通义') ||
    blob.includes('千问') ||
    blob.includes('dashscope')
  ) {
    return 'qwen';
  }
  if (
    blob.includes('doubao') ||
    blob.includes('豆包') ||
    blob.includes('volc') ||
    blob.includes('火山')
  ) {
    return 'doubao';
  }
  if (blob.includes('minimax') || blob.includes('海螺')) return 'minimax';
  if (blob.includes('hunyuan') || blob.includes('混元')) return 'hunyuan';
  const fromProvider = slugVendorKey(provider || '');
  if (fromProvider) return fromProvider;
  const fromModel = slugVendorKey(model || '');
  if (fromModel) return fromModel;
  return 'other';
}

export function vendorKeyFromProviderName(providerName: string): string {
  return classifyVendor(providerName, '');
}

export function vendorDisplayLabel(vendor: string, providerName?: string): string {
  const ref = OFFICIAL_REF_VENDOR_PRICES[vendor];
  if (ref?.label) return ref.label;
  if (vendor === 'zhipu') {
    const name = (providerName || '').trim();
    if (!name || /^zhipu$/i.test(name) || name === '智谱') return '智谱';
    return name;
  }
  const name = (providerName || '').trim();
  if (name) return name;
  if (!vendor || vendor === 'other') return '其它';
  return vendor;
}

/** 从 Octop 已启用聊天模型推导厂商目录（按 provider 聚合）。 */
export function deriveVendorCatalog(models: OctopEnabledChatModel[]): PricingVendorCatalogEntry[] {
  const map = new Map<string, PricingVendorCatalogEntry>();
  for (const m of models) {
    const vendor = vendorKeyFromProviderName(m.providerName);
    if (!vendor || vendor === 'other') continue;
    let row = map.get(vendor);
    if (!row) {
      row = {
        vendor,
        label: vendorDisplayLabel(vendor, m.providerName),
        modelIds: [],
      };
      map.set(vendor, row);
    }
    if (!row.modelIds.includes(m.modelId)) row.modelIds.push(m.modelId);
  }
  const preferred = ['deepseek', 'kimi', 'zhipu', 'qwen', 'doubao', 'minimax', 'hunyuan'];
  const keys = [...map.keys()].sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  });
  return keys.map((k) => map.get(k)!);
}

