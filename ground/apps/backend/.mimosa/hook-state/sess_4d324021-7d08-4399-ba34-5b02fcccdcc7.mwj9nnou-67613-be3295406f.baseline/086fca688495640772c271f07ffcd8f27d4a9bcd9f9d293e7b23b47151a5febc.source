import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminSupportService } from './admin-support.service';
import { AdminUsersService } from './admin-users.service';
import { AdminEnterprisesService } from './admin-enterprises.service';
import { AdminRolesService } from './admin-roles.service';
import { AdminUserController } from './admin-user.controller';
import { AdminEnterpriseController } from './admin-enterprise.controller';
import { AdminPermissionsController } from './admin-permissions.controller';
import { AdminRolesController } from './admin-roles.controller';
import { AdminTenantRolesController } from './admin-tenant-roles.controller';
import { AdminOfficialAgentsController } from './admin-official-agents.controller';
import { AdminOfficialAgentsService } from './admin-official-agents.service';
import { AdminOfficialKnowledgeController } from './admin-official-knowledge.controller';
import { AdminOfficialKnowledgeService } from './admin-official-knowledge.service';
import { OfficialAgentModule } from '../official-agent/official-agent.module';
import { OfficialSkillModule } from '../official-skill/official-skill.module';
import { AdminOfficialSkillsController } from './admin-official-skills.controller';
import { AdminOfficialSkillsService } from './admin-official-skills.service';

@Module({
  imports: [AuthModule, OfficialAgentModule, OfficialSkillModule],
  controllers: [
    AdminUserController,
    AdminEnterpriseController,
    AdminPermissionsController,
    AdminRolesController,
    AdminTenantRolesController,
    AdminOfficialAgentsController,
    AdminOfficialKnowledgeController,
    AdminOfficialSkillsController,
  ],
  providers: [
    AdminSupportService,
    AdminUsersService,
    AdminEnterprisesService,
    AdminRolesService,
    AdminService,
    AdminOfficialAgentsService,
    AdminOfficialKnowledgeService,
    AdminOfficialSkillsService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
