import { BadRequestException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';

export type SmsScene = 'login' | 'register';

/**
 * 机器可读错误码：桌面端/Web 端据此做本地化与升级引导，不依赖中文文案。
 * 短信登录接口会把所有校验失败都折叠成 SMS_INVALID，避免泄露号码是否存在。
 */
export type SmsErrorCode =
  | 'SMS_RATE_LIMITED'
  | 'SMS_INVALID'
  | 'SMS_CODE_EXPIRED'
  | 'SMS_UNAVAILABLE'
  | 'CLIENT_TOO_OLD';

export function smsError(code: SmsErrorCode, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

/** 验证码有效期（秒）。单测按字面量断言，改动必须显式同步。 */
export const SMS_CODE_TTL_SECONDS = 5 * 60;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const IP_HOURLY_LIMIT = 20;
const PHONE_HOURLY_LIMIT = 5;
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** 进程级清理节流：发码是低频操作，每小时最多顺带删一次过期行。 */
let lastPurgeAt = 0;

export type SmsSendResult = {
  ok: true;
  retryAfterSeconds: number;
  mockCode?: string;
};

type CodeRow = {
  id: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
};

/** Narrow store so send and consume can be tested without a database. */
export interface SmsCodeStore {
  findLatest(phone: string, scene: SmsScene, now: Date): Promise<CodeRow | null>;
  findCooldown(phone: string, scene: SmsScene, since: Date): Promise<{ createdAt: Date } | null>;
  countSince(sendIp: string, since: Date): Promise<number>;
  countPhoneSince(phone: string, since: Date): Promise<number>;
  /** 把已过期的未核销行标记为已核销，释放 phone+scene 的活跃唯一槽位。 */
  retireExpired(phone: string, scene: SmsScene, now: Date): Promise<void>;
  /** 惰性清理：删除过期超过一天的旧行，避免表无限增长。 */
  purgeExpired(before: Date): Promise<void>;
  /** 返回新行 id；同一 phone+scene 已有未核销行时返回 null（部分唯一索引）。 */
  insert(row: {
    phone: string;
    scene: SmsScene;
    codeHash: string;
    provider: string;
    sendIp: string;
    expiresAt: Date;
  }): Promise<string | null>;
  /** 丢弃刚插入但未送达成功的行，让用户可以立即重试。 */
  discard(id: string): Promise<void>;
  bumpAttempts(id: string): Promise<void>;
  /** 条件核销：仅当 consumedAt 仍为空时成功，返回是否由本次调用核销。 */
  consume(id: string, at: Date): Promise<boolean>;
  phoneRegistered(phone: string): Promise<boolean>;
}

export type SmsProvider = 'mock' | 'tencent' | 'aliyun';

const REAL_SMS_PROVIDERS = ['tencent', 'aliyun'] as const;

export function isProductionRuntime(): boolean {
  return (process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

export function smsProvider(): SmsProvider {
  const value = (process.env.SMS_PROVIDER || '').trim().toLowerCase();
  // 生产 fail-closed：没显式配 tencent/aliyun 就不允许发码，绝不回落到 mock。
  if (isProductionRuntime()) {
    if (value === 'tencent' || value === 'aliyun') return value;
    throw new Error('生产环境必须显式配置 SMS_PROVIDER=tencent 或 aliyun；拒绝回落到 mock 短信通道');
  }
  if (value === '' || value === 'mock') return 'mock';
  if (value === 'tencent' || value === 'aliyun') return value;
  throw smsError('SMS_UNAVAILABLE', '短信服务暂不可用');
}

export function mockSmsCode(): string {
  const code = (process.env.MOCK_SMS_CODE || '123456').replace(/[^\d]/g, '');
  return code.length === 6 ? code : '123456';
}

function mockCodeAllowed(provider: SmsProvider): boolean {
  return provider === 'mock' && !isProductionRuntime();
}

function templateId(scene: SmsScene): string {
  const specific = scene === 'login'
    ? process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN
    : process.env.TENCENT_SMS_TEMPLATE_ID_REGISTER;
  return String(specific || process.env.TENCENT_SMS_TEMPLATE_ID || '').trim();
}

function aliyunTemplateId(scene: SmsScene): string {
  const specific = scene === 'login'
    ? process.env.ALIYUN_SMS_TEMPLATE_ID_LOGIN
    : process.env.ALIYUN_SMS_TEMPLATE_ID_REGISTER;
  return String(specific || process.env.ALIYUN_SMS_TEMPLATE_ID || '').trim();
}

/** 只回键名，绝不回值；日志/异常都能安全外露。 */
export function missingSmsConfig(provider: SmsProvider): string[] {
  if (provider === 'aliyun') {
    const required: Array<[string, string | undefined]> = [
      ['ALIYUN_SMS_ACCESS_KEY_ID', process.env.ALIYUN_SMS_ACCESS_KEY_ID],
      ['ALIYUN_SMS_ACCESS_KEY_SECRET', process.env.ALIYUN_SMS_ACCESS_KEY_SECRET],
    ];
    const missing = required
      .filter(([, value]) => !String(value || '').trim())
      .map(([key]) => key);
    if (!aliyunTemplateId('login')) missing.push('ALIYUN_SMS_TEMPLATE_ID_LOGIN');
    if (!aliyunTemplateId('register')) missing.push('ALIYUN_SMS_TEMPLATE_ID_REGISTER');
    return missing;
  }
  if (provider === 'tencent') {
    const required: Array<[string, string | undefined]> = [
      ['TENCENT_SMS_SECRET_ID', process.env.TENCENT_SMS_SECRET_ID],
      ['TENCENT_SMS_SECRET_KEY', process.env.TENCENT_SMS_SECRET_KEY],
      ['TENCENT_SMS_SDK_APP_ID', process.env.TENCENT_SMS_SDK_APP_ID],
    ];
    const missing = required
      .filter(([, value]) => !String(value || '').trim())
      .map(([key]) => key);
    if (!String(process.env.TENCENT_SMS_TEMPLATE_ID || '').trim()) {
      for (const scene of ['login', 'register'] as const) {
        if (!templateId(scene)) missing.push(`TENCENT_SMS_TEMPLATE_ID_${scene.toUpperCase()}`);
      }
    }
    return missing;
  }
  return [];
}

/**
 * 启动前置校验：生产环境缺短信通道/凭据直接抛错，进程起不来（fail-closed）。
 * 部署方宁可启动失败，也不能带着 mock 通道对外服务。
 */
export function assertSmsConfig(): void {
  if (!isProductionRuntime()) return;
  // smsProvider() 已在生产 fail-closed：缺失/mock/未知 provider 都抛错。
  const provider = smsProvider();
  if (provider === 'mock') {
    throw new Error('生产环境禁止 mock 短信通道');
  }
  const missing = missingSmsConfig(provider);
  if (missing.length > 0) {
    throw new Error(`生产环境短信配置缺失（${provider}）：${missing.join(', ')}`);
  }
}

export function hashSmsCode(secret: string, phone: string, scene: SmsScene, code: string): string {
  return createHmac('sha256', secret).update(`${phone}:${scene}:${code}`).digest('hex');
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeCode(code: string): string {
  const digits = String(code || '').replace(/[^\d]/g, '');
  if (!/^\d{6}$/.test(digits)) throw smsError('SMS_INVALID', '请输入6位短信验证码');
  return digits;
}

async function sendTencentSms(phone: string, scene: SmsScene, code: string): Promise<void> {
  const secretId = String(process.env.TENCENT_SMS_SECRET_ID || '').trim();
  const secretKey = String(process.env.TENCENT_SMS_SECRET_KEY || '').trim();
  const sdkAppId = String(process.env.TENCENT_SMS_SDK_APP_ID || '').trim();
  const signName = String(process.env.TENCENT_SMS_SIGN_NAME || '').trim() || '猛犸世纪';
  const region = String(process.env.TENCENT_SMS_REGION || '').trim() || 'ap-guangzhou';
  const template = templateId(scene);
  if (!secretId || !secretKey || !sdkAppId || !template) {
    throw smsError('SMS_UNAVAILABLE', '短信服务暂不可用');
  }
  const sdk = await import('tencentcloud-sdk-nodejs-sms');
  const client = new sdk.sms.v20210111.Client({
    credential: { secretId, secretKey },
    region,
    profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com', reqTimeout: 10 } },
  });
  const result = await client.SendSms({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: template,
    TemplateParamSet: [code],
  });
  const status = result.SendStatusSet?.[0];
  if (String(status?.Code || '').toLowerCase() !== 'ok') {
    throw smsError('SMS_UNAVAILABLE', '验证码发送失败，请稍后重试');
  }
}

const ALIYUN_DEFAULT_SIGN_NAME = '猛犸世纪';
const ALIYUN_DEFAULT_REGION = 'cn-hangzhou';
const ALIYUN_DEFAULT_ENDPOINT = 'https://dysmsapi.aliyuncs.com/';
const ALIYUN_DEFAULT_TEMPLATE_PARAM_NAME = 'code';
const ALIYUN_API_VERSION = '2017-05-25';

/** 阿里云 RPC 签名要求的百分号编码（RFC3986，空格 %20、* 也要编码）。 */
export function aliyunPercentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** 规范化查询串：键按字典序排序后用 & 连接，签名与请求体共用同一套编码。 */
export function aliyunCanonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${aliyunPercentEncode(key)}=${aliyunPercentEncode(params[key] ?? '')}`)
    .join('&');
}

/** StringToSign = POST & %2F & percentEncode(canonicalQuery)；密钥为 AccessKeySecret + '&'。 */
export function aliyunSignature(params: Record<string, string>, accessKeySecret: string): string {
  // 签名串永远不含 Signature 自身，重复调用也稳定。
  const unsigned: Record<string, string> = { ...params };
  delete unsigned.Signature;
  const stringToSign = `POST&${aliyunPercentEncode('/')}&${aliyunPercentEncode(aliyunCanonicalQuery(unsigned))}`;
  return createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64');
}

export type AliyunSmsParamsOptions = {
  nonce?: string;
  /** ISO8601 UTC，形如 2026-11-13T00:00:00Z。 */
  timestamp?: string;
};

/**
 * 构造 SendSms 的完整参数（含 Signature）。缺配置直接抛 SMS_UNAVAILABLE，
 * 不把凭据/原始响应带进错误信息。
 */
export function buildAliyunSmsParams(
  phone: string,
  scene: SmsScene,
  code: string,
  options: AliyunSmsParamsOptions = {},
): Record<string, string> {
  const accessKeyId = String(process.env.ALIYUN_SMS_ACCESS_KEY_ID || '').trim();
  const accessKeySecret = String(process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || '').trim();
  const template = aliyunTemplateId(scene);
  if (!accessKeyId || !accessKeySecret || !template) {
    throw smsError('SMS_UNAVAILABLE', '短信服务暂不可用');
  }
  const signName = String(process.env.ALIYUN_SMS_SIGN_NAME || '').trim() || ALIYUN_DEFAULT_SIGN_NAME;
  const region = String(process.env.ALIYUN_SMS_REGION || '').trim() || ALIYUN_DEFAULT_REGION;
  const paramName = String(process.env.ALIYUN_SMS_TEMPLATE_PARAM_NAME || '').trim()
    || ALIYUN_DEFAULT_TEMPLATE_PARAM_NAME;
  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: region,
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: options.nonce || randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: template,
    TemplateParam: JSON.stringify({ [paramName]: code }),
    Timestamp: options.timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: ALIYUN_API_VERSION,
  };
  params.Signature = aliyunSignature(params, accessKeySecret);
  return params;
}

export type AliyunHttpResponse = { status: number; body: unknown };
export type AliyunHttpPost = (url: string, body: string) => Promise<AliyunHttpResponse>;

/** 默认传输：POST 表单，10 秒超时；解析失败按空响应处理，绝不打印响应体。 */
export const defaultAliyunHttpPost: AliyunHttpPost = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
};

/** 阿里云 SendSms：HTTP 2xx 且 Code=OK 才算成功，其余一律 SMS_UNAVAILABLE。 */
export async function sendAliyunSms(
  phone: string,
  scene: SmsScene,
  code: string,
  deps: { httpPost?: AliyunHttpPost; params?: AliyunSmsParamsOptions } = {},
): Promise<void> {
  const params = buildAliyunSmsParams(phone, scene, code, deps.params);
  const endpoint = String(process.env.ALIYUN_SMS_ENDPOINT || '').trim() || ALIYUN_DEFAULT_ENDPOINT;
  const body = new URLSearchParams(params).toString();
  const post = deps.httpPost ?? defaultAliyunHttpPost;
  let result: AliyunHttpResponse;
  try {
    result = await post(endpoint, body);
  } catch {
    throw smsError('SMS_UNAVAILABLE', '验证码发送失败，请稍后重试');
  }
  const payload = (result.body && typeof result.body === 'object')
    ? result.body as { Code?: unknown; Message?: unknown }
    : {};
  const ok = result.status >= 200 && result.status < 300 && String(payload.Code || '').toUpperCase() === 'OK';
  if (!ok) {
    // 只吐稳定码，不回显阿里云的 Code/Message/RequestId，避免泄露内部细节。
    throw smsError('SMS_UNAVAILABLE', '验证码发送失败，请稍后重试');
  }
}

/** 发送通道签名：生产实现走腾讯云/阿里云，单测注入桩，绝不真发短信。 */
export type SmsDeliverer = (phone: string, scene: SmsScene, code: string) => Promise<void>;

export class SmsCodes {
  constructor(
    private readonly store: SmsCodeStore,
    private readonly secret: string,
    private readonly deliver?: SmsDeliverer,
  ) {}

  async send(phone: string, scene: SmsScene, sendIp: string): Promise<SmsSendResult> {
    const provider = smsProvider();
    const now = new Date();
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const ip = (sendIp || '').trim();
    // 双维度限流：单 IP 防全站被打停，单手机号防跨 IP 轰炸。
    if (ip && await this.store.countSince(ip, since) >= IP_HOURLY_LIMIT) {
      throw smsError('SMS_RATE_LIMITED', '验证码发送过于频繁，请稍后再试');
    }
    if (await this.store.countPhoneSince(phone, since) >= PHONE_HOURLY_LIMIT) {
      throw smsError('SMS_RATE_LIMITED', '验证码发送过于频繁，请稍后再试');
    }

    const registered = await this.store.phoneRegistered(phone);
    const deliverable = scene === 'register' ? !registered : registered;
    if (!deliverable) {
      // 未鉴权接口不得区分手机号是否已注册：静默成功、不发码，避免被用来枚举号码。
      return { ok: true, retryAfterSeconds: COOLDOWN_SECONDS };
    }

    const recent = await this.store.findCooldown(phone, scene, new Date(now.getTime() - COOLDOWN_SECONDS * 1000));
    if (recent) {
      // 冷却分支必须与上面的静默分支逐字段一致：真实剩余秒数/是否带 mockCode 都会泄露
      // 「这个号码已注册且刚发过码」。固定回满冷却时间，前端只拿它做倒计时。
      return { ok: true, retryAfterSeconds: COOLDOWN_SECONDS };
    }

    await this.purgeIfDue(now);
    await this.store.retireExpired(phone, scene, now);

    const code = provider === 'mock' ? mockSmsCode() : randomInt(0, 1_000_000).toString().padStart(6, '0');
    const id = await this.store.insert({
      phone,
      scene,
      codeHash: hashSmsCode(this.secret, phone, scene, code),
      provider,
      sendIp: ip.slice(0, 80),
      expiresAt: new Date(now.getTime() + SMS_CODE_TTL_SECONDS * 1000),
    });
    if (!id) {
      // 并发发码撞上 phone+scene 活跃唯一索引：本次不重复下发，等冷却结束。
      return { ok: true, retryAfterSeconds: COOLDOWN_SECONDS };
    }

    if (provider !== 'mock') {
      const deliver = this.deliver ?? (provider === 'aliyun' ? sendAliyunSms : sendTencentSms);
      try {
        await deliver(phone, scene, code);
      } catch (error) {
        // 通道失败不能留着未核销行，否则用户 60 秒后也无法重发。
        await this.store.discard(id);
        if (error instanceof BadRequestException) throw error;
        throw smsError('SMS_UNAVAILABLE', '验证码发送失败，请稍后重试');
      }
    }
    return {
      ok: true,
      retryAfterSeconds: COOLDOWN_SECONDS,
      ...(mockCodeAllowed(provider) ? { mockCode: code } : {}),
    };
  }

  /** 只校验不核销：注册场景先建号成功，再在同一事务内核销（失败整体回滚）。 */
  async verify(phone: string, scene: SmsScene, code: string): Promise<{ id: string }> {
    const normalized = normalizeCode(code);
    const record = await this.store.findLatest(phone, scene, new Date());
    if (!record) throw smsError('SMS_CODE_EXPIRED', '验证码不存在或已过期');
    if (record.attempts >= MAX_ATTEMPTS) throw smsError('SMS_RATE_LIMITED', '验证码尝试次数过多，请重新获取');
    await this.store.bumpAttempts(record.id);
    if (!sameHash(record.codeHash, hashSmsCode(this.secret, phone, scene, normalized))) {
      throw smsError('SMS_INVALID', '验证码错误');
    }
    return { id: record.id };
  }

  /** 校验 + 条件核销（并发下只有一个请求能核销成功）。 */
  async consume(phone: string, scene: SmsScene, code: string): Promise<void> {
    const { id } = await this.verify(phone, scene, code);
    if (!await this.store.consume(id, new Date())) {
      throw smsError('SMS_CODE_EXPIRED', '验证码已使用，请重新获取');
    }
  }

  private async purgeIfDue(now: Date): Promise<void> {
    if (now.getTime() - lastPurgeAt < PURGE_INTERVAL_MS) return;
    lastPurgeAt = now.getTime();
    await this.store.purgeExpired(new Date(now.getTime() - PURGE_AFTER_MS));
  }
}
