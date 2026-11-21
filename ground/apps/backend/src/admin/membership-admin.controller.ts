import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { MembershipService } from '../membership/membership.service';
import { AdminSupportService } from './admin-support.service';
import { SetAgentMinPlanDto, SetEnterpriseMembershipDto, UpdateMembershipCatalogDto } from './dto/membership.dto';

@Controller('admin')
@UseGuards(JwtGuard)
export class MembershipAdminController {
  constructor(
    private support: AdminSupportService,
    private membership: MembershipService,
  ) {}

  @Get('membership-catalog')
  async getCatalog(@CurrentUser() user: User) {
    await this.support.adminScope(user);
    return this.membership.getCatalog();
  }

  @Put('membership-catalog')
  async saveCatalog(@CurrentUser() user: User, @Body() dto: UpdateMembershipCatalogDto) {
    await this.support.adminScope(user);
    return this.membership.saveCatalog(user.id, dto);
  }

  @Patch('enterprises/:id/membership')
  async setEnterprise(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SetEnterpriseMembershipDto,
  ) {
    const scope = await this.support.adminScope(user);
    await this.support.assertTenantInScope(scope, id);
    return this.membership.setEnterprise(user.id, id, dto);
  }

  @Patch('official-agents/:id/min-plan')
  async setAgentMinPlan(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SetAgentMinPlanDto,
  ) {
    await this.support.adminScope(user);
    return this.membership.setAgentMinPlan(user.id, id, dto.minPlan);
  }
}
