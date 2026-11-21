import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MEMBERSHIP_PLANS, type MembershipPlanName } from '../../membership/plan';

export class SetEnterpriseMembershipDto {
  @IsIn(MEMBERSHIP_PLANS)
  plan!: MembershipPlanName;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class SetAgentMinPlanDto {
  @IsIn(MEMBERSHIP_PLANS)
  minPlan!: MembershipPlanName;
}

export class UpdateMembershipCatalogDto {
  @IsInt()
  @Min(1)
  @Max(100000000)
  proPriceYuan!: number;

  @IsInt()
  @Min(1)
  @Max(100000000)
  flagshipPriceYuan!: number;

  @IsString()
  @MaxLength(200)
  standardSummary!: string;

  @IsString()
  @MaxLength(200)
  proSummary!: string;

  @IsString()
  @MaxLength(200)
  flagshipSummary!: string;
}
