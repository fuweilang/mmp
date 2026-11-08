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
  ) {
    if (!agentId !== !versionId) {
      throw new BadRequestException('官方专家归因信息不完整');
    }
    const execution = agentId && versionId
      ? await this.officialAgents.resolve(user, tenantId, agentId, versionId)
      : undefined;
    await this.gateway.proxyChatCompletions(user, tenantId, body, res, execution ? {
      agentId: execution.agentId,
      versionId: execution.versionId,
      ...(sessionId ? { sessionId: sessionId.slice(0, 128) } : {}),
    } : sessionId ? { sessionId: sessionId.slice(0, 128) } : undefined);
  }
}
