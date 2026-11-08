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
  imports: [AuthModule, TenantModule, KnowledgeModule, OfficialSkillModule],
  controllers: [CatalogPreferenceController, OfficialAgentController, OfficialAgentAvatarController],
  providers: [
    OfficialAgentService,
    OfficialKbService,
    OfficialWebSearchService,
    OfficialWebFetchService,
    OfficialTabularAnalyzeService,
    OfficialOrchestrateService,
  ],
  exports: [OfficialAgentService, OfficialKbService],
})
export class OfficialAgentModule {}
