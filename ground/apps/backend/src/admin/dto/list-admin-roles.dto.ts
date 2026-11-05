import { IsOptional, IsString } from 'class-validator';

export class ListAdminRolesDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}
