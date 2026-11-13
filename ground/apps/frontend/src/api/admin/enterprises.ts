import type { TenantType } from '@mammoth/shared';
import { adminHttp } from '../http';

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
