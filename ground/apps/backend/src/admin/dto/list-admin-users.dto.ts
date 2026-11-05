import { IsOptional, IsString } from 'class-validator';

export class ListAdminUsersDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 角色筛选：super_admin / platform_admin / org_admin / org_member / none（普通用户）。 */
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  status?: string;

  /** 只返回属于该企业的用户（org_member.tenantId）。 */
  @IsOptional()
  @IsString()
  enterpriseId?: string;
}