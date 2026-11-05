import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class SyncedMessageDto {
  @IsInt() @Min(0) @Max(2147483647) seq!: number;
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(1000000) text!: string;
  @IsISO8601() time!: string;
}

export class UploadHistoryDto {
  @IsString() @MinLength(1) @MaxLength(160) accountId!: string;
  @IsOptional() @IsString() @MaxLength(160) tenantId?: string | null;
  @IsString() @MinLength(1) @MaxLength(160) deviceId!: string;
  @IsString() @MinLength(1) @MaxLength(160) sessionId!: string;
  @IsString() @MinLength(1) @MaxLength(160) deviceName!: string;
  @IsIn(['desktop', 'web']) clientKind!: 'desktop' | 'web';
  @IsString() @MaxLength(256) title!: string;
  @IsString() @MaxLength(256) projectName!: string;
  @IsISO8601() createdAt!: string;
  @IsISO8601() updatedAt!: string;
  @IsInt() @Min(0) @Max(2147483647) revision!: number;
  @IsIn(['idle', 'running', 'completed', 'interrupted', 'error']) state!: string;
  @IsBoolean() final!: boolean;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SyncedMessageDto)
  messages!: SyncedMessageDto[];
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(255, { each: true })
  files!: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50000) @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(2147483647, { each: true })
  visibleSeqs?: number[];
}

export class HistoryListDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @MaxLength(256) project?: string;
  @IsOptional() @IsString() @MaxLength(160) cursor?: string;
}

export class HistoryPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(-1) @Max(2147483647) after?: number;
}

export class HistoryHeartbeatDto {
  @IsString() @MinLength(1) @MaxLength(160) deviceId!: string;
}
