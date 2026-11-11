import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
export class KnowledgeProfileDto {
  @IsString()
  @MaxLength(128)
  providerId!: string;
  @IsIn(['EMBEDDING', 'RERANK'])
  task!: 'EMBEDDING' | 'RERANK';
  @IsString()
  @MaxLength(200)
  model!: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16000)
  dimension?: number;
  @IsOptional()
  @IsIn(['cl100k_base', 'o200k_base'])
  tokenizer?: 'cl100k_base' | 'o200k_base';
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  endpoint?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120000)
  timeoutMs?: number;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128)
  batchSize?: number;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(131072)
  maxInputTokens?: number;
  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(16777216)
  maxResponseBytes?: number;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  predecessorId?: string;
}
export class KnowledgeEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
export class KnowledgeBaseDto {
  @IsString()
  @MaxLength(200)
  name!: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  ownerAgentId?: string;
}
export class KnowledgeBasePatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
export class KnowledgeIndexConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  targetTokens?: number;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8191)
  overlapTokens?: number;
}
export class KnowledgeReindexDto {
  @IsString()
  @MaxLength(128)
  profileId!: string;
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => KnowledgeIndexConfigDto)
  indexConfig?: KnowledgeIndexConfigDto;
}
/** Multipart scalar fields; token configuration on reindex JSON avoids implicit string coercion. */
export class KnowledgeUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  profileId?: string;
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  documentId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
export class KnowledgeReleaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({
    each: true
  })
  @MaxLength(128, {
    each: true
  })
  indexRevisionIds!: string[];
}
export class KnowledgeRetrievalTestDto {
  @IsString()
  @MaxLength(2000)
  query!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({
    each: true
  })
  @MaxLength(128, {
    each: true
  })
  releaseIds!: string[];
  @IsOptional()
  @IsIn(['required', 'optional'])
  mode?: 'required' | 'optional';
  @IsOptional()
  @IsString()
  @MaxLength(128)
  embeddingProfileId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  rerankProfileId?: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8000)
  budgetTokens?: number;
}
export class KnowledgeSourceDto {
  @IsString()
  @MaxLength(128)
  knowledgeReleaseId!: string;
  @IsString()
  @MaxLength(128)
  documentId!: string;
  @IsString()
  @MaxLength(128)
  revisionId!: string;
  @IsString()
  @MaxLength(128)
  indexRevisionId!: string;
  @IsString()
  @MaxLength(128)
  chunkId!: string;
}
export class KnowledgeChunkPreviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset = 0;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
export class KnowledgeExtractedPreviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset = 0;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  limit = 10000;
}
