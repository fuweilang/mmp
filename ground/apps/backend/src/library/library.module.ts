import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { LibraryController } from './library.controller';
import { PrismaLibraryStore } from './library.prisma-store';
import { LibraryService } from './library.service';

@Module({
  imports: [LlmModule],
  controllers: [LibraryController],
  providers: [
    PrismaLibraryStore,
    {
      provide: LibraryService,
      useFactory: (store: PrismaLibraryStore) => new LibraryService(store),
      inject: [PrismaLibraryStore],
    },
  ],
})
export class LibraryModule {}
