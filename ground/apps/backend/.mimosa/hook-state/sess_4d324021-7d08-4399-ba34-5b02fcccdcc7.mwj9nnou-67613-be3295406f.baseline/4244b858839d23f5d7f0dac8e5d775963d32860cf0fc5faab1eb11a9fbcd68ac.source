import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportOfficialAgentsDto {
  /** 仅导入指定 key；缺省导入 assets/agents 下全部。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  keys?: string[];
}
