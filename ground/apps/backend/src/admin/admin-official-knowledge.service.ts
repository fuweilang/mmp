import { Injectable } from '@nestjs/common';
import { KbStatus, User } from '@prisma/client';
import { OfficialKbService } from '../official-agent/official-kb.service';
import { AdminSupportService } from './admin-support.service';
import { ListOfficialKnowledgeDto } from './dto/official-knowledge.dto';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class AdminOfficialKnowledgeService {
  constructor(
    private support: AdminSupportService,
    private officialKb: OfficialKbService,
  ) {}

  async list(actor: User, query: ListOfficialKnowledgeDto) {
    await this.support.adminScope(actor);
    return this.officialKb.listAdminDocuments({
      keyword: query.keyword,
      agentId: query.agentId,
      status: query.status,
      activeOnly: query.activeOnly === 'false' ? false : true,
    });
  }

  async bindableAgents(actor: User) {
    await this.support.adminScope(actor);
    return this.officialKb.listBindableAgents();
  }

  async detail(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.officialKb.getAdminDocument(id);
  }

  async content(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.officialKb.readAdminContent(id);
  }

  async chunks(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.officialKb.listAdminChunks(id);
  }

  async download(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.officialKb.adminDownload(id);
  }

  async upload(
    actor: User,
    file: UploadedFile | undefined,
    body: { agentId: string; name?: string; assetKey?: string },
  ) {
    await this.support.adminScope(actor);
    return this.officialKb.uploadAdminDocument({
      agentId: body.agentId,
      file,
      name: body.name,
      assetKey: body.assetKey,
    });
  }

  async replace(actor: User, id: string, file: UploadedFile | undefined, name?: string) {
    await this.support.adminScope(actor);
    return this.officialKb.replaceAdminDocument(id, file, name);
  }

  async reindex(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.officialKb.reindexAdminDocument(id);
  }

  /** Expose status enum for callers/tests. */
  statuses(): KbStatus[] {
    return [KbStatus.PENDING, KbStatus.READY, KbStatus.FAILED];
  }
}
