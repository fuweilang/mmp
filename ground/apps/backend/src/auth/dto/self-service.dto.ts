import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(1, { message: '请输入新密码' })
  @MaxLength(64)
  newPassword!: string;
}

export class UpdateMeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}
