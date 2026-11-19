import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { AvatarGenerationService } from './avatar-generation.service';
class GenerateAvatarDto {
  @IsString() @MaxLength(100) providerId!: string;
  @IsString() @MaxLength(100) model!: string;
  @IsString() @MinLength(1) @MaxLength(1000) prompt!: string;
}
@Controller('admin/avatar-generation')
@UseGuards(JwtGuard)
export class AdminAvatarController {
  constructor(private readonly avatars: AvatarGenerationService) {}
  @Get('models') models(@CurrentUser() actor: User) {return this.avatars.models(actor);}
  @Post('models/sync') sync(@CurrentUser() actor: User) {return this.avatars.sync(actor);}
  @Post() generate(@CurrentUser() actor: User, @Body() input: GenerateAvatarDto) {return this.avatars.generate(actor,input);}
}
