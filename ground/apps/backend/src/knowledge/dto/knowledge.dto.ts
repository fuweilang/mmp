import { AccessScope, KbStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class PatchDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsEnum(KbStatus)
  status?: KbStatus;

  @IsOptional()
  @IsEnum(AccessScope)
  visibility?: AccessScope;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}
