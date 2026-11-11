import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { LibraryAdminService } from './library.admin.service';
import { LibraryAdminController } from './library.admin.controller';
import { LibraryController } from './library.controller';
import { LibraryDomainModule } from './library-domain.module';

@Module({
  imports: [AuthModule, LlmModule, LibraryDomainModule],
  controllers: [LibraryController, LibraryAdminController],
  providers: [LibraryAdminService],
  exports: [LibraryDomainModule],
})
export class LibraryModule {}
