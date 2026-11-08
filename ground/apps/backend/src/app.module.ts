import { SessionHistoryModule } from './session-history/session-history.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantRoleModule } from './tenant-role/tenant-role.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LibraryModule } from './library/library.module';
import { WorkbenchModule } from './workbench/workbench.module';
import { UsageModule } from './usage/usage.module';
import { AuditModule } from './audit/audit.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { PayModule } from './pay/pay.module';
import { LlmModule } from './llm/llm.module';
import { HealthController } from './health.controller';
import { VersionController } from './version.controller';
import { LoggingModule } from './logging/logging.module';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { OfficialAgentModule } from './official-agent/official-agent.module';
import { OfficialSkillModule } from './official-skill/official-skill.module';

@Module({
  imports: [
    SessionHistoryModule,
    LoggingModule,
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    TenantRoleModule,
    KnowledgeModule,
    LibraryModule,
    WorkbenchModule,
    UsageModule,
    AuditModule,
    EnterpriseModule,
    AdminModule,
    BillingModule,
    PayModule,
    OfficialAgentModule,
    OfficialSkillModule,
    LlmModule,
  ],
  providers: [RequestLoggingMiddleware],
  controllers: [HealthController, VersionController],
})
export class AppModule {}
