import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OfficialAgentGrantStatus,
  Prisma,
} from '@prisma/client';
import { loadOfficialAgentAssets } from '../official-agent/official-agent-assets';
import { ExpertRuntimeService, executionDraftProjection } from '../official-agent/expert-runtime.service';
import { normalizeExpertDefinition } from '../official-agent/expert-definition';
import { resolvePresentedOfficialAvatarUrl } from '../official-agent/gallery-avatars';
import { OfficialKbService } from '../official-agent/official-kb.service';
import { OfficialSkillService } from '../official-skill/official-skill.service';
import { legacySkillCategory } from '../official-skill/skill-package';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSupportService } from './admin-support.service';

/**
 * 拆分后的共享依赖视图。用 getter 而不是快照，保证测试里替换
 * `(service as any).officialKb = …` 之后各职责簇立即读到新值（原行为）。
 */
export type AdminOfficialAgentDeps = {
  prisma: PrismaService;
  support: AdminSupportService;
  officialKb: OfficialKbService;
  officialSkills: OfficialSkillService;
  runtime?: ExpertRuntimeService;
};

/**
 * 专家展示层（审计 P1-2 A 簇）以及被多个写入簇复用的纯函数。
 * 只做读取与投影，不开事务、不写库；发布/草稿/授权簇均依赖这里，
 * 反向依赖禁止（避免拆分后出现新的环）。
 */
export const officialAgentInclude = {
  onlineVersion: true,
  versions: { orderBy: { version: 'desc' as const } },
  grants: {
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      version: { select: { id: true, version: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  skillLinks: {
    include: {
      skill: {
        select: {
          id: true,
          key: true,
          name: true,
          summary: true,
          categories: true,
          enabledAt: true,
          currentRevision: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.OfficialAgentInclude;

export type OfficialAgentRow = Prisma.OfficialAgentGetPayload<{
  include: typeof officialAgentInclude;
}>;

/** 原样搬自 `admin-official-agents.service.ts` 的私有实现，供发布/预览共用。 */
export function frozenStringList(value: Prisma.JsonValue, label: string): string[] {
  if (!Array.isArray(value)) throw new BadRequestException(`${label}草稿格式异常，请重新保存`);
  const strings = value.filter((item): item is string => typeof item === 'string');
  if (strings.length !== value.length) {
    throw new BadRequestException(`${label}草稿格式异常，请重新保存`);
  }
  return strings;
}

/** Sort object keys recursively so Postgres jsonb key-order churn cannot fake diffs. */
export function stableJson(value: unknown): string {
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input as Record<string, unknown>)
          .sort()
          .map((key) => [key, sortKeys((input as Record<string, unknown>)[key])]),
      );
    }
    return input;
  };
  return JSON.stringify(sortKeys(value) ?? null);
}

export function hasUnpublishedChanges(row: OfficialAgentRow): boolean {
  const online = row.onlineVersion;
  if (!online) return false;
  const draftSkillIds = row.skillLinks.map((link) => link.skillId).slice().sort();
  const onlineSkillIds = (
    Array.isArray(online.linkedSkillSummaries)
      ? online.linkedSkillSummaries
          .map((item) =>
            item && typeof item === 'object' && 'id' in item
              ? String((item as { id?: unknown }).id ?? '')
              : '',
          )
          .filter(Boolean)
      : []
  ).slice().sort();
  // Compare semantic snapshots on both sides. discoveryDetail lives inside expertDefinition,
  // so plaza-intro saves are included; jsonb key order must not create false positives.
  const draftAvatar = row.customAvatarPath || null;
  const onlineAvatar =
    'customAvatarPath' in online
      ? ((online as { customAvatarPath?: string | null }).customAvatarPath || null)
      : null;
  return !(
    stableJson(executionDraftProjection(row.executionConfig)) === stableJson(executionDraftProjection(online.executionConfig)) &&
    row.name === online.name &&
    row.summary === online.summary &&
    row.systemPrompt === online.systemPrompt &&
    draftAvatar === onlineAvatar &&
    stableJson(row.openingQuestions) === stableJson(online.openingQuestions) &&
    stableJson(row.toolScope) === stableJson(online.toolScope) &&
    stableJson(normalizeExpertDefinition(row.expertDefinition, row)) ===
      stableJson(
        normalizeExpertDefinition(online.expertDefinition, {
          name: online.name,
          summary: online.summary,
        }),
      ) &&
    stableJson(draftSkillIds) === stableJson(onlineSkillIds)
  );
}

/** Publish requires complete public+execution essentials; save may keep incomplete drafts. */
export function assertPublishable(agent: {
  name: string;
  summary: string;
  systemPrompt: string;
  expertDefinition: Prisma.JsonValue;
  toolScope: Prisma.JsonValue;
  skillLinks?: Array<{ skillId: string }>;
}): void {
  const missing: string[] = [];
  if (!agent.name.trim()) missing.push('专家名称');
  if (!agent.summary.trim()) missing.push('一句话介绍');
  if (!agent.systemPrompt.trim()) missing.push('专家指令');
  const definition = normalizeExpertDefinition(agent.expertDefinition, agent);
  const profile =
    definition.profile && typeof definition.profile === 'object' && !Array.isArray(definition.profile)
      ? (definition.profile as Record<string, unknown>)
      : {};
  // Storage may fill role from name on save; frontend still requires an explicit 角色定位 before publish.
  const role = typeof profile.role === 'string' ? profile.role.trim() : '';
  if (!role) missing.push('角色定位');
  const tools = Array.isArray(agent.toolScope)
    ? agent.toolScope.filter((item): item is string => typeof item === 'string')
    : [];
  const allowedTools = new Set([
    'enterprise_knowledge',
    'web_search',
    'web_fetch',
    'tabular_analyze',
    'delegate_official_agent',
    'delegate',
  ]);
  if (tools.some((tool) => tool && !allowedTools.has(tool))) {
    missing.push('可用工具（存在无效标识）');
  }
  void agent.skillLinks;
  if (missing.length) {
    throw new BadRequestException(`发布前请完善：${missing.join('、')}`);
  }
}

export async function requireAgentRow(prisma: PrismaService, id: string) {
  const agent = await prisma.officialAgent.findUnique({ where: { id } });
  if (!agent) throw new NotFoundException('官方专家不存在');
  return agent;
}

export async function auditOfficialAgent(
  prisma: PrismaService,
  actorUserId: string,
  action: string,
  tenantId: string | null,
  meta: Prisma.InputJsonObject,
): Promise<void> {
  await prisma.auditLog.create({
    data: { userId: actorUserId, action, tenantId, meta },
  });
}

export class AdminOfficialAgentPresenter {
  constructor(private readonly prisma: () => PrismaService) {}

  async load(id: string) {
    const row = await this.prisma().officialAgent.findUnique({
      where: { id },
      include: officialAgentInclude,
    });
    if (!row) throw new NotFoundException('官方专家不存在');
    const [presented] = await this.presentMany([row]);
    return presented;
  }

  async presentMany(rows: OfficialAgentRow[]) {
    const avatarByKey = this.avatarExplicitByKey();
    const publisherIds = rows.flatMap((row) =>
      row.versions.map((version) => version.publishedByUserId),
    );
    const publisherNames = await this.loadPublisherNames(publisherIds);
    return rows.map((row) => this.present(row, avatarByKey, publisherNames));
  }

  private async loadPublisherNames(userIds: Array<string | null | undefined>) {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma().user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  present(
    row: OfficialAgentRow,
    avatarByKey: Map<string, string | null> = this.avatarExplicitByKey(),
    publisherNames: Map<string, string> = new Map(),
  ) {
    return {
      id: row.id,
      key: row.key,
      kind: row.kind,
      category: row.category,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      status: row.status,
      hasUnpublishedChanges: hasUnpublishedChanges(row),
      avatarUrl: this.resolveAvatarUrl(
        row.key,
        avatarByKey.get(row.key) ?? null,
        row.customAvatarPath ?? null,
      ),
      linkedSkillIds: row.skillLinks.map(link => link.skillId),
      linkedSkills: row.skillLinks.map(({ skill }) => ({ id: skill.id, key: skill.key, name: skill.name, summary: skill.summary, category: legacySkillCategory(skill.categories[0] ?? null), enabledAt: skill.enabledAt?.toISOString() ?? null, packageRevision: skill.currentRevision, enabled: skill.enabledAt !== null })),
      draft: {
        name: row.name,
        summary: row.summary,
        openingQuestions: row.openingQuestions,
        systemPrompt: row.systemPrompt,
        toolScope: row.toolScope,
        expertDefinition: row.expertDefinition,
        executionConfig: row.executionConfig,
      },
      onlineVersion: row.onlineVersion
        ? this.presentVersion(row.onlineVersion, publisherNames)
        : null,
      versions: row.versions.map((version) => this.presentVersion(version, publisherNames)),
      grants: row.grants.map((grant) => ({
        id: grant.id,
        tenant: grant.tenant,
        version: grant.version,
        status: grant.status,
        revokedAt: grant.revokedAt,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
      })),
      activeGrantCount: row.grants.filter(
        (grant) => grant.status === OfficialAgentGrantStatus.ACTIVE,
      ).length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Asset-declared avatar remaps (e.g. niche → avatars/data.jpg). */
  private avatarExplicitByKey(): Map<string, string | null> {
    return new Map(
      loadOfficialAgentAssets().map((asset) => [asset.key, asset.avatar ?? null] as const),
    );
  }

  /**
   * Admin list/detail branding URL. Priority: custom uploaded → packaged asset default.
   * Null → UI first-character fallback. Never invents paths.
   */
  private resolveAvatarUrl(
    key: string,
    explicitAvatar: string | null = null,
    customAvatarPath: string | null = null,
  ): string | null {
    return resolvePresentedOfficialAvatarUrl({
      key,
      customAvatarPath,
      explicitAssetAvatar: explicitAvatar,
    });
  }

  presentVersion(
    version: OfficialAgentRow['versions'][number],
    publisherNames: Map<string, string> = new Map(),
  ) {
    const publishedByUserId = version.publishedByUserId ?? null;
    const publishedByName =
      publishedByUserId && publisherNames.has(publishedByUserId)
        ? publisherNames.get(publishedByUserId) ?? null
        : null;
    return {
      id: version.id,
      version: version.version,
      name: version.name,
      summary: version.summary,
      openingQuestions: version.openingQuestions,
      systemPrompt: version.systemPrompt,
      toolScope: version.toolScope,
      expertDefinition: version.expertDefinition,
      linkedSkillSummaries: Array.isArray(version.linkedSkillSummaries)
        ? version.linkedSkillSummaries
        : [],
      executionConfig: version.executionConfig,
      publishedByUserId,
      // Only expose a real name when the user row still exists; never invent operators.
      publishedByName,
      publishedAt: version.publishedAt,
    };
  }
}
