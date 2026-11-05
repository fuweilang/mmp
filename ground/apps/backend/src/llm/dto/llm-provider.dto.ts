import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LlmModelInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  modelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsBoolean()
  thinkingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateLlmProviderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/, {
    message: 'name 仅允许字母数字与 ._-，且不以符号开头',
  })
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LlmModelInputDto)
  models?: LlmModelInputDto[];
}

export class UpdateLlmProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string | null;

  /** 省略=不改；空串=清除 Key */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateLlmModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  modelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsBoolean()
  thinkingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLlmModelDto {
  @IsOptional()
  @IsBoolean()
  supportsTools?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsBoolean()
  thinkingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}


/** 连通探测：已存模型或表单草稿（可未保存）。 */
export class ProbeLlmDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelRowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  modelId?: string;
}


/** 拉取上游 /models 列表（表单草稿或已存厂商）。 */
export class ListRemoteModelsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;
}
