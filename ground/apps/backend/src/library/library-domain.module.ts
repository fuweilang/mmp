import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaLibraryStore } from './library.prisma-store';
import { LibraryService } from './library.service';
/** Storage and owning ACL service only. No controllers, LlmModule or OfficialAgent dependency. */
@Module({
  imports: [PrismaModule],
  providers: [PrismaLibraryStore, {
    provide: LibraryService,
    useFactory: (store: PrismaLibraryStore) => new LibraryService(store),
    inject: [PrismaLibraryStore],
  }],
  exports: [LibraryService],
})
export class LibraryDomainModule {
}
