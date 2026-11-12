import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SmsCodes, SMS_CODE_TTL_SECONDS, assertSmsConfig, hashSmsCode, mockSmsCode, smsProvider, type SmsScene } from '../../src/auth/sms';
import { errorCode, errorMessage, memoryStore, seedRow, type Row } from './fake-sms-store';

const ENV_KEYS = [
  'SMS_PROVIDER',
  'NODE_ENV',
  'MOCK_SMS_CODE',
  'TENCENT_SMS_SECRET_ID',
  'TENCENT_SMS_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_TEMPLATE_ID',
  'TENCENT_SMS_TEMPLATE_ID_LOGIN',
  'TENCENT_SMS_TEMPLATE_ID_REGISTER',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_REGION',
] as const;
const savedEnv = new Map<string, string | undefined>(ENV_KEYS.map(key => [key, process.env[key]]));
afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('sms codes', () => {
  it('fills the local mock code and accepts it once', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'test-secret');
    const sent = await sms.send('13800138000', 'register', '127.0.0.1');
    assert.equal(sent.mockCode, '123456');
    assert.equal(mockSmsCode(), '123456');
    assert.equal(store.rows[0]?.codeHash, hashSmsCode('test-secret', '13800138000', 'register', '123456'));
    await sms.consume('13800138000', 'register', '123456');
    await assert.rejects(() => sms.consume('13800138000', 'register', '123456'), /验证码不存在或已过期/);
  });

  it('keeps the 5 minute TTL on a freshly issued code', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'test-secret');
    await sms.send('13800138000', 'register', '127.0.0.1');
    const row = store.rows[0] as Row;
    // 常量与真实落库有效期都要钉死字面量，改 TTL 必须显式改测试。
    assert.equal(SMS_CODE_TTL_SECONDS, 300);
    assert.equal(row.expiresAt.getTime() - row.createdAt.getTime(), 300_000);
  });

  it('rejects a wrong code and a duplicate send during cooldown', async () => {    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore(new Set(['13800138000']));
    const sms = new SmsCodes(store, 'test-secret');
    await sms.send('13800138000', 'login', '127.0.0.1');
    const again = await sms.send('13800138000', 'login', '127.0.0.1');
    assert.equal(store.rows.length, 1);
    assert.ok(again.retryAfterSeconds > 0 && again.retryAfterSeconds <= 60);
    await assert.rejects(() => sms.consume('13800138000', 'login', '000000'), /验证码错误/);
  });

  it('does not leak registration state when a login code is requested for an unknown phone', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'test-secret');
    const result = await sms.send('13800138000', 'login', '127.0.0.1');
    assert.equal(result.ok, true);
    assert.equal(result.mockCode, undefined);
    assert.equal(store.rows.length, 0);
  });

  it('does not leak registration state when a register code is requested for a known phone', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore(new Set(['13800138000']));
    const sms = new SmsCodes(store, 'test-secret');
    const result = await sms.send('13800138000', 'register', '127.0.0.1');
    assert.equal(result.ok, true);
    assert.equal(result.mockCode, undefined);
    assert.equal(store.rows.length, 0);
  });

  it('returns a byte-identical body for the silent branch and the cooldown branch', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const silent = await new SmsCodes(memoryStore(), 'test-secret').send('13800138000', 'login', '1.1.1.1');

    const store = memoryStore(new Set(['13800138000']));
    seedRow(store, 'test-secret', '13800138000', 'login', '123456', { createdAt: new Date(Date.now() - 35_000) });
    const cooled = await new SmsCodes(store, 'test-secret').send('13800138000', 'login', '1.1.1.1');

    // 冷却分支若回真实剩余秒数或带 mockCode，就能被匿名接口用来枚举号码是否已注册。
    assert.deepEqual(cooled, silent);
    assert.deepEqual(Object.keys(cooled), ['ok', 'retryAfterSeconds']);
    assert.equal(cooled.retryAfterSeconds, 60);
    assert.equal(store.rows.length, 1);
  });

  it('rejects an unknown provider with SMS_UNAVAILABLE before touching the store', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'bogus';
    const store = memoryStore();
    await assert.rejects(
      () => new SmsCodes(store, 'test-secret').send('13800138000', 'register', '1.1.1.1'),
      (error: unknown) => {
        assert.equal(errorCode(error), 'SMS_UNAVAILABLE');
        return true;
      },
    );
    assert.equal(store.rows.length, 0);
  });

  it('consumes a code at most once under concurrency', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'test-secret');
    await sms.send('13800138000', 'register', '127.0.0.1');
    const results = await Promise.allSettled([
      sms.consume('13800138000', 'register', '123456'),
      sms.consume('13800138000', 'register', '123456'),
    ]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  });

  it('counts the hourly limit per phone as well as per IP', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'test-secret');
    for (let i = 0; i < 5; i += 1) {
      await sms.send('13800138000', 'register', `10.0.0.${i}`);
      // 绕开 60 秒冷却并释放活跃唯一槽位，模拟同一号码被连续索码。
      for (const row of store.rows) {
        row.createdAt = new Date(Date.now() - 120_000);
        row.consumedAt ??= new Date();
      }
    }
    await assert.rejects(() => sms.send('13800138000', 'register', '10.0.0.99'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_RATE_LIMITED');
      assert.match(errorMessage(error) ?? '', /过于频繁/);
      return true;
    });
  });

  it('fails closed in production without an explicit real SMS provider', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_PROVIDER;
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent/);
    assert.throws(() => assertSmsConfig(), /SMS_PROVIDER=tencent/);
    process.env.SMS_PROVIDER = 'mock';
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent/);
    assert.throws(() => assertSmsConfig(), /SMS_PROVIDER=tencent/);
  });

  it('fails closed in production when Tencent credentials are incomplete', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    delete process.env.TENCENT_SMS_SECRET_ID;
    delete process.env.TENCENT_SMS_SECRET_KEY;
    delete process.env.TENCENT_SMS_SDK_APP_ID;
    delete process.env.TENCENT_SMS_TEMPLATE_ID;
    assert.throws(() => assertSmsConfig(), /TENCENT_SMS_SECRET_ID/);
  });

  it('fails closed in production when only the scene template IDs are missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    process.env.TENCENT_SMS_SECRET_ID = 'secret-id';
    process.env.TENCENT_SMS_SECRET_KEY = 'secret-key';
    process.env.TENCENT_SMS_SDK_APP_ID = '1400000000';
    delete process.env.TENCENT_SMS_TEMPLATE_ID;
    delete process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN;
    delete process.env.TENCENT_SMS_TEMPLATE_ID_REGISTER;
    assert.throws(() => assertSmsConfig(), (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /TENCENT_SMS_TEMPLATE_ID_LOGIN/);
      assert.match(message, /TENCENT_SMS_TEMPLATE_ID_REGISTER/);
      assert.doesNotMatch(message, /SECRET_ID|SECRET_KEY|SDK_APP_ID/);
      return true;
    });
  });
});

describe('production code verification (stubbed channel, no real SMS)', () => {
  afterEach(() => {
    delete process.env.TENCENT_SMS_SIGN_NAME;
  });

  /** 生产分支：只校验真实随机码校验逻辑，发送通道替换成桩。 */
  async function prodSender() {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    const store = memoryStore();
    const delivered: Array<{ phone: string; scene: SmsScene; code: string }> = [];
    const sms = new SmsCodes(store, 'prod-secret', async (phone, scene, code) => {
      delivered.push({ phone, scene, code });
    });
    return { store, delivered, sms };
  }

  it('sends a random code through the injected channel and never returns mockCode', async () => {
    const { store, delivered, sms } = await prodSender();
    const result = await sms.send('13800138000', 'register', '127.0.0.1');
    assert.equal(result.mockCode, undefined);
    assert.equal(delivered.length, 1);
    const code = delivered[0]!.code;
    assert.match(code, /^\d{6}$/);
    const row = store.rows[0] as Row;
    assert.equal(row.provider, 'tencent');
    assert.equal(row.codeHash, hashSmsCode('prod-secret', '13800138000', 'register', code));
    await sms.consume('13800138000', 'register', code);
    // 生产环境固定 mock 码不能通用（随机码极小概率等于 123456）。
    if (code !== '123456') {
      const store2 = memoryStore();
      const sms2 = new SmsCodes(store2, 'prod-secret', async () => undefined);
      await sms2.send('13900139000', 'register', '127.0.0.1');
      await assert.rejects(() => sms2.consume('13900139000', 'register', '123456'), /验证码错误/);
    }
  });

  it('rejects expired, reused, wrong and missing codes with stable codes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'prod-secret', async () => undefined);
    seedRow(store, 'prod-secret', '13800138000', 'register', '482913', { ttlMs: -1 });
    await assert.rejects(() => sms.consume('13800138000', 'register', '482913'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_CODE_EXPIRED');
      return true;
    });

    seedRow(store, 'prod-secret', '13800138001', 'register', '482913');
    await sms.consume('13800138001', 'register', '482913');
    await assert.rejects(() => sms.consume('13800138001', 'register', '482913'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_CODE_EXPIRED');
      return true;
    });

    seedRow(store, 'prod-secret', '13800138002', 'register', '482913');
    await assert.rejects(() => sms.consume('13800138002', 'register', '111111'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_INVALID');
      return true;
    });
    await assert.rejects(() => sms.consume('13800138002', 'register', ''), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_INVALID');
      return true;
    });
  });

  it('fails the send with SMS_UNAVAILABLE and drops the pending row when the channel throws', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'prod-secret', async () => {
      throw new Error('channel down');
    });
    await assert.rejects(() => sms.send('13800138000', 'register', '127.0.0.1'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_UNAVAILABLE');
      return true;
    });
    // 未送达的码必须丢弃，否则用户 60 秒冷却后也无法重发。
    assert.equal(store.rows.length, 0);
  });

  it('locks the code after five wrong attempts', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore();
    const sms = new SmsCodes(store, 'test-secret');
    await sms.send('13800138000', 'register', '127.0.0.1');
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => sms.consume('13800138000', 'register', '000000'), /验证码错误/);
    }
    await assert.rejects(() => sms.consume('13800138000', 'register', '123456'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_RATE_LIMITED');
      return true;
    });
  });

  it('enforces the 60s cooldown per phone even from another IP', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const store = memoryStore(new Set(['13800138000']));
    const sms = new SmsCodes(store, 'test-secret');
    const first = await sms.send('13800138000', 'login', '10.0.0.1');
    assert.equal(first.retryAfterSeconds, 60);
    const second = await sms.send('13800138000', 'login', '10.0.0.2');
    assert.equal(store.rows.length, 1);
    assert.ok(second.retryAfterSeconds > 0 && second.retryAfterSeconds <= 60);
  });

  it('enforces the IP limit across different phones and the phone limit across different IPs', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const ipStore = memoryStore();
    const ipSms = new SmsCodes(ipStore, 'test-secret');
    for (let i = 0; i < 20; i += 1) {
      await ipSms.send(`1390000${String(i).padStart(4, '0')}`, 'register', '20.20.20.20');
    }
    await assert.rejects(() => ipSms.send('13900009999', 'register', '20.20.20.20'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_RATE_LIMITED');
      return true;
    });

    const phoneStore = memoryStore(new Set(['13800138000']));
    const phoneSms = new SmsCodes(phoneStore, 'test-secret');
    for (let i = 0; i < 5; i += 1) {
      await phoneSms.send('13800138000', 'login', `30.30.30.${i}`);
      for (const row of phoneStore.rows) {
        row.createdAt = new Date(Date.now() - 120_000);
        row.consumedAt ??= new Date();
      }
    }
    await assert.rejects(() => phoneSms.send('13800138000', 'login', '30.30.30.99'), (error: unknown) => {
      assert.equal(errorCode(error), 'SMS_RATE_LIMITED');
      return true;
    });
  });

  it('behaves oppositely in dev and production for the same input', async () => {
    const store = memoryStore();
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const dev = new SmsCodes(store, 'secret');
    const devSend = await dev.send('13800138000', 'register', '127.0.0.1');
    assert.equal(devSend.mockCode, '123456');

    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    assert.equal(smsProvider(), 'tencent');
    delete process.env.SMS_PROVIDER;
    process.env.NODE_ENV = 'production';
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent/);

    process.env.SMS_PROVIDER = 'mock';
    assert.throws(() => smsProvider(), /SMS_PROVIDER=tencent/);
    process.env.NODE_ENV = 'development';
    assert.equal(smsProvider(), 'mock');
  });
});
