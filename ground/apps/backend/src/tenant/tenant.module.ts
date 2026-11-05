import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { MemberController } from './member.controller';

@Module({
  imports: [AuthModule],
  controllers: [TenantController, MemberController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
