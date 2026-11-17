import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import { createReadStream } from 'fs';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminOfficialKnowledgeService } from './admin-official-knowledge.service';
import {
  ListOfficialKnowledgeDto,
  ReplaceOfficialKnowledgeDto,
  UploadOfficialKnowledgeDto,
} from './dto/official-knowledge.dto';

@Controller('admin/official-knowledge')
@UseGuards(JwtGuard)
export class AdminOfficialKnowledgeController {
  constructor(private knowledge: AdminOfficialKnowledgeService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() actor: User, @Query() query: ListOfficialKnowledgeDto) {
    return this.knowledge.list(actor, query);
  }

  @Get('agents')
  @Header('Cache-Control', 'private, no-store')
  agents(@CurrentUser() actor: User) {
    return this.knowledge.bindableAgents(actor);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.knowledge.detail(actor, id);
  }

  @Get(':id/content')
  @Header('Cache-Control', 'private, no-store')
  content(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.knowledge.content(actor, id);
  }

  @Get(':id/chunks')
  @Header('Cache-Control', 'private, no-store')
  chunks(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.knowledge.chunks(actor, id);
  }

  @Get(':id/file')
  @Header('Cache-Control', 'private, no-store')
  async file(@CurrentUser() actor: User, @Param('id') id: string) {
    const info = await this.knowledge.download(actor, id);
    const encoded = encodeURIComponent(info.name);
    return new StreamableFile(createReadStream(info.abs), {
      type: info.mime,
      disposition: `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    });
  }

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(
    @CurrentUser() actor: User,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() body: UploadOfficialKnowledgeDto,
  ) {
    return this.knowledge.upload(actor, file, body);
  }

  @Post(':id/replace')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  replace(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() body: ReplaceOfficialKnowledgeDto,
  ) {
    return this.knowledge.replace(actor, id, file, body.name);
  }

  @Post(':id/reindex')
  @HttpCode(200)
  reindex(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.knowledge.reindex(actor, id);
  }
}
