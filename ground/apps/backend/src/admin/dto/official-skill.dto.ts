import {
  IsArray,
  IsObject,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ListAdminOfficialSkillsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(['true', 'false', ''])
  enabled?: 'true' | 'false' | '';
}

export class CreateOfficialSkillFormDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,63}$/, {
    message: '标识需以小写字母开头，只能包含小写字母、数字和连字符',
  })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsString()
  @MaxLength(140)
  summary!: string;

  @IsOptional()
  @IsIn(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle'])
  category?: 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle';

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  instruction!: string;
}

export class UpdateOfficialSkillDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  summary?: string;

  @IsOptional()
  @IsIn(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle', ''])
  category?: 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle' | '';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  instruction?: string;
}

export class OfficialSkillZipMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  summary?: string;

  @IsOptional()
  @IsIn(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle', ''])
  category?: 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle' | '';
}

export class UpdateCatalogDiscoveryDto {
  @IsString() @MaxLength(100) expectedUpdatedAt!: string;
  @IsObject() discoveryDetail!: Record<string, unknown>;
}
