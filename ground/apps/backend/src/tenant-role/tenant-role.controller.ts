import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { TenantRoleService } from './tenant-role.service';
import { CreateTenantRoleDto, PatchTenantRoleDto } from './dto/upsert-tenant-role.dto';

@Controller('tenant-roles')
@UseGuards(JwtGuard)
export class TenantRoleController {
  constructor(private roles: TenantRoleService) {}

  @Get()
  list(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.roles.list(user, tenantId);
  }

  /** 成员编辑时可选的角色：企业预设 + 本企业自建。 */
  @Get('assignable')
  assignable(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.roles.assignable(user, tenantId);
  }

  /** 企业角色可勾选的权限目录（已过滤平台/安装配置类键）。 */
  @Get('catalog')
  catalog(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.roles.catalog(user, tenantId);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateTenantRoleDto,
  ) {
    return this.roles.create(user, tenantId, dto);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: PatchTenantRoleDto,
  ) {
    return this.roles.patch(user, tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.roles.remove(user, tenantId, id);
  }
}
