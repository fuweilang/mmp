import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminEnterpriseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: '请输入品牌' })
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  status?: string;
}