import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { OfficialSkillController } from './official-skill.controller';
import { OfficialSkillService } from './official-skill.service';

@Module({
  imports: [AuthModule, forwardRef(() => LlmModule)],
  controllers: [OfficialSkillController],
  providers: [OfficialSkillService],
  exports: [OfficialSkillService],
})
export class OfficialSkillModule {}
