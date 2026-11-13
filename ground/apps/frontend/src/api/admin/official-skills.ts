import { adminHttp } from '../http';

export type OfficialSkillCategory = 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle';

export type OfficialSkillRow = {
  id: string;
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategory | null;
  categories?: OfficialSkillCategory[];
  enabledAt: string | null;
  enabled: boolean;
  packageRevision: number;
  contentSource?: 'zip' | 'form' | 'none';
  resourceCount: number;
  fileCount?: number;
  scriptCount?: number;
  referenceCount?: number;
  assetCount?: number;
  totalBytes?: number;
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
  categories?: OfficialSkillCategory[];
  packageRevision: number;
  enabledAt: string | null;
};

export type OfficialSkillZipPreview = {
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategory | null;
  categories?: OfficialSkillCategory[];
  resourceCount: number;
  fileCount?: number;
  scriptCount?: number;
  referenceCount?: number;
  assetCount?: number;
  totalBytes?: number;
  instructionBytes: number;
  keyConflict: boolean;
  existingId: string | null;
  keyDerived?: boolean;
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
    key?: string;
    name: string;
    summary?: string;
    category?: OfficialSkillCategory;
    categories?: OfficialSkillCategory[];
    instruction?: string;
  }) => adminHttp<OfficialSkillRow>('/official-skills/from-form', { method: 'POST', body: JSON.stringify(body) }),
  update: (
    id: string,
    body: Partial<{ name: string; summary: string; category: OfficialSkillCategory | ''; categories: OfficialSkillCategory[]; instruction: string; expectedUpdatedAt: string }>,
  ) => adminHttp<OfficialSkillRow>(`/official-skills/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  replaceZip: (id: string, body: FormData) =>
    adminHttp<OfficialSkillRow>(`/official-skills/${id}/replace-zip`, { method: 'POST', body }),
  uploadIcon: (id:string,body:FormData) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/icon`,{method:'POST',body}),
  removeIcon: (id:string, expectedUpdatedAt?: string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/icon${expectedUpdatedAt ? `?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}` : ''}`,{method:'DELETE'}),
  enable: (id: string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/enable`, { method: 'POST' }),
  disable: (id: string) => adminHttp<OfficialSkillRow>(`/official-skills/${id}/disable`, { method: 'POST' }),
  remove: (id: string) => adminHttp<{ ok: boolean }>(`/official-skills/${id}`, { method: 'DELETE' }),
};
