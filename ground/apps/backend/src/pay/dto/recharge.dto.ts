import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRechargeOrderDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amountYuan!: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey?: string;
}

export class CreateRechargePayQrDto {
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsString()
  @MinLength(1)
  channel!: string;
}

export class RechargeStatusDto {
  @IsString()
  @MinLength(1)
  orderId!: string;
}

export class CancelRechargeOrderDto {
  @IsString()
  @MinLength(1)
  orderId!: string;
}
