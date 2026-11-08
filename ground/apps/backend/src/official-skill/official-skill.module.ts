import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OfficialSkillController } from './official-skill.controller';
import { OfficialSkillService } from './official-skill.service';

@Module({
  imports: [AuthModule],
  controllers: [OfficialSkillController],
  providers: [OfficialSkillService],
  exports: [OfficialSkillService],
})
export class OfficialSkillModule {}
