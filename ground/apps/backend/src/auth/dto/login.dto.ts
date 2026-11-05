import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PHONE = /^1\d{10}$/;

export class LoginDto {
  @Matches(PHONE, { message: '请输入正确的手机号' })
  phone!: string;

  @IsString()
  password!: string;
}

export class RegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(PHONE, { message: '请输入正确的手机号' })
  phone!: string;

  @IsString()
  password!: string;

  @IsString()
  @MinLength(1)
  enterpriseName!: string;

  /** 品牌标识：1～40 位，全局唯一；字符清洗由前端黑名单完成。 */
  @IsString()
  @MinLength(1, { message: '请输入品牌' })
  @MaxLength(40)
  slug!: string;
}

export class SwitchTenantDto {
  @IsString()
  tenantId!: string;
}

export class ConsumeBrowserSsoDto {
  @IsString()
  ticket!: string;
}
