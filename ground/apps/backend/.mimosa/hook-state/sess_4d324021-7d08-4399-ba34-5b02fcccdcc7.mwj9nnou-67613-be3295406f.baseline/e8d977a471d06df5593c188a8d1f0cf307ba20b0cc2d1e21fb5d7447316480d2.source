import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LibraryService } from '../library/library.service';
import { KnowledgeCoreError } from './errors';
/** Legacy Library source bridge, never semantic/hash embeddings. Caller selects exact node/version from server-owned session attachments. */
@Injectable()
export class KnowledgeLibrarySourceAdapter {
  constructor(private readonly db: PrismaService, private readonly library: LibraryService) { }
  async readVersion(actorUserId: string, tenantId: string, nodeId: string, versionId: string) {
    const user = await this.db.user.findUnique({
      where: {
        id: actorUserId
      }, select: {
        status: true
      }
    });
    const member = await this.db.orgMember.findUnique({
      where: {
        userId_tenantId: {
          userId: actorUserId, tenantId
        }
      }, include: {
        tenant: true
      }
    });
    if (!user || user.status !== 'active' || !member || member.tenant.status !== 'active')
      throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
    return this.library.readRetrievalVersion({
      userId: actorUserId, tenantId, activeMember: true,
      isOrgAdmin: member.role === 'ADMIN' || member.role === 'OWNER', isPlatformAdmin: false
    }, nodeId, versionId);
  }
}
