import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateIf, ValidateNested } from 'class-validator';

/** 只改这个人已经加入的某一家企业里的成员档。 */
export class MembershipRoleUpdateDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}

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

  /** 仅为既有平台账号新增 MEMBER 企业关系；不替换已有企业或平台角色。 */
  @IsOptional()
  @IsString()
  @MinLength(1)
  addMemberTenantId?: string;

  /** 企业内角色：ADMIN=企业管理员，MEMBER=企业成员。 */
  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  memberRole?: 'ADMIN' | 'MEMBER';

  /** 按企业改角色。不新增、不移除企业。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MembershipRoleUpdateDto)
  membershipRoles?: MembershipRoleUpdateDto[];
}