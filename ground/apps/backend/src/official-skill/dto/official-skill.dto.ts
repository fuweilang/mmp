import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ListOfficialSkillsQueryDto {
  @IsOptional()
  @IsIn(['industry', 'facets'])
  taxonomy?: 'industry' | 'facets';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle'])
  category?: 'common' | 'content' | 'analytics' | 'office' | 'education' | 'expertise' | 'business' | 'ecommerce' | 'sales' | 'hr' | 'legal' | 'finance' | 'consulting' | 'research' | 'files' | 'search' | 'writing' | 'lifestyle';
}

export class OfficialSkillContentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision?: number;
}

export class OfficialSkillResourceQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  path!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision?: number;
}

export class BeginOfficialSkillSessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}
