import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionHistoryController } from './session-history.controller';
import { SessionHistoryService } from './session-history.service';
@Module({ imports: [AuthModule], controllers: [SessionHistoryController], providers: [SessionHistoryService] })
export class SessionHistoryModule {}
