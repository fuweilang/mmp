import { Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RechargeService } from './recharge.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('pay')
export class PayNotifyController {
  constructor(private recharge: RechargeService) {}

  @Post('wechatNotify')
  wechatNotify(@Req() req: RawBodyRequest, @Headers() headers: Record<string, string | string[] | undefined>) {
    const raw =
      req.rawBody ??
      (typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body
        : JSON.stringify(req.body ?? {}));
    return this.recharge.handleWechatNotify(raw, headers);
  }

  @Post('alipayNotify')
  alipayNotify(@Req() req: Request) {
    const body =
      req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    return this.recharge.handleAlipayNotify(body);
  }
}
