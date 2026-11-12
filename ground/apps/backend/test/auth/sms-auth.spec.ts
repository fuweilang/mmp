import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { AuthService } from '../../src/auth/auth.service';
import { SmsCodes, hashSmsCode, smsError } from '../../src/auth/sms';
import { ApplicationExceptionFilter } from '../../src/logging/application-exception.filter';
import { errorCode, errorMessage, memoryStore } from './fake-sms-store';

const SECRET = 'test-secret';
const savedProvider = process.env.SMS_PROVIDER;
const savedNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (savedProvider === undefined) delete process.env.SMS_PROVIDER;
  else process.env.SMS_PROVIDER = savedProvider;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

type Row = { id: string; codeHash: string; attempts: number; createdAt: Date };

/** 只实现 AuthService 短信路径会用到的 prisma 面；其它访问直接抛错，防止偷偷建号。 */
function fakeAuthPrisma(options: { user: unknown; row?: Row | null; consumedCount?: number }) {
  const calls = { userCreate: 0, audit: 0, smsBump: 0 };
  const prisma = {
    calls,
    user: {
      findUnique: async () => options.user,
      create: async () => {
        calls.userCreate += 1;
        throw new Error('user.create 不应被调用');
      },
    },
    smsVerificationCode: {
      findFirst: async () => options.row ?? null,
      updateMany: async () => ({ count: options.consumedCount ?? 1 }),
      update: async () => {
        calls.smsBump += 1;
        return {};
      },
    },
    auditLog: {
      create: async () => {
        calls.audit += 1;
        return {};
      },
    },
    $transaction: async () => {
      throw new Error('事务不应被调用');
    },
  };
  return prisma;
}

function service(prisma: unknown, jwt: unknown = {}) {
  const config = {
    getOrThrow: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined),
    get: () => undefined,
  };
  return new AuthService(prisma as never, jwt as never, config as never);
}

async function loginError(auth: AuthService, phone: string, code: string) {
  try {
    await auth.smsLogin(phone, code, {} as never, '1.2.3.4');
  } catch (error) {
    return { code: errorCode(error), message: errorMessage(error) };
  }
  throw new Error('smsLogin 本应失败');
}

const activeUser = { id: 'user-1', phone: '13800138000', status: 'active' };

describe('sms-login does not enumerate phones', () => {
  it('returns the same code and message for unknown phone, no live code, and wrong code', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';

    const unknown = await loginError(
      service(fakeAuthPrisma({ user: null })),
      '13800138000',
      '654321',
    );

    const noLiveCode = await loginError(
      service(fakeAuthPrisma({ user: activeUser, row: null })),
      '13800138000',
      '654321',
    );

    const wrongCode = await loginError(
      service(fakeAuthPrisma({
        user: activeUser,
        row: {
          id: 'code-1',
          codeHash: hashSmsCode(SECRET, '13800138000', 'login', '111111'),
          attempts: 0,
          createdAt: new Date(),
        },
      })),
      '13800138000',
      '654321',
    );

    assert.deepEqual(unknown, { code: 'SMS_INVALID', message: '手机号或验证码错误' });
    assert.deepEqual(noLiveCode, unknown);
    assert.deepEqual(wrongCode, unknown);
  });

  it('returns the same response for a disabled account', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const disabled = await loginError(
      service(fakeAuthPrisma({ user: { ...activeUser, status: 'disabled' }, row: null })),
      '13800138000',
      '654321',
    );
    assert.deepEqual(disabled, { code: 'SMS_INVALID', message: '手机号或验证码错误' });
  });
});

describe('stable error codes reach the HTTP body', () => {
  function runFilter(error: unknown) {
    const filter = new ApplicationExceptionFilter({ event() {}, requestId: () => 'req-1' } as never);
    let status = 0;
    let body: Record<string, unknown> = {};
    const res = {
      headersSent: false,
      status(value: number) {
        status = value;
        return this;
      },
      json(value: Record<string, unknown>) {
        body = value;
        return this;
      },
      end() {},
    };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    filter.catch(error, host as never);
    return { status, body };
  }

  it('keeps the machine-readable code and the Chinese message', () => {
    for (const [code, message] of [
      ['SMS_RATE_LIMITED', '验证码发送过于频繁，请稍后再试'],
      ['SMS_INVALID', '手机号或验证码错误'],
      ['SMS_CODE_EXPIRED', '验证码不存在或已过期'],
      ['SMS_UNAVAILABLE', '短信服务暂不可用'],
      ['CLIENT_TOO_OLD', '当前客户端版本过旧，请升级到最新版本后重试'],
    ] as const) {
      const { status, body } = runFilter(smsError(code, message));
      assert.equal(status, 400);
      assert.equal(body.code, code);
      assert.equal(body.message, message);
      assert.equal(body.statusCode, 400);
      assert.equal(body.requestId, 'req-1');
    }
  });

  it('turns a real provider failure into the SMS_UNAVAILABLE HTTP body', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'tencent';
    const store = memoryStore();
    const sms = new SmsCodes(store, SECRET, async () => {
      throw new Error('sms vendor 500');
    });
    let thrown: unknown;
    try {
      await sms.send('13800138000', 'register', '1.2.3.4');
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, 'provider 失败必须抛错，不能静默成功');
    const { status, body } = runFilter(thrown);
    assert.equal(status, 400);
    assert.equal(body.code, 'SMS_UNAVAILABLE');
    assert.equal(body.message, '验证码发送失败，请稍后重试');
    assert.equal(body.statusCode, 400);
    assert.equal(body.requestId, 'req-1');
    assert.equal(store.rows.length, 0);
  });
});

describe('client-register requires SMS verification', () => {
  const base = {
    name: '张三',
    phone: '13800138000',
    password: 'secret123',
    enterpriseName: '猛犸测试',
    slug: 'mammoth-test',
  };

  function untouchedPrisma() {
    const touched: string[] = [];
    const prisma = new Proxy({}, {
      get(_target, property) {
        touched.push(String(property));
        throw new Error(`prisma.${String(property)} 不应被访问`);
      },
    });
    return { prisma, touched };
  }

  it('rejects a legacy client without smsCode and never touches the database', async () => {
    process.env.NODE_ENV = 'development';
    const { prisma, touched } = untouchedPrisma();
    await assert.rejects(
      () => service(prisma).clientRegister(base, '1.2.3.4'),
      (error: unknown) => {
        assert.equal(errorCode(error), 'CLIENT_TOO_OLD');
        assert.match(errorMessage(error) ?? '', /升级/);
        return true;
      },
    );
    assert.deepEqual(touched, []);
  });

  it('treats a blank smsCode as missing and still refuses to register', async () => {
    process.env.NODE_ENV = 'development';
    const { prisma, touched } = untouchedPrisma();
    await assert.rejects(
      () => service(prisma).clientRegister({ ...base, smsCode: '   ' }, '1.2.3.4'),
      (error: unknown) => errorCode(error) === 'CLIENT_TOO_OLD',
    );
    assert.deepEqual(touched, []);
  });

  it('rejects a malformed code with SMS_INVALID and creates no account', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const prisma = fakeAuthPrisma({ user: null, row: null });
    await assert.rejects(
      () => service(prisma).clientRegister({ ...base, smsCode: '123' }, '1.2.3.4'),
      (error: unknown) => {
        assert.equal(errorCode(error), 'SMS_INVALID');
        assert.match(errorMessage(error) ?? '', /6位/);
        return true;
      },
    );
    assert.equal(prisma.calls.userCreate, 0);
    assert.equal(prisma.calls.audit, 0);
  });

  it('rejects a valid-shaped but nonexistent code and creates no account', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const prisma = fakeAuthPrisma({ user: null, row: null });
    await assert.rejects(
      () => service(prisma).clientRegister({ ...base, smsCode: '123456' }, '1.2.3.4'),
      (error: unknown) => {
        assert.equal(errorCode(error), 'SMS_CODE_EXPIRED');
        return true;
      },
    );
    assert.equal(prisma.calls.userCreate, 0);
  });

  function fakeRegisterPrisma(code: string) {
    const calls = { userCreate: 0, tenantCreate: 0, audit: 0, smsConsume: 0 };
    const auditRows: Array<Record<string, unknown>> = [];
    const consumeArgs: Array<Record<string, unknown>> = [];
    type CreateArgs = { data: Record<string, unknown> };
    const tx = {
      tenant: {
        create: async ({ data }: CreateArgs) => {
          calls.tenantCreate += 1;
          return { id: 'tenant-1', status: 'active', ...data };
        },
      },
      orgTree: { create: async () => ({}) },
      user: {
        create: async ({ data }: CreateArgs) => {
          calls.userCreate += 1;
          return { id: 'user-1', email: null, avatarPath: null, welcomeSeenAt: null, isPlatformAdmin: false, ...data };
        },
      },
      orgMember: { create: async () => ({}) },
      role: { findUnique: async () => ({ id: 'role-1' }) },
      userRole: { create: async () => ({}) },
      quota: { create: async () => ({}) },
      tenantAiWallet: {
        create: async () => ({ id: 'wallet-1' }),
        update: async () => ({ balanceCoins: 50000 }),
      },
      platformBillingConfig: { findUnique: async () => null },
      tenantAiLedger: { findUnique: async () => null, create: async () => ({}) },
      smsVerificationCode: {
        updateMany: async (args: Record<string, unknown>) => {
          calls.smsConsume += 1;
          consumeArgs.push(args);
          return { count: 1 };
        },
      },
    };
    const prisma = {
      calls,
      auditRows,
      consumeArgs,
      user: { findUnique: async () => null },
      tenant: {
        findUnique: async () => null,
        findFirst: async () => ({ id: 'platform-1' }),
      },
      smsVerificationCode: {
        findFirst: async () => ({
          id: 'code-1',
          codeHash: hashSmsCode(SECRET, '13800138000', 'register', code),
          attempts: 0,
          createdAt: new Date(),
        }),
        update: async () => ({}),
      },
      auditLog: {
        create: async ({ data }: CreateArgs) => {
          calls.audit += 1;
          auditRows.push(data);
          return {};
        },
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    };
    return prisma;
  }

  it('creates the account, consumes the code and audits client_register with a valid code', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SMS_PROVIDER = 'mock';
    const prisma = fakeRegisterPrisma('123456');
    const auth = service(prisma, { sign: () => 'signed-token' });
    const session = { user: { id: 'user-1' }, currentTenant: { id: 'tenant-1' }, tenants: [] };
    (auth as unknown as { me: () => Promise<unknown> }).me = async () => session;

    const result = await auth.clientRegister({ ...base, smsCode: '123456' }, '1.2.3.4');

    assert.equal(result.token, 'signed-token');
    assert.deepEqual(result.session, session);
    assert.equal(prisma.calls.userCreate, 1);
    assert.equal(prisma.calls.tenantCreate, 1);
    assert.equal(prisma.calls.smsConsume, 1);
    assert.equal(prisma.calls.audit, 1);

    const consume = prisma.consumeArgs[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    assert.deepEqual(consume.where, { id: 'code-1', consumedAt: null });
    assert.ok(consume.data.consumedAt instanceof Date);

    assert.deepEqual(prisma.auditRows[0], {
      userId: 'user-1',
      tenantId: 'tenant-1',
      action: 'client_register',
      ip: '1.2.3.4',
    });
  });
});
