import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeMemberPasswordDto {
  @IsString()
  @MinLength(1, { message: '请输入新密码' })
  @MaxLength(64)
  password!: string;
}
