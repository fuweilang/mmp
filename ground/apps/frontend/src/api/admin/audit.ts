import { adminHttp } from '../http';

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
