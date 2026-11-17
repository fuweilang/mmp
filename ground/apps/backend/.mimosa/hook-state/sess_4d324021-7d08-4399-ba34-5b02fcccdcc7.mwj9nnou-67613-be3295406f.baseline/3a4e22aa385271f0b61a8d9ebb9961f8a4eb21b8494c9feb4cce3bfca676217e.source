import { assertTenantActor, type LibraryContext } from './library.context';
import { LibraryError, libraryNotFound } from './library.errors';
import { canKnow, canManage, canSee, matchingCustody } from './library.policy';
import type { Actor, AuditRecord, CustodyRecord, NodeRecord } from './library.types';

/**
 * 鉴权与代管：Actor 校验、可见性/管理权判定、代管授权 CRUD、审计与最近访问。
 * 只持有上下文，不构造 store，也不开事务。
 */
export class LibraryAuthService {
  constructor(private readonly ctx: LibraryContext) {}

  rebind(ctx: LibraryContext): LibraryAuthService {
    return new LibraryAuthService(ctx);
  }

  requireTenantActor(actor: Actor) {
    assertTenantActor(actor);
  }

  requireMember(actor: Actor) {
    this.requireTenantActor(actor);
    if (!actor.activeMember) throw new LibraryError(403, '离开企业后不能继续使用资料库', 'NOT_MEMBER');
  }

  async requireVisible(actor: Actor, nodeId: string) {
    await this.sweep(actor.tenantId);
    const node = await this.ctx.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.custodiesFor(actor);
    if (!canSee(actor, node, custodies, this.ctx.now())) throw libraryNotFound();
    return node;
  }

  async requireVisibleFolder(actor: Actor, parentId: string) {
    const parent = await this.requireVisible(actor, parentId);
    if (parent.kind !== 'FOLDER' || parent.state !== 'ACTIVE') {
      throw new LibraryError(400, '上级不是可用文件夹', 'BAD_PARENT');
    }
    return parent;
  }

  async requireManage(actor: Actor, nodeId: string) {
    await this.sweep(actor.tenantId);
    const node = await this.ctx.store.getNode(nodeId);
    if (!node) throw libraryNotFound();
    const custodies = await this.custodiesFor(actor);
    if (!canKnow(actor, node, custodies, this.ctx.now())) throw libraryNotFound();
    if (!canManage(actor, node, custodies, this.ctx.now())) {
      throw new LibraryError(403, '不能修改该资料', 'FORBIDDEN');
    }
    return node;
  }

  async custodiesFor(actor: Actor) {
    const rows = await this.ctx.store.listCustodies();
    return rows.filter((row) => row.tenantId === actor.tenantId && row.granteeUserId === actor.userId && (!actor.custodyId || row.id === actor.custodyId));
  }

  async auditCustodyRead(actor: Actor, node: NodeRecord) {
    const custody = matchingCustody(actor, node, await this.custodiesFor(actor), this.ctx.now());
    if (custody) await this.writeAudit(actor, 'library_custody_read', { custodyId: custody.id, nodeId: node.id });
  }

  async touch(actor: Actor, node: NodeRecord) {
    if (node.state !== 'ACTIVE') return;
    await this.ctx.store.touchRecent({
      id: this.ctx.store.createId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      nodeId: node.id,
      accessedAt: this.ctx.now(),
    });
  }

  async writeAudit(actor: Actor, action: string, meta: AuditRecord['meta']) {
    await this.ctx.store.audit({
      id: this.ctx.store.createId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      action,
      meta,
      createdAt: this.ctx.now(),
    });
  }

  async sweep(_tenantId: string) {
    // Retention cleanup requires a separately authorized maintenance operation.
    // Reading a list/config/summary must not permanently erase customer files.
  }

  async grantCustody(actor: Actor, input: {
    tenantId: string;
    granteeUserId: string;
    contentScope: 'ENTERPRISE' | 'PRIVATE_OWNER';
    ownerUserId?: string | null;
    powers: 'READ' | 'CRUD';
    expiresAt: number;
    reason: string;
  }) {
    if (actor.userId === input.granteeUserId || !actor.activeMember || actor.tenantId !== input.tenantId
      || (input.contentScope === 'ENTERPRISE' ? !actor.isOrgAdmin : input.ownerUserId !== actor.userId)) {
      throw new LibraryError(403, '代管必须由本企业管理员批准共享范围，或由资料所有者批准私人范围', 'FORBIDDEN');
    }
    const reason = input.reason.trim();
    if (reason.length < 4) throw new LibraryError(400, '请写明代管原因', 'BAD_CUSTODY');
    if (input.expiresAt <= this.ctx.now()) throw new LibraryError(400, '代管到期时间必须晚于现在', 'BAD_CUSTODY');
    if (input.contentScope === 'PRIVATE_OWNER' && !input.ownerUserId) {
      throw new LibraryError(400, '代管私人资料必须指定所有者', 'BAD_CUSTODY');
    }
    const tenants = await this.ctx.store.listTenants();
    if (!tenants.some((tenant) => tenant.id === input.tenantId)) throw libraryNotFound();
    const now = this.ctx.now();
    const ownerUserId = input.contentScope === 'PRIVATE_OWNER' ? input.ownerUserId ?? null : null;
    // 同一组授权键只保留一条有效授权；重复批准时续期覆盖，避免撤销一条后旧授权仍然生效。
    const reusable = (await this.ctx.store.listCustodies()).find((row) =>
      row.tenantId === input.tenantId
      && row.granteeUserId === input.granteeUserId
      && row.contentScope === input.contentScope
      && row.ownerUserId === ownerUserId
      && row.powers === input.powers
      && row.revokedAt === null);
    const row: CustodyRecord = reusable
      ? { ...reusable, expiresAt: input.expiresAt, reason, createdAt: now }
      : {
        id: this.ctx.store.createId(),
        tenantId: input.tenantId,
        grantorUserId: actor.userId,
        granteeUserId: input.granteeUserId,
        contentScope: input.contentScope,
        ownerUserId,
        powers: input.powers,
        expiresAt: input.expiresAt,
        revokedAt: null,
        reason,
        createdAt: now,
      };
    if (reusable) {
      await this.ctx.store.updateCustody(row.id, { expiresAt: row.expiresAt, reason: row.reason, createdAt: row.createdAt });
    } else {
      await this.ctx.store.insertCustody(row);
    }
    await this.ctx.store.audit({
      id: this.ctx.store.createId(),
      tenantId: input.tenantId,
      userId: actor.userId,
      action: 'library_custody_grant',
      meta: { custodyId: row.id, contentScope: row.contentScope, powers: row.powers, granteeUserId: row.granteeUserId },
      createdAt: now,
    });
    return this.custodyView(row);
  }

  async revokeCustody(actor: Actor, custodyId: string) {
    const row = await this.ctx.store.getCustody(custodyId);
    if (!row || (!actor.isPlatformAdmin && !(actor.activeMember && actor.tenantId === row.tenantId
      && (row.grantorUserId === actor.userId || (row.contentScope === 'ENTERPRISE' && actor.isOrgAdmin))))) throw libraryNotFound();
    row.revokedAt = this.ctx.now();
    await this.ctx.store.updateCustody(row.id, { revokedAt: row.revokedAt });
    await this.ctx.store.audit({
      id: this.ctx.store.createId(),
      tenantId: row.tenantId,
      userId: actor.userId,
      action: 'library_custody_revoke',
      meta: { custodyId: row.id },
      createdAt: this.ctx.now(),
    });
    return {
      ...this.custodyView(row),
      message: '已撤销代管，之后不能再读取。已经发生的阅读不会被抹掉。',
    };
  }

  /** Resolve tenant and owner scope from the still-active grant, never from client tenantId. */
  async managedActor(actor: Pick<Actor, 'userId' | 'isPlatformAdmin'>, custodyId: string): Promise<Actor> {
    const grant = await this.ctx.store.getCustody(custodyId);
    if (!actor.isPlatformAdmin || !grant || grant.granteeUserId !== actor.userId || grant.revokedAt !== null || grant.expiresAt <= this.ctx.now()) throw libraryNotFound();
    return { userId: actor.userId, tenantId: grant.tenantId, isPlatformAdmin: true, isOrgAdmin: false, activeMember: false, custodyId: grant.id };
  }

  async listCustody(actor: Actor) {
    const rows = await this.ctx.store.listCustodies();
    return rows.filter(row => actor.isPlatformAdmin || (actor.activeMember && row.tenantId === actor.tenantId
      && (row.grantorUserId === actor.userId || (actor.isOrgAdmin && row.contentScope === 'ENTERPRISE'))))
      .map(row => this.custodyView(row));
  }

  private custodyView(row: CustodyRecord) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      granteeUserId: row.granteeUserId,
      contentScope: row.contentScope,
      ownerUserId: row.ownerUserId,
      powers: row.powers,
      expiresAt: new Date(row.expiresAt).toISOString(),
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
      reason: row.reason,
    };
  }
}
