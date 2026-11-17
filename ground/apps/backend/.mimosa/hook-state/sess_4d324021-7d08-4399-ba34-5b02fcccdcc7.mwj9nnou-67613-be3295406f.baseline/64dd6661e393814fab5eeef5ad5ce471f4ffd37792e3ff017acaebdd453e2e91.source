import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { CreateLlmProviderDto, UpdateLlmProviderDto } from '../llm/dto/llm-provider.dto';
import { LlmProvidersService } from '../llm/llm-providers.service';
import { KnowledgeSuperAdminGuard } from './admin.controller';

export class UpdateKnowledgeProviderDto extends UpdateLlmProviderDto {
  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;
}

/** Super-admin entry to the existing encrypted owner; retrieval models never become chat models. */
@Controller('admin/knowledge-core/providers')
@UseGuards(JwtGuard, KnowledgeSuperAdminGuard)
export class KnowledgeProviderAdminController {
  constructor(private readonly providers: LlmProvidersService) {}
  @Get()
  list(@CurrentUser() actor: User) { return this.providers.list(actor); }
  @Post()
  create(@CurrentUser() actor: User, @Body() dto: CreateLlmProviderDto) {
    if (dto.models?.length) throw new BadRequestException('检索供应商凭据入口不创建聊天模型');
    return this.providers.create(actor, { ...dto, models: [] });
  }
  @Patch(':id')
  update(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateKnowledgeProviderDto) {
    const { clearApiKey, apiKey, ...fields } = dto;
    if (clearApiKey && apiKey?.trim()) throw new BadRequestException('清除密钥与更新密钥不能同时提交');
    return this.providers.update(actor, id, {
      ...fields,
      ...(clearApiKey ? { apiKey: '' } : apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
    });
  }
}
