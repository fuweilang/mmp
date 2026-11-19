import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeCoreModule } from '../knowledge-core/knowledge-core.module';
import { KnowledgeHttpAdapter } from '../knowledge-core/provider';
import { LlmModule } from '../llm/llm.module';
import { PrismaService } from '../prisma/prisma.service';
import { LibraryAdminService } from './library.admin.service';
import { LibraryAdminController } from './library.admin.controller';
import { configureLibraryAsr } from './library.asr-setup';
import { LibraryController } from './library.controller';
import { LibraryDomainModule } from './library-domain.module';
import { embedLibraryQuery } from './library.embed';
import { setLibraryEmbedQuery } from './library.embed-port';

class LibrarySearchBootstrap implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly adapter: KnowledgeHttpAdapter) {}

  onModuleInit(): void {
    setLibraryEmbedQuery((text) => embedLibraryQuery(this.prisma, this.adapter, text));
    void configureLibraryAsr(this.prisma).catch(() => undefined);
  }
}

@Module({
  imports: [AuthModule, LlmModule, LibraryDomainModule, KnowledgeCoreModule],
  controllers: [LibraryController, LibraryAdminController],
  providers: [LibraryAdminService, LibrarySearchBootstrap],
  exports: [LibraryDomainModule],
})
export class LibraryModule {}
