import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^1\d{10}$/, { message: '请输入正确的手机号' })
  phone!: string;

  @IsString()
  @MinLength(1, { message: '请输入密码' })
  password!: string;

  @IsBoolean()
  isPlatformAdmin!: boolean;

  @IsOptional()
  @IsString()
  tenantId?: string;

  /** 用户的角色（可多选，权限取并集）；任何已存在的 Role.key，含自建角色。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleKeys?: string[];

  /** 历史字段：单个角色，等价于 roleKeys: [key]。 */
  @IsOptional()
  @IsString()
  platformRoleKey?: string;

  /** 企业内角色：ADMIN=企业管理员，MEMBER=企业成员；不传默认企业成员。 */
  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  memberRole?: 'ADMIN' | 'MEMBER';
}