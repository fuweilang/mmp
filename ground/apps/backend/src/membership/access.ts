import { ForbiddenException } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import {
  effectivePlan,
  isMembershipPlan,
  membershipLocked,
  type MembershipPlanName,
  type MembershipView,
} from './plan';

type TenantMembershipRow = {
  membershipPlan?: string | null;
  membershipExpiresAt?: Date | null;
  type?: string | null;
};

function tenantFinder(db: object) {
  const tenant = (db as { tenant?: { findUnique?: (args: unknown) => Promise<TenantMembershipRow | null> } }).tenant;
  return typeof tenant?.findUnique === 'function' ? tenant.findUnique.bind(tenant) : null;
}

/** 没选企业，或当前是猛犸总部时不拦。企业按有效版本拦。 */
export async function loadMembershipView(db: object, tenantId: string | null, now = new Date()): Promise<MembershipView> {
  const findUnique = tenantFinder(db);
  if (!tenantId || !findUnique) return { enforced: false, plan: 'flagship', expiresAt: null };
  const tenant = await findUnique({
    where: { id: tenantId },
    select: { membershipPlan: true, membershipExpiresAt: true, type: true },
  });
  if (!tenant || tenant.type === TenantType.PLATFORM) {
    return { enforced: false, plan: 'flagship', expiresAt: null };
  }
  const stored = isMembershipPlan(tenant.membershipPlan) ? tenant.membershipPlan : 'standard';
  return {
    enforced: true,
    plan: effectivePlan(stored, tenant.membershipExpiresAt ?? null, now),
    expiresAt: tenant.membershipExpiresAt?.toISOString() ?? null,
  };
}

export async function assertAgentMembership(
  db: object,
  tenantId: string | null,
  minPlan: MembershipPlanName | string | null | undefined,
): Promise<void> {
  const required = isMembershipPlan(minPlan) ? minPlan : 'flagship';
  const view = await loadMembershipView(db, tenantId);
  if (membershipLocked(view, required)) throw new ForbiddenException('MEMBERSHIP_REQUIRED');
}
