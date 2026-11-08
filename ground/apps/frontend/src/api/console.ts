import type { AccessScope, KbStatus } from '@mammoth/shared';
import { apiUrl, http } from './http';

export type WorkbenchSummary = {
  tenantName: string;
  welcomeMessage: string;
  logoUrl: string | null;
  memberCount: number;
  kbDocumentCount: number;
  kbPendingCount: number;
  kbReadyCount: number;
  usedTurns: number;
  monthlyTurns: number;
  aiBalanceCoins?: number;
  aiTotalCredited?: number;
  aiTotalDebited?: number;
};


export type KbFolderRow = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
};

export type KbDocumentRow = {
  id: string;
  tenantId: string;
  folderId: string | null;
  folderName: string | null;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: KbStatus;
  indexError?: string | null;
  visibility: AccessScope;
  userIds: string[];
  createdAt: string;
};


export const workbenchApi = {
  summary: () => http<WorkbenchSummary>('/api/workbench'),
};


export type TenantRoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'ORG_PRESET' | 'ORG_CUSTOM';
  builtIn: boolean;
  editable: boolean;
  permKeys: string[];
  /** org_member 是否已写本企业覆盖 */
  hasTenantOverride?: boolean;
  /** org_member：tenant=覆盖 / global=跟随平台；其它预置多为 global */
  permSource?: 'tenant' | 'global';
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AssignableRole = {
  id: string;
  key: string;
  name: string;
  scope: 'ORG_PRESET' | 'ORG_CUSTOM';
  builtIn: boolean;
};

export type PermissionCatalogItem = { key: string; labelZh: string; labelEn: string };

export type PermissionCatalogPage = {
  page: string | null;
  pageZh: string;
  pageEn: string;
  items: PermissionCatalogItem[];
};

export type PermissionCatalogGroup = {
  category: string;
  labelZh: string;
  labelEn: string;
  items: PermissionCatalogItem[];
  pages: PermissionCatalogPage[];
};

export type TenantRolePayload = {
  name: string;
  description?: string;
  permKeys: string[];
};

export const tenantRoleApi = {
  list: () => http<TenantRoleRow[]>('/api/tenant-roles'),
  assignable: () => http<AssignableRole[]>('/api/tenant-roles/assignable'),
  catalog: () => http<{ categories: PermissionCatalogGroup[] }>('/api/tenant-roles/catalog'),
  create: (body: TenantRolePayload) =>
    http<TenantRoleRow>('/api/tenant-roles', { method: 'POST', body: JSON.stringify(body) }),
  patch: (id: string, body: Partial<TenantRolePayload>) =>
    http<TenantRoleRow>(`/api/tenant-roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => http<{ ok: boolean }>(`/api/tenant-roles/${id}`, { method: 'DELETE' }),
};

export const knowledgeApi = {
  folders: () => http<KbFolderRow[]>('/api/kb/folders'),
  createFolder: (name: string) =>
    http<KbFolderRow>('/api/kb/folders', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteFolder: (id: string) => http<{ ok: boolean }>(`/api/kb/folders/${id}`, { method: 'DELETE' }),
  documents: (folderId?: string) => {
    const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
    return http<KbDocumentRow[]>(`/api/kb/documents${query}`);
  },
  upload: (form: FormData) => http<KbDocumentRow>('/api/kb/documents', { method: 'POST', body: form }),
  patch: (
    id: string,
    body: Partial<{
      name: string;
      folderId: string | null;
      status: KbStatus;
      visibility: AccessScope;
      userIds: string[];
    }>,
  ) => http<KbDocumentRow>(`/api/kb/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => http<{ ok: boolean }>(`/api/kb/documents/${id}`, { method: 'DELETE' }),
  search: (q: string) => http<{ tenantId: string; hits: KbHit[] }>(`/api/kb/search?q=${encodeURIComponent(q)}`),
};

/** 知识库文件下载地址：浏览器新开窗口直接下载，前缀改写与 http() 同源（apiUrl）。 */
export function kbDownloadUrl(id: string) {
  return apiUrl(`/api/kb/documents/${id}/file`);
}

export type KbHit = {
  documentId: string;
  documentName: string;
  folderName: string | null;
  snippet: string;
  score: number;
};

export type OfficialAgentScopeRow = {
  id: string;
  key: string;
  kind: 'KNOWLEDGE';
  versionId: string;
  version: number;
  name: string;
  summary: string;
  openingQuestions: string[];
  kbFolderIds: string[];
};

export const officialAgentApi = {
  scopes: () => http<OfficialAgentScopeRow[]>('/api/official-agents/console/scopes'),
  updateScope: (id: string, kbFolderIds: string[]) =>
    http<OfficialAgentScopeRow>(`/api/official-agents/${id}/scope`, {
      method: 'PUT',
      body: JSON.stringify({ kbFolderIds }),
    }),
};

export type QuotaSnapshot = {
  monthlyTurns: number;
  monthlyTokens: number;
  usedTurns: number;
  usedTokens?: number;
  remainingTurns: number | null;
  remainingTokens?: number | null;
  exceeded: boolean;
  tokensExceeded?: boolean;
  message?: string;
  recent?: Array<{
    id: string;
    userId: string | null;
    kind: string;
    quantity: number;
    createdAt: string;
  }>;
};

export type UserTokenQuotaRow = {
  userId: string;
  name: string;
  phone: string | null;
  monthlyTokens: number;
  usedTokens: number;
  remainingTokens: number | null;
  exceeded: boolean;
};

export type AuditRow = {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  ip: string | null;
  meta: unknown;
  createdAt: string;
};

export type EnterpriseSettings = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  welcomeMessage: string;
};

export const usageApi = {
  quota: () => http<QuotaSnapshot>('/api/usage/quota'),
  summary: () => http<QuotaSnapshot>('/api/usage/summary'),
  patchQuota: (body: { monthlyTurns?: number; monthlyTokens?: number }) =>
    http<QuotaSnapshot>('/api/usage/quota', { method: 'PATCH', body: JSON.stringify(body) }),
  tokenQuotas: () => http<{ tenantQuota: number; members: UserTokenQuotaRow[] }>('/api/usage/token-quotas'),
  patchTokenQuota: (body: { userId: string; monthlyTokens: number }) =>
    http<{ tenantQuota: number; members: UserTokenQuotaRow[] }>('/api/usage/token-quotas', { method: 'PATCH', body: JSON.stringify(body) }),
};

export const auditApi = {
  list: (page = 1, action = '') => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (action) params.set('action', action);
    return http<{ total: number; page: number; pageSize: number; rows: AuditRow[] }>(`/api/audit?${params}`);
  },
};

export const enterpriseApi = {
  get: () => http<EnterpriseSettings>('/api/enterprise'),
  patch: (body: { name?: string; welcomeMessage?: string }) =>
    http<EnterpriseSettings>('/api/enterprise', { method: 'PATCH', body: JSON.stringify(body) }),
  uploadLogo: (form: FormData) => http<EnterpriseSettings>('/api/enterprise/logo', { method: 'POST', body: form }),
};

/** AI 币钱包与扫码充值（任务1/2） */
export type BillingWalletView = {
  skipped: boolean;
  reason?: string;
  balanceCoins: number | null;
  canRecharge?: boolean;
  /** 是否含 portal.console.access（Agent 企业控制台入口） */
  hasConsoleAccess?: boolean;
  isPlatformAdmin?: boolean;
  totalCredited?: number;
  totalDebited?: number;
  config?: { sellPriceMultiplier: number; tokensPerAiCoin?: number; aiCoinsPerYuan: number };
};

export type RechargeOrder = {
  id: string;
  orderNo: string;
  amountYuan: string;
  aiCoins: number;
  status: string;
  channel: string;
  codeUrl: string;
  expireAt: string | null;
  confirmedAt: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  remark: string;
  createdAt: string;
  tenantName?: string;
  tenantSlug?: string;
};

export type PayChannels = {
  mockEnabled: boolean;
  wechatConfigured: boolean;
  alipayConfigured: boolean;
};

export const billingApi = {
  wallet: () => http<BillingWalletView>('/api/billing/wallet'),
  channels: () => http<PayChannels>('/api/billing/recharge/channels'),
  createRecharge: (body: { amountYuan: number; idempotencyKey?: string }) =>
    http<RechargeOrder>('/api/billing/recharge/create', { method: 'POST', body: JSON.stringify(body) }),
  payQr: (body: { orderId: string; channel: string }) =>
    http<RechargeOrder & { channels?: PayChannels }>('/api/billing/recharge/payQr', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  status: (orderId: string) =>
    http<RechargeOrder>('/api/billing/recharge/status', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),
  cancel: (orderId: string) =>
    http<RechargeOrder>('/api/billing/recharge/cancel', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),
  tokenUsage: (query?: {
    from?: string;
    to?: string;
    userId?: string;
    model?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    if (query?.from) q.set('from', query.from);
    if (query?.to) q.set('to', query.to);
    if (query?.userId) q.set('userId', query.userId);
    if (query?.model) q.set('model', query.model);
    if (query?.page) q.set('page', String(query.page));
    if (query?.pageSize) q.set('pageSize', String(query.pageSize));
    const suffix = q.toString() ? `?${q}` : '';
    return http<{
      skipped?: boolean;
      source?: string;
      totals: {
        turns: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        modelCalls: number;
        aiCoins: number;
      };
      members: Array<{ userId: string; name: string; phone: string | null }>;
      models: string[];
      items: Array<{
        id: string;
        occurredAt: string;
        userId: string;
        memberName: string;
        memberPhone: string | null;
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        aiCoins: number;
        modelCalls: number;
        clientKind: string;
        source: string;
        threadId: string | null;
      }>;
      page: number;
      pageSize: number;
      total: number;
    }>(`/api/billing/token-usage${suffix}`);
  },
  orders: (query?: {
    from?: string;
    to?: string;
    status?: string;
    channel?: string;
    createdByUserId?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    if (query?.from) q.set('from', query.from);
    if (query?.to) q.set('to', query.to);
    if (query?.status) q.set('status', query.status);
    if (query?.channel) q.set('channel', query.channel);
    if (query?.createdByUserId) q.set('createdByUserId', query.createdByUserId);
    if (query?.page) q.set('page', String(query.page));
    if (query?.pageSize) q.set('pageSize', String(query.pageSize));
    const suffix = q.toString() ? `?${q}` : '';
    return http<{ items: RechargeOrder[]; page: number; pageSize: number; total: number }>(
      `/api/billing/recharge/orders${suffix}`,
    );
  },
  ledger: (query?: {
    from?: string;
    to?: string;
    actorUserId?: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    if (query?.from) q.set('from', query.from);
    if (query?.to) q.set('to', query.to);
    if (query?.actorUserId) q.set('actorUserId', query.actorUserId);
    if (query?.type) q.set('type', query.type);
    if (query?.page) q.set('page', String(query.page));
    if (query?.pageSize) q.set('pageSize', String(query.pageSize));
    const suffix = q.toString() ? `?${q}` : '';
    return http<{
      skipped: boolean;
      items: Array<{
        id: string;
        type: string;
        direction: string;
        coins: number;
        deltaCoins?: number;
        balanceAfter: number;
        tokens: number | null;
        remark: string | null;
        actorUserId: string | null;
        actorName: string | null;
        actorPhone: string | null;
        createdAt: string;
      }>;
      page: number;
      pageSize: number;
      total: number;
    }>(`/api/billing/ledger${suffix}`);
  },
};

