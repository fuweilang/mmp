import { KbStatus } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListOfficialKnowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  @IsOptional()
  @IsEnum(KbStatus)
  status?: KbStatus;

  /** When "false", include inactive staging / superseded rows. Default active-only. */
  @IsOptional()
  @IsBooleanString()
  activeOnly?: string;
}

export class UploadOfficialKnowledgeDto {
  @IsString()
  @MaxLength(64)
  agentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assetKey?: string;
}

export class ReplaceOfficialKnowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
