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
import { Transform, Type } from 'class-transformer';
import { libraryLimitsFromEnv } from './library.limits';

export class CreationScopeDto {
  @IsOptional()
  @IsIn(['PRIVATE', 'ENTERPRISE'])
  scope?: 'PRIVATE' | 'ENTERPRISE';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  confirmShare?: boolean;
}

export class UploadFilesDto extends CreationScopeDto {
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateFolderDto extends UploadFilesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateLinkDto extends CreationScopeDto {
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

  @IsOptional() @IsBoolean() confirmShare?: boolean;
  @IsOptional() @IsString() @MaxLength(64) expectedTreeRevision?: string;
}

export class ScopeNodeDto {
  @IsIn(['PRIVATE', 'ENTERPRISE'])
  scope!: 'PRIVATE' | 'ENTERPRISE';

  @IsOptional()
  @IsBoolean()
  confirmShare?: boolean;

  @IsOptional() @IsBoolean() confirmUnshare?: boolean;
  @IsOptional() @IsString() @MaxLength(64) expectedTreeRevision?: string;
}

export class ScopeImpactQuery {
  @IsIn(['PRIVATE', 'ENTERPRISE'])
  scope!: 'PRIVATE' | 'ENTERPRISE';
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

export class SearchQuery {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q!: string;
}

export class ListQuery {
  @IsOptional() @IsIn(['all', 'ready', 'failed', 'download', 'processing', 'uncitable'])
  status?: 'all' | 'ready' | 'failed' | 'download' | 'processing' | 'uncitable';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  /** Authorized metadata-only picker view; never loads any file body. */
  @IsOptional()
  @IsIn(['1'])
  flat?: '1';

  /** All visible files, every folder depth, paged for the document finder. */
  @IsOptional()
  @IsIn(['1'])
  catalog?: '1';

  /** Agent library. Failed files stay stored and remain visible to Console and Admin. */
  @IsOptional()
  @IsIn(['1'])
  agent?: '1';

  @IsOptional()
  @IsIn(['recent', 'mine', 'shared', 'trash', 'members'])
  view?: 'recent' | 'mine' | 'shared' | 'trash' | 'members';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  q?: string;

  /** 成员资料进入某一个人时使用。其他视图忽略。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  owner?: string;

  @IsOptional()
  @IsIn(['folder', 'link', 'image', 'video', 'pdf', 'word', 'excel', 'ppt', 'text', 'other', 'content'])
  fileType?: string;
}

export const libraryUploadLimit = libraryLimitsFromEnv().maxFileBytes;
