import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class VendorUnitPricePairDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  input!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  output!: number;
}

/**
 * 厂商级采购单价（deepseek / kimi / zhipu / …，与 Octop models 同步）。
 * 嵌套结构在 service 内校验；此处只约束为对象。
 */
export class VendorUnitPricesDto {
  deepseek?: VendorUnitPricePairDto;
  kimi?: VendorUnitPricePairDto;
  zhipu?: VendorUnitPricePairDto;
  [key: string]: VendorUnitPricePairDto | undefined;
}

export class UpdateBillingConfigDto {
  @IsOptional()
  @IsObject()
  modelUnitPrices?: Record<string, { input: number; output: number; cachedInput?: number; multiplier?: number }>;

  /** 全局默认售价倍率（模型未覆盖时使用）。 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  sellPriceMultiplier?: number;

  /** 遗留兼容字段，当前配置接口禁止修改。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tokensPerAiCoin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  aiCoinsPerYuan?: number;

  /** 新企业开户赠送金额（元）；0 = 不赠送 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  welcomeGiftYuan?: number;

  @IsOptional()
  @IsObject()
  vendorUnitPrices?: Record<string, VendorUnitPricePairDto>;
}

export class AdjustWalletDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  /** 正数入账，负数扣减（不能把余额扣到 0 以下）。 */
  @IsInt()
  @Type(() => Number)
  deltaCoins!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class ChargeBillingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  cacheWrite5mTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cacheWrite1hTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cachedInputTokens?: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  tokens!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(160)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}

export class PrecheckBillingDto {
  /** 遗留预估字段；当前预检检查余额是否耗尽，实际扣费按模型价格快照结算。 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  estimatedTokens?: number;
}

export class ReportTokenUsageDto {
  @IsString()
  @MinLength(8)
  @MaxLength(160)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  outputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  totalTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  modelCalls?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  threadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  agentId?: string;

  /** web | desktop | unknown */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientKind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  /** ISO 时间；缺省用服务器 now */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  occurredAt?: string;
}
