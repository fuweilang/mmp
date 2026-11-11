import { KnowledgeProviderAdminController } from './provider-admin.controller';
import { LlmModule } from '../llm/llm.module';
import { Module } from '@nestjs/common';
import { KnowledgeInspectionService } from './inspection.service';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeCoreModule } from './knowledge-core.module';
import { KnowledgeAdminController, KnowledgeSuperAdminGuard } from './admin.controller';
/** HTTP privilege boundary stays outside Core so the standalone worker needs no JWT or auth app. */
@Module({
  imports: [AuthModule, KnowledgeCoreModule, LlmModule], controllers: [KnowledgeAdminController, KnowledgeProviderAdminController], providers: [KnowledgeSuperAdminGuard, KnowledgeInspectionService]
})
export class KnowledgeCoreAdminModule {
}
