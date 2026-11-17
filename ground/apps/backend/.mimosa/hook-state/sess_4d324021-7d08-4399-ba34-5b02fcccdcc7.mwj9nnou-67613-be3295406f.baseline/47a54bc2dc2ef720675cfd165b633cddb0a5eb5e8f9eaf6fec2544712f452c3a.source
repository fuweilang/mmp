import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
