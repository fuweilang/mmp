import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { assertSuperAdmin } from '../auth/super-admin';
import {
  expertExecutionPrompt,
  normalizeExpertDefinition,
} from '../official-agent/expert-definition';
import { normalizeExecutionConfig } from '../official-agent/expert-runtime.service';
import {
  AdminOfficialAgentDeps,
  assertPublishable,
  frozenStringList,
} from './admin-official-agent.presenter';

/**
 * 不可变预览簇（审计 P1-2 B 簇的 createPreview）。
 * 只读草稿 + 冻结快照，不写线上版本；Serializable 隔离级别与错误码保持原样。
 */
export class AdminOfficialAgentPreviewService {
  constructor(private readonly deps: () => AdminOfficialAgentDeps) {}

  async createPreview(actor:User,id:string) {
    const { prisma, officialSkills, runtime } = this.deps();
    await assertSuperAdmin(prisma,actor.id);
    const preview=await prisma.$transaction(async tx=>{
      const agent=await tx.officialAgent.findUnique({where:{id},include:{skillLinks:true}});
      if(!agent)throw new NotFoundException('专家不存在');
      const draftExecution=normalizeExecutionConfig(agent.executionConfig);
      if(draftExecution.route==='LEGACY' && (frozenStringList(agent.toolScope,'工具范围').includes('enterprise_knowledge') || await tx.officialKbDocument.count({where:{agentId:id}})>0)) {
        throw new BadRequestException({code:'LEGACY_KNOWLEDGE_PREVIEW_REQUIRES_MIGRATION',message:'旧知识库暂不支持不可变预览。请绑定已就绪的新知识库发布版本，或显式选择 KNOWLEDGE_CORE / OFF 关闭知识检索后预览。已发布旧专家仍可正常使用。'});
      }
      assertPublishable(agent);
      const linkedSkills=await officialSkills.snapshotLinkedSkills(id,tx);
      if(linkedSkills.length!==agent.skillLinks.length)throw new BadRequestException('SKILL_DEPENDENCY_DISABLED');
      const executionConfig=await runtime!.freeze(agent.executionConfig,frozenStringList(agent.toolScope,'工具范围'),linkedSkills,tx);
      return tx.officialExpertPreview.create({data:{agentId:id,actorUserId:actor.id,expiresAt:new Date(Date.now()+30*60*1000),snapshot:{agentId:id,key:agent.key,kind:agent.kind,versionId:null,version:0,systemPrompt:expertExecutionPrompt(agent.systemPrompt,normalizeExpertDefinition(agent.expertDefinition,agent) as Prisma.JsonValue),toolScope:agent.toolScope,linkedSkills,executionConfig} as unknown as Prisma.InputJsonValue}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return {previewId:preview.id,agentId:id,expiresAt:preview.expiresAt.toISOString(),executionProtocol:2,launch:{entry:'expertPreview',path:`/agent?expertPreview=${encodeURIComponent(preview.id)}&expertId=${encodeURIComponent(id)}`}};
  }
}
