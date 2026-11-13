import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { ExpertRuntimeService } from '../official-agent/expert-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSupportService } from './admin-support.service';
import {
  CreateOfficialAgentDto,
  GrantOfficialAgentDto,
  ListOfficialAgentsDto,
  UpdateOfficialAgentDto,
} from './dto/official-agent.dto';
import { OfficialKbService } from '../official-agent/official-kb.service';
import { OfficialSkillService } from '../official-skill/official-skill.service';
import {
  AdminOfficialAgentDeps,
  AdminOfficialAgentPresenter,
  officialAgentInclude,
} from './admin-official-agent.presenter';
import { AdminOfficialAgentDraftService } from './admin-official-agent.draft.service';
import { AdminOfficialAgentPublishService } from './admin-official-agent.publish.service';
import { AdminOfficialAgentPreviewService } from './admin-official-agent.preview.service';
import { AdminOfficialAgentDiscoveryService } from './admin-official-agent.discovery.service';
import { AdminOfficialAgentGrantService } from './admin-official-agent.grant.service';

/**
 * 官方专家 Admin 组合入口（审计 P1-2 拆分后的门面）。
 *
 * 保持构造签名 `(prisma, support, officialKb, officialSkills, runtime?)` 与全部 public 方法不变：
 * 7 处测试按位置实例化，且 `official-agent-admin.service.test.ts` 会在构造后覆盖
 * `(service as any).officialKb`，因此职责簇通过 `deps()` getter 惰性读取依赖。
 */
@Injectable()
export class AdminOfficialAgentsService {
  private readonly presenter: AdminOfficialAgentPresenter;
  private readonly draft: AdminOfficialAgentDraftService;
  private readonly publishService: AdminOfficialAgentPublishService;
  private readonly preview: AdminOfficialAgentPreviewService;
  private readonly discoveryService: AdminOfficialAgentDiscoveryService;
  private readonly grantService: AdminOfficialAgentGrantService;

  constructor(
    private prisma: PrismaService,
    private support: AdminSupportService,
    private officialKb: OfficialKbService,
    private officialSkills: OfficialSkillService,
    private runtime?: ExpertRuntimeService,
  ) {
    const deps = () => this.deps();
    this.presenter = new AdminOfficialAgentPresenter(() => this.prisma);
    this.draft = new AdminOfficialAgentDraftService(deps, this.presenter);
    this.publishService = new AdminOfficialAgentPublishService(deps, this.presenter);
    this.preview = new AdminOfficialAgentPreviewService(deps);
    this.discoveryService = new AdminOfficialAgentDiscoveryService(deps, this.presenter);
    this.grantService = new AdminOfficialAgentGrantService(deps, this.presenter);
  }

  private deps(): AdminOfficialAgentDeps {
    return {
      prisma: this.prisma,
      support: this.support,
      officialKb: this.officialKb,
      officialSkills: this.officialSkills,
      runtime: this.runtime,
    };
  }

  // ---- 列表与详情（保留在门面，读取路径无需职责簇） ----

  async list(actor: User, query: ListOfficialAgentsDto) {
    await this.support.adminScope(actor);
    const keyword = query.keyword?.trim();
    const keywordWhere: Prisma.OfficialAgentWhereInput = keyword
      ? {
          OR: [
            { id: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
            { key: { contains: keyword, mode: 'insensitive' } },
            { summary: { contains: keyword, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, grouped] = await Promise.all([
      this.prisma.officialAgent.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...keywordWhere,
        },
        include: officialAgentInclude,
        // Newest first so freshly created drafts surface on page 1; id break ties.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.officialAgent.groupBy({
        by: ['status'],
        where: keywordWhere,
        _count: { _all: true },
      }),
    ]);
    const statusCounts = {
      all: 0,
      DRAFT: 0,
      PUBLISHED: 0,
      OFFLINE: 0,
    };
    for (const row of grouped) {
      statusCounts[row.status] = row._count._all;
      statusCounts.all += row._count._all;
    }
    return {
      items: await this.presenter.presentMany(rows),
      statusCounts,
    };
  }

  async detail(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.presenter.load(id);
  }

  // ---- 发现与资产 ----

  discovery(actor: User, id: string) {
    return this.discoveryService.discovery(actor, id);
  }

  saveDiscovery(actor: User, id: string, body: { expectedUpdatedAt: string; discoveryDetail: unknown }) {
    return this.discoveryService.saveDiscovery(actor, id, body);
  }

  listAssetCatalog(actor: User) {
    return this.discoveryService.listAssetCatalog(actor);
  }

  importAssets(actor: User, keys?: string[]) {
    return this.discoveryService.importAssets(actor, keys);
  }

  // ---- 专家 CRUD ----

  create(actor: User, dto: CreateOfficialAgentDto) {
    return this.draft.create(actor, dto);
  }

  update(actor: User, id: string, dto: UpdateOfficialAgentDto) {
    return this.draft.update(actor, id, dto);
  }

  remove(actor: User, id: string) {
    return this.draft.remove(actor, id);
  }

  uploadAvatar(
    actor: User,
    id: string,
    file:
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined,
  ) {
    return this.draft.uploadAvatar(actor, id, file);
  }

  removeAvatar(actor: User, id: string) {
    return this.draft.removeAvatar(actor, id);
  }

  // ---- 发布 / 下线 / 回滚 ----

  publish(actor: User, id: string) {
    return this.publishService.publish(actor, id);
  }

  offline(actor: User, id: string) {
    return this.publishService.offline(actor, id);
  }

  rollback(actor: User, id: string, versionId: string) {
    return this.publishService.rollback(actor, id, versionId);
  }

  bulkOffline(actor: User, ids: string[]) {
    return this.publishService.bulkOffline(actor, ids);
  }

  // ---- 预览 ----

  createPreview(actor: User, id: string) {
    return this.preview.createPreview(actor, id);
  }

  // ---- 企业授权与配额 ----

  grant(actor: User, id: string, dto: GrantOfficialAgentDto) {
    return this.grantService.grant(actor, id, dto);
  }

  revoke(actor: User, id: string, tenantId: string) {
    return this.grantService.revoke(actor, id, tenantId);
  }

  bulkGrant(actor: User, id: string, tenantIds: string[], versionId?: string) {
    return this.grantService.bulkGrant(actor, id, tenantIds, versionId);
  }

  bulkRevoke(actor: User, id: string, tenantIds: string[]) {
    return this.grantService.bulkRevoke(actor, id, tenantIds);
  }
}
