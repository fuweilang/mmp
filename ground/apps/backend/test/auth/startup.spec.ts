import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { assertSmsConfig } from '../../src/auth/sms';
import { runStartupChecks } from '../../src/startup-check';

const BACKEND_ROOT = join(__dirname, '..', '..');
const savedProvider = process.env.SMS_PROVIDER;
const savedNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (savedProvider === undefined) delete process.env.SMS_PROVIDER;
  else process.env.SMS_PROVIDER = savedProvider;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

describe('startup SMS assertion', () => {
  it('runStartupChecks throws in production without a real provider', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_PROVIDER;
    assert.throws(() => runStartupChecks(), /SMS_PROVIDER=tencent/);
  });

  it('runStartupChecks is a no-op outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SMS_PROVIDER;
    assert.doesNotThrow(() => runStartupChecks());
  });

  it('main.ts calls runStartupChecks before NestFactory.create', async () => {
    const source = await readFile(join(BACKEND_ROOT, 'src', 'main.ts'), 'utf8');
    // 去掉行注释，避免「注释掉调用」也骗过静态顺序检查。
    const code = source
      .split('\n')
      .map(line => line.replace(/\/\/.*$/, ''))
      .join('\n');
    const checkAt = code.indexOf('runStartupChecks()');
    const createAt = code.indexOf('NestFactory.create');
    assert.ok(checkAt >= 0, 'main.ts 必须调用 runStartupChecks()');
    assert.ok(createAt >= 0, 'main.ts 必须创建 Nest 应用');
    assert.ok(checkAt < createAt, 'runStartupChecks() 必须先于 NestFactory.create');
  });

  it('the real entrypoint exits non-zero instead of booting with mock SMS in production', async () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
    };
    delete env.SMS_PROVIDER;
    delete env.TENCENT_SMS_SECRET_ID;
    delete env.TENCENT_SMS_SECRET_KEY;
    delete env.TENCENT_SMS_SDK_APP_ID;
    delete env.TENCENT_SMS_TEMPLATE_ID;

    const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: BACKEND_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
    const code = await new Promise<number | null>((resolve) => {
      child.once('exit', (exitCode) => resolve(exitCode));
    });
    clearTimeout(timeout);

    const output = `${stdout}\n${stderr}`;
    assert.equal(code, 1, `期望进程 fail-closed 退出，实际 code=${code}；输出：${output.slice(0, 500)}`);
    assert.match(output, /SMS_PROVIDER=tencent/);
    assert.doesNotMatch(output, /Local:\s+http:\/\/localhost/);
  });

  it('assertSmsConfig still rejects mock in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'mock';
    assert.throws(() => assertSmsConfig(), /SMS_PROVIDER=tencent/);
  });
});
