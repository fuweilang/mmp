import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPlatformAdmin?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  /** 用户的角色（可多选，权限取并集）；传空数组表示清空。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleKeys?: string[];

  /** 历史字段：单个角色。 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  platformRoleKey?: string | null;

  /** 所属企业；null = 解绑全部企业，string = 只保留该企业。 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  tenantId?: string | null;

  /** 企业内角色：ADMIN=企业管理员，MEMBER=企业成员。 */
  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  memberRole?: 'ADMIN' | 'MEMBER';
}