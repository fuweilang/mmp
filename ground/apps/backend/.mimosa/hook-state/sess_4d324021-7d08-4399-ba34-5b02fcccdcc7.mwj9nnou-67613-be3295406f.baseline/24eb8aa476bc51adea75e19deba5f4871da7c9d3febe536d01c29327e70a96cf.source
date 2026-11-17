import {
  Allow,
  IsObject,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
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
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.trim().length > 0)
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,63}$/, {
    message: '标识需以小写字母开头，只能包含小写字母、数字和连字符',
  })
  key?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  summary?: string;

  @IsOptional()
  @IsIn(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle'])
  category?: 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle';

  @IsOptional()
  @Allow()
  categories?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  instruction?: string;
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
  @Allow()
  categories?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  instruction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  expectedUpdatedAt?: string;
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

  @IsOptional()
  @Allow()
  categories?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  expectedUpdatedAt?: string;
}

export class OfficialSkillIconDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  expectedUpdatedAt?: string;
}

export class UpdateCatalogDiscoveryDto {
  @IsString() @MaxLength(100) expectedUpdatedAt!: string;
  @IsObject() discoveryDetail!: Record<string, unknown>;
}
