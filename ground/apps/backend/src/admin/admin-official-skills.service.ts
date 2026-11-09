import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { OfficialSkillService } from '../official-skill/official-skill.service';
import { AdminSupportService } from './admin-support.service';
import {
  CreateOfficialSkillFormDto,
  ListAdminOfficialSkillsDto,
  OfficialSkillZipMetaDto,
  UpdateOfficialSkillDto,
} from './dto/official-skill.dto';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class AdminOfficialSkillsService {
  constructor(
    private support: AdminSupportService,
    private skills: OfficialSkillService,
  ) {}

  async icon(actor:User,id:string,file?:UploadedFile,expectedUpdatedAt?:string){await this.support.adminScope(actor);return this.skills.setIcon(id,file,actor.id,expectedUpdatedAt);}

  async discovery(actor:User,id:string){await this.support.adminScope(actor);return this.skills.discovery(id);}

  async saveDiscovery(actor:User,id:string,body:{expectedUpdatedAt:string;discoveryDetail:unknown}) {
    await this.support.adminScope(actor);
    return this.skills.saveDiscovery(actor,id,body);
  }

  async list(actor: User, query: ListAdminOfficialSkillsDto) {
    await this.support.adminScope(actor);
    return this.skills.adminList(query);
  }

  async enabledOptions(actor: User) {
    await this.support.adminScope(actor);
    return this.skills.listEnabledOptions();
  }

  async detail(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.skills.adminDetail(id, { includeInstruction: true });
  }

  async validateZip(actor: User, file: UploadedFile | undefined) {
    await this.support.adminScope(actor);
    return this.skills.validateZip(file);
  }

  async createFromZip(actor: User, file: UploadedFile | undefined, body: OfficialSkillZipMetaDto) {
    await this.support.adminScope(actor);
    return this.skills.createFromZip(actor, file, body);
  }

  async createFromForm(actor: User, body: CreateOfficialSkillFormDto) {
    await this.support.adminScope(actor);
    return this.skills.createFromForm(actor, body);
  }

  async update(actor: User, id: string, body: UpdateOfficialSkillDto) {
    await this.support.adminScope(actor);
    return this.skills.updateMeta(actor, id, body);
  }

  async replaceZip(
    actor: User,
    id: string,
    file: UploadedFile | undefined,
    body: OfficialSkillZipMetaDto,
  ) {
    await this.support.adminScope(actor);
    return this.skills.replaceZip(actor, id, file, body);
  }

  async enable(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.skills.enable(actor, id);
  }

  async disable(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.skills.disable(actor, id);
  }

  async remove(actor: User, id: string) {
    await this.support.adminScope(actor);
    await this.support.assertPlatformOperator(actor, '删除技能');
    return this.skills.remove(actor, id);
  }

  async translateDisplay(
    actor: User,
    body: { dryRun?: boolean; limit?: number; keys?: string[]; maxAttempts?: number },
  ) {
    await this.support.adminScope(actor);
    return this.skills.translateDisplayBatch(actor, body ?? {});
  }
}
