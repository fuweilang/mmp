import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('tenants')
@UseGuards(JwtGuard)
export class TenantController {
  constructor(private tenants: TenantService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.tenants.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateTenantDto) {
    return this.tenants.create(user, dto);
  }
}
