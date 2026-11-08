import type { Actor, CustodyRecord, NodeRecord } from './library.types';

function custodyActive(row: CustodyRecord, now: number): boolean {
  return row.revokedAt == null && row.expiresAt > now;
}

function custodyCovers(actor: Actor, node: NodeRecord, row: CustodyRecord, now: number): boolean {
  if (!custodyActive(row, now)) return false;
  if (row.granteeUserId !== actor.userId || row.tenantId !== node.tenantId) return false;
  if (row.contentScope === 'ENTERPRISE') return node.scope === 'ENTERPRISE';
  return row.contentScope === 'PRIVATE_OWNER'
    && row.ownerUserId === node.ownerUserId
    && node.scope === 'PRIVATE';
}

/** 平台代管是否覆盖这条资料。企业管理员身份本身不算代管。 */
export function matchingCustody(
  actor: Actor,
  node: NodeRecord,
  custodies: readonly CustodyRecord[],
  now: number,
): CustodyRecord | null {
  return custodies.find((row) => custodyCovers(actor, node, row, now)) ?? null;
}

/**
 * 列表和正文可见性。回收站里的资料仍可被有权的人看见标题。
 * 彻底删除的行不出现在列表。跨租户、非成员、他人私人资料都不可见。
 */
export function canSee(
  actor: Actor,
  node: NodeRecord,
  custodies: readonly CustodyRecord[],
  now: number,
): boolean {
  if (node.tenantId !== actor.tenantId) return false;
  if (node.state === 'PURGED') return false;
  const custody = matchingCustody(actor, node, custodies, now);
  if (node.scope === 'PRIVATE') {
    if (node.ownerUserId === actor.userId && actor.activeMember) return true;
    return custody != null;
  }
  if (actor.activeMember) return true;
  return custody != null;
}

/** 曾经有权知道这条资料存在，含已彻底删除的行。无权的人连标题也不能靠 410 探到。 */
export function canKnow(
  actor: Actor,
  node: NodeRecord,
  custodies: readonly CustodyRecord[],
  now: number,
): boolean {
  if (node.state !== 'PURGED') return canSee(actor, node, custodies, now);
  return canSee(actor, { ...node, state: 'ACTIVE' }, custodies, now);
}

/** 改名、移动、回收、删除、改可见性。代管只有 CRUD 才能写。读代管不能改。 */
export function canManage(
  actor: Actor,
  node: NodeRecord,
  custodies: readonly CustodyRecord[],
  now: number,
): boolean {
  if (!canSee(actor, node, custodies, now) && !canKnow(actor, node, custodies, now)) return false;
  if (node.state === 'PURGED') return false;
  if (node.ownerUserId === actor.userId && actor.activeMember) return true;
  if (actor.isOrgAdmin && actor.activeMember && node.scope === 'ENTERPRISE') return true;
  const custody = matchingCustody(actor, node, custodies, now);
  return custody?.powers === 'CRUD';
}
