import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { LibraryAdminService } from './library.admin.service';
import { LibraryAdminController } from './library.admin.controller';
import { LibraryController } from './library.controller';
import { PrismaLibraryStore } from './library.prisma-store';
import { LibraryService } from './library.service';

@Module({
  imports: [AuthModule, LlmModule],
  controllers: [LibraryController, LibraryAdminController],
  providers: [
    PrismaLibraryStore,
    LibraryAdminService,
    {
      provide: LibraryService,
      useFactory: (store: PrismaLibraryStore) => new LibraryService(store),
      inject: [PrismaLibraryStore],
    },
  ],
})
export class LibraryModule {}
