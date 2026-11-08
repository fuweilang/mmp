import {
  ArrayMaxSize,
  IsArray,
  IsInt, Min, Max,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { libraryLimitsFromEnv } from './library.limits';

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class RenameNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;
}

export class MoveNodeDto {
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  parentId!: string | null;
}

export class ScopeNodeDto {
  @IsIn(['PRIVATE', 'ENTERPRISE'])
  scope!: 'PRIVATE' | 'ENTERPRISE';

  @IsOptional()
  @IsBoolean()
  confirmShare?: boolean;
}

export class AskDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  versionIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;
}

export class BatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['recycle', 'restore', 'purge'])
  action!: 'recycle' | 'restore' | 'purge';
}

export class OpenCitationDto {
  @IsOptional() @IsIn(['preview', 'prepare'])
  purpose?: 'preview' | 'prepare';

  @IsString()
  nodeId!: string;

  @IsString()
  versionId!: string;

  @IsOptional()
  @IsString()
  locator?: string;
}

export class GrantCustodyDto {
  @IsString()
  tenantId!: string;

  @IsString()
  granteeUserId!: string;

  @IsIn(['ENTERPRISE', 'PRIVATE_OWNER'])
  contentScope!: 'ENTERPRISE' | 'PRIVATE_OWNER';

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsIn(['READ', 'CRUD'])
  powers!: 'READ' | 'CRUD';

  @IsISO8601()
  expiresAt!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

export class ListQuery {
  @IsOptional() @IsIn(['all', 'ready', 'failed', 'download'])
  status?: 'all' | 'ready' | 'failed' | 'download';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  /** Authorized metadata-only picker view; never loads any file body. */
  @IsOptional()
  @IsIn(['1'])
  flat?: '1';

  @IsOptional()
  @IsIn(['recent', 'mine', 'shared', 'trash'])
  view?: 'recent' | 'mine' | 'shared' | 'trash';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  q?: string;
}

export const libraryUploadLimit = libraryLimitsFromEnv().maxFileBytes;
