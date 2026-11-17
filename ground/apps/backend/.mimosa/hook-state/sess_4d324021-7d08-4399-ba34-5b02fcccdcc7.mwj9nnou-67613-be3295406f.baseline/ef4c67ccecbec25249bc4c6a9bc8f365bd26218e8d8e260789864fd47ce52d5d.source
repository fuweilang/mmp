import type { BadRequestException } from '@nestjs/common';
import { SMS_CODE_TTL_SECONDS, hashSmsCode, type SmsCodeStore, type SmsScene } from '../../src/auth/sms';

export type Row = {
  id: string;
  phone: string;
  scene: SmsScene;
  codeHash: string;
  provider: string;
  sendIp: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

/** 内存版 SmsCodeStore：复刻迁移里的部分唯一索引语义，不连库。 */
export function memoryStore(registered = new Set<string>()): SmsCodeStore & { rows: Row[] } {
  const rows: Row[] = [];
  return {
    rows,
    async findLatest(phone, scene, now) {
      return rows.filter(row => row.phone === phone && row.scene === scene && row.consumedAt === null && row.expiresAt > now)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async findCooldown(phone, scene, since) {
      return rows.filter(row => row.phone === phone && row.scene === scene && row.consumedAt === null && row.createdAt > since)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async countSince(sendIp, since) {
      return rows.filter(row => row.sendIp === sendIp && row.createdAt > since).length;
    },
    async countPhoneSince(phone, since) {
      return rows.filter(row => row.phone === phone && row.createdAt > since).length;
    },
    async retireExpired(phone, scene, now) {
      for (const row of rows) {
        if (row.phone === phone && row.scene === scene && row.consumedAt === null && row.expiresAt <= now) {
          row.consumedAt = now;
        }
      }
    },
    async purgeExpired(before) {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i]!.expiresAt < before) rows.splice(i, 1);
      }
    },
    async insert(row) {
      // 模拟迁移里的部分唯一索引：(phone, scene) WHERE consumed_at IS NULL。
      const live = rows.some(item => item.phone === row.phone && item.scene === row.scene && item.consumedAt === null);
      if (live) return null;
      const id = String(rows.length + 1);
      rows.push({ ...row, id, attempts: 0, consumedAt: null, createdAt: new Date() });
      return id;
    },
    async discard(id) {
      const index = rows.findIndex(item => item.id === id && item.consumedAt === null);
      if (index >= 0) rows.splice(index, 1);
    },
    async bumpAttempts(id) {
      const row = rows.find(item => item.id === id);
      if (row) row.attempts += 1;
    },
    async consume(id, at) {
      const row = rows.find(item => item.id === id && item.consumedAt === null);
      if (!row) return false;
      row.consumedAt = at;
      return true;
    },
    async phoneRegistered(phone) {
      return registered.has(phone);
    },
  };
}

/** 直接写入一条活跃验证码行，绕过发码通道（生产场景测试用）。 */
export function seedRow(
  store: ReturnType<typeof memoryStore>,
  secret: string,
  phone: string,
  scene: SmsScene,
  code: string,
  options: { ttlMs?: number; createdAt?: Date; attempts?: number; sendIp?: string } = {},
): Row {
  const now = options.createdAt ?? new Date();
  const row: Row = {
    id: String(store.rows.length + 1),
    phone,
    scene,
    codeHash: hashSmsCode(secret, phone, scene, code),
    provider: 'tencent',
    sendIp: options.sendIp ?? '127.0.0.1',
    attempts: options.attempts ?? 0,
    consumedAt: null,
    expiresAt: new Date(now.getTime() + (options.ttlMs ?? SMS_CODE_TTL_SECONDS * 1000)),
    createdAt: now,
  };
  store.rows.push(row);
  return row;
}

/** 取 Nest HttpException 的 body 错误码；断言稳定码而不是中文文案。 */
export function errorCode(error: unknown): string | undefined {
  const response = (error as BadRequestException | undefined)?.getResponse?.();
  if (response && typeof response === 'object' && 'code' in response) {
    return String((response as { code: unknown }).code);
  }
  return undefined;
}

export function errorMessage(error: unknown): string | undefined {
  const response = (error as BadRequestException | undefined)?.getResponse?.();
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    return String((response as { message: unknown }).message);
  }
  return undefined;
}
