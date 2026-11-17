import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { legacySkillCategory, primarySkillCategory, type OfficialSkillCategoryKey } from './skill-package';

export type SkillSummary = {
  id: string;
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategoryKey | null;
  packageRevision: number;
  enabledAt: string | null;
};

/**
 * Agent ↔ Skill 关联与快照（审计 P1-3 拆分的 links 部分）。
 *
 * `setAgentSkillLinks(agentId, skillIds, tx?)` 的 `tx?` 形参被
 * `admin-official-agents.service.ts` 在事务内调用，签名与语义必须一字不差：
 * 有 tx 就在 tx 内写关联，无 tx 才自己开事务。
 */
export async function summarizeEnabledSkills(
  prisma: PrismaService,
  skillIds: string[],
  tx?: Prisma.TransactionClient,
): Promise<SkillSummary[]> {
  if (!skillIds.length) return [];
  const rows = await (tx ?? prisma).officialSkill.findMany({
    where: {
      id: { in: skillIds },
      deletedAt: null,
      enabledAt: { not: null },
      currentRevision: { gt: 0 },
    },
    select: {
      id: true,
      key: true,
      name: true,
      summary: true,
      categories: true,
      currentRevision: true,
      enabledAt: true,
    },
  });
  const order = new Map(skillIds.map((id, index) => [id, index]));
  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      summary: row.summary,
      category: legacySkillCategory(primarySkillCategory(row.categories)),
      packageRevision: row.currentRevision,
      enabledAt: row.enabledAt?.toISOString() ?? null,
    }));
}

export async function listAgentLinkedSkillIds(
  prisma: PrismaService,
  agentId: string,
  tx?: Prisma.TransactionClient,
) {
  const rows = await (tx ?? prisma).officialAgentSkillLink.findMany({
    where: { agentId },
    select: { skillId: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => row.skillId);
}

export async function snapshotLinkedSkills(
  prisma: PrismaService,
  agentId: string,
  tx?: Prisma.TransactionClient,
): Promise<SkillSummary[]> {
  const ids = await listAgentLinkedSkillIds(prisma, agentId, tx);
  return summarizeEnabledSkills(prisma, ids, tx);
}

export async function setAgentSkillLinks(
  prisma: PrismaService,
  agentId: string,
  skillIds: string[],
  tx?: Prisma.TransactionClient,
) {
  const unique = [...new Set(skillIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length) {
    const enabled = await (tx ?? prisma).officialSkill.findMany({
      where: { id: { in: unique }, OR: [{ enabledAt: { not: null } }, { agentLinks: { some: { agentId } } }] },
      select: { id: true },
    });
    if (enabled.length !== unique.length) {
      throw new BadRequestException('只能关联当前已启用的技能');
    }
  }
  const write = async (client: Prisma.TransactionClient) => {
    await client.officialAgentSkillLink.deleteMany({ where: { agentId } });
    if (unique.length) {
      await client.officialAgentSkillLink.createMany({
        data: unique.map((skillId) => ({ agentId, skillId })),
      });
    }
  };
  if (tx) await write(tx); else await prisma.$transaction(write);
  return summarizeEnabledSkills(prisma, unique, tx);
}
