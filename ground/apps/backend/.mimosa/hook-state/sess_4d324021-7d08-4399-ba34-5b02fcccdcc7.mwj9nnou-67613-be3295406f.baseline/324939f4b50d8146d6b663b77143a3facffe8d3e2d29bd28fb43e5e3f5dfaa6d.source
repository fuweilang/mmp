import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOfficialAgentDto {
  @IsOptional() @IsObject() executionConfig?: Record<string, unknown>;
  @IsString()
  /** 允许 latest 风格 key，如 mammoth / c3274112ed041 / copy-polish-master */
  @Matches(/^[a-z][a-z0-9-]{1,63}$/, {
    message: '标识需以小写字母开头，只能包含小写字母、数字和连字符',
  })
  key!: string;

  @IsIn(['GENERAL', 'KNOWLEDGE'])
  kind!: 'GENERAL' | 'KNOWLEDGE';

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(1000)
  summary!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  openingQuestions!: string[];

  @IsString()
  @MaxLength(60000)
  systemPrompt!: string;

  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  toolScope!: string[];

  @IsOptional()
  @IsIn(['common', 'productivity', 'content', 'sales', 'expertise', 'analytics'])
  category?: 'common' | 'productivity' | 'content' | 'sales' | 'expertise' | 'analytics';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  capabilities?: string[];

  /** 关联已启用官方技能 id 列表。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  linkedSkillIds?: string[];

  @IsOptional()
  @IsObject()
  expertDefinition?: Record<string, unknown>;
}

export class UpdateOfficialAgentDto {
  @IsOptional() @IsObject() executionConfig?: Record<string, unknown>;
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  openingQuestions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60000)
  systemPrompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  toolScope?: string[];

  @IsOptional()
  @IsIn(['common', 'productivity', 'content', 'sales', 'expertise', 'analytics'])
  category?: 'common' | 'productivity' | 'content' | 'sales' | 'expertise' | 'analytics';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  capabilities?: string[];

  /** 关联已启用官方技能 id 列表；传空数组清空。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  linkedSkillIds?: string[];

  @IsOptional()
  @IsObject()
  expertDefinition?: Record<string, unknown>;
}

export class GrantOfficialAgentDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  versionId?: string;
}

export class ListOfficialAgentsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'OFFLINE'])
  status?: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
}

export class BulkOfflineOfficialAgentsDto {
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  ids!: string[];
}

export class BulkGrantOfficialAgentDto {
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  tenantIds!: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  versionId?: string;
}

export class BulkRevokeOfficialAgentDto {
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  tenantIds!: string[];
}

export class UpdateCatalogDiscoveryDto {
  @IsString() @MaxLength(100) expectedUpdatedAt!: string;
  @IsObject() discoveryDetail!: Record<string, unknown>;
}
