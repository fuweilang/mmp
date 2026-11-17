import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminService } from './admin.service';
import { getCatalogGrouped } from '../permissions/catalog';

@Controller('admin/permissions')
@UseGuards(JwtGuard)
export class AdminPermissionsController {
  constructor(private admin: AdminService) {}

  /** Chip-ready grouped catalog. Phase1: platform admin gate (roles.read later). */
  @Get('catalog')
  catalog(@CurrentUser() user: User) {
    this.admin.requirePlatformAdminPublic(user);
    return { categories: getCatalogGrouped() };
  }
}
