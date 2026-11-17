import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class PatchMemberDto {
  /** @deprecated 历史枚举档不再单独生效：角色一律走 roleIds，本字段仅为兼容旧调用方保留。 */
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;

  /** 全量替换该成员的企业角色绑定（企业预设 + 本企业自建）；传 [] 自动回落 org_member 预设。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  /** 修改成员姓名（同步到用户账号）。 */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;
}
