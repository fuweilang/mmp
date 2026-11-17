import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { TenantService } from './tenant.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { PatchMemberDto } from './dto/patch-member.dto';
import { ChangeMemberPasswordDto } from './dto/change-member-password.dto';

@Controller('members')
@UseGuards(JwtGuard)
export class MemberController {
  constructor(private tenants: TenantService) {}

  @Get('simple')
  simpleList(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.tenants.simpleMembers(user, tenantId);
  }

  @Get(':id/permissions')
  permissions(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null, @Param('id') id: string) {
    return this.tenants.memberPermissions(user, tenantId, id);
  }

  @Get()
  list(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.tenants.members(user, tenantId);
  }

  @Post()
  add(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: CreateMemberDto,
  ) {
    return this.tenants.addMember(user, tenantId, dto);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: PatchMemberDto,
  ) {
    return this.tenants.patchMember(user, tenantId, id, dto);
  }

  @Patch(':id/password')
  changePassword(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ChangeMemberPasswordDto,
  ) {
    return this.tenants.changeMemberPassword(user, tenantId, id, dto.password);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.tenants.removeMember(user, tenantId, id);
  }
}
