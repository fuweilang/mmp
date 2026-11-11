import { OfficialOrchestrateService } from './orchestrate.service';
import { OfficialWebSearchService } from './web-search.service';
import { OfficialWebFetchService } from './web-fetch.service';
import { OfficialTabularAnalyzeService } from './tabular-analyze.service';
import { KnowledgeCoreError } from '../knowledge-core/errors';
import { Body, Controller, HttpException, ForbiddenException, Header, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { User } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser, CurrentTenantId } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { ExpertRuntimeService } from './expert-runtime.service';
class BindingDto {
    @Equals(2)
    executionProtocol!: 2;
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    versionId?: string;
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    previewId?: string;
}
class VisibleMessageDto {
    @IsIn(['user', 'assistant'])
    role!: 'user' | 'assistant';
    @IsString()
    @MaxLength(2000)
    content!: string;
}
class TurnDto extends BindingDto {
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    sessionId!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    turnId!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    query!: string;
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(8)
    @ValidateNested({ each: true })
    @Type(() => VisibleMessageDto)
    context?: VisibleMessageDto[];
}
class ExactSourceDto {
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    knowledgeReleaseId!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    documentId!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    revisionId!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    indexRevisionId!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    chunkId!: string;
}
class SourceDto extends ExactSourceDto {
    @Equals(2) executionProtocol!: 2;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(128) versionId?: string;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(128) previewId?: string;
}
class HistoryEntryDto extends BindingDto {
    @IsString() @MinLength(1) @MaxLength(128) agentId!: string;
    @IsArray() @ArrayMaxSize(1024) @ValidateNested({each:true}) @Type(()=>ExactSourceDto) sources!: ExactSourceDto[];
}
class HistoryDto {
    @IsString() @MinLength(1) @MaxLength(128) userId!: string;
    @IsString() @MinLength(1) @MaxLength(256) scope!: string;
    @IsArray() @ArrayMaxSize(1024) @ValidateNested({each:true}) @Type(()=>HistoryEntryDto) entries!: HistoryEntryDto[];
}
class RuntimeSearchDto extends BindingDto {
    @IsString()
    @MinLength(1)
    @MaxLength(500)
    query!: string;
}
class RuntimeFetchDto extends BindingDto {
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    url!: string;
}
class RuntimeTabularDto extends BindingDto {
    @IsString()
    @MinLength(1)
    @MaxLength(1500000)
    content!: string;
    @IsOptional()
    @IsIn(['csv', 'json', 'auto'])
    format?: 'csv' | 'json' | 'auto';
    @IsOptional()
    @IsString()
    @MaxLength(120)
    groupBy?: string;
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsString({ each: true })
    metrics?: string[];
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    goal?: string;
}
class RuntimeDelegateDto extends BindingDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    targetKey!: string;
    @IsString()
    @MinLength(1)
    @MaxLength(12000)
    task!: string;
    @IsOptional()
    @IsString()
    @MaxLength(1500000)
    tabularContent?: string;
    @IsOptional()
    @IsIn(['csv', 'json', 'auto'])
    tabularFormat?: 'csv' | 'json' | 'auto';
}
@Controller('official-agents/:id/runtime')
@UseGuards(JwtGuard)
export class ExpertRuntimeController {
    constructor(private runtime: ExpertRuntimeService, private searchProvider: OfficialWebSearchService, private fetchProvider: OfficialWebFetchService, private tabular: OfficialTabularAnalyzeService, private orchestrate: OfficialOrchestrateService) { }
    @Post('resolve')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    resolve(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: BindingDto) { return this.runtime.resolve(u, t, { agentId: id, versionId: b.versionId, previewId: b.previewId }); }
    @Post('history/authorize')
    @HttpCode(200)
    @Header('Cache-Control','private, no-store')
    authorizeHistory(@CurrentUser() u:User, @CurrentTenantId() t:string|null, @Body() b:HistoryDto) {
        return this.runtime.authorizeHistory(u,t,b,b.entries.map(({agentId,versionId,previewId,sources})=>({binding:{agentId,versionId,previewId},sources})));
    }
    @Post('retrieve')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    async retrieve(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: TurnDto, 
    @Req()
    req: Request) {
        const abort = new AbortController();
        const cancel = () => abort.abort();
        req.once('aborted', cancel);
        req.res?.once('close', cancel);
        try {
            return await this.runtime.retrieve(u, t, { agentId: id, versionId: b.versionId, previewId: b.previewId }, b, b.query, abort.signal);
        }
        finally {
            req.off('aborted', cancel);
            req.res?.off('close', cancel);
        }
    }
    @Post('search')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    async search(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: RuntimeSearchDto) {
        const binding = { agentId: id, versionId: b.versionId, previewId: b.previewId };
        await this.runtime.authorizeTool(u, t, binding, 'web_search');
        const result = await this.searchProvider.search(b.query);
        await this.runtime.authorizeTool(u, t, binding, 'web_search');
        return result;
    }
    @Post('fetch-url')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    async fetchUrl(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: RuntimeFetchDto) {
        const binding = { agentId: id, versionId: b.versionId, previewId: b.previewId };
        await this.runtime.authorizeTool(u, t, binding, 'web_fetch');
        const result = await this.fetchProvider.fetchUrl(b.url);
        await this.runtime.authorizeTool(u, t, binding, 'web_fetch');
        return result;
    }
    @Post('analyze-tabular')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    async analyze(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: RuntimeTabularDto) {
        const binding = { agentId: id, versionId: b.versionId, previewId: b.previewId };
        await this.runtime.authorizeTool(u, t, binding, 'tabular_analyze');
        const result = this.tabular.analyze(b);
        await this.runtime.authorizeTool(u, t, binding, 'tabular_analyze');
        return result;
    }
    @Post('delegate')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    async delegate(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: RuntimeDelegateDto) {
        const binding = { agentId: id, versionId: b.versionId, previewId: b.previewId };
        await this.runtime.authorizeTool(u, t, binding, 'delegate_official_agent');
        const { execution } = await this.runtime.load(u, t, binding);
        if (execution.key !== 'boss')
            throw new ForbiddenException('仅猛犸大总管可委派其它官方专家');
        const result = await this.orchestrate.delegate(u, t, id, { id: b.previewId ?? b.versionId!, agentId: id, version: execution.version, name: execution.key, systemPrompt: execution.systemPrompt, toolScope: execution.toolScope }, b, b.previewId ? { agentId: id, previewId: b.previewId } : undefined);
        await this.runtime.authorizeTool(u, t, binding, 'delegate_official_agent');
        return result;
    }
    @Post('sources/open')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    @Header('X-Content-Type-Options', 'nosniff')
    async source(
    @CurrentUser()
    u: User, 
    @CurrentTenantId()
    t: string | null, 
    @Param('id')
    id: string, 
    @Body()
    b: SourceDto) { try {
        return await this.runtime.source(u, t, { agentId: id, versionId: b.versionId, previewId: b.previewId }, b);
    }
    catch (error) {
        if (error instanceof KnowledgeCoreError)
            throw new HttpException({ code: error.code, message: error.code }, error.code.includes("NOT_FOUND") ? 404 : 403);
        throw error;
    } }
}
