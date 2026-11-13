import { adminHttp } from '../http';
import type { ExpertExecutionConfig } from './types';

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
  /** Real operator display name when the user still exists; null if unknown/missing. */
  publishedByName?: string | null;
  publishedAt: string;
  expertDefinition?: ExpertDefinition;
  linkedSkillSummaries?: OfficialAgentLinkedSkill[];
  executionConfig?: ExpertExecutionConfig & Record<string, unknown>;
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
  /** True when a published online version exists and pending config differs. Not a 4th status. */
  hasUnpublishedChanges?: boolean;
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
    executionConfig?: ExpertExecutionConfig;
  };
  onlineVersion: OfficialAgentVersion | null;
  versions: OfficialAgentVersion[];
  grants: OfficialAgentGrant[];
  activeGrantCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OfficialAgentDraftPayload = {
  executionConfig?: ExpertExecutionConfig;
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

export type OfficialAgentStatusCounts = {
  all: number;
  DRAFT: number;
  PUBLISHED: number;
  OFFLINE: number;
};

export type OfficialAgentListResult = {
  items: OfficialAgentRow[];
  statusCounts: OfficialAgentStatusCounts;
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
  preview: (id:string) => adminHttp<{agentId:string;previewId:string;expiresAt:string;launch:{path:string}}>(`/official-agents/${id}/preview`,{method:'POST'}),
  rollback: (id:string,versionId:string) => adminHttp<OfficialAgentRow>(`/official-agents/${id}/rollback/${versionId}`,{method:'POST'}),
  list: (params: { keyword?: string; status?: OfficialAgentStatus | '' } = {}) => {
    const query = new URLSearchParams();
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminHttp<OfficialAgentListResult>(`/official-agents${suffix}`);
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
  discovery: (id: string) =>
    adminHttp<{
      id: string;
      name: string;
      updatedAt: string;
      discoveryDetail: {
        introduction: string;
        outputs: string[];
        materials: string[];
        boundaries: string[];
        starters: Array<{ text: string; label?: string }>;
      };
    }>(`/official-agents/${id}/discovery`),
  publish: (id: string) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/publish`, { method: 'POST' }),
  offline: (id: string) =>
    adminHttp<OfficialAgentRow>(`/official-agents/${id}/offline`, { method: 'POST' }),
  remove: (id: string) =>
    adminHttp<{ ok: true; id: string; key: string; name: string }>(`/official-agents/${id}`, {
      method: 'DELETE',
    }),
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
