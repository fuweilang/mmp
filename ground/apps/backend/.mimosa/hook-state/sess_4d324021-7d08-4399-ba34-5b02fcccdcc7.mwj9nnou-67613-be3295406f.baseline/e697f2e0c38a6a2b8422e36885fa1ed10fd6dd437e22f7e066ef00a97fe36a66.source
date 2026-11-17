import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

export class PublicRegisterDto extends RegisterDto {
  @Matches(/^\d{6}$/, { message: '请输入6位短信验证码' })
  smsCode!: string;
}

/**
 * 桌面端注册。smsCode 必填（旧客户端不发则服务层返回 CLIENT_TOO_OLD，不建号、不发会话）。
 * 这里保持 optional 让缺失码走到服务层拿稳定错误码，而不是 ValidationPipe 的通用 400；
 * 6 位格式校验也放在服务层，统一返回 SMS_INVALID。
 */
export class ClientRegisterDto extends RegisterDto {
  @IsOptional()
  @IsString()
  smsCode?: string;
}

export class SendSmsDto {
  @Matches(PHONE, { message: '请输入正确的手机号' })
  phone!: string;

  @IsIn(['login', 'register'])
  scene!: 'login' | 'register';
}

export class SmsLoginDto {
  @Matches(PHONE, { message: '请输入正确的手机号' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: '请输入6位短信验证码' })
  smsCode!: string;
}

export class SwitchTenantDto {
  @IsString()
  tenantId!: string;
}

export class ConsumeBrowserSsoDto {
  @IsString()
  ticket!: string;
}
