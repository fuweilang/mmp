import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import {
  BeginOfficialSkillSessionDto,
  ListOfficialSkillsQueryDto,
  OfficialSkillContentQueryDto,
  OfficialSkillResourceQueryDto,
} from './dto/official-skill.dto';
import { OfficialSkillService } from './official-skill.service';

@Controller('official-skills')
@UseGuards(JwtGuard)
export class OfficialSkillController {
  constructor(private skills: OfficialSkillService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: User, @Query() query: ListOfficialSkillsQueryDto) {
    void user;
    return this.skills.publicList(query);
  }

  @Get(':id/catalog-detail')
  @Header('Cache-Control','private, no-store')
  catalogDetail(@CurrentUser() user:User,@Param('id') id:string){return this.skills.catalogDetail(user,id);}

  @Get('catalog-page')
  @Header('Cache-Control','private, no-store')
  page(@CurrentUser() user:User,@Query('q') q?:string,@Query('capability') capability?:string,@Query('industry') industry?:string,@Query('cursor') cursor?:string){if(user.status!=='active')throw new ForbiddenException('账号已停用');return this.skills.catalogPage({q,capability,industry,cursor});}
  @Get('catalog-facets')
  @Header('Cache-Control','private, no-store')
  facets(@CurrentUser() user:User){if(user.status!=='active')throw new ForbiddenException('账号已停用');return this.skills.catalogFacets();}

  @Get(':id/content')
  @Header('Cache-Control', 'private, no-store')
  content(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: OfficialSkillContentQueryDto,
  ) {
    void user;
    return this.skills.publicContent(id, query.revision);
  }

  @Get(':id/resources')
  @Header('Cache-Control', 'private, no-store')
  async resource(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: OfficialSkillResourceQueryDto,
  ) {
    void user;
    const info = await this.skills.publicResource(id, query.path, query.revision);
    const encoded = encodeURIComponent(info.path.split('/').pop() || 'resource');
    return new StreamableFile(info.stream, {
      disposition: `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    });
  }

  /** Ground→Host contract: validate + return sessionSource binding; Host creates the session. */
  @Post(':id/sessions')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  beginSession(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BeginOfficialSkillSessionDto,
  ) {
    return this.skills.beginSession(user, id, dto.expectedRevision);
  }
}
