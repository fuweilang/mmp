import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PatchEnterpriseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  welcomeMessage?: string;
}
