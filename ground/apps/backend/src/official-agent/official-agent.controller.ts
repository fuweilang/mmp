import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { createReadStream } from 'fs';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import {
  AnalyzeTabularOfficialAgentDto,
  DelegateOfficialAgentDto,
  FetchUrlOfficialAgentDto,
  ResolveOfficialAgentDto,
  RetrieveOfficialAgentDto,
  SearchOfficialAgentDto,
  UpdateOfficialAgentScopeDto,
} from './dto/official-agent.dto';
import { OfficialAgentService } from './official-agent.service';

@Controller('official-agents')
@UseGuards(JwtGuard)
export class OfficialAgentController {
  constructor(private officialAgents: OfficialAgentService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.officialAgents.list(user, tenantId);
  }

  @Get(':id/catalog-detail')
  @Header('Cache-Control','private, no-store')
  catalogDetail(@CurrentUser() user:User,@Param('id') id:string){return this.officialAgents.catalogDetail(user,id);}

  @Get('catalog-page')
  @Header('Cache-Control','private, no-store')
  page(@CurrentUser() user:User,@Query('q') q?:string,@Query('capability') capability?:string,@Query('industry') industry?:string,@Query('cursor') cursor?:string){return this.officialAgents.catalogPage(user,{q,capability,industry,cursor});}
  @Get('catalog-home')
  @Header('Cache-Control','private, no-store')
  home(@CurrentUser() user:User,@Query('q') q?:string,@Query('capability') capability?:string,@Query('industry') industry?:string){return this.officialAgents.catalogHome(user,{q,capability,industry});}
  @Get('catalog-facets')
  @Header('Cache-Control','private, no-store')
  facets(@CurrentUser() user:User){return this.officialAgents.catalogFacets(user);}
  @Get(':id/catalog-card')
  @Header('Cache-Control','private, no-store')
  card(@CurrentUser() user:User,@Param('id') id:string){return this.officialAgents.catalogCard(user,id);}

  @Get('console/scopes')
  @Header('Cache-Control', 'private, no-store')
  consoleList(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.officialAgents.consoleList(user, tenantId);
  }

  @Put(':id/scope')
  updateScope(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateOfficialAgentScopeDto,
  ) {
    return this.officialAgents.updateScope(user, tenantId, id, dto.kbFolderIds);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  resolve(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ResolveOfficialAgentDto,
  ) {
    return this.officialAgents.resolve(user, tenantId, id, dto.versionId, dto.executionProtocol);
  }

  @Post(':id/retrieve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  retrieve(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: RetrieveOfficialAgentDto,
  ) {
    return this.officialAgents.retrieve(user, tenantId, id, dto.versionId, dto.query);
  }

  @Post(':id/search')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  search(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: SearchOfficialAgentDto,
  ) {
    return this.officialAgents.webSearch(user, tenantId, id, dto.versionId, dto.query);
  }


  @Post(':id/analyze-tabular')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  analyzeTabular(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: AnalyzeTabularOfficialAgentDto,
  ) {
    return this.officialAgents.analyzeTabular(user, tenantId, id, dto.versionId, {
      content: dto.content,
      format: dto.format,
      groupBy: dto.groupBy,
      metrics: dto.metrics,
      goal: dto.goal,
    });
  }

  @Post(':id/fetch-url')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  fetchUrl(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: FetchUrlOfficialAgentDto,
  ) {
    return this.officialAgents.fetchUrl(user, tenantId, id, dto.versionId, dto.url);
  }

  @Post(':id/delegate')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  delegate(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: DelegateOfficialAgentDto,
  ) {
    return this.officialAgents.delegate(user, tenantId, id, dto.versionId, {
      targetKey: dto.targetKey,
      task: dto.task,
      tabularContent: dto.tabularContent,
      tabularFormat: dto.tabularFormat,
    });
  }

  @Get(':id/sources/:documentId')
  @Header('Cache-Control', 'private, no-store')
  async source(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Query('versionId') versionId: string | undefined,
  ) {
    const info = await this.officialAgents.source(user, tenantId, id, versionId, documentId);
    const encoded = encodeURIComponent(info.name);
    return new StreamableFile(createReadStream(info.abs), {
      type: 'application/octet-stream',
      disposition: `attachment; filename*=UTF-8''${encoded}`,
    });
  }
}
