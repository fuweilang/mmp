import { http } from './http';

export type MembershipPlanName = 'standard' | 'pro' | 'flagship';

export type MembershipOffer = {
  plan: MembershipPlanName;
  expiresAt: string | null;
  enforced: boolean;
  canPay: boolean;
  proPriceYuan: number;
  flagshipPriceYuan: number;
  standardSummary: string;
  proSummary: string;
  flagshipSummary: string;
  wechatConfigured: boolean;
  alipayConfigured: boolean;
};

export type MembershipQr = {
  outTradeNo: string;
  qrDataUrl: string;
  plan: 'pro' | 'flagship';
  amountYuan: number;
  provider: 'wechat' | 'alipay';
};

export type PlazaExpert = {
  id: string;
  name: string;
  summary: string;
  avatarUrl: string | null;
  minPlan?: MembershipPlanName;
  locked?: boolean;
};

export const membershipApi = {
  offer: () => http<MembershipOffer>('/api/billing/membership'),
  experts: () => http<PlazaExpert[]>('/api/official-agents'),
  payQr: (plan: 'pro' | 'flagship', provider: 'wechat' | 'alipay') =>
    http<MembershipQr>('/api/billing/membership/payQr', {
      method: 'POST',
      body: JSON.stringify({ plan, provider }),
    }),
  status: (outTradeNo: string) =>
    http<{ paid: boolean; plan: MembershipPlanName; expiresAt: string | null }>('/api/billing/membership/status', {
      method: 'POST',
      body: JSON.stringify({ outTradeNo }),
    }),
};
