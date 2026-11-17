import type { LibraryAuthService } from './library.auth';
import type { LibraryContext } from './library.context';
import { LibraryError } from './library.errors';
import type { Actor } from './library.types';

/** 运维统计：限额视图、配置、所有者计数、平台总览与容量核算。 */
export class LibraryStatsService {
  constructor(
    private readonly ctx: LibraryContext,
    private readonly auth: LibraryAuthService,
  ) {}

  rebind(ctx: LibraryContext, auth: LibraryAuthService): LibraryStatsService {
    return new LibraryStatsService(ctx, auth);
  }

  limitsView() {
    return {
      maxFileBytes: this.ctx.limits.maxFileBytes,
      tenantQuotaBytes: this.ctx.limits.tenantQuotaBytes,
      recycleDays: this.ctx.limits.recycleDays,
      askMaxChars: this.ctx.limits.askMaxChars,
      allowedExtensions: [...this.ctx.limits.allowedExtensions],
    };
  }

  async config(actor: Actor) {
    // A platform account that has not entered an enterprise workbench has no tenant
    // context. Report that state instead of failing every library request with 403,
    // so the client can explain how to enable the library.
    if (!actor.tenantId || !actor.activeMember) return {
      enabled: false,
      reason: 'NO_TENANT',
      message: '请先选择你已加入的有效企业；尚未加入企业时，请联系平台管理员配置成员关系。',
      ...this.limitsView(),
      usedBytes: 0,
    };
    this.auth.requireTenantActor(actor);
    await this.auth.sweep(actor.tenantId);
    return { enabled: true, ...this.limitsView(), usedBytes: await this.usedBytes(actor.tenantId) };
  }

  async ownerCounts(actor: Actor): Promise<Record<string, number>> {
    this.auth.requireTenantActor(actor);
    if (!(actor.isOrgAdmin && actor.activeMember)) throw new LibraryError(403, '只有企业管理员可以查看成员资料', 'FORBIDDEN');
    const counts: Record<string, number> = {};
    for (const node of await this.ctx.store.listNodes(actor.tenantId)) {
      if (node.state !== 'ACTIVE') continue;
      counts[node.ownerUserId] = (counts[node.ownerUserId] ?? 0) + 1;
    }
    return counts;
  }

  async adminStats(actor: { userId: string; isPlatformAdmin: boolean }) {
    if (!actor.isPlatformAdmin) throw new LibraryError(403, '只有平台管理员可以查看资料概况', 'FORBIDDEN');
    const tenants = await this.ctx.store.listTenants();
    const rows = [];
    for (const tenant of tenants) {
      await this.auth.sweep(tenant.id);
      const nodes = await this.ctx.store.listNodes(tenant.id);
      let usedBytes = 0;
      let versionCount = 0;
      const counts = { ready: 0, failed: 0, downloadOnly: 0, pending: 0, processing: 0 };
      for (const node of nodes) {
        if (node.kind !== 'FILE') continue;
        const versions = await this.ctx.store.listVersions(node.id);
        versionCount += versions.length;
        if (node.state !== 'PURGED') {
          for (const version of versions) usedBytes += version.sizeBytes;
        }
        const current = versions.find((version) => version.id === node.currentVersionId);
        if (!current || node.state === 'PURGED') continue;
        if (current.parseStatus === 'READY') counts.ready += 1;
        else if (current.parseStatus === 'FAILED') counts.failed += 1;
        else if (current.parseStatus === 'DOWNLOAD_ONLY') counts.downloadOnly += 1;
        else if (current.parseStatus === 'PROCESSING') counts.processing += 1;
        else counts.pending += 1;
      }
      rows.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        activeFiles: nodes.filter((node) => node.kind === 'FILE' && node.state === 'ACTIVE').length,
        recycledFiles: nodes.filter((node) => node.state === 'RECYCLED').length,
        purgedFiles: nodes.filter((node) => node.state === 'PURGED').length,
        versionCount,
        usedBytes,
        ...counts,
      });
    }
    return { limits: this.limitsView(), tenants: rows };
  }

  async assertQuota(tenantId: string, extra: number) {
    const used = await this.usedBytes(tenantId);
    if (used + extra > this.ctx.limits.tenantQuotaBytes) {
      throw new LibraryError(400, '超出企业资料容量', 'QUOTA');
    }
  }

  private async usedBytes(tenantId: string) {
    const nodes = await this.ctx.store.listNodes(tenantId);
    let used = 0;
    for (const node of nodes) {
      if (node.state === 'PURGED' || node.kind !== 'FILE') continue;
      const versions = await this.ctx.store.listVersions(node.id);
      for (const version of versions) used += version.sizeBytes;
    }
    return used;
  }
}
