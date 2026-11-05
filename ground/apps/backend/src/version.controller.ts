import { Controller, Get } from '@nestjs/common';
import { APP_VERSION } from '@mammoth/shared';

/**
 * 产品版本号统一出口（来源：ground/config/version.json → packages/shared）。
 * 前端角标只读这里，禁止再读环境变量或各自硬编码。
 */
@Controller('version')
export class VersionController {
  @Get()
  read() {
    return { product: 'mammoth', version: APP_VERSION };
  }
}