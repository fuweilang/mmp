import { BadRequestException, Body, Controller, Get, Headers, Post, Res, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { OfficialAgentService } from '../official-agent/official-agent.service';
import { LlmChatGatewayService } from './llm-chat.gateway.service';

/**
 * OpenAI-compatible 聊天网关（方案1）。
 * 网关入口：
 * - http://127.0.0.1:5201/api/v1/chat/completions
 * - http://127.0.0.1:5201/console/api/v1/models
 * 鉴权：Cookie `mammothai_access_token` 或 `Authorization: Bearer <jwt>`。
 *
 * 模型可见性：启用模型默认全员可用，按企业停用例外过滤；平台管理员无租户可见全池。
 * 余额不足：HTTP 402，`code=INSUFFICIENT_AI_COINS`（见 LlmChatGatewayService 注释）。
 */
@Controller('v1')
@UseGuards(JwtGuard)
export class LlmChatController {
  constructor(
    private gateway: LlmChatGatewayService,
    private officialAgents: OfficialAgentService,
  ) {}

  @Get('models')
  listModels(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
  ) {
    return this.gateway.listModelsOpenAiShape(user, tenantId);
  }

  @Post('chat/completions')
  async chatCompletions(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() body: Record<string, unknown>,
    @Headers('x-mmp-official-agent-id') agentId: string | undefined,
    @Headers('x-mmp-official-agent-version-id') versionId: string | undefined,
    @Headers('x-mmp-session-id') sessionId: string | undefined,
    @Res() res: Response,
    @Headers('x-mmp-expert-preview-id') previewId?:string,
    @Headers('x-mmp-helper-purpose') helperPurpose?:string,
    @Headers('x-mmp-origin-agent-id') originAgentId?:string,
    @Headers('x-mmp-origin-version-id') originVersionId?:string,
    @Headers('x-mmp-origin-preview-id') originPreviewId?:string,
  ) {
    if(previewId && (!agentId || versionId))throw new BadRequestException('INVALID_PREVIEW_ATTRIBUTION');
    if(!previewId && !agentId !== !versionId)throw new BadRequestException('官方专家归因信息不完整');
    for(const value of [agentId,versionId,previewId,sessionId,originAgentId,originVersionId,originPreviewId])if(value!==undefined&&(!value||value.length>128||/[\x00-\x1f]/.test(value)))throw new BadRequestException('INVALID_RUNTIME_ATTRIBUTION');
    if (helperPurpose !== undefined && (!sessionId || !['compaction','session-title'].includes(helperPurpose))) throw new BadRequestException('INVALID_HELPER_PURPOSE');
    if ((originAgentId || originVersionId || originPreviewId) && (!helperPurpose || !originAgentId || !!originVersionId === !!originPreviewId)) throw new BadRequestException('INVALID_HELPER_ORIGIN');
    // Purpose is attribution only: ordinary binding headers always retain FIXED enforcement.
    // Gateway owns fresh validation and fixed policy enforcement immediately before dispatch.
    await this.gateway.proxyChatCompletions(user,tenantId,body,res,{agentId,versionId,previewId,sessionId,...helperPurpose?{helperPurpose:helperPurpose as 'compaction'|'session-title'}:{},...originAgentId?{helperOrigin:{agentId:originAgentId,versionId:originVersionId,previewId:originPreviewId}}:{}});
  }
}
