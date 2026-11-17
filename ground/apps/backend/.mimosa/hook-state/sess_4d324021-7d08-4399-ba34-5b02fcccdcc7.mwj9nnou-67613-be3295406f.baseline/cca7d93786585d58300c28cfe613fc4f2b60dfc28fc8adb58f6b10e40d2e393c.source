import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminAuditController } from './admin-audit.controller';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [AuthModule, TenantModule],
  controllers: [AuditController, AdminAuditController],
  providers: [AuditService],
})
export class AuditModule {}
