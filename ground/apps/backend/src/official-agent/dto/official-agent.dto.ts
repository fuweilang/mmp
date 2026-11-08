import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResolveOfficialAgentDto {
  /** 会话创建后的固定版本；缺省仅用于创建前解析当前授权版本。 */
  @IsOptional()
  @IsString()
  @MinLength(1)
  versionId?: string;
}

export class RetrieveOfficialAgentDto extends ResolveOfficialAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query!: string;
}

export class UpdateOfficialAgentScopeDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  kbFolderIds!: string[];
}


export class SearchOfficialAgentDto extends ResolveOfficialAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;
}


export class AnalyzeTabularOfficialAgentDto extends ResolveOfficialAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1500000)
  content!: string;

  @IsOptional()
  @IsString()
  format?: 'csv' | 'json' | 'auto';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  groupBy?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  metrics?: string[];

  /** 可选分析目标；未传 groupBy 时服务端可据此确定性推断分组列。 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;
}

export class FetchUrlOfficialAgentDto extends ResolveOfficialAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  url!: string;
}

export class DelegateOfficialAgentDto extends ResolveOfficialAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  task!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500000)
  tabularContent?: string;

  @IsOptional()
  @IsString()
  tabularFormat?: 'csv' | 'json' | 'auto';
}
