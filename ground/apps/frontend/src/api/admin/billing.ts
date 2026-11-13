import { adminHttp } from '../http';

export type VendorUnitPricePair = { input: number; output: number };
/** 厂商级采购单价（动态键：deepseek / kimi / zhipu / …），元/100万 token */
export type VendorUnitPrices = Record<string, VendorUnitPricePair>;

export type PricingVendorRow = {
  vendor: string;
  label: string;
  input: number;
  output: number;
  hintInput: string;
  hintOutput: string;
  hasOfficialRef: boolean;
  officialInput: number | null;
  officialOutput: number | null;
  /** ActiveModelPool 星标所属厂商 */
  isPreferred?: boolean;
};

/** @deprecated 计价已改为厂商级；兼容旧字段 */
export type PricingModelRow = {
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

export type ModelPurchasePrice = { input: number; output: number; cachedInput?: number; multiplier?: number };
export type BillingConfig = {
  modelUnitPrices: Record<string, ModelPurchasePrice>;
  modelCatalog: Array<{ ref: string; name: string; provider: string; price?: { input: number; output: number; cachedInput?: number; source: string; checkedAt: string; expiresAt: string; tier?: string; cacheWrite5m?: number; cacheWrite1h?: number } | null }>;

  sellPriceMultiplier: number;
  /** 遗留兼容字段；当前不固定 AI币与 Token 的比例。 */
  tokensPerAiCoin: number;
  aiCoinsPerYuan: number;
  /** 新企业开户赠送金额（元）；0 = 不赠送 */
  welcomeGiftYuan?: number;
  /** 星标厂商 mid → 否则池序首模厂商 mid → 否则 0；不对全厂商取均值 */
  suggestedAiCoinsPerYuan?: number;
  vendorUnitPrices: VendorUnitPrices;
  pricingVendors: PricingVendorRow[];
  /** 兼容：恒为空或忽略；原 /agent/admin/models（Octop）已废弃 */
  pricingModels?: PricingModelRow[];
  modelsSource: { dbPath: string; error?: string };
  preferredModelRef?: string | null;
  preferredVendor?: string | null;
  /** 建议 N 所用厂商；前端改价本地重算 */
  suggestVendor?: string | null;
  catalogEmpty?: boolean;
  historicalPricesOnly?: boolean;
  updatedAt: string;
};

export type UsageReconcileReport = {
  source: string;
  assumption: string;
  disclaimer: string;
  range: { from: string | null; to: string | null; tenantId: string | null };
  config: {
    sellPriceMultiplier: number;
    tokensPerAiCoin?: number;
    vendorUnitPrices: VendorUnitPrices;
  };
  totals: { tokens: number; coins: number; turns: number; estimatedCostYuan: number };
  byVendor: Array<{
    vendor: string;
    tokens: number;
    coins: number;
    turns: number;
    estimatedCostYuan: number;
    blendedYuanPer1m: number | null;
  }>;
  byModel: Array<{
    vendor: string;
    provider: string;
    model: string;
    tokens: number;
    coins: number;
    turns: number;
  }>;
  octopHint: { path: string; api: string; note: string };
};

export type EnterpriseTokenStatsEnterprise = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantType: string;
  tenantStatus: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  modelCalls: number;
  memberCount: number;
  /** 当前钱包 AI币余额快照，与筛选时段无关 */
  balanceAiCoins: number;
  /** 时段内 chat_consume 实扣 AI币 */
  consumedAiCoins: number;
  /** 时段内 chat_consume ledger.tokens 合计 */
  ledgerTokens?: number;
};

export type EnterpriseTokenStatsOverview = {
  source: string;
  dbPath: string;
  range: {
    from: string | null;
    to: string | null;
    startUnix: number;
    endUnix: number;
    timezone: string;
  };
  model: string | null;
  /** 筛选项 = Octop 已启用聊天目录 ∪ 时段用量模型 */
  models: string[];
  /** 有用量但不在当前目录中的模型（可标「已下线」） */
  offlineModels?: string[];
  modelsSource?: { dbPath: string | null; error?: string };
  tokensPerAiCoin?: number;
  aiCoinSource?: 'ledger_chat_consume' | string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    turns: number;
    modelCalls: number;
    consumedAiCoins?: number;
    ledgerTokens?: number;
  };
  byModel: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    turns: number;
    consumedAiCoins?: number;
  }>;
  enterprises: EnterpriseTokenStatsEnterprise[];
  related: { ledgerUsagePath: string; note: string };
};

export type EnterpriseTokenStatsDetail = {
  source: string;
  tenant: { id: string; name: string; slug: string; type: string; status: string };
  range: EnterpriseTokenStatsOverview['range'];
  model: string | null;
  models: string[];
  offlineModels?: string[];
  modelsSource?: { dbPath: string | null; error?: string };
  tokensPerAiCoin?: number;
  aiCoinSource?: 'ledger_chat_consume' | string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    turns: number;
    modelCalls: number;
    consumedAiCoins?: number;
    ledgerTokens?: number;
  };
  members: Array<{
    userId: string;
    name: string;
    phone: string | null;
    octopUserId: number | null;
    username: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    turns: number;
    modelCalls: number;
    consumedAiCoins?: number;
    ledgerTokens?: number;
    byModel: Array<{ model: string; totalTokens: number; turns: number }>;
  }>;
  related: { ledgerUsagePath: string; note: string };
};

export type AdminWalletRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantType: string;
  tenantStatus: string;
  balanceCoins: number;
  totalCredited: number;
  totalDebited: number;
  updatedAt: string;
};

export type AdminWalletDetail = {
  tenant: { id: string; name: string; slug: string; type: string; status: string };
  balanceCoins: number;
  totalCredited: number;
  totalDebited: number;
  config: BillingConfig;
  recent: Array<{
    id: string;
    type: string;
    direction: string;
    coins: number;
    balanceAfter: number;
    tokens: number | null;
    remark: string | null;
    createdAt: string;
  }>;
};

export const adminBillingApi = {
  getConfig: () => adminHttp<BillingConfig>('/billing/config'),
  updateConfig: (body: {
    /** 遗留：不参与扣币/充值；省略则保留库内值 */
    sellPriceMultiplier?: number;
    tokensPerAiCoin?: number;
    aiCoinsPerYuan?: number;
    welcomeGiftYuan?: number;
    vendorUnitPrices?: VendorUnitPrices;
    modelUnitPrices?: Record<string, ModelPurchasePrice>;
  }) => adminHttp<BillingConfig>('/billing/config', { method: 'PUT', body: JSON.stringify(body) }),
  /** 内置官网参考价（静态表）；刷新失败时前端应保留上次参考 */
  getReferencePrices: () =>
    adminHttp<{
      source: 'built-in';
      checkedAt: string;
      vendors: Array<{
        vendor: string;
        label: string;
        input: number;
        output: number;
        hintInput: string;
        hintOutput: string;
      }>;
    }>('/billing/config/reference-prices'),
  usageReconcile: (query?: { from?: string; to?: string; tenantId?: string }) => {
    const q = new URLSearchParams();
    if (query?.from) q.set('from', query.from);
    if (query?.to) q.set('to', query.to);
    if (query?.tenantId) q.set('tenantId', query.tenantId);
    const suffix = q.toString() ? `?${q}` : '';
    return adminHttp<UsageReconcileReport>(`/billing/usage-reconcile${suffix}`);
  },
  listEnterpriseTokenStats: (query?: { from?: string; to?: string; model?: string }) => {
    const q = new URLSearchParams();
    if (query?.from) q.set('from', query.from);
    if (query?.to) q.set('to', query.to);
    if (query?.model) q.set('model', query.model);
    const suffix = q.toString() ? `?${q}` : '';
    return adminHttp<EnterpriseTokenStatsOverview>(`/billing/enterprise-token-stats${suffix}`);
  },
  getEnterpriseTokenStatsDetail: (query: {
    tenantId: string;
    from?: string;
    to?: string;
    model?: string;
  }) => {
    const q = new URLSearchParams();
    q.set('tenantId', query.tenantId);
    if (query.from) q.set('from', query.from);
    if (query.to) q.set('to', query.to);
    if (query.model) q.set('model', query.model);
    return adminHttp<EnterpriseTokenStatsDetail>(`/billing/enterprise-token-stats/detail?${q}`);
  },
  listWallets: () => adminHttp<AdminWalletRow[]>('/billing/wallets'),
  getWallet: (tenantId: string) => adminHttp<AdminWalletDetail>(`/billing/wallets/${tenantId}`),
  adjustWallet: (body: { tenantId: string; deltaCoins: number; idempotencyKey: string; remark?: string }) =>
    adminHttp<{ reused: boolean; ledgerId: string; balanceCoins: number; deltaCoins: number }>(
      '/billing/wallets/adjust',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  getEnterpriseFunds: (
    tenantId: string,
    opts?: { page?: number; pageSize?: number; type?: string },
  ) => {
    const q = new URLSearchParams();
    q.set('tenantId', tenantId);
    if (opts?.page != null) q.set('page', String(opts.page));
    if (opts?.pageSize != null) q.set('pageSize', String(opts.pageSize));
    if (opts?.type) q.set('type', opts.type);
    return adminHttp<{
      tenant: { id: string; name: string; slug: string };
      wallet: { balanceCoins: number; totalCredited: number; totalDebited: number };
      summary: { inflowCoins: number; inflowCount: number; outflowCoins: number; outflowCount: number };
      ledger: Array<{
        id: string;
        type: string;
        direction: string;
        coins: number;
        deltaCoins: number;
        balanceAfter: number;
        tokens: number | null;
        amountYuan: string | null;
        remark: string | null;
        actorName: string | null;
        createdAt: string;
        provider?: string | null;
        model?: string | null;
        orderNo?: string | null;
        orderId?: string | null;
        channel?: string | null;
        yuan?: string | null;
        tokensPerAiCoin?: number | null;
        sellPriceMultiplier?: number | null;
        aiCoinsPerYuan?: number | null;
        meta?: Record<string, unknown> | null;
      }>;
      ledgerPage: { page: number; pageSize: number; total: number };
      ledgerType?: string | null;
      byEmployee: Array<{ userId: string | null; name: string; phone: string | null; consumedCoins: number; tokens: number; turns: number }>;
      recentConsumes: Array<{ id: string; coins: number; tokens: number | null; actorName: string | null; createdAt: string; remark: string | null; type?: string; deltaCoins?: number }>;
      rechargeOrders: Array<{ id: string; orderNo: string; amountYuan: string; aiCoins: number; status: string; channel: string; createdAt: string }>;
      config: BillingConfig;
      notes?: { chargeRule: string; legacyLedger: string };
      consistency?: {
        balanceCoins: number;
        expectedCoins: number;
        frozenNetCoins: number;
        danglingFreezes: number;
        ok: boolean;
      };
    }>(`/billing/enterprise-funds?${q.toString()}`);
  },
  listRechargeOrders: (query?: {
    tenantId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    if (query?.tenantId) q.set('tenantId', query.tenantId);
    if (query?.status) q.set('status', query.status);
    if (query?.page != null) q.set('page', String(query.page));
    if (query?.pageSize != null) q.set('pageSize', String(query.pageSize));
    const suffix = q.toString() ? `?${q}` : '';
    return adminHttp<{
      items: Array<{
        id: string;
        orderNo: string;
        amountYuan: string;
        aiCoins: number;
        status: string;
        channel: string;
        tenantId: string;
        tenantName?: string;
        tenantSlug?: string;
        createdAt: string;
        confirmedAt: string | null;
      }>;
      page: number;
      pageSize: number;
      total: number;
    }>(`/billing/recharge-orders${suffix}`);
  },
};
