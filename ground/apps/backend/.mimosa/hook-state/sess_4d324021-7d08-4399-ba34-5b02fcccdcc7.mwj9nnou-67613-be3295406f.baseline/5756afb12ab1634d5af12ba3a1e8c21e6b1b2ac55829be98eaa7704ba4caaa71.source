import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import {
  SmsCodes,
  aliyunCanonicalQuery,
  aliyunPercentEncode,
  aliyunSignature,
  assertSmsConfig,
  buildAliyunSmsParams,
  sendAliyunSms,
  smsProvider,
  type AliyunHttpPost,
} from '../../src/auth/sms';
import { errorCode, errorMessage, memoryStore, type Row } from './fake-sms-store';

const ALIYUN_KEYS = [
  'ALIYUN_SMS_ACCESS_KEY_ID',
  'ALIYUN_SMS_ACCESS_KEY_SECRET',
  'ALIYUN_SMS_SIGN_NAME',
  'ALIYUN_SMS_REGION',
  'ALIYUN_SMS_ENDPOINT',
  'ALIYUN_SMS_TEMPLATE_ID',
  'ALIYUN_SMS_TEMPLATE_ID_LOGIN',
  'ALIYUN_SMS_TEMPLATE_ID_REGISTER',
  'ALIYUN_SMS_TEMPLATE_PARAM_NAME',
] as const;
const ENV_KEYS = ['SMS_PROVIDER', 'NODE_ENV', ...ALIYUN_KEYS] as const;
const savedEnv = new Map<string, string | undefined>(ENV_KEYS.map(key => [key, process.env[key]]));

function resetAliyunEnv(): void {
  for (const key of ALIYUN_KEYS) delete process.env[key];
}

function configureAliyun(): void {
  process.env.ALIYUN_SMS_ACCESS_KEY_ID = 'test-key-id';
  process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = 'test-secret';
  process.env.ALIYUN_SMS_TEMPLATE_ID = 'SMS_000001';
}

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('aliyun sms request building', () => {
  it('percent-encodes per RFC3986 (space, *, ~, quotes)', () => {
    assert.equal(aliyunPercentEncode('a b'), 'a%20b');
    assert.equal(aliyunPercentEncode('a*b'), 'a%2Ab');
    assert.equal(aliyunPercentEncode('~-_.'), '~-_.');
    assert.equal(aliyunPercentEncode('{"code":"1"}'), '%7B%22code%22%3A%221%22%7D');
    assert.equal(aliyunPercentEncode('/'), '%2F');
  });

  it('sorts the canonical query by key', () => {
    assert.equal(aliyunCanonicalQuery({ b: '2', a: '1' }), 'a=1&b=2');
  });

  it('pins the HMAC-SHA1 signature over a fixed request', () => {
    const params: Record<string, string> = {
      AccessKeyId: 'test-key-id',
      Action: 'SendSms',
      Format: 'JSON',
      PhoneNumbers: '13800138000',
      RegionId: 'cn-hangzhou',
      SignName: '猛犸世纪',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: 'fixed-nonce',
      SignatureVersion: '1.0',
      TemplateCode: 'SMS_000001',
      TemplateParam: JSON.stringify({ code: '654321' }),
      Timestamp: '2026-11-13T00:00:00Z',
      Version: '2017-05-25',
    };
    // 独立重算：StringToSign = POST&%2F&percentEncode(canonicalQuery)
    const encode = (value: string) => encodeURIComponent(value)
      .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const expected = createHmac('sha1', 'test-secret&')
      .update(`POST&%2F&${encode(aliyunCanonicalQuery(params))}`)
      .digest('base64');
    assert.equal(aliyunSignature(params, 'test-secret'), expected);
    // 固定向量，防止编码/排序被悄悄改动
    assert.equal(aliyunSignature(params, 'test-secret'), '/MCntR8N55Bk0wVLpuaUSCkgY+s=');
  });

  it('builds SendSms params with defaults, templates and no secret leakage', () => {
    resetAliyunEnv();
    configureAliyun();
    process.env.ALIYUN_SMS_TEMPLATE_ID_LOGIN = 'SMS_LOGIN_1';
    const params = buildAliyunSmsParams('13800138000', 'login', '654321', {
      nonce: 'fixed-nonce',
      timestamp: '2026-11-13T00:00:00Z',
    });
    assert.equal(params.Action, 'SendSms');
    assert.equal(params.Version, '2017-05-25');
    assert.equal(params.SignatureMethod, 'HMAC-SHA1');
    assert.equal(params.SignatureVersion, '1.0');
    assert.equal(params.Format, 'JSON');
    assert.equal(params.PhoneNumbers, '13800138000');
    assert.equal(params.RegionId, 'cn-hangzhou');
    assert.equal(params.SignName, '猛犸世纪');
    assert.equal(params.TemplateCode, 'SMS_LOGIN_1');
    assert.equal(params.TemplateParam, '{"code":"654321"}');
    assert.equal(params.Timestamp, '2026-11-13T00:00:00Z');
    assert.equal(params.Signature, aliyunSignature(params, 'test-secret'));
    assert.ok(!Object.values(params).includes('test-secret'));
  });

  it('honours sign name, region, endpoint, template param name and scene templates', () => {
    resetAliyunEnv();
    configureAliyun();
    delete process.env.ALIYUN_SMS_TEMPLATE_ID;
    process.env.ALIYUN_SMS_TEMPLATE_ID_REGISTER = 'SMS_REGISTER_9';
    process.env.ALIYUN_SMS_SIGN_NAME = '测试签名';
    process.env.ALIYUN_SMS_REGION = 'cn-shanghai';
    process.env.ALIYUN_SMS_TEMPLATE_PARAM_NAME = 'codeNum';
    const params = buildAliyunSmsParams('13900139000', 'register', '000123');
    assert.equal(params.SignName, '测试签名');
    assert.equal(params.RegionId, 'cn-shanghai');
    assert.equal(params.TemplateCode, 'SMS_REGISTER_9');
    assert.equal(params.TemplateParam, '{"codeNum":"000123"}');
  });
});

describe('aliyun sms delivery (stubbed HTTP, no real SMS)', () => {
  function enqueue(code: string) {
    const digits = code.replace(/\D/g, '');
    assert.equal(digits.length, 6);
    return digits;
  }

  it('posts a signed form body and accepts Code=OK', async () => {
    resetAliyunEnv();
    configureAliyun();
    const calls: Array<{ url: string; body: string }> = [];
    const httpPost: AliyunHttpPost = async (url, body) => {
      calls.push({ url, body });
      return { status: 200, body: { Code: 'OK', Message: 'OK', BizId: '1' } };
    };
    await sendAliyunSms('13800138000', 'register', enqueue('123456'), { httpPost });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://dysmsapi.aliyuncs.com/');
    const form = new URLSearchParams(calls[0]!.body);
    assert.equal(form.get('Action'), 'SendSms');
    assert.equal(form.get('PhoneNumbers'), '13800138000');
    assert.equal(form.get('SignName'), '猛犸世纪');
    assert.equal(form.get('TemplateCode'), 'SMS_000001');
    assert.equal(form.get('TemplateParam'), '{"code":"123456"}');
    assert.ok(form.get('Signature'));
    assert.ok(form.get('SignatureNonce'));
    assert.equal(form.get('AccessKeyId'), 'test-key-id');
    assert.equal(calls[0]!.body.includes('test-secret'), false);
  });

  it('throws SMS_UNAVAILABLE without echoing vendor code or credentials', async () => {
    resetAliyunEnv();
    configureAliyun();
    const httpPost: AliyunHttpPost = async () => ({
      status: 200,
      body: { Code: 'isv.BUSINESS_LIMIT_CONTROL', Message: '触发分钟级流控', RequestId: 'req-1' },
    });
    let thrown: unknown;
    try {
      await sendAliyunSms('13800138000', 'register', '123456', { httpPost });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown);
    assert.equal(errorCode(thrown), 'SMS_UNAVAILABLE');
    const message = errorMessage(thrown) ?? '';
    assert.equal(message, '验证码发送失败，请稍后重试');
    assert.doesNotMatch(message, /isv\.|流控|req-1|test-secret|test-key-id/);
  });

  it('treats HTTP errors and transport failures as SMS_UNAVAILABLE', async () => {
    resetAliyunEnv();
    configureAliyun();
    await assert.rejects(
      () => sendAliyunSms('13800138000', 'register', '123456', { httpPost: async () => ({ status: 500, body: null }) }),
      (error: unknown) => errorCode(error) === 'SMS_UNAVAILABLE',
    );
    await assert.rejects(
      () => sendAliyunSms('13800138000', 'register', '123456', { httpPost: async () => { throw new Error('ECONNRESET'); } }),
      (error: unknown) => {
        assert.equal(errorCode(error), 'SMS_UNAVAILABLE');
        assert.doesNotMatch(errorMessage(error) ?? '', /ECONNRESET/);
        return true;
      },
    );
  });

  it('fails closed with SMS_UNAVAILABLE when aliyun config is incomplete', async () => {
    resetAliyunEnv();
    process.env.ALIYUN_SMS_ACCESS_KEY_ID = 'test-key-id';
    process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = 'test-secret';
    delete process.env.ALIYUN_SMS_TEMPLATE_ID;
    let calls = 0;
    await assert.rejects(
      () => sendAliyunSms('13800138000', 'register', '123456', {
        httpPost: async () => {
          calls += 1;
          return { status: 200, body: { Code: 'OK' } };
        },
      }),
      (error: unknown) => {
        assert.equal(errorCode(error), 'SMS_UNAVAILABLE');
        assert.doesNotMatch(errorMessage(error) ?? '', /test-secret|test-key-id/);
        return true;
      },
    );
    assert.equal(calls, 0);
  });
});

const nativeFetch = globalThis.fetch;

describe('aliyun provider wiring', () => {
  afterEach(() => {
    globalThis.fetch = nativeFetch;
  });

  it('produces codes through the aliyun default channel in production', async () => {
    resetAliyunEnv();
    configureAliyun();
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'aliyun';
    const posts: string[] = [];
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      posts.push(init.body);
      return { status: 200, json: async () => ({ Code: 'OK' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const store = memoryStore();
    const result = await new SmsCodes(store, 'prod-secret').send('13800138000', 'register', '1.2.3.4');
    assert.equal(result.mockCode, undefined);
    assert.equal(posts.length, 1);
    const form = new URLSearchParams(posts[0]!);
    assert.match(form.get('TemplateParam') ?? '', /^\{"code":"\d{6}"\}$/);
    const row = store.rows[0] as Row;
    assert.equal(row.provider, 'aliyun');
    const ttl = row.expiresAt.getTime() - row.createdAt.getTime();
    assert.ok(ttl > 299_000 && ttl <= 300_000, `TTL 应为 5 分钟，实际 ${ttl}ms`);
  });

  it('drops the pending row when the aliyun channel fails', async () => {
    resetAliyunEnv();
    configureAliyun();
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'aliyun';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'prod-secret', async () => {
      throw new Error('channel down');
    });
    await assert.rejects(
      () => sms.send('13800138000', 'register', '1.2.3.4'),
      (error: unknown) => errorCode(error) === 'SMS_UNAVAILABLE',
    );
    assert.equal(store.rows.length, 0);
  });

  it('keeps the tencent provider working and selects tencent by default', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    const delivered: Array<{ code: string }> = [];
    const store = memoryStore();
    const sms = new SmsCodes(store, 'prod-secret', async (_phone, _scene, code) => {
      delivered.push({ code });
    });
    assert.equal(smsProvider(), 'tencent');
    await sms.send('13800138000', 'register', '1.2.3.4');
    assert.equal(delivered.length, 1);
    assert.equal((store.rows[0] as Row).provider, 'tencent');
  });

  it('keeps dev mock fixed at 123456 and allows aliyun in dev without mock codes', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const dev = await new SmsCodes(memoryStore(), 'secret').send('13800138000', 'register', '1.2.3.4');
    assert.equal(dev.mockCode, '123456');

    resetAliyunEnv();
    configureAliyun();
    process.env.SMS_PROVIDER = 'aliyun';
    const delivered: string[] = [];
    const sms = new SmsCodes(memoryStore(), 'secret', async (_phone, _scene, code) => {
      delivered.push(code);
    });
    const result = await sms.send('13800138000', 'register', '1.2.3.4');
    assert.equal(result.mockCode, undefined);
    assert.match(delivered[0]!, /^\d{6}$/);
  });
});

describe('aliyun startup assertions', () => {
  it('fails closed in production for missing, mock and unknown providers', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_PROVIDER;
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent 或 aliyun/);
    assert.throws(() => assertSmsConfig(), /SMS_PROVIDER=tencent 或 aliyun/);
    process.env.SMS_PROVIDER = 'mock';
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent 或 aliyun/);
    assert.throws(() => assertSmsConfig(), /SMS_PROVIDER=tencent 或 aliyun/);
    process.env.SMS_PROVIDER = 'huawei';
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent 或 aliyun/);
    assert.throws(() => assertSmsConfig(), /SMS_PROVIDER=tencent 或 aliyun/);
  });

  it('accepts a fully configured aliyun channel in production', () => {
    resetAliyunEnv();
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'aliyun';
    configureAliyun();
    assert.equal(smsProvider(), 'aliyun');
    assert.doesNotThrow(() => assertSmsConfig());
  });

  it('lists only the missing aliyun key names', () => {
    resetAliyunEnv();
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'aliyun';
    delete process.env.ALIYUN_SMS_ACCESS_KEY_ID;
    delete process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
    delete process.env.ALIYUN_SMS_TEMPLATE_ID;
    assert.throws(() => assertSmsConfig(), (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /ALIYUN_SMS_ACCESS_KEY_ID/);
      assert.match(message, /ALIYUN_SMS_ACCESS_KEY_SECRET/);
      assert.match(message, /ALIYUN_SMS_TEMPLATE_ID_LOGIN/);
      assert.match(message, /ALIYUN_SMS_TEMPLATE_ID_REGISTER/);
      return true;
    });
  });

  it('keeps tencent startup checks unchanged', () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    delete process.env.TENCENT_SMS_SECRET_ID;
    delete process.env.TENCENT_SMS_SECRET_KEY;
    delete process.env.TENCENT_SMS_SDK_APP_ID;
    delete process.env.TENCENT_SMS_TEMPLATE_ID;
    assert.throws(() => assertSmsConfig(), /TENCENT_SMS_SECRET_ID/);
    process.env.TENCENT_SMS_SECRET_ID = 'id';
    process.env.TENCENT_SMS_SECRET_KEY = 'key';
    process.env.TENCENT_SMS_SDK_APP_ID = '1400000000';
    assert.throws(() => assertSmsConfig(), /TENCENT_SMS_TEMPLATE_ID_LOGIN/);
    process.env.TENCENT_SMS_TEMPLATE_ID = '123';
    assert.doesNotThrow(() => assertSmsConfig());
  });

  it('does not require sms config outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SMS_PROVIDER;
    resetAliyunEnv();
    assert.equal(smsProvider(), 'mock');
    assert.doesNotThrow(() => assertSmsConfig());
  });
});
