import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminService } from './admin.service';
import {
  CreateAdminTenantRoleDto,
  ListAdminTenantRolesDto,
  UpdateAdminTenantRoleDto,
} from './dto/tenant-role.dto';

/** 总后台对企业自定义角色（ORG_CUSTOM）的跨企业管理，数据与 Console 同源。 */
@Controller('admin/tenant-roles')
@UseGuards(JwtGuard)
export class AdminTenantRolesController {
  constructor(private admin: AdminService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: ListAdminTenantRolesDto) {
    return this.admin.listTenantRoles(user, query);
  }

  @Get('catalog')
  catalog(@CurrentUser() user: User) {
    return this.admin.tenantRoleCatalog(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateAdminTenantRoleDto) {
    return this.admin.createTenantRole(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAdminTenantRoleDto) {
    return this.admin.updateTenantRole(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteTenantRole(user, id);
  }
}
