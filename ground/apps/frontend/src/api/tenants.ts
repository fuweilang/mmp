import type { MemberRole } from '@mammoth/shared';
import { http } from './http';

export type RolePermSource = {
  key: string;
  name: string;
  scope: 'PLATFORM' | 'ORG_PRESET' | 'ORG_CUSTOM' | string;
  permKeys: string[];
};

export type MemberRoleRef = {
  id: string;
  key: string;
  name: string;
  scope: 'PLATFORM' | 'ORG_PRESET' | 'ORG_CUSTOM';
  tenantId: string | null;
};

export type MemberRow = {
  id: string;
  role: MemberRole;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    /** 用户的全部角色（多角色，权限取并集）。 */
    roles?: Array<{ role: MemberRoleRef }>;
  };
};

export type SimpleMember = {
  id: string;
  user: { id: string; name: string; phone: string | null };
};

export const tenantApi = {
  members: () => http<MemberRow[]>('/api/members'),
  /** 轻量成员列表，下拉用；仅需 console 登录权限。 */
  simpleMembers: () => http<SimpleMember[]>('/api/members/simple'),
  addMember: (body: { name: string; phone: string; password: string; roleIds?: string[] }) =>
    http<MemberRow>('/api/members', { method: 'POST', body: JSON.stringify(body) }),
  patchMember: (id: string, body: { name?: string; roleIds?: string[] }) =>
    http<MemberRow>(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeMember: (id: string) =>
    http<{ ok: boolean }>(`/api/members/${id}`, { method: 'DELETE' }),
  /** 企业管理员重置成员密码。 */
  changeMemberPassword: (id: string, password: string) =>
    http<{ ok: boolean }>(`/api/members/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    }),
  /** 查看成员：基本信息 + 跨角色有效权限并集（只读）。 */
  memberPermissions: (id: string) =>
    http<{
      member: MemberRow;
      permissions: string[];
      roles: RolePermSource[];
      isPlatformAdmin: boolean;
    }>(`/api/members/${id}/permissions`),
};
