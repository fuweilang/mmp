import { User } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { absoluteUploadPath } from '../knowledge/storage';
import {
  completeSkillManifest,
  isSkillPackagePath,
} from './skill-package-format';
import { skillPackageError } from './skill-package';
import { skillReadDecision, skillStartDecision } from './skill-workflow';
import { uploadedCatalogIconUrl } from '../official-agent/gallery-avatars';
import { skillDiscovery } from './skill-discovery';
import { isOfficialSkillCategory, type OfficialSkillCategoryKey } from './skill-package';
import type { OfficialSkillService } from './official-skill.service';

/**
 * 面向客户端的公开技能读取簇（审计 P1-3 public 部分）。
 * `deletedAt/enabledAt/currentRevision` 三重过滤、`FOR UPDATE` 启动校验、
 * 资源白名单与路径穿越防护逐行保留。
 */
export class OfficialSkillPublicService {
  constructor(private readonly host: OfficialSkillService) {}

  private get prisma() {
    return this.host.prisma;
  }

  /** Public enabled directory for both clients. */
  async publicList(query: { q?: string; category?: string; taxonomy?: 'industry' | 'facets' }) {
    const q = query.q?.trim();
    const category =
      query.category && isOfficialSkillCategory(query.category) ? query.category : undefined;
    const rows = await this.prisma.officialSkill.findMany({
      where: {
        deletedAt: null,
        enabledAt: { not: null },
        currentRevision: { gt: 0 },
        ...(category ? { categories: { has: category } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { summary: { contains: q, mode: 'insensitive' } },
                ...(isOfficialSkillCategory(q) ? [{ categories: { has: q as OfficialSkillCategoryKey } }] : []),
              ],
            }
          : {}),
      },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        categories: true,
        enabledAt: true,
        currentRevision: true,
      },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((row) => {
      const card = this.host.publicCard(row, query.taxonomy === 'industry' || query.taxonomy === 'facets');
      const discovery = query.taxonomy === 'facets' ? skillDiscovery(row.key) : undefined;
      return discovery ? { ...card, discovery } : card;
    });
  }

  async publicContent(id: string, revision?: number, packageFormat?: number) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: { currentPackage: true, packages: true },
    });
    if (!row) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    const decision = skillReadDecision({
      deleted: Boolean(row.deletedAt),
      enabled: Boolean(row.enabledAt),
      pinnedRevision: revision,
    });
    if (!decision.ok) throw skillPackageError(decision.code, decision.message, 403);
    const targetRevision = revision ?? row.currentRevision;
    const pkg =
      row.packages.find((item) => item.revision === targetRevision) ??
      (row.currentPackage?.revision === targetRevision ? row.currentPackage : null);
    if (!pkg) {
      throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本不可用', 404);
    }
    const instruction = await this.host.readInstructionFromPath(pkg.storagePath);
    const manifest = pkg.manifest as {
      references?: Array<{ path: string }>;
      name?: string;
      description?: string;
      key?: string;
    };
    const complete = completeSkillManifest(pkg.manifest);
    if (complete) {
      if (packageFormat !== 2) throw skillPackageError('SKILL_CLIENT_UPGRADE_REQUIRED', '此技能包含完整包内容，请更新客户端后使用', 409);
      return {
        id: row.id, key: row.key, name: row.name, summary: row.summary,
        packageRevision: pkg.revision, instruction, ...complete,
      };
    }
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      summary: row.summary,
      packageRevision: pkg.revision,
      instruction,
      references: Array.isArray(manifest.references) ? manifest.references : [],
    };
  }

  async publicResource(id: string, resourcePath: string, revision?: number) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: { packages: true, currentPackage: true },
    });
    if (!row) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    const decision = skillReadDecision({
      deleted: Boolean(row.deletedAt),
      enabled: Boolean(row.enabledAt),
      pinnedRevision: revision,
    });
    if (!decision.ok) throw skillPackageError(decision.code, decision.message, 403);
    const safe = String(resourcePath || '');
    if (!isSkillPackagePath(safe)) throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    const targetRevision = revision ?? row.currentRevision;
    const pkg = row.packages.find((item) => item.revision === targetRevision);
    if (!pkg) {
      throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本不可用', 404);
    }
    const manifest = pkg.manifest as { references?: Array<{ path: string }> };
    const complete = completeSkillManifest(pkg.manifest);
    const allowed = new Set(complete ? complete.files.map(file => file.path) :
      (Array.isArray(manifest.references) ? manifest.references.map(item => item.path).filter(path => path.startsWith('references/')) : []));
    if (!allowed.has(safe)) {
      throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    }
    const abs = join(absoluteUploadPath(pkg.storagePath), ...safe.split('/'));
    if (!abs.startsWith(absoluteUploadPath(pkg.storagePath)) || !existsSync(abs)) {
      throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    }
    return {
      abs,
      path: safe,
      stream: createReadStream(abs),
    };
  }

  /**
   * Ground contract for Host to start a skill-sourced session.
   * Does not create Host sessions; returns frozen binding payload only.
   */
  async beginSession(user: User, id: string, expectedRevision?: number) {
    this.host.requireActiveAccount(user);
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM official_skill WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
      const fresh = await tx.officialSkill.findUnique({ where: { id } });
      if (!fresh) throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
      const decision = skillStartDecision({
        deleted: Boolean(fresh.deletedAt),
        enabled: Boolean(fresh.enabledAt),
        revision: fresh.currentRevision,
      });
      if (!decision.ok) throw skillPackageError(decision.code, decision.message, 403);
      if (expectedRevision != null && expectedRevision !== fresh.currentRevision) {
        throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本已更新，请刷新后重试', 409);
      }
      return fresh;
    });
    return {
      sessionSource: {
        type: 'skill' as const,
        id: row.id,
        key: row.key,
        name: row.name,
        packageRevision: row.currentRevision,
        ...(uploadedCatalogIconUrl(row.customAvatarPath)
          ? { avatarUrl: uploadedCatalogIconUrl(row.customAvatarPath) }
          : {}),
      },
      skill: this.host.publicCard(row),
      /** Host should keep standard mode capabilities; Ground does not expand tool registry here. */
      standardCapabilities: {
        files: true,
        terminal: true,
        network: true,
      },
      loadPolicy: {
        initialContext: 'summary_only',
        instructionOnDemand: true,
        contentPath: `/api/official-skills/${row.id}/content?revision=${row.currentRevision}`,
      },
    };
  }
}
