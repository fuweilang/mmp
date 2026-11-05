import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

function secretBytes(): Buffer {
  const raw = (process.env.LLM_API_KEY_SECRET || process.env.JWT_SECRET || '').trim();
  if (!raw) {
    throw new Error('缺少 LLM_API_KEY_SECRET（或 JWT_SECRET）无法加解密厂商 Key');
  }
  return createHash('sha256').update(`mammoth-llm-api-key:${raw}`).digest();
}

/** 加密上游 API Key；返回 v1:iv:tag:ciphertext（均为 base64url）。 */
export function encryptApiKey(plaintext: string): string {
  const key = secretBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(':');
}

/** 解密；仅服务端内部转发用，禁止回传前端。 */
export function decryptApiKey(blob: string): string {
  const parts = String(blob || '').split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('厂商 Key 密文格式无效');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = secretBytes();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** 掩码提示：保留末 4 位。 */
export function maskApiKeyHint(plaintext: string): string {
  const t = plaintext.trim();
  if (!t) return '';
  if (t.length <= 4) return '••••';
  return `••••${t.slice(-4)}`;
}
