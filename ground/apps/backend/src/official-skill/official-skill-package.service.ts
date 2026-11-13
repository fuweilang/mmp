import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { absoluteUploadPath, officialSkillPackageRelDir } from '../knowledge/storage';
import { rm } from 'fs/promises';
import { join } from 'path';
import {
  ParsedSkillPackage,
  assertSkillDisplayName,
  assertSkillKey,
  assertSkillSummary,
  assignManifestCategories,
  buildSkillPackageFromForm,
  packagePreview,
  parseSkillCategories,
  parseSkillZip,
  retargetPackageKey,
  skillPackageError,
  storedCategories,
  writeSkillPackageToDisk,
  type OfficialSkillCategoryKey,
} from './skill-package';
import {
  assertFreshStamp,
  candidateSkillKeys,
  packageWriteClaim,
  skillEnableGaps,
  skillEnableMessage,
  zipReplaceDecision,
} from './skill-workflow';
import { displaySourceHash } from './skill-display-i18n';
import type { OfficialSkillService } from './official-skill.service';

export const skillInclude = {
  currentPackage: true,
  agentLinks: { select: { agentId: true, agent: { select: { id: true, key: true, name: true } } } },
} satisfies Prisma.OfficialSkillInclude;

export type SkillRow = Prisma.OfficialSkillGetPayload<{ include: typeof skillInclude }>;

/**
 * 技能包导入/替换/元数据簇（审计 P1-3 package 部分）。
 * SQL、`FOR UPDATE` 加锁顺序、`expectedUpdatedAt` 校验、磁盘回滚（失败删目录）逐行保留。
 */
export class OfficialSkillPackageService {
  constructor(private readonly host: OfficialSkillService) {}

  private get prisma() {
    return this.host.prisma;
  }

  async validateZip(file?: { buffer: Buffer; originalname?: string }) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    const existing = await this.prisma.officialSkill.findUnique({
      where: { key: parsed.manifest.key },
      select: { id: true, enabledAt: true },
    });
    return {
      ...packagePreview(parsed),
      keyConflict: Boolean(existing),
      existingId: existing?.id ?? null,
    };
  }

  async createFromZip(
    actor: User,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null; categories?: unknown },
  ) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    if (parsed.keyDerived) {
      retargetPackageKey(parsed, await this.allocateKey(undefined, parsed.manifest.name));
    } else {
      await this.assertKeyAvailable(parsed.manifest.key);
    }
    const display = this.displayFromOverrides(parsed, overrides);
    this.applyCategories(parsed, this.resolveCategories(overrides));
    return this.persistNewSkill(actor, parsed, file.buffer, display);
  }

  async createFromForm(
    actor: User,
    body: {
      key?: string;
      name: string;
      summary?: string;
      category?: string | null;
      categories?: unknown;
      instruction?: string;
    },
  ) {
    const name = assertSkillDisplayName(body.name);
    const summary = assertSkillSummary(body.summary ?? '');
    const categories = this.resolveCategories(body) ?? [];
    const key = await this.allocateKey(body.key, name);
    const instruction = String(body.instruction ?? '');
    if (!instruction.trim()) {
      const created = await this.prisma.officialSkill.create({
        data: {
          key,
          name,
          summary,
          categories,
          enabledAt: null,
          currentRevision: 0,
          sourceName: name,
          sourceSummary: summary,
          displayProvenance: 'manual',
          displayLocale: 'zh-Hans',
          displaySourceHash: displaySourceHash(name, summary),
        },
      });
      await this.host.audit(actor.id, 'admin_create_official_skill', { skillId: created.id, key, revision: 0 });
      return this.host.adminDetail(created.id, { includeInstruction: true });
    }
    const parsed = buildSkillPackageFromForm({
      key,
      name,
      summary,
      categories,
      instruction,
    });
    return this.persistNewSkill(actor, parsed);
  }

  async updateMeta(
    actor: User,
    id: string,
    body: {
      name?: string;
      summary?: string;
      category?: string | null;
      categories?: unknown;
      instruction?: string;
      expectedUpdatedAt?: string;
      linkedOnly?: boolean;
    },
  ) {
    const row = await this.host.requireSkill(id);
    assertFreshStamp(row.updatedAt.toISOString(), body.expectedUpdatedAt);
    const data: Prisma.OfficialSkillUpdateInput = {};
    if (body.name !== undefined) data.name = assertSkillDisplayName(body.name);
    if (body.summary !== undefined) data.summary = assertSkillSummary(body.summary);
    if (body.name !== undefined || body.summary !== undefined) {
      data.displayProvenance = 'manual';
      if (!row.sourceName) data.sourceName = row.name;
      if (!row.sourceSummary) data.sourceSummary = row.summary;
    }
    const categories = this.resolveCategories(body);
    if (categories !== undefined) {
      data.categories = categories;
    }

    const instructionProvided = body.instruction !== undefined;
    const instructionText = String(body.instruction ?? '');
    if (instructionProvided && !instructionText.trim() && row.currentPackageId) {
      throw new BadRequestException('技能指令不能为空');
    }
    let rebuilt: ParsedSkillPackage | null = null;
    if (instructionProvided && instructionText.trim()) {
      const name = body.name !== undefined ? assertSkillDisplayName(body.name) : row.name;
      const summary = body.summary !== undefined ? assertSkillSummary(body.summary) : row.summary;
      const nextCategories = categories ?? [...row.categories];
      rebuilt = buildSkillPackageFromForm({ key: row.key, name, summary, categories: nextCategories, instruction: instructionText });
    }
    await this.assertEnabledStillComplete(row, {
      name: body.name !== undefined ? String(data.name) : row.name,
      summary: body.summary !== undefined ? String(data.summary) : row.summary,
      instruction: instructionProvided ? instructionText : await this.host.readInstructionIfAny(row),
      hasPackage: Boolean(rebuilt || (row.currentPackageId && !(instructionProvided && !instructionText.trim()))),
    });

    if (!Object.keys(data).length && !rebuilt) {
      throw new BadRequestException('没有可保存的修改');
    }

    if (rebuilt) {
      const built = rebuilt;
      await this.mutateSkill(id, body.expectedUpdatedAt, async (tx, locked) => {
        await this.assertEnabledStillComplete(locked, {
          name: body.name !== undefined ? String(data.name ?? locked.name) : locked.name,
          summary: body.summary !== undefined ? String(data.summary ?? locked.summary) : locked.summary,
          instruction: built.instruction,
          hasPackage: true,
        });
        await this.replacePackage(tx, locked, built, undefined, data);
        await this.host.auditTx(tx, actor.id, 'admin_update_official_skill', {
          skillId: id,
          fields: [...Object.keys(data), 'instruction', 'package'],
        });
      });
      return this.host.adminDetail(id, { includeInstruction: true });
    } else {
      const updated = await this.prisma.officialSkill.updateMany({ where: { id, updatedAt: row.updatedAt }, data });
      if (updated.count !== 1) throw new ConflictException('技能已更新，请重新打开后保存');
      if (row.currentPackageId && (body.name !== undefined || body.summary !== undefined || categories !== undefined)) {
        await this.syncCurrentManifestMeta(id);
      }
    }

    await this.host.audit(actor.id, 'admin_update_official_skill', {
      skillId: id,
      fields: [...Object.keys(data), ...(rebuilt ? ['instruction', 'package'] : [])],
    });
    return this.host.adminDetail(id, { includeInstruction: true });
  }

  async replaceZip(
    actor: User,
    id: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null; categories?: unknown; expectedUpdatedAt?: string },
  ) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    await this.mutateSkill(id, overrides.expectedUpdatedAt, async (tx, row) => {
      const decision = zipReplaceDecision(row.key, { key: parsed.manifest.key, keyDerived: parsed.keyDerived });
      if (!decision.ok) throw skillPackageError('SKILL_PACKAGE_INVALID', decision.message);
      if (parsed.manifest.key !== decision.key) retargetPackageKey(parsed, decision.key);
      const display = this.displayFromOverrides(parsed, overrides, row);
      this.applyCategories(parsed, this.resolveCategories(overrides));
      await this.assertEnabledStillComplete(row, {
        name: display.name,
        summary: display.summary,
        instruction: parsed.instruction,
        hasPackage: true,
      });
      await this.replacePackage(tx, row, parsed, file.buffer, {
        name: display.name,
        summary: display.summary,
        categories: storedCategories(parsed.manifest),
        displayProvenance: display.provenance,
      });
      await this.host.auditTx(tx, actor.id, 'admin_replace_official_skill_package', {
        skillId: id,
        key: row.key,
        revision: row.currentRevision + 1,
      });
    });
    return this.host.adminDetail(id, { includeInstruction: true });
  }

  async assertEnabledStillComplete(
    row: SkillRow,
    next: { name: string; summary: string; instruction: string; hasPackage: boolean },
  ) {
    if (!row.enabledAt) return;
    const gaps = skillEnableGaps(next);
    if (gaps.length) throw new BadRequestException(skillEnableMessage(gaps, 'save'));
  }

  /** Lock the skill row, then run the write. The stamp is checked on the locked row, not on an earlier read. */
  async mutateSkill<T>(
    id: string,
    expectedUpdatedAt: string | undefined,
    run: (tx: Prisma.TransactionClient, row: SkillRow) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM official_skill WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('官方技能不存在');
      const row = await tx.officialSkill.findUnique({ where: { id }, include: skillInclude });
      if (!row || row.deletedAt) throw new NotFoundException('官方技能不存在');
      assertFreshStamp(row.updatedAt.toISOString(), expectedUpdatedAt);
      return run(tx, row);
    }, { timeout: 20000 });
  }

  private async persistNewSkill(
    actor: User,
    parsed: ParsedSkillPackage,
    sourceZip?: Buffer,
    display?: { name: string; summary: string; provenance: 'manual' | 'source' },
  ) {
    const name = display?.name ?? parsed.manifest.name;
    const summary = display?.summary ?? parsed.manifest.description;
    // Create skill row first to get id for storage path; then package + point current.
    const createdId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.officialSkill.create({
        data: {
          key: parsed.manifest.key,
          name,
          summary,
          categories: storedCategories(parsed.manifest),
          enabledAt: null,
          currentRevision: 0,
          sourceName: parsed.manifest.name,
          sourceSummary: parsed.manifest.description,
          displayProvenance: display?.provenance ?? 'source',
          displayLocale: 'zh-Hans',
          displaySourceHash: displaySourceHash(parsed.manifest.name, parsed.manifest.description),
        },
      });
      const revision = 1;
      const rel = officialSkillPackageRelDir(created.id, revision);
      try {
        const written = await writeSkillPackageToDisk(created.id, revision, parsed, sourceZip);
        const pkg = await tx.officialSkillPackage.create({
          data: {
            skillId: created.id,
            revision,
            storagePath: written.storagePath,
            manifest: parsed.manifest as unknown as Prisma.InputJsonValue,
            instructionBytes: Buffer.byteLength(parsed.instruction, 'utf8'),
            resourceCount: parsed.resourceCount,
            sourceZipPath: written.sourceZipPath,
          },
        });
        await tx.officialSkill.update({
          where: { id: created.id },
          data: { currentRevision: revision, currentPackageId: pkg.id },
        });
        await this.host.auditTx(tx, actor.id, 'admin_create_official_skill', {
          skillId: created.id,
          key: created.key,
          revision: 1,
        });
        return created.id;
      } catch (error) {
        await rm(absoluteUploadPath(rel), { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    }, { timeout: 20000 });
    return this.host.adminDetail(createdId, { includeInstruction: true });
  }

  private async replacePackage(
    tx: Prisma.TransactionClient,
    row: SkillRow,
    parsed: ParsedSkillPackage,
    sourceZip: Buffer | undefined,
    extra: Prisma.OfficialSkillUpdateInput = {},
  ) {
    const { revision } = packageWriteClaim(
      { updatedAt: row.updatedAt.toISOString(), revision: row.currentRevision },
      row.updatedAt.toISOString(),
    );
    const rel = officialSkillPackageRelDir(row.id, revision);
    const sourceName = row.sourceName?.trim() || parsed.manifest.name;
    const sourceSummary = row.sourceSummary?.trim() || parsed.manifest.description;
    try {
      const written = await writeSkillPackageToDisk(row.id, revision, parsed, sourceZip);
      const pkg = await tx.officialSkillPackage.create({
        data: {
          skillId: row.id,
          revision,
          storagePath: written.storagePath,
          manifest: parsed.manifest as unknown as Prisma.InputJsonValue,
          instructionBytes: Buffer.byteLength(parsed.instruction, 'utf8'),
          resourceCount: parsed.resourceCount,
          sourceZipPath: written.sourceZipPath,
        },
      });
      await tx.officialSkill.update({
        where: { id: row.id },
        data: {
          currentRevision: revision,
          currentPackageId: pkg.id,
          categories: storedCategories(parsed.manifest),
          ...(!row.sourceName?.trim() ? { sourceName: parsed.manifest.name } : {}),
          ...(!row.sourceSummary?.trim() ? { sourceSummary: parsed.manifest.description } : {}),
          displaySourceHash: displaySourceHash(sourceName, sourceSummary),
          ...extra,
        } as Prisma.OfficialSkillUncheckedUpdateInput,
      });
    } catch (error) {
      await rm(absoluteUploadPath(rel), { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async syncCurrentManifestMeta(skillId: string) {
    const row = await this.host.requireSkill(skillId);
    if (!row.currentPackage) return;
    const prev = (row.currentPackage.manifest ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = {
      ...prev,
      key: row.key,
      name: row.sourceName?.trim() || row.name,
      description: (row.sourceSummary || row.summary || '').trim(),
      entry: 'SKILL.md',
    };
    if (row.categories.length) next.category = row.categories[0];
    else delete next.category;
    if (row.categories.length > 1) next.categories = row.categories;
    else delete next.categories;
    await this.prisma.officialSkillPackage.update({
      where: { id: row.currentPackage.id },
      data: { manifest: next as Prisma.InputJsonValue },
    });
    // Complete package files retain their uploaded bytes; display metadata is database-owned.
    if (prev.packageFormat === 2) return;
    // Legacy packages have a platform-generated skill.json.
    try {
      const abs = join(absoluteUploadPath(row.currentPackage.storagePath), 'skill.json');
      const { writeFile } = await import('fs/promises');
      await writeFile(abs, JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore disk sync failure; DB is authority for meta */
    }
  }

  private displayFromOverrides(
    parsed: ParsedSkillPackage,
    overrides: { name?: string; summary?: string },
    row?: { name: string; summary: string },
  ) {
    const name =
      overrides.name !== undefined && String(overrides.name).trim()
        ? assertSkillDisplayName(overrides.name)
        : (row?.name ?? parsed.manifest.name);
    const summary =
      overrides.summary !== undefined
        ? assertSkillSummary(overrides.summary)
        : (row?.summary ?? parsed.manifest.description);
    const provenance: 'manual' | 'source' =
      name !== parsed.manifest.name || summary !== parsed.manifest.description ? 'manual' : 'source';
    return { name, summary, provenance };
  }

  private applyCategories(parsed: ParsedSkillPackage, categories: OfficialSkillCategoryKey[] | undefined) {
    if (categories === undefined) return;
    assignManifestCategories(parsed.manifest, categories);
    retargetPackageKey(parsed, parsed.manifest.key);
  }

  private resolveCategories(body: { categories?: unknown; category?: string | null }): OfficialSkillCategoryKey[] | undefined {
    if (body.categories !== undefined) return parseSkillCategories(body.categories);
    if (body.category !== undefined) return parseSkillCategories(body.category === '' ? [] : body.category);
    return undefined;
  }

  private async allocateKey(requested: string | undefined, name: string) {
    const explicit = String(requested ?? '').trim();
    if (explicit) {
      const key = assertSkillKey(explicit);
      await this.assertKeyAvailable(key);
      return key;
    }
    const entropy = Array.from({ length: 6 }, () => randomBytes(3).toString('hex'));
    for (const key of candidateSkillKeys(name, entropy)) {
      const existing = await this.prisma.officialSkill.findUnique({ where: { key }, select: { id: true } });
      if (!existing) return key;
    }
    throw new ConflictException('暂时无法生成唯一标识，请重试');
  }

  private async assertKeyAvailable(key: string) {
    assertSkillKey(key);
    const existing = await this.prisma.officialSkill.findUnique({ where: { key } });
    if (existing) {
      throw new ConflictException('技能标识已存在，同标识请走编辑入口替换内容');
    }
  }
}
