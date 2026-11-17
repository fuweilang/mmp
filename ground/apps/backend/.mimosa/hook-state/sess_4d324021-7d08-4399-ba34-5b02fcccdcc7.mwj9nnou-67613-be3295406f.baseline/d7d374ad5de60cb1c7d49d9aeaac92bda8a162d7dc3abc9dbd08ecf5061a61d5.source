import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationLog } from '../logging/application-log.service';
import { refreshOfficialPrices } from './official-model-prices';

function refreshInterval(): number {
  const raw = process.env.LLM_PRICE_REFRESH_INTERVAL_MS;
  if (!raw) return 86_400_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1000) {
    throw new Error('LLM_PRICE_REFRESH_INTERVAL_MS 必须是大于等于 1000 的整数');
  }
  return value;
}

/** 有启用模型时按厂商刷新官方价目表；各模型继续共用系统参考价缓存。 */
@Injectable()
export class OfficialPriceRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly interval = refreshInterval();
  private timer?: ReturnType<typeof setTimeout>;
  private polling?: Promise<void>;
  private stopped = false;

  constructor(private readonly prisma: PrismaService, private readonly log: ApplicationLog) {}

  onModuleInit(): void {
    if (process.env.LLM_PRICE_REFRESH_ENABLED === '0') return;
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling;
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.polling = this.poll()
        .catch(error => this.log.event('error', 'model.price.refresh_failed', { error }))
        .finally(() => {
          this.polling = undefined;
          if (!this.stopped) this.schedule(this.interval);
        });
    }, delay);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    const configured = await this.prisma.llmProvider.count({
      where: { enabled: true, models: { some: { enabled: true } } },
    });
    if (configured === 0) return;
    await refreshOfficialPrices();
    this.log.event('debug', 'model.price.refreshed', { configuredProviders: configured });
  }
}
