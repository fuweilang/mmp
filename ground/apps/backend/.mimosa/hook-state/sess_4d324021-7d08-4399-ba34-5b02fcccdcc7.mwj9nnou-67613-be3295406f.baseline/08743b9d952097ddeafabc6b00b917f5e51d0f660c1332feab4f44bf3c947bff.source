import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { existsSync } from 'fs';
import { join } from 'path';
import { absoluteUploadPath, saveOfficialAvatar } from '../knowledge/storage';
import {
  assertFreshStamp,
  planSkillDelete,
  skillDeletePatch,
  skillEnableGaps,
  skillEnableMessage,
} from './skill-workflow';
import { skillPackageError } from './skill-package';
import type { OfficialSkillService } from './official-skill.service';
import type { OfficialSkillPackageService } from './official-skill-package.service';
import { skillInclude, type SkillRow } from './official-skill-package.service';

/**
 * 技能生命周期簇：图标、启用、停用、删除（审计 P1-3 lifecycle 部分）。
 * `FOR UPDATE` 锁、`skillDeletePatch`、级联保留策略与审计字段原样保留。
 */
export class OfficialSkillLifecycleService {
  constructor(
    private readonly host: OfficialSkillService,
    private readonly packages: OfficialSkillPackageService,
  ) {}

  private get prisma() {
    return this.host.prisma;
  }

  async setIcon(id:string,file?:{originalname:string;mimetype:string;buffer:Buffer},actorId?:string,expectedUpdatedAt?:string) {
    const row=await this.host.requireSkill(id);
    assertFreshStamp(row.updatedAt.toISOString(),expectedUpdatedAt);
    let path:string|null=null;
    if(file){try{path=await saveOfficialAvatar(id,file.originalname,file.buffer,file.mimetype);}catch(e){throw new BadRequestException(e instanceof Error?e.message:'图片无效');}}
    const updated=await this.prisma.officialSkill.updateMany({where:{id,updatedAt:row.updatedAt},data:{customAvatarPath:path}});
    if(updated.count!==1)throw new ConflictException('技能已更新，请重新打开后保存');
    if(actorId)await this.host.audit(actorId,file?'admin_upload_official_skill_icon':'admin_remove_official_skill_icon',{skillId:id});
    return this.host.adminDetail(id,{includeInstruction:true});
  }

  async enable(actor: User, id: string) {
    await this.packages.mutateSkill(id, undefined, async (tx, row) => {
      if (row.enabledAt) return;
      const instruction = await this.host.readInstructionIfAny(row);
      const gaps = skillEnableGaps({
        name: row.name,
        summary: row.summary,
        instruction,
        hasPackage: Boolean(row.currentPackageId && row.currentRevision >= 1 && row.currentPackage),
      });
      if (gaps.length) {
        throw new BadRequestException({
          code: 'SKILL_ENABLE_INCOMPLETE',
          message: skillEnableMessage(gaps),
          missing: gaps,
        });
      }
      await tx.officialSkill.update({ where: { id }, data: { enabledAt: new Date() } });
      await this.host.auditTx(tx, actor.id, 'admin_enable_official_skill', { skillId: id, key: row.key });
    });
    return this.host.presentAdmin(await this.host.requireSkill(id));
  }

  async disable(actor: User, id: string) {
    const row = await this.host.requireSkill(id);
    if (!row.enabledAt) return this.host.presentAdmin(row);
    await this.prisma.officialSkill.update({
      where: { id },
      data: { enabledAt: null },
    });
    await this.host.audit(actor.id, 'admin_disable_official_skill', {
      skillId: id,
      key: row.key,
      linkedAgentCount: row.agentLinks.length,
    });
    return this.host.presentAdmin(await this.host.requireSkill(id));
  }

  async remove(actor: User, id: string) {
    const row = await this.prisma.officialSkill.findUnique({ where: { id }, include: skillInclude });
    if (!row || row.deletedAt) throw new NotFoundException('官方技能不存在');
    const plan = planSkillDelete({ enabled: Boolean(row.enabledAt), linkedAgentCount: row.agentLinks.length });
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM official_skill WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('官方技能不存在');
      const fresh = await tx.officialSkill.findUnique({ where: { id }, select: { deletedAt: true } });
      if (!fresh || fresh.deletedAt) throw new NotFoundException('官方技能不存在');
      await tx.officialSkill.update({ where: { id }, data: skillDeletePatch(new Date()) });
      if (plan.hideFromNewUse) {
        await tx.officialCatalogPreference.deleteMany({ where: { kind: 'skill', resourceId: id } });
      }
      await this.host.auditTx(tx, actor.id, 'admin_delete_official_skill', {
        skillId: id,
        key: row.key,
        name: row.name,
        enabled: Boolean(row.enabledAt),
        linkedAgentCount: row.agentLinks.length,
        retained: [
          ...(plan.retainPackages ? ['packages' as const] : []),
          ...(plan.retainAgentLinks ? ['agentLinks' as const] : []),
          ...(plan.retainUserHistory ? ['userHistory' as const] : []),
        ],
      });
    });
    return { ok: true as const, id: row.id, key: row.key, name: row.name };
  }

  private async assertPackageReady(row: SkillRow) {
    if (!row.currentPackageId || row.currentRevision < 1 || !row.currentPackage) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包尚未就绪，无法启用');
    }
    const skillMd = join(absoluteUploadPath(row.currentPackage.storagePath), 'SKILL.md');
    if (!existsSync(skillMd)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包资源不完整，无法启用');
    }
  }
}
