import { Body, Controller, ForbiddenException, Get, Header, Param, Put, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { CatalogCategoryService } from './catalog-category.service';
import { AdminSupportService } from '../admin/admin-support.service';
import { assertSuperAdmin } from '../auth/super-admin';
import { PrismaService } from '../prisma/prisma.service';
import { categoryKind } from './catalog-category';

@Controller('catalog-categories')
@UseGuards(JwtGuard)
export class CatalogCategoryController {
  constructor(private readonly categories: CatalogCategoryService) {}
  @Get(':kind')
  @Header('Cache-Control', 'private, no-store')
  read(@CurrentUser() user: User, @Param('kind') kind: string) {
    if (user.status !== 'active') throw new ForbiddenException('账号已停用');
    return this.categories.read(kind);
  }
}
@Controller('admin/catalog-categories')
@UseGuards(JwtGuard)
export class AdminCatalogCategoryController {
  constructor(private readonly categories: CatalogCategoryService, private readonly support: AdminSupportService, private readonly prisma: PrismaService) {}
  private async authorize(user: User, value: string) {
    if (user.status !== 'active') throw new ForbiddenException('账号已停用');
    const kind = categoryKind(value);
    await this.support.adminScope(user);
    if (kind === 'expert') await assertSuperAdmin(this.prisma, user.id);
  }
  @Get(':kind')
  @Header('Cache-Control', 'private, no-store')
  async read(@CurrentUser() user: User, @Param('kind') kind: string) {
    await this.authorize(user, kind);
    return this.categories.read(kind);
  }
  @Get(':kind/:key/usage')
  @Header('Cache-Control', 'private, no-store')
  async usage(@CurrentUser() user: User, @Param('kind') kind: string, @Param('key') key: string) {
    await this.authorize(user, kind);
    return this.categories.usage(kind, key);
  }
  @Put(':kind')
  async save(@CurrentUser() user: User, @Param('kind') kind: string, @Body() body: unknown) {
    await this.authorize(user, kind);
    return this.categories.save(kind, body, user.id);
  }
}
