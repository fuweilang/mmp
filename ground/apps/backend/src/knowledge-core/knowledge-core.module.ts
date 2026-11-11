import { Module } from '@nestjs/common';
import { LibraryDomainModule } from '../library/library-domain.module';
import { KnowledgeLibrarySourceAdapter } from './library-source.adapter';
import { KnowledgeCandidateStore } from './candidate-store';
import { KnowledgeRetrievalService } from './retrieval.service';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeProfilesService } from './profiles.service';
import { KnowledgeCoreService } from './knowledge-core.service';
import { KnowledgeBlobStorage } from './storage';
import { KnowledgeJobsService } from './jobs.service';
import { KnowledgeHttpAdapter } from './provider';
import { KnowledgeIngestionWorker } from './ingestion.worker';
@Module({
  imports: [PrismaModule, LibraryDomainModule],
  providers: [
    KnowledgeLibrarySourceAdapter, KnowledgeCandidateStore, KnowledgeRetrievalService,
    KnowledgeProfilesService,
    KnowledgeCoreService,
    KnowledgeBlobStorage,
    KnowledgeJobsService,
    KnowledgeHttpAdapter,
    KnowledgeIngestionWorker,
  ],
  exports: [
    KnowledgeLibrarySourceAdapter,
    KnowledgeRetrievalService,
    KnowledgeProfilesService,
    KnowledgeCoreService,
    KnowledgeHttpAdapter,
    KnowledgeJobsService,
    KnowledgeBlobStorage,
  ],
})
export class KnowledgeCoreModule {}
