import { ExpertRuntimeService } from './expert-runtime.service';
import { KnowledgeCoreModule } from '../knowledge-core/knowledge-core.module';
import { ExpertRuntimeController } from './expert-runtime.controller';
import { CatalogPreferenceController } from './catalog-preference.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { TenantModule } from '../tenant/tenant.module';
import { OfficialAgentController } from './official-agent.controller';
import { OfficialAgentAvatarController } from './official-agent-avatar.controller';
import { OfficialAgentService } from './official-agent.service';
import { OfficialKbService } from './official-kb.service';
import { OfficialWebSearchService } from './web-search.service';
import { OfficialWebFetchService } from './web-fetch.service';
import { OfficialTabularAnalyzeService } from './tabular-analyze.service';
import { OfficialOrchestrateService } from './orchestrate.service';
import { OfficialSkillModule } from '../official-skill/official-skill.module';

@Module({
  imports: [KnowledgeCoreModule, AuthModule, TenantModule, KnowledgeModule, OfficialSkillModule],
  controllers: [ExpertRuntimeController,CatalogPreferenceController, OfficialAgentController, OfficialAgentAvatarController],
  providers: [
    ExpertRuntimeService,
    OfficialAgentService,
    OfficialKbService,
    OfficialWebSearchService,
    OfficialWebFetchService,
    OfficialTabularAnalyzeService,
    OfficialOrchestrateService,
  ],
  exports: [ExpertRuntimeService, OfficialAgentService, OfficialKbService],
})
export class OfficialAgentModule {}
