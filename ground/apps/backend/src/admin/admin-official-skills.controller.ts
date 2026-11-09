import { Put } from '@nestjs/common';
import { UpdateCatalogDiscoveryDto } from './dto/official-skill.dto';
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminOfficialSkillsService } from './admin-official-skills.service';
import {
  CreateOfficialSkillFormDto,
  ListAdminOfficialSkillsDto,
  OfficialSkillIconDto,
  OfficialSkillZipMetaDto,
  UpdateOfficialSkillDto,
} from './dto/official-skill.dto';

const ZIP_LIMIT = 12 * 1024 * 1024;

@Controller('admin/official-skills')
@UseGuards(JwtGuard)
export class AdminOfficialSkillsController {
  constructor(private skills: AdminOfficialSkillsService) {}

  @Get(':id/discovery')
  discovery(@CurrentUser() actor:User,@Param('id') id:string){return this.skills.discovery(actor,id);}

  @Put(':id/discovery')
  saveDiscovery(@CurrentUser() actor: User, @Param('id') id: string, @Body() dto: UpdateCatalogDiscoveryDto) { return this.skills.saveDiscovery(actor,id,dto); }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() actor: User, @Query() query: ListAdminOfficialSkillsDto) {
    return this.skills.list(actor, query);
  }

  @Get('enabled-options')
  @Header('Cache-Control', 'private, no-store')
  enabledOptions(@CurrentUser() actor: User) {
    return this.skills.enabledOptions(actor);
  }

  @Post('translate-display')
  @HttpCode(200)
  translateDisplay(
    @CurrentUser() actor: User,
    @Body() body: { dryRun?: boolean; limit?: number; keys?: string[]; maxAttempts?: number },
  ) {
    return this.skills.translateDisplay(actor, body ?? {});
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.skills.detail(actor, id);
  }

  @Post('validate-zip')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ZIP_LIMIT } }))
  validateZip(
    @CurrentUser() actor: User,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    return this.skills.validateZip(actor, file);
  }

  @Post('from-zip')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ZIP_LIMIT } }))
  createFromZip(
    @CurrentUser() actor: User,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() body: OfficialSkillZipMetaDto,
  ) {
    return this.skills.createFromZip(actor, file, body);
  }

  @Post('from-form')
  @HttpCode(200)
  createFromForm(@CurrentUser() actor: User, @Body() body: CreateOfficialSkillFormDto) {
    return this.skills.createFromForm(actor, body);
  }

  @Post(':id/icon')
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024}}))
  icon(
    @CurrentUser() actor:User,
    @Param('id') id:string,
    @UploadedFile() file:{originalname:string;mimetype:string;size:number;buffer:Buffer}|undefined,
    @Body() body: OfficialSkillIconDto,
  ){
    if(!file) throw new BadRequestException('请选择图片');
    return this.skills.icon(actor,id,file,body?.expectedUpdatedAt);
  }
  @Delete(':id/icon')
  removeIcon(@CurrentUser() actor:User,@Param('id') id:string,@Query('expectedUpdatedAt') expectedUpdatedAt?:string){
    return this.skills.icon(actor,id,undefined,expectedUpdatedAt);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() body: UpdateOfficialSkillDto,
  ) {
    return this.skills.update(actor, id, body);
  }

  @Post(':id/replace-zip')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ZIP_LIMIT } }))
  replaceZip(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() body: OfficialSkillZipMetaDto,
  ) {
    return this.skills.replaceZip(actor, id, file, body);
  }

  @Post(':id/enable')
  @HttpCode(200)
  enable(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.skills.enable(actor, id);
  }

  @Post(':id/disable')
  @HttpCode(200)
  disable(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.skills.disable(actor, id);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.skills.remove(actor, id);
  }
}
