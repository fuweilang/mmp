import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { HistoryHeartbeatDto, HistoryListDto, HistoryPageDto, UploadHistoryDto } from './dto/session-history.dto';
import { SessionHistoryService } from './session-history.service';

@Controller('session-history')
@UseGuards(JwtGuard)
export class SessionHistoryController {
  constructor(private readonly history: SessionHistoryService) {}
  @Post('sync') sync(@CurrentUser() user: User, @CurrentTenantId() tenant: string | null, @Body() body: UploadHistoryDto) { return this.history.upload(user, tenant, body); }
  @Post('heartbeat') heartbeat(@CurrentUser() user: User, @CurrentTenantId() tenant: string | null, @Body() body: HistoryHeartbeatDto) { return this.history.heartbeat(user, tenant, body.deviceId); }
  @Get() list(@CurrentUser() user: User, @CurrentTenantId() tenant: string | null, @Query() query: HistoryListDto) { return this.history.list(user, tenant, query); }
  @Get(':id') detail(@CurrentUser() user: User, @CurrentTenantId() tenant: string | null, @Param('id') id: string, @Query() query: HistoryPageDto) { return this.history.detail(user, tenant, id, query.after); }
}
