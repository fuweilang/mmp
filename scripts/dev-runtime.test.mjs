import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { assertWebPortAvailable, startDevelopment } from './dev-runtime.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mmp-dev-runtime-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const events = [];
  const children = [];
  let building = false;
  const build = async () => {
    assert.equal(building, false, 'artifact builds must never overlap');
    building = true;
    events.push('build');
    return { pid: process.pid, exited: delay(30).then(() => { building = false; return 0; }) };
  };
  const launch = async mode => {
    assert.equal(building, false, 'application starts after preparation');
    events.push(mode);
    const done = Promise.withResolvers();
    children.push(done);
    return { pid: process.pid, exited: done.promise };
  };
  t.after(async () => {
    for (const child of children) child.resolve(0);
    await delay(10);
  });
  const start = (mode, overrides = {}) => startDevelopment({ root, mode, build, launch, log() {}, ...overrides });
  return { root, events, children, start };
}

test('agent then desktop share preparation while the agent watcher is alive', async t => {
  const f = await fixture(t);
  const agent = await f.start('agent');
  const desktop = await f.start('desktop');
  assert.deepEqual(f.events, ['build', 'agent', 'desktop']);
  f.children.forEach(child => child.resolve(0));
  assert.equal(await agent.exited, 0);
  assert.equal(await desktop.exited, 0);
});

test('simultaneous agent and desktop starts cannot overlap their artifact builds', async t => {
  const f = await fixture(t);
  const running = await Promise.all([f.start('agent'), f.start('desktop')]);
  assert.equal(f.events.filter(event => event === 'agent').length, 1);
  assert.equal(f.events.filter(event => event === 'desktop').length, 1);
  f.children.forEach(child => child.resolve(0));
  await Promise.all(running.map(child => child.exited));
});

test('desktop then agent can prepare again before starting the sole watcher', async t => {
  const f = await fixture(t);
  const desktop = await f.start('desktop');
  const agent = await f.start('agent');
  assert.deepEqual(f.events, ['build', 'desktop', 'build', 'agent']);
  const duplicate = await f.start('agent');
  assert.equal(await duplicate.exited, 0);
  assert.deepEqual(f.events, ['build', 'desktop', 'build', 'agent']);
  f.children.forEach(child => child.resolve(0));
  await Promise.all([desktop.exited, agent.exited]);
});

test('agent exit releases ownership so the next launch prepares fresh artifacts', async t => {
  const f = await fixture(t);
  const first = await f.start('agent');
  f.children[0].resolve(1);
  assert.equal(await first.exited, 1);
  const next = await f.start('agent');
  assert.deepEqual(f.events, ['build', 'agent', 'build', 'agent']);
  f.children[1].resolve(0);
  await next.exited;
});

test('failed preparation launches nothing and does not block the next attempt', async t => {
  const f = await fixture(t);
  await assert.rejects(f.start('agent', { build: async () => { throw new Error('build failed'); } }), /build failed/);
  assert.deepEqual(f.events, []);
  const next = await f.start('agent');
  f.children[0].resolve(0);
  await next.exited;
});

test('dead startup and watcher owners are recovered', async t => {
  const f = await fixture(t);
  const state = join(f.root, '.mmp-dev');
  await mkdir(join(state, 'startup.lock'), { recursive: true });
  await writeFile(join(state, 'startup.lock', 'owner.json'), JSON.stringify({ pid: 2147483647 }));
  await writeFile(join(state, 'agent.json'), JSON.stringify({ pid: 2147483647 }));
  const agent = await f.start('agent');
  assert.deepEqual(f.events, ['build', 'agent']);
  assert.equal(JSON.parse(await readFile(join(state, 'agent.json'), 'utf8')).pid, process.pid);
  f.children[0].resolve(0);
  await agent.exited;
});


test('an occupied Web port is reported before preparing any artifacts', async t => {
  const f = await fixture(t);
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(f.start('agent', {
    preflight: () => assertWebPortAvailable(port),
  }), /已被其他服务占用/);
  assert.deepEqual(f.events, []);
  await new Promise(resolve => server.close(resolve));
  await assertWebPortAvailable(port);
});

test('failed application launch releases the startup lock for retry', async t => {
  const f = await fixture(t);
  await assert.rejects(f.start('agent', {
    launch: async () => { throw new Error('launch failed'); },
  }), /launch failed/);
  const next = await f.start('agent');
  assert.deepEqual(f.events, ['build', 'build', 'agent']);
  f.children[0].resolve(0);
  await next.exited;
});

test('waiting startup can be cancelled without stealing the active build lock', async t => {
  const f = await fixture(t);
  const entered = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const first = f.start('desktop', { build: async () => { entered.resolve(); return { pid: process.pid, exited: finish.promise.then(() => 0) }; } });
  await entered.promise;
  const controller = new AbortController();
  const waiting = f.start('agent', { signal: controller.signal });
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  finish.resolve();
  const desktop = await first;
  assert.deepEqual(f.events, ['desktop']);
  f.children[0].resolve(0);
  await desktop.exited;
});


test('independent terminal processes serialize startup after a crashed owner', async t => {
  const f = await fixture(t);
  const state = join(f.root, '.mmp-dev');
  await mkdir(join(state, 'startup.lock'), { recursive: true });
  await writeFile(join(state, 'startup.lock', 'owner.json'), JSON.stringify({ pid: 2147483647, token: 'crashed' }));
  const moduleUrl = new URL('./dev-runtime.mjs', import.meta.url).href;
  const source = `
    import { startDevelopment } from ${JSON.stringify(moduleUrl)};
    import { open, unlink } from 'node:fs/promises';
    import { setTimeout as delay } from 'node:timers/promises';
    const root = process.argv[1];
    const running = await startDevelopment({ root, mode: process.argv[2], log() {},
      build: async () => {
        const guard = root + '/building';
        const file = await open(guard, 'wx');
        return { pid: process.pid, exited: delay(100).then(async () => {
          await file.close(); await unlink(guard); return 0;
        }) };
      },
      launch: async () => ({ pid: process.pid, exited: delay(150).then(() => 0) }),
    });
    process.exitCode = await running.exited;
  `;
  const run = mode => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, f.root, mode]);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  await Promise.all([run('agent'), run('desktop')]);
});


test('shutdown retains watcher ownership until its process group finishes cleanup', { timeout: 10_000 }, async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'scripts'));
  await mkdir(join(f.root, 'mammoth-agent/scripts'), { recursive: true });
  await symlink(new URL('../mammoth-agent/node_modules', import.meta.url), join(f.root, 'mammoth-agent/node_modules'));
  await writeFile(join(f.root, 'mammoth-agent/scripts/build.ts'), 'process.exit(0);');
  await copyFile(new URL('./dev-runtime.mjs', import.meta.url), join(f.root, 'scripts/dev-runtime.mjs'));
  const worker = `
    const fs = require('node:fs');
    fs.writeFileSync('worker.pid', String(process.pid));
    process.on('SIGTERM', () => setTimeout(() => {
      fs.writeFileSync('cleaned', 'yes'); process.exit(0);
    }, 250));
    console.log('READY');
    setInterval(() => {}, 1000);
  `;
  const fakeSupervisor = `
    import {spawn} from 'node:child_process';
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], {stdio:'inherit'});
    process.on('SIGTERM', () => process.exit(143));
    child.on('exit', code => process.exit(code ?? 1));
  `;
  await writeFile(join(f.root, 'mammoth-agent/scripts/dev-web.ts'), fakeSupervisor);
  const launcher = spawn(process.execPath, [join(f.root, 'scripts/dev-runtime.mjs'), 'agent', '--no-serve'], {
    cwd: f.root, env: process.env,
  });
  t.after(async () => {
    launcher.kill('SIGKILL');
    const pid = await readFile(join(f.root, 'mammoth-agent/worker.pid'), 'utf8').catch(() => undefined);
    if (pid) { try { process.kill(Number(pid), 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  });
  let stderr = '';
  launcher.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => launcher.once('exit', resolve));
  await new Promise((resolve, reject) => {
    let output = '';
    launcher.stdout.on('data', chunk => { output += chunk; if (output.includes('READY')) resolve(); });
    launcher.once('error', reject);
    launcher.once('exit', code => reject(new Error('launcher exited before ready: ' + code + ' ' + output + ' ' + stderr)));
  });
  launcher.kill('SIGTERM');
  await exited;
  assert.equal(await readFile(join(f.root, 'mammoth-agent/cleaned'), 'utf8').catch(() => ''), 'yes');
  assert.equal(await readFile(join(f.root, '.mmp-dev/agent.json'), 'utf8').catch(() => ''), '');
});

async function survivingWriter(t) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32', stdio: 'ignore',
  });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
    await exited;
  });
  return { pid: 2147483647, token: 'crashed-parent', writerPid: child.pid, writerGroup: process.platform !== 'win32' };
}

test('a watcher surviving its coordinator prevents a desktop rebuild', async t => {
  const f = await fixture(t);
  const owner = await survivingWriter(t);
  await mkdir(join(f.root, '.mmp-dev'));
  await writeFile(join(f.root, '.mmp-dev/agent.json'), JSON.stringify(owner));
  const desktop = await f.start('desktop');
  assert.deepEqual(f.events, ['desktop']);
  f.children[0].resolve(0);
  await desktop.exited;
});

test('a build surviving its coordinator retains the startup lock', async t => {
  const f = await fixture(t);
  const owner = await survivingWriter(t);
  await mkdir(join(f.root, '.mmp-dev/startup.lock'), { recursive: true });
  await writeFile(join(f.root, '.mmp-dev/startup.lock/owner.json'), JSON.stringify(owner));
  await assert.rejects(f.start('desktop', { signal: AbortSignal.timeout(50) }), { name: 'AbortError' });
  assert.deepEqual(f.events, []);
});
