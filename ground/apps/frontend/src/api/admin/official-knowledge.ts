import { adminHttp } from '../http';
import type { OfficialAgentKind } from './official-agents';

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
