import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminService } from './admin.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { ChangeAdminUserPasswordDto } from './dto/change-admin-user-password.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';

@Controller('admin/users')
@UseGuards(JwtGuard)
export class AdminUserController {
  constructor(private admin: AdminService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: ListAdminUsersDto) {
    return this.admin.listUsers(user, query);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateAdminUserDto) {
    return this.admin.createUser(user, dto);
  }

  @Get(':id/permissions')
  permissions(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.admin.userPermissions(user, id, tenantId || null);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.admin.updateUser(user, id, dto);
  }

  @Patch(':id/password')
  changePassword(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ChangeAdminUserPasswordDto,
  ) {
    return this.admin.changePassword(user, id, dto.password);
  }

  @Delete(':id')
  deactivate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deactivateUser(user, id);
  }

  @Post(':id/delete')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteUser(user, id);
  }
}