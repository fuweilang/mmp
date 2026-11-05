import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminService } from './admin.service';
import { CreateAdminEnterpriseDto } from './dto/create-admin-enterprise.dto';
import { UpdateAdminEnterpriseDto } from './dto/update-admin-enterprise.dto';

@Controller('admin/enterprises')
@UseGuards(JwtGuard)
export class AdminEnterpriseController {
  constructor(private admin: AdminService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.admin.listEnterprises(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateAdminEnterpriseDto) {
    return this.admin.createEnterprise(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAdminEnterpriseDto) {
    return this.admin.updateEnterprise(user, id, dto);
  }

  @Get(':id/deletion-impact')
  deletionImpact(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.getEnterpriseDeletionImpact(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.admin.deleteEnterprise(user, id);
  }
}