import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantType } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** 品牌：放开中文；危险字符由前端黑名单清洗。 */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  slug!: string;

  @IsEnum(TenantType)
  type!: TenantType;

  @IsOptional()
  @IsString()
  parentId?: string;
}
