import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const LLM_USER_CONCURRENCY_LIMIT = 'LLM_USER_CONCURRENCY_LIMIT';
export const LLM_TENANT_CONCURRENCY_LIMIT = 'LLM_TENANT_CONCURRENCY_LIMIT';

function configuredLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new Error(`${name} 必须是 0 到 100000 之间的整数`);
  }
  return value;
}

/**
 * 单 Backend 进程内的在途请求限制；0 表示不限制。
 * 多实例部署需要改用共享存储，不能把各实例计数当作全局限额。
 */
@Injectable()
export class LlmConcurrencyService {
  private readonly userLimit = configuredLimit('LLM_USER_MAX_CONCURRENCY', 10);
  private readonly tenantLimit = configuredLimit('LLM_TENANT_MAX_CONCURRENCY', 50);
  private readonly userInflight = new Map<string, number>();
  private readonly tenantInflight = new Map<string, number>();

  /**
   * 同步占用用户与企业名额，避免同一进程内并发请求穿透检查。
   * 返回的释放函数必须放在 finally 中调用；重复释放不会产生效果。
   */
  acquire(userId: string, tenantId: string | null): () => void {
    const userKey = `user:${userId}`;
    const tenantKey = tenantId ? `tenant:${tenantId}` : null;
    if (this.userLimit > 0 && (this.userInflight.get(userKey) ?? 0) >= this.userLimit) {
      throw this.tooMany(
        LLM_USER_CONCURRENCY_LIMIT,
        'user',
        this.userLimit,
        '当前账号同时进行的模型请求过多，请等待正在进行的请求完成',
      );
    }
    if (tenantKey && this.tenantLimit > 0 && (this.tenantInflight.get(tenantKey) ?? 0) >= this.tenantLimit) {
      throw this.tooMany(
        LLM_TENANT_CONCURRENCY_LIMIT,
        'tenant',
        this.tenantLimit,
        '当前企业同时进行的模型请求过多，请稍后重试',
      );
    }

    if (this.userLimit > 0) this.increment(this.userInflight, userKey);
    if (tenantKey && this.tenantLimit > 0) this.increment(this.tenantInflight, tenantKey);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.userLimit > 0) this.decrement(this.userInflight, userKey);
      if (tenantKey && this.tenantLimit > 0) this.decrement(this.tenantInflight, tenantKey);
    };
  }

  private tooMany(code: string, scope: 'user' | 'tenant', limit: number, message: string): HttpException {
    return new HttpException(
      { code, scope, limit, message, retryAfterSeconds: 1 },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private increment(counts: Map<string, number>, key: string): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  private decrement(counts: Map<string, number>, key: string): void {
    const next = (counts.get(key) ?? 0) - 1;
    if (next > 0) counts.set(key, next);
    else counts.delete(key);
  }
}
