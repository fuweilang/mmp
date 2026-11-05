import { IsArray, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class CreateMemberDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^1\d{10}$/, { message: '请输入正确的手机号' })
  phone!: string;

  @IsString()
  password!: string;

  /** 历史枚举档，可选；实际角色绑定走 roleIds。缺省时按 MEMBER 处理。 */
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;

  /** 额外绑定的企业角色（预设或本企业自建），权限取并集。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}
