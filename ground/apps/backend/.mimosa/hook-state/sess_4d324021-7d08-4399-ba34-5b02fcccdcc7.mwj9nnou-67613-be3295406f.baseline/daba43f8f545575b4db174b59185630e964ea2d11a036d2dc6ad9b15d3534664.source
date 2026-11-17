import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { assertSuperAdmin } from '../auth/super-admin';
import { normalizeExpertDefinition } from '../official-agent/expert-definition';
import { ExpertRuntimeService, normalizeExecutionConfig } from '../official-agent/expert-runtime.service';
import {
  isOfficialAgentCategory,
  normalizeCapabilities,
} from '../official-agent/gallery-presentation';
import {
  absoluteUploadPath,
  removeStoredFile,
  saveOfficialAvatar,
} from '../knowledge/storage';
import { existsSync } from 'fs';
import { CreateOfficialAgentDto, UpdateOfficialAgentDto } from './dto/official-agent.dto';
import {
  AdminOfficialAgentDeps,
  AdminOfficialAgentPresenter,
  auditOfficialAgent,
  requireAgentRow,
} from './admin-official-agent.presenter';

type DraftConfig = {
  name: string;
  summary: string;
  openingQuestions: string[];
  systemPrompt: string;
  toolScope: string[];
};

/**
 * 专家 CRUD 簇（审计 P1-2 B 簇的创建/编辑/删除 + 头像写入）。
 * 事务边界、错误码、审计动作与原服务逐行一致。
 */
export class AdminOfficialAgentDraftService {
  constructor(
    private readonly deps: () => AdminOfficialAgentDeps,
    private readonly presenter: AdminOfficialAgentPresenter,
  ) {}

  async create(actor: User, dto: CreateOfficialAgentDto) {
    const { prisma, officialSkills } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const existing = await prisma.officialAgent.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('专家标识已存在');

    const draft = this.normalizeDraft(dto);
    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.officialAgent.create({
      data: {
        key: dto.key,
        kind: dto.kind,
        ...draft,
        executionConfig: normalizeExecutionConfig(dto.executionConfig) as unknown as Prisma.InputJsonValue,
        expertDefinition: normalizeExpertDefinition(dto.expertDefinition, draft),
        ...(dto.category && isOfficialAgentCategory(dto.category)
          ? { category: dto.category }
          : {}),
        ...(dto.capabilities !== undefined
          ? { capabilities: normalizeCapabilities(dto.capabilities) }
          : {}),
      },
      });
      if (dto.linkedSkillIds !== undefined) await officialSkills.setAgentSkillLinks(created.id, dto.linkedSkillIds, tx);
      return created;
    });
    await auditOfficialAgent(prisma, actor.id, 'admin_create_official_agent', null, {
      agentId: created.id,
      key: created.key,
      kind: created.kind,
      linkedSkillIds: dto.linkedSkillIds ?? [],
    });
    return this.presenter.load(created.id);
  }

  async update(actor: User, id: string, dto: UpdateOfficialAgentDto) {
    const { prisma, officialSkills } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const existing = await requireAgentRow(prisma, id);
    const data: Prisma.OfficialAgentUpdateInput = {};
    if (dto.executionConfig !== undefined) data.executionConfig = normalizeExecutionConfig(dto.executionConfig) as unknown as Prisma.InputJsonValue;
    if (dto.name !== undefined) data.name = this.requiredText(dto.name, '名称');
    if (dto.summary !== undefined) data.summary = dto.summary.trim();
    if (dto.openingQuestions !== undefined) {
      data.openingQuestions = this.normalizeList(dto.openingQuestions);
    }
    if (dto.systemPrompt !== undefined) {
      data.systemPrompt = dto.systemPrompt.trim();
    }
    if (dto.toolScope !== undefined) data.toolScope = this.normalizeList(dto.toolScope);
    if (dto.category !== undefined) {
      if (!isOfficialAgentCategory(dto.category)) {
        throw new BadRequestException('分类无效');
      }
      data.category = dto.category;
    }
    if (dto.capabilities !== undefined) {
      data.capabilities = normalizeCapabilities(dto.capabilities);
    }
    if (dto.expertDefinition !== undefined) data.expertDefinition = normalizeExpertDefinition(dto.expertDefinition, { name: dto.name ?? existing.name, summary: dto.summary ?? existing.summary });
    if (!Object.keys(data).length && dto.linkedSkillIds === undefined) {
      throw new BadRequestException('没有可保存的修改');
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.officialAgent.update({ where: { id }, data });
      if (dto.linkedSkillIds !== undefined) await officialSkills.setAgentSkillLinks(id, dto.linkedSkillIds, tx);
    });
    await auditOfficialAgent(prisma, actor.id, 'admin_update_official_agent_draft', null, {
      agentId: id,
      fields: [
        ...Object.keys(data),
        ...(dto.linkedSkillIds !== undefined ? ['linkedSkillIds'] : []),
      ],
    });
    return this.presenter.load(id);
  }

  /**
   * Physical delete. Cascades versions/grants/skillLinks/official KB owned by this expert.
   * Does not touch OfficialSkill bodies, user sessions/messages, or enterprise libraries.
   * Host sessions keep frozen binding snapshots; new starts fail because the catalog row is gone.
   */
  async remove(actor: User, id: string) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    let avatarPath: string | null | undefined;
    let snapshot: { id: string; key: string; name: string; status: string };
    try {
      await prisma.$transaction(async (tx) => {
        const agent = await tx.officialAgent.findUnique({ where: { id } });
        if (!agent) throw new NotFoundException('官方专家不存在');
        avatarPath = agent.customAvatarPath;
        snapshot = { id: agent.id, key: agent.key, name: agent.name, status: agent.status };
        // Break OfficialAgent.onlineVersionId ↔ Version circular FK before cascading versions.
        if (agent.onlineVersionId) {
          await tx.officialAgent.update({
            where: { id },
            data: { onlineVersion: { disconnect: true } },
          });
        }
        await tx.officialAgent.delete({ where: { id } });
        // Preferences are soft references (no FK); clear so favourites cannot resurrect UI ghosts.
        await tx.officialCatalogPreference.deleteMany({
          where: { kind: 'expert', resourceId: id },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'admin_delete_official_agent',
            meta: {
              agentId: snapshot.id,
              key: snapshot.key,
              name: snapshot.name,
              status: snapshot.status,
            },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034' || error.code === 'P2025')
      ) {
        throw new ConflictException('删除冲突，请刷新后重试');
      }
      throw error;
    }
    if (avatarPath) {
      try {
        await removeStoredFile(avatarPath);
      } catch {
        // Orphan avatar file is acceptable; config row is already gone.
      }
    }
    return { ok: true as const, id: snapshot!.id, key: snapshot!.key, name: snapshot!.name };
  }

  /**
   * Upload / replace Admin custom avatar for one official agent.
   * Persists immediately (not draft-gated); does not publish prompt/config.
   */
  async uploadAvatar(
    actor: User,
    id: string,
    file:
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined,
  ) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    if (!file?.buffer?.length) throw new BadRequestException('请选择头像图片');
    const current = await prisma.officialAgent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('官方专家不存在');
    let storagePath: string;
    try {
      storagePath = await saveOfficialAvatar(
        current.id,
        file.originalname || 'avatar.png',
        file.buffer,
        file.mimetype,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '头像上传失败');
    }
    // Confirm file landed before swapping DB pointer.
    const abs = absoluteUploadPath(storagePath);
    if (!existsSync(abs)) {
      throw new BadRequestException('头像写入失败');
    }
    await prisma.officialAgent.update({
      where: { id },
      data: { customAvatarPath: storagePath },
    });
    // Never delete a file still frozen on any published version snapshot.
    if (current.customAvatarPath && current.customAvatarPath !== storagePath) {
      const referenced = await prisma.officialAgentVersion.count({
        where: { customAvatarPath: current.customAvatarPath },
      });
      if (referenced === 0) {
        await removeStoredFile(current.customAvatarPath);
      }
    }
    await auditOfficialAgent(prisma, actor.id, 'admin_upload_official_agent_avatar', null, {
      agentId: id,
      key: current.key,
      customAvatarPath: storagePath,
    });
    return this.presenter.load(id);
  }

  async removeAvatar(actor: User, id: string) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const current = await requireAgentRow(prisma, id);
    const previous = current.customAvatarPath || null;
    await prisma.officialAgent.update({ where: { id }, data: { customAvatarPath: '' } });
    if (previous) {
      const referenced = await prisma.officialAgentVersion.count({
        where: { customAvatarPath: previous },
      });
      if (referenced === 0) await removeStoredFile(previous);
    }
    await auditOfficialAgent(prisma, actor.id, 'admin_remove_official_agent_avatar', null, { agentId: id });
    return this.presenter.load(id);
  }

  private normalizeDraft(dto: CreateOfficialAgentDto): DraftConfig {
    // Save allows incomplete drafts; publish runs assertPublishable for required fields.
    return {
      name: this.requiredText(dto.name, '专家名称'),
      summary: (dto.summary ?? '').trim(),
      openingQuestions: this.normalizeList(dto.openingQuestions ?? []),
      systemPrompt: (dto.systemPrompt ?? '').trim(),
      toolScope: this.normalizeList(dto.toolScope ?? []),
    };
  }

  private normalizeList(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private requiredText(value: string, label: string) {
    const text = value.trim();
    if (!text) throw new BadRequestException(`${label}不能只包含空白字符`);
    return text;
  }
}
