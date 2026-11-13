import { adminHttp } from '../http';

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
