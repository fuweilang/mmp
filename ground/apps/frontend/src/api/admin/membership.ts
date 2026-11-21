import { adminHttp } from '../http';

export type MembershipPlanName = 'standard' | 'pro' | 'flagship';

export type MembershipCatalog = {
  proPriceYuan: number;
  flagshipPriceYuan: number;
  standardSummary: string;
  proSummary: string;
  flagshipSummary: string;
  updatedAt: string;
};

export const adminMembershipApi = {
  getCatalog: () => adminHttp<MembershipCatalog>('/membership-catalog'),
  saveCatalog: (body: Omit<MembershipCatalog, 'updatedAt'>) =>
    adminHttp<MembershipCatalog>('/membership-catalog', { method: 'PUT', body: JSON.stringify(body) }),
  setEnterprise: (id: string, body: { plan: MembershipPlanName; expiresAt?: string }) =>
    adminHttp<{ id: string; membershipPlan: MembershipPlanName; membershipExpiresAt: string | null }>(
      `/enterprises/${id}/membership`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  setAgentMinPlan: (id: string, minPlan: MembershipPlanName) =>
    adminHttp<{ id: string; minPlan: MembershipPlanName }>(`/official-agents/${id}/min-plan`, {
      method: 'PATCH',
      body: JSON.stringify({ minPlan }),
    }),
};
