import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminService } from './admin.service';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { ListAdminRolesDto } from './dto/list-admin-roles.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

@Controller('admin/roles')
@UseGuards(JwtGuard)
export class AdminRolesController {
  constructor(private admin: AdminService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: ListAdminRolesDto) {
    return this.admin.listRoles(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.getRole(user, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateAdminRoleDto) {
    return this.admin.createRole(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAdminRoleDto) {
    return this.admin.updateRole(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteRole(user, id);
  }
}
