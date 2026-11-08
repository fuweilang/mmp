import type { MemberRole, TenantType } from '@mammoth/shared';
import { adminHttp } from './http';

export type AdminUserTenant = {
  id: string;
  name: string;
  role: MemberRole;
  /** 企业内实际角色（任意角色，含自建角色）。 */
  roleKey?: string | null;
  roleName?: string | null;
};

export type RolePermSource = {
  key: string;
  name: string;
  scope: 'PLATFORM' | 'ORG_PRESET' | 'ORG_CUSTOM' | string;
  permKeys: string[];
};

export type AdminUserRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isPlatformAdmin: boolean;
  /** 用户拥有的全部角色（权限取并集）。 */
  roleKeys?: string[];
  roleNames?: string[];
  platformRoleKey?: string | null;
  platformRoleName?: string | null;
  platformRoleScope?: 'PLATFORM' | 'ORG_PRESET' | null;
  status: string;
  /** 所属企业全部停用 → 表现为停用（由企业启停控制，非账号级停用）。 */
  blockedByTenant?: boolean;
  createdAt: string;
  tenants: AdminUserTenant[];
};

export type AdminEnterpriseRow = {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  status: string;
  memberCount: number;
  createdAt: string;
  admins: Array<{ id: string; name: string; phone: string }>;
  adminCount: number;
  /** 上级：null = 直属企业（猛犸总部）。 */
  parentId: string | null;
  parentName: string | null;
  balanceCoins?: number;
  totalCreditedCoins?: number;
  totalDebitedCoins?: number;
};

export type AdminEnterpriseDeletionImpact = {
  tenant: { id: string; name: string; slug: string };
  memberCount: number;
  deletedUsers: Array<{ id: string; name: string; phone: string }>;
  unboundMemberCount: number;
  usageEventCount: number;
  blockedReasons: string[];
  canDelete: boolean;
};

export type AdminUserCreate = {
  name: string;
  phone: string;
  password: string;
  isPlatformAdmin: boolean;
  tenantId?: string;
  /** 用户的角色（可多选，权限取并集）。 */
  roleKeys?: string[];
  platformRoleKey?: string;
  /** 企业内角色：ADMIN=企业管理员，MEMBER=企业成员。 */
  memberRole?: 'ADMIN' | 'MEMBER';
};

export type AdminUserUpdate = {
  name?: string;
  isPlatformAdmin?: boolean;
  status?: string;
  /** 用户的角色（可多选，权限取并集）；空数组 = 清空。 */
  roleKeys?: string[];
  /** 历史字段：单个角色。 */
  platformRoleKey?: string | null;
  /** null = 解绑全部企业。 */
  tenantId?: string | null;
  /** 历史字段，仅企业控制台内部使用；总后台按角色 key 分配。 */
  memberRole?: 'ADMIN' | 'MEMBER';
};

export type AdminRoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'PLATFORM' | 'ORG_PRESET';
  builtIn: boolean;
  editable: boolean;
  permissionsLocked: boolean;
  permissions: string[];
  userCount: number;
};

export type PermissionCatalogChip = {
  key: string;
  labelZh: string;
  labelEn: string;
  page?: string;
  pageZh?: string;
  pageEn?: string;
};

export type PermissionCatalogPage = {
  page: string | null;
  pageZh: string;
  pageEn: string;
  items: PermissionCatalogChip[];
};

export type PermissionCatalogGroup = {
  category: string;
  labelZh: string;
  labelEn: string;
  items: PermissionCatalogChip[];
  pages?: PermissionCatalogPage[];
};

export type AdminEnterpriseCreate = {
  name: string;
  slug: string;
  type?: 'ENTERPRISE' | 'AGENCY';
  parentId?: string;
  status?: string;
};

export type AdminEnterpriseUpdate = {
  name?: string;
  slug?: string;
  status?: string;
};

export const adminUserApi = {
  list: (params: { keyword?: string; role?: string; status?: string; enterpriseId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.role) qs.set('role', params.role);
    if (params.status) qs.set('status', params.status);
    if (params.enterpriseId) qs.set('enterpriseId', params.enterpriseId);
    const query = qs.toString();
    return adminHttp<AdminUserRow[]>(`/users${query ? `?${query}` : ''}`);
  },
  create: (body: AdminUserCreate) =>
    adminHttp<AdminUserRow>('/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: AdminUserUpdate) =>
    adminHttp<AdminUserRow>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (id: string, password: string) =>
    adminHttp<AdminUserRow>(`/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    }),
  deactivate: (id: string) => adminHttp<AdminUserRow>(`/users/${id}`, { method: 'DELETE' }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/users/${id}/delete`, { method: 'POST' }),
  /** 查看用户：指定企业上下文下的有效权限并集（只读）。 */
  permissions: (id: string, params: { tenantId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.tenantId) qs.set('tenantId', params.tenantId);
    const query = qs.toString();
    return adminHttp<{
      permissions: string[];
      roles: RolePermSource[];
      isPlatformAdmin: boolean;
      tenantId: string | null;
      tenants: Array<{ id: string; name: string }>;
    }>(`/users/${id}/permissions${query ? `?${query}` : ''}`);
  },
};

export const adminEnterpriseApi = {
  list: () => adminHttp<AdminEnterpriseRow[]>('/enterprises'),
  create: (body: AdminEnterpriseCreate) =>
    adminHttp<AdminEnterpriseRow>('/enterprises', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: AdminEnterpriseUpdate) =>
    adminHttp<AdminEnterpriseRow>(`/enterprises/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/enterprises/${id}`, { method: 'DELETE' }),
  deletionImpact: (id: string) =>
    adminHttp<AdminEnterpriseDeletionImpact>(`/enterprises/${id}/deletion-impact`),
};
export const adminRoleApi = {
  list: (params: { keyword?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return adminHttp<AdminRoleRow[]>(`/roles${query ? `?${query}` : ''}`);
  },
  get: (id: string) => adminHttp<AdminRoleRow>(`/roles/${id}`),
  create: (body: { name: string; description?: string | null; permissions?: string[] }) =>
    adminHttp<AdminRoleRow>('/roles', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string | null; permissions?: string[] }) =>
    adminHttp<AdminRoleRow>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/roles/${id}`, { method: 'DELETE' }),
};

export const adminPermissionApi = {
  catalog: () => adminHttp<{ categories: PermissionCatalogGroup[] }>('/permissions/catalog'),
};

/** 总后台对企业自定义角色（ORG_CUSTOM）的跨企业管理，与 Console 同源。 */
export type AdminTenantRoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'ORG_CUSTOM';
  builtIn: boolean;
  editable: boolean;
  permissions: string[];
  userCount: number;
  tenant: { id: string; name: string } | null;
};

export const adminTenantRoleApi = {
  list: (params: { tenantId?: string; keyword?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.tenantId) qs.set('tenantId', params.tenantId);
    if (params.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return adminHttp<AdminTenantRoleRow[]>(`/tenant-roles${query ? `?${query}` : ''}`);
  },
  catalog: () => adminHttp<{ categories: PermissionCatalogGroup[] }>('/tenant-roles/catalog'),
  create: (body: { tenantId: string; name: string; description?: string | null; permissions?: string[] }) =>
    adminHttp<{ id: string }>('/tenant-roles', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string | null; permissions?: string[] }) =>
    adminHttp<{ ok: boolean }>(`/tenant-roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/tenant-roles/${id}`, { method: 'DELETE' }),
};

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

export type AdminAuditRow = {
  id: string;
  tenantId: string | null;
  enterpriseName: string;
  userId: string | null;
  actorName: string;
  actorPhone: string | null;
  action: string;
  ip: string | null;
  meta: unknown;
  createdAt: string;
};

export type AdminAuditListResult = {
  total: number;
  page: number;
  pageSize: number;
  rows: AdminAuditRow[];
};

export const adminAuditApi = {
  list: (query: {
    page?: number;
    pageSize?: number;
    tenantId?: string;
    action?: string;
    actionPrefix?: string;
    actor?: string;
    from?: string;
    to?: string;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(query.page ?? 1));
    q.set('pageSize', String(query.pageSize ?? 20));
    if (query.tenantId) q.set('tenantId', query.tenantId);
    if (query.action) q.set('action', query.action);
    if (query.actionPrefix) q.set('actionPrefix', query.actionPrefix);
    if (query.actor) q.set('actor', query.actor);
    if (query.from) q.set('from', query.from);
    if (query.to) q.set('to', query.to);
    return adminHttp<AdminAuditListResult>(`/audit?${q}`);
  },
};


export type AdminLlmModelRow = {
  health?: {status:'unchecked'|'healthy'|'degraded'|'limited'|'unavailable';reason:string|null;checkedAt:string|null;retryAt:string|null;latencyMs:number|null};
  supportsTools?: boolean;
  supportsVision?: boolean;
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  thinkingEnabled: boolean;
  isPreferred: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminLlmProviderRow = {
  id: string;
  name: string;
  displayName: string;
  kind: string;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  note: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  models: AdminLlmModelRow[];
};

export type AdminLlmProviderCreate = {
  name: string;
  displayName: string;
  kind?: string;
  baseUrl?: string;
  apiKey?: string;
  note?: string;
  enabled?: boolean;
  sortOrder?: number;
  models?: Array<{
    modelId: string;
    displayName?: string;
    enabled?: boolean;
    isPreferred?: boolean;
    sortOrder?: number;
  }>;
};

export type AdminLlmProviderUpdate = {
  displayName?: string;
  kind?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  note?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

export const adminLlmProviderApi = {
  list: () => adminHttp<AdminLlmProviderRow[]>('/llm-providers'),
  get: (id: string) => adminHttp<AdminLlmProviderRow>(`/llm-providers/${id}`),
  create: (body: AdminLlmProviderCreate) =>
    adminHttp<AdminLlmProviderRow>('/llm-providers', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: AdminLlmProviderUpdate) =>
    adminHttp<AdminLlmProviderRow>(`/llm-providers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/llm-providers/${id}`, { method: 'DELETE' }),
  addModel: (
    providerId: string,
    body: { modelId: string; displayName?: string; enabled?: boolean; isPreferred?: boolean; sortOrder?: number },
  ) =>
    adminHttp<AdminLlmModelRow>(`/llm-providers/${providerId}/models`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateModel: (
    modelId: string,
    body: {
      displayName?: string;
      supportsTools?: boolean;
      supportsVision?: boolean;
      enabled?: boolean;
      thinkingEnabled?: boolean;
      isPreferred?: boolean;
      sortOrder?: number;
    },
  ) =>
    adminHttp<AdminLlmModelRow>(`/llm-models/${modelId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeModel: (modelId: string) =>
    adminHttp<{ ok: boolean }>(`/llm-models/${modelId}`, { method: 'DELETE' }),
  /** 连通探测：已存模型或表单草稿 */
  probe: (body: AdminLlmProbeBody) =>
    adminHttp<AdminLlmProbeResult>('/llm-providers/probe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** 拉取上游 /models 列表（表单草稿或已存厂商） */
  listRemoteModels: (body: AdminLlmListModelsBody) =>
    adminHttp<AdminLlmListModelsResult>('/llm-providers/list-models', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export type AdminLlmProbeBody = {
  modelRowId?: string;
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
};

export type AdminLlmProbeResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  statusCode?: number;
};


export type AdminLlmListModelsBody = {
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
};

export type AdminLlmListModelsResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  models: Array<{ id: string; ownedBy?: string }>;
};

export type OfficialAgentStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
/** Managed expert metadata; upstream extensions are data, never host configuration. */
export type ExpertDefinition = {
  schemaVersion?: number;
  profile?: { role?: string; mission?: string; [key: string]: unknown };
  workflow?: string[];
  deliverables?: string[];
  source?: { repository?: string; ref?: string; paths?: string[]; [key: string]: unknown };
  license?: { spdx?: string; path?: string; [key: string]: unknown };
  dependencies?: unknown[];
  adaptation?: { mode?: string; notes?: string[]; [key: string]: unknown };
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
};

export type OfficialAgentKind = 'GENERAL' | 'KNOWLEDGE';
export type OfficialAgentGrantStatus = 'ACTIVE' | 'REVOKED';

export type OfficialAgentVersion = {
  id: string;
  version: number;
  name: string;
  summary: string;
  openingQuestions: string[];
  systemPrompt: string;
  toolScope: string[];
  publishedByUserId: string | null;
  publishedAt: string;
  expertDefinition?: ExpertDefinition;
  linkedSkillSummaries?: OfficialAgentLinkedSkill[];
};

export type OfficialAgentGrant = {
  id: string;
  tenant: { id: string; name: string; slug: string; status: string };
  version: { id: string; version: number; name: string };
  status: OfficialAgentGrantStatus;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OfficialAgentCategory =
  | 'common'
  | 'productivity'
  | 'content'
  | 'sales'
  | 'expertise'
  | 'analytics';

export type OfficialAgentLinkedSkill = {
  id: string;
  key: string;
  name: string;
  summary: string;
  category: string | null;
  enabledAt: string | null;
  packageRevision: number;
  enabled: boolean;
};

export type OfficialAgentRow = {
  id: string;
  key: string;
  kind: OfficialAgentKind;
  category: OfficialAgentCategory | null;
  capabilities: string[];
  status: OfficialAgentStatus;
  /** Public branding URL when an avatar file exists; null → first-character fallback. */
  avatarUrl: string | null;
  linkedSkillIds?: string[];
  linkedSkills?: OfficialAgentLinkedSkill[];
  draft: {
    name: string;
    summary: string;
    openingQuestions: string[];
    systemPrompt: string;
    toolScope: string[];
    expertDefinition?: ExpertDefinition;
  };
  onlineVersion: OfficialAgentVersion | null;
  versions: OfficialAgentVersion[];
  grants: OfficialAgentGrant[];
  activeGrantCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OfficialAgentDraftPayload = {
  name: string;
  summary: string;
  openingQuestions: string[];
  systemPrompt: string;
  toolScope: string[];
  category?: OfficialAgentCategory;
  capabilities?: string[];
  linkedSkillIds?: string[];
  expertDefinition?: ExpertDefinition;
};

export type OfficialAgentAssetCatalogItem = {
  key: string;
  name: string;
  kind: OfficialAgentKind;
  summary: string;
  openingQuestionCount: number;
  toolScope: string[];
  batch: string | null;
  linkedSkillKeys?: string[];
  expertDefinition?: ExpertDefinition;
  existing: { id: string; status: OfficialAgentStatus; hasOnlineVersion: boolean } | null;
};

export type OfficialAgentImportResult = {
  imported: number;
  results: Array<{
    key: string;
    action: 'created' | 'updated' | 'filled' | 'skipped' | 'error';
    id?: string;
    reason?: string;
  }>;
  errors: Array<{ key: string; message: string }>;
  summary: {
    created: number;
    updated: number;
    filled: number;
    skipped: number;
    errors: number;
  };
};

export type OfficialAgentBulkOfflineResult = {
  results: Array<{
    id: string;
    key?: string;
    action: 'offlined' | 'skipped' | 'error';
    reason?: string;
  }>;
  summary: { offlined: number; skipped: number; errors: number };
};

export type OfficialAgentBulkGrantResult = {
  agent: OfficialAgentRow;
  results: Array<{
    tenantId: string;
    action: 'granted' | 'reactivated' | 'upgraded' | 'skipped' | 'error';
    reason?: string;
    versionId?: string;
  }>;
  summary: {
    granted: number;
    reactivated: number;
    upgraded: number;
    skipped: number;
    errors: number;
  };
};

export type OfficialAgentBulkRevokeResult = {
  agent: OfficialAgentRow;
  results: Array<{
    tenantId: string;
    action: 'revoked' | 'skipped' | 'error';
    reason?: string;
    versionId?: string | null;
  }>;
  summary: { revoked: number; skipped: number; errors: number };
};

export const adminOfficialAgentApi = {
  list: (params: { keyword?: string; status?: OfficialAgentStatus | '' } = {}) => {
    const query = new URLSearchParams();
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminHttp<OfficialAgentRow[]>(`/official-agents${suffix}`);
  },
  detail: (id: string) => adminHttp<OfficialAgentRow>(`/official-agents/${id}`),
  assetCatalog: () => adminHttp<OfficialAgentAssetCatalogItem[]>('/official-agents/asset-catalog'),
  importAssets: (body: { keys?: string[] } = {}) =>
    adminHttp<OfficialAgentImportResult>('/official-agents/import-assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  create: (body: OfficialAgentDraftPayload & { key: string; kind: OfficialAgentKind }) =>
    adminHttp<OfficialAgentRow>('/official-agents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<OfficialAgentDraftPayload>) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** Image request is staged by the editor until Save; existing branding timing is retained. */
  uploadAvatar: (id: string, body: FormData) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/avatar`, { method: 'POST', body }),
  removeAvatar: (id:string) => adminHttp<OfficialAgentRow>(`/official-agents/${id}/avatar`,{method:'DELETE'}),
  publish: (id: string) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/publish`, { method: 'POST' }),
  offline: (id: string) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/offline`, { method: 'POST' }),
  bulkOffline: (ids: string[]) =>
    adminHttp<OfficialAgentBulkOfflineResult>('/official-agents/bulk-offline', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  grant: (id: string, body: { tenantId: string; versionId?: string }) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/grants`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  bulkGrant: (id: string, body: { tenantIds: string[]; versionId?: string }) =>
    adminHttp<OfficialAgentBulkGrantResult>(`/official-agents/${id}/grants/bulk`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bulkRevoke: (id: string, body: { tenantIds: string[] }) =>
    adminHttp<OfficialAgentBulkRevokeResult>(`/official-agents/${id}/grants/bulk-revoke`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revoke: (id: string, tenantId: string) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/grants/${tenantId}`, { method: 'DELETE' }),
};

export type OfficialKnowledgeStatus = 'PENDING' | 'READY' | 'FAILED';

export type OfficialKnowledgeRow = {
  id: string;
  agentId: string;
  assetKey: string;
  name: string;
  originalName: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  status: OfficialKnowledgeStatus;
  indexError: string | null;
  active: boolean;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  agent: {
    id: string;
    key: string;
    name: string;
    kind: OfficialAgentKind;
    status: string;
  };
  effectiveVersion: { id: string; version: number; publishedAt: string } | null;
};

export type OfficialKnowledgeBindableAgent = {
  id: string;
  key: string;
  name: string;
  kind: OfficialAgentKind;
  status: string;
  hasOfficialKb: boolean;
};

export type OfficialKnowledgeContent = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  truncated: boolean;
  content: string;
};

export type OfficialKnowledgeChunks = {
  documentId: string;
  total: number;
  chunks: Array<{ id: string; ordinal: number; preview: string; length: number }>;
};

export const adminOfficialKnowledgeApi = {
  list: (params: {
    keyword?: string;
    agentId?: string;
    status?: OfficialKnowledgeStatus | '';
    activeOnly?: boolean;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.keyword?.trim()) q.set('keyword', params.keyword.trim());
    if (params.agentId) q.set('agentId', params.agentId);
    if (params.status) q.set('status', params.status);
    if (params.activeOnly === false) q.set('activeOnly', 'false');
    const suffix = q.toString() ? `?${q}` : '';
    return adminHttp<OfficialKnowledgeRow[]>(`/official-knowledge${suffix}`);
  },
  agents: () => adminHttp<OfficialKnowledgeBindableAgent[]>('/official-knowledge/agents'),
  detail: (id: string) => adminHttp<OfficialKnowledgeRow>(`/official-knowledge/${id}`),
  content: (id: string) => adminHttp<OfficialKnowledgeContent>(`/official-knowledge/${id}/content`),
  chunks: (id: string) => adminHttp<OfficialKnowledgeChunks>(`/official-knowledge/${id}/chunks`),
  upload: (body: FormData) =>
    adminHttp<OfficialKnowledgeRow>('/official-knowledge/upload', { method: 'POST', body }),
  replace: (id: string, body: FormData) =>
    adminHttp<OfficialKnowledgeRow>(`/official-knowledge/${id}/replace`, { method: 'POST', body }),
  reindex: (id: string) =>
    adminHttp<OfficialKnowledgeRow>(`/official-knowledge/${id}/reindex`, { method: 'POST' }),
  fileUrl: (id: string) => `/admin/api/official-knowledge/${id}/file`,
};



export type OfficialSkillCategory = 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle';

export type OfficialSkillRow = {
  id: string;
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategory | null;
  enabledAt: string | null;
  enabled: boolean;
  packageRevision: number;
  resourceCount: number;
  instructionBytes: number;
  linkedAgents: Array<{ id: string; key: string; name: string }>;
  linkedAgentCount: number;
  createdAt: string;
  updatedAt: string;
  instruction?: string;
  avatarUrl?: string | null;
};

export type OfficialSkillOption = {
  id: string;
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategory | null;
  packageRevision: number;
  enabledAt: string | null;
};

export type OfficialSkillZipPreview = {
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategory | null;
  resourceCount: number;
  instructionBytes: number;
  keyConflict: boolean;
  existingId: string | null;
};

export const adminOfficialSkillApi = {
  list: (params: { keyword?: string; enabled?: 'true' | 'false' | '' } = {}) => {
    const q = new URLSearchParams();
    if (params.keyword?.trim()) q.set('keyword', params.keyword.trim());
    if (params.enabled) q.set('enabled', params.enabled);
    const suffix = q.toString() ? `?${q}` : '';
    return adminHttp<OfficialSkillRow[]>(`/official-skills${suffix}`);
  },
  enabledOptions: () => adminHttp<OfficialSkillOption[]>('/official-skills/enabled-options'),
  detail: (id: string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}`),
  validateZip: (body: FormData) =>
    adminHttp<OfficialSkillZipPreview>('/official-skills/validate-zip', { method: 'POST', body }),
  createFromZip: (body: FormData) =>
    adminHttp<OfficialSkillRow>('/official-skills/from-zip', { method: 'POST', body }),
  createFromForm: (body: {
    key: string;
    name: string;
    summary: string;
    category?: OfficialSkillCategory;
    instruction: string;
  }) => adminHttp<OfficialSkillRow>('/official-skills/from-form', { method: 'POST', body: JSON.stringify(body) }),
  update: (
    id: string,
    body: Partial<{ name: string; summary: string; category: OfficialSkillCategory | ''; instruction: string }>,
  ) => adminHttp<OfficialSkillRow>(`/official-skills/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  replaceZip: (id: string, body: FormData) =>
    adminHttp<OfficialSkillRow>(`/official-skills/${id}/replace-zip`, { method: 'POST', body }),
  uploadIcon: (id:string,body:FormData) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/icon`,{method:'POST',body}),
  removeIcon: (id:string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/icon`,{method:'DELETE'}),
  enable: (id: string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/enable`, { method: 'POST' }),
  disable: (id: string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/disable`, { method: 'POST' }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/official-skills/${id}`, { method: 'DELETE' }),
};
