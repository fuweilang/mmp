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

@Module({
  imports: [AuthModule],
  controllers: [AdminUserController, AdminEnterpriseController, AdminPermissionsController, AdminRolesController, AdminTenantRolesController],
  providers: [AdminSupportService, AdminUsersService, AdminEnterprisesService, AdminRolesService, AdminService],
  exports: [AdminService],
})
export class AdminModule {}
