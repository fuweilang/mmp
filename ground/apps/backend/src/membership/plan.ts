export const MEMBERSHIP_PLANS = ['standard', 'pro', 'flagship'] as const;
export type MembershipPlanName = (typeof MEMBERSHIP_PLANS)[number];
export type PaidMembershipPlan = 'pro' | 'flagship';

const RANK: Record<MembershipPlanName, number> = { standard: 1, pro: 2, flagship: 3 };

export function isMembershipPlan(value: unknown): value is MembershipPlanName {
  return value === 'standard' || value === 'pro' || value === 'flagship';
}

export function planRank(plan: MembershipPlanName): number {
  return RANK[plan];
}

/** 标准版永久。专业版、旗舰版到期（含到期时刻）后按标准版。 */
export function effectivePlan(
  plan: MembershipPlanName,
  expiresAt: Date | null,
  now: Date,
): MembershipPlanName {
  if (plan === 'standard') return 'standard';
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) return 'standard';
  return plan;
}

/** 同一版本未到期续费，从原到期日往后一年。升级或已过期，从支付时刻起算一年。 */
export function expiryAfterPayment(input: {
  currentPlan: MembershipPlanName;
  currentExpiresAt: Date | null;
  target: PaidMembershipPlan;
  paidAt: Date;
}): Date {
  const effective = effectivePlan(input.currentPlan, input.currentExpiresAt, input.paidAt);
  const sameTierRenewal =
    effective === input.target
    && input.currentExpiresAt !== null
    && input.currentExpiresAt.getTime() > input.paidAt.getTime();
  const base = sameTierRenewal ? input.currentExpiresAt! : input.paidAt;
  const next = new Date(base.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export type MembershipView = {
  enforced: boolean;
  plan: MembershipPlanName;
  expiresAt: string | null;
};

export function membershipLocked(view: MembershipView, minPlan: MembershipPlanName): boolean {
  return view.enforced && planRank(minPlan) > planRank(view.plan);
}

/** Usable experts keep their incoming order and come before locked ones. */
export function orderByMembershipAccess<T extends { minPlan: unknown }>(
  rows: readonly T[],
  view: MembershipView,
): T[] {
  const locked = (minPlan: unknown) => membershipLocked(view, isMembershipPlan(minPlan) ? minPlan : 'flagship');
  return [...rows].sort((left, right) => Number(locked(left.minPlan)) - Number(locked(right.minPlan)));
}
