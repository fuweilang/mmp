import { adminHttp } from '../http';

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
