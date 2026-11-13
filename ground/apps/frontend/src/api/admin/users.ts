import type { MemberRole } from '@mammoth/shared';
import { adminHttp } from '../http';

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
  /** 平台账号仅新增 MEMBER 成员关系，不替换已有企业。 */
  addMemberTenantId?: string;
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
