import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  adminBillingApi,
  type BillingConfig,
  type PricingVendorRow,
  type VendorUnitPrices,
} from '@/api/admin';
import { ApiError } from '@/api/http';
import { FALLBACK_OFFICIAL, round2 } from './pricingHelpers';

export function useAdminPricingConfig() {
  const loading = ref(false);
  const savingConfig = ref(false);
  const refreshingRef = ref(false);
  const error = ref('');
  const modelsSourceHint = ref('');
  const config = ref<BillingConfig | null>(null);
  const pricingVendorMeta = ref<PricingVendorRow[]>([]);
  const catalogEmpty = ref(false);
  const historicalPricesOnly = ref(false);
  const preferredVendor = ref<string | null>(null);
  /** 建议 N 厂商：星标或池序首模 */
  const suggestVendor = ref<string | null>(null);
  const refCheckedAt = ref<string | null>(null);
  const refSource = ref<'built-in' | 'fallback' | null>(null);

  const configForm = reactive({
    sellPriceMultiplier: 1.5, // 遗留：不参与扣币/充值，保存时不改
    tokensPerAiCoin: 1, // 产品暂定锁 1
    aiCoinsPerYuan: 1000,
    welcomeGiftYuan: 5,
    vendorUnitPrices: {} as VendorUnitPrices,
  });

  const estimatedWelcomeGiftCoins = computed(() => {
    const yuan = Number(configForm.welcomeGiftYuan) || 0;
    const rate = Math.floor(Number(configForm.aiCoinsPerYuan) || 0);
    if (!(yuan > 0) || rate < 1) return 0;
    return Math.floor(yuan * rate);
  });

  function ensurePair(key: string) {
    if (!configForm.vendorUnitPrices[key]) {
      configForm.vendorUnitPrices[key] = { input: 0, output: 0 };
    }
    return configForm.vendorUnitPrices[key];
  }

  const vendorRows = computed(() => {
    return pricingVendorMeta.value.map((row) => {
      const pair = configForm.vendorUnitPrices[row.vendor] || { input: 0, output: 0 };
      const hintInput =
        row.hintInput ||
        (pair.input > 0
          ? `按采购单价提醒：当前提问价 ¥${round2(pair.input)} / 100万 token`
          : '暂无官网参考，请按采购单价手填');
      const hintOutput =
        row.hintOutput ||
        (pair.output > 0
          ? `按采购单价提醒：当前回复价 ¥${round2(pair.output)} / 100万 token`
          : '暂无官网参考，请按采购单价手填');
      const isPreferred = Boolean(
        row.isPreferred || (preferredVendor.value && row.vendor === preferredVendor.value),
      );
      return {
        key: row.vendor,
        label: row.label,
        hintInput,
        hintOutput,
        hasOfficialRef: row.hasOfficialRef,
        officialInput: row.officialInput,
        officialOutput: row.officialOutput,
        isPreferred,
      };
    });
  });

  const showCatalogEmpty = computed(
    () => catalogEmpty.value && !historicalPricesOnly.value && vendorRows.value.length === 0,
  );

  const officialRefCount = computed(
    () => vendorRows.value.filter((r) => r.hasOfficialRef && r.officialInput != null && r.officialOutput != null).length,
  );

  /**
   * 建议 N：suggestVendor（星标 → 池序首模）mid=(input+output)/2，
   * N = floor(1e6 / mid)。不对全厂商/DeepSeek 取均值。
   */
  const suggestedAiCoinsPerYuan = computed(() => {
    const vendor = suggestVendor.value;
    if (!vendor) return 0;
    const pair = configForm.vendorUnitPrices[vendor];
    if (!pair) return 0;
    const input = Number(pair.input);
    const output = Number(pair.output);
    if (!(input > 0) && !(output > 0)) return 0;
    const vals = [input, output].filter((v) => Number.isFinite(v) && v >= 0);
    if (!vals.length) return 0;
    const mid = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!(mid > 0)) return 0;
    const n = Math.floor(1_000_000 / mid);
    return Number.isFinite(n) && n >= 1 ? n : 0;
  });

  const canApplySuggested = computed(() => suggestedAiCoinsPerYuan.value >= 1);


  function syncFormPrices(
    stored?: VendorUnitPrices | null,
    vendors?: BillingConfig['pricingVendors'],
    opts?: {
      catalogEmpty?: boolean;
      historicalPricesOnly?: boolean;
      preferredVendor?: string | null;
      suggestVendor?: string | null;
    },
  ) {
    catalogEmpty.value = Boolean(opts?.catalogEmpty);
    historicalPricesOnly.value = Boolean(opts?.historicalPricesOnly);
    preferredVendor.value = opts?.preferredVendor ?? null;
    suggestVendor.value = opts?.suggestVendor ?? null;

    const vendorList = Array.isArray(vendors) ? vendors : [];
    pricingVendorMeta.value = vendorList.map((row) => ({ ...row }));

    const next: VendorUnitPrices = {};
    for (const row of vendorList) {
      const fromStored = stored?.[row.vendor];
      next[row.vendor] = {
        input: round2(Number(fromStored?.input ?? row.input) || 0),
        output: round2(Number(fromStored?.output ?? row.output) || 0),
      };
    }
    // 历史模式：保留未列在 vendors 但 DB 有的键（后端一般已放入 vendors）
    if (stored && (opts?.historicalPricesOnly || !vendorList.length)) {
      for (const [key, pair] of Object.entries(stored)) {
        if (next[key] || !pair) continue;
        next[key] = {
          input: round2(Number(pair.input) || 0),
          output: round2(Number(pair.output) || 0),
        };
        if (!pricingVendorMeta.value.some((r) => r.vendor === key)) {
          const fb = FALLBACK_OFFICIAL[key];
          pricingVendorMeta.value.push({
            vendor: key,
            label: fb?.label || key,
            input: next[key].input,
            output: next[key].output,
            hintInput: fb?.hintInput || '历史采购单价',
            hintOutput: fb?.hintOutput || '历史采购单价',
            hasOfficialRef: Boolean(fb),
            officialInput: fb?.officialInput ?? null,
            officialOutput: fb?.officialOutput ?? null,
            isPreferred: preferredVendor.value === key,
          });
        }
      }
    }

    for (const key of Object.keys(configForm.vendorUnitPrices)) {
      if (!(key in next)) delete configForm.vendorUnitPrices[key];
    }
    for (const [key, pair] of Object.entries(next)) {
      configForm.vendorUnitPrices[key] = { ...pair };
    }
  }

  /** 只更新参考元数据 / hint，不改动已填采购价 */
  function applyReferenceMeta(
    vendors: Array<{
      vendor: string;
      label: string;
      input: number;
      output: number;
      hintInput: string;
      hintOutput: string;
    }>,
  ) {
    const byVendor = new Map(vendors.map((v) => [v.vendor, v]));
    pricingVendorMeta.value = pricingVendorMeta.value.map((row) => {
      const ref = byVendor.get(row.vendor);
      if (!ref) return row;
      return {
        ...row,
        label: row.label || ref.label,
        hintInput: ref.hintInput,
        hintOutput: ref.hintOutput,
        hasOfficialRef: true,
        officialInput: ref.input,
        officialOutput: ref.output,
      };
    });
  }

  function applyOfficialRef(vendorKey: string) {
    if (historicalPricesOnly.value) {
      ElMessage.warning('目录为空，历史单价只读；请先启用模型');
      return;
    }
    const row = vendorRows.value.find((r) => r.key === vendorKey);
    if (!row?.hasOfficialRef || row.officialInput == null || row.officialOutput == null) {
      ElMessage.warning('该厂商暂无官网参考，请手填采购价');
      return;
    }
    configForm.vendorUnitPrices[vendorKey] = {
      input: round2(Number(row.officialInput) || 0),
      output: round2(Number(row.officialOutput) || 0),
    };
    ElMessage.success(`已将 ${row.label} 参考价填入提问/回复（未保存）`);
  }

  function fillOfficialRefPrices() {
    if (historicalPricesOnly.value) {
      ElMessage.warning('目录为空，历史单价只读；请先启用模型');
      return;
    }
    let filled = 0;
    for (const row of vendorRows.value) {
      if (!row.hasOfficialRef || row.officialInput == null || row.officialOutput == null) continue;
      configForm.vendorUnitPrices[row.key] = {
        input: round2(Number(row.officialInput) || 0),
        output: round2(Number(row.officialOutput) || 0),
      };
      filled += 1;
    }
    if (!filled) {
      ElMessage.warning('当前同步厂商暂无官网参考价可填（新厂商请手填采购价）');
      return;
    }
    if (!configForm.aiCoinsPerYuan || configForm.aiCoinsPerYuan < 1) {
      void applySuggestedN(false, false);
    }
    ElMessage.success(`已填 ${filled} 个厂商官网参考价（未保存，请点保存）`);
  }

  async function applySuggestedN(toast: boolean = true, save: boolean = true) {
    const n = suggestedAiCoinsPerYuan.value;
    if (!n) {
      if (toast) ElMessage.warning('需要星标厂商且填写有效采购单价后才有建议 N');
      return;
    }
    configForm.aiCoinsPerYuan = n;
    if (save) {
      await saveConfig();
    } else if (toast) {
      ElMessage.success(`已写入建议汇率 N = ${n.toLocaleString('zh-CN')}（未保存）`);
    }
  }

  async function refreshReferences() {
    refreshingRef.value = true;
    try {
      const res = await adminBillingApi.getReferencePrices();
      applyReferenceMeta(res.vendors || []);
      refCheckedAt.value = res.checkedAt || new Date().toISOString();
      refSource.value = 'built-in';
      ElMessage.success(`已刷新内置参考（${(res.vendors || []).length} 家），未改动已填采购价`);
    } catch (e) {
      ElMessage.warning(
        e instanceof ApiError
          ? `刷新参考失败，已保留上次：${e.message}`
          : '刷新参考失败，已保留上次参考；仍可保存采购价',
      );
    } finally {
      refreshingRef.value = false;
    }
  }

  async function reload() {
    loading.value = true;
    error.value = '';
    modelsSourceHint.value = '';
    try {
      const cfg = await adminBillingApi.getConfig();
      config.value = cfg;
      configForm.sellPriceMultiplier = round2(cfg.sellPriceMultiplier);
      // 产品暂定锁 1：展示与保存均强制 1，与 charge/precheck 口径一致
      configForm.tokensPerAiCoin = 1;
      const loadedN = Math.floor(Number(cfg.aiCoinsPerYuan) || 0);
      configForm.aiCoinsPerYuan = loadedN >= 1 ? loadedN : 1;
      const loadedGift = Number(cfg.welcomeGiftYuan);
      configForm.welcomeGiftYuan =
        Number.isFinite(loadedGift) && loadedGift >= 0 ? round2(loadedGift) : 5;
      syncFormPrices(cfg.vendorUnitPrices, cfg.pricingVendors, {
        catalogEmpty: Boolean(cfg.catalogEmpty),
        historicalPricesOnly: Boolean(cfg.historicalPricesOnly),
        preferredVendor: cfg.preferredVendor ?? null,
        suggestVendor: cfg.suggestVendor ?? null,
      });
      if (cfg.modelsSource?.error) {
        modelsSourceHint.value = `模型目录读取异常：${cfg.modelsSource.error}（仍可手改充值 N / 开户赠送）`;
      } else if (cfg.catalogEmpty && !cfg.historicalPricesOnly) {
        modelsSourceHint.value = '模型目录为空：Octop 已废弃，模型目录待 猛犸专家 / 中台配置；无 octop.db 时为空';
      } else if (cfg.historicalPricesOnly) {
        modelsSourceHint.value = '目录空，以下为历史单价（只读）';
      }
      // 静默带出参考时间戳；失败不影响主加载
      try {
        const res = await adminBillingApi.getReferencePrices();
        applyReferenceMeta(res.vendors || []);
        refCheckedAt.value = res.checkedAt || null;
        refSource.value = 'built-in';
      } catch {
        refSource.value = refSource.value || 'fallback';
      }
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : '加载失败';
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig() {
    savingConfig.value = true;
    try {
      // 主路径只写：tokensPerAiCoin=1、aiCoinsPerYuan、welcomeGiftYuan
      // 不传 sellPriceMultiplier / vendorUnitPrices → 后端保留库内值
      const body = {
        tokensPerAiCoin: 1,
        aiCoinsPerYuan: Math.floor(Number(configForm.aiCoinsPerYuan) || 1),
        welcomeGiftYuan: round2(Math.max(0, Number(configForm.welcomeGiftYuan) || 0)),
      };
      config.value = await adminBillingApi.updateConfig(body);
      configForm.tokensPerAiCoin = 1;
      const savedN = Math.floor(Number(config.value.aiCoinsPerYuan) || 0);
      configForm.aiCoinsPerYuan = savedN >= 1 ? savedN : body.aiCoinsPerYuan;
      const savedGift = Number(config.value.welcomeGiftYuan);
      configForm.welcomeGiftYuan =
        Number.isFinite(savedGift) && savedGift >= 0 ? round2(savedGift) : body.welcomeGiftYuan;
      if (config.value.sellPriceMultiplier != null) {
        configForm.sellPriceMultiplier = round2(config.value.sellPriceMultiplier);
      }
      syncFormPrices(config.value.vendorUnitPrices, config.value.pricingVendors, {
        catalogEmpty: Boolean(config.value.catalogEmpty),
        historicalPricesOnly: Boolean(config.value.historicalPricesOnly),
        preferredVendor: config.value.preferredVendor ?? null,
        suggestVendor: config.value.suggestVendor ?? null,
      });
      ElMessage.success('AI币计价配置已保存');
    } catch (e) {
      ElMessage.error(e instanceof ApiError ? e.message : '保存失败');
    } finally {
      savingConfig.value = false;
    }
  }

  onMounted(reload);
  return {
    loading,
    savingConfig,
    refreshingRef,
    error,
    modelsSourceHint,
    config,
    historicalPricesOnly,
    configForm,
    estimatedWelcomeGiftCoins,
    ensurePair,
    vendorRows,
    showCatalogEmpty,
    officialRefCount,
    suggestedAiCoinsPerYuan,
    canApplySuggested,
    applyOfficialRef,
    fillOfficialRefPrices,
    applySuggestedN,
    refreshReferences,
    reload,
    saveConfig,
  };
}
