import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { resolveOfficialAvatarFile } from './gallery-avatars';

/**
 * Public official Agent portrait files (branding).
 * Intentionally unauthenticated so <img> tags can load without a Bearer token.
 * Serves Admin uploads under uploads/official-avatars/ first, then assets/avatars/.
 */
@Controller('official-agents/avatars')
export class OfficialAgentAvatarController {
  @Get(':fileName')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  serve(@Param('fileName') fileName: string) {
    const file = resolveOfficialAvatarFile(fileName);
    if (!file) throw new NotFoundException('头像不存在');
    const lower = file.fileName.toLowerCase();
    const type = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    return new StreamableFile(createReadStream(file.absPath), {
      type,
      disposition: `inline; filename="${file.fileName}"`,
    });
  }
}
