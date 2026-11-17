import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** 总后台跨租户审计查询。tenantId=`__platform__` 表示仅平台（tenant_id IS NULL）。 */
export class AdminAuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  /** 按 action 前缀筛选（如 admin_），与精确 action 互斥时优先精确 action */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  actionPrefix?: string;

  /** 操作者：姓名 / 手机 / userId 关键字 */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
