import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminEnterpriseDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(1, { message: '请输入品牌' })
  @MaxLength(80)
  slug!: string;

  /** ENTERPRISE=企业（默认）；AGENCY=代理商（下级代理）。 */
  @IsOptional()
  @IsIn(['ENTERPRISE', 'AGENCY'])
  type?: 'ENTERPRISE' | 'AGENCY';

  /** 上级租户 id：空=直属猛犸总部；仅平台管理员可指定。 */
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}