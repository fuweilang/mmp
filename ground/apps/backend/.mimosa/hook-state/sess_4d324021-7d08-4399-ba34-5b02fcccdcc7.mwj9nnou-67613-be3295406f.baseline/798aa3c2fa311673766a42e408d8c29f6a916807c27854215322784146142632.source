import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUsageEventDto {
  @IsIn(['chat_turn'])
  kind!: 'chat_turn';
}

export class PatchQuotaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000000)
  monthlyTurns?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  monthlyTokens?: number;
}

export class PatchUserTokenQuotaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;

  /** 月度 Token 上限；0 = 不限 */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  monthlyTokens!: number;
}
