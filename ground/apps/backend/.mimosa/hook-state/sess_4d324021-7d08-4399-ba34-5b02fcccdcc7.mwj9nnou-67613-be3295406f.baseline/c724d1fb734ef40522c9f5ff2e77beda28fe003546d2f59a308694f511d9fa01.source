import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantRoleController } from './tenant-role.controller';
import { TenantRoleService } from './tenant-role.service';

@Module({
  imports: [AuthModule, TenantModule],
  controllers: [TenantRoleController],
  providers: [TenantRoleService],
})
export class TenantRoleModule {}
