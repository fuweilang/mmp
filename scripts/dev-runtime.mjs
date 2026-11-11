/** Coordinate the root Web watcher and Desktop launch against one artifact tree. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function ownerIsAlive(owner) {
  if (isAlive(owner.pid) || isAlive(owner.writerPid)) return true;
  if (owner.writerGroup && Number.isInteger(owner.writerPid) && owner.writerPid > 0) {
    try { process.kill(-owner.writerPid, 0); return true; }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  return false;
}

async function readOwner(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function publishOwner(path, owner) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(owner), { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function releaseOwner(path, token, directory = false) {
  const owner = await readOwner(directory ? join(path, 'owner.json') : path);
  if (owner?.token === token) await rm(path, { recursive: directory, force: true });
}

async function acquireStartup(state, signal, log) {
  await mkdir(state, { recursive: true });
  const path = join(state, 'startup.lock');
  const token = randomUUID();
  let reported = false;
  for (;;) {
    signal?.throwIfAborted();
    try {
      await mkdir(path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readOwner(join(path, 'owner.json'));
      if (owner && !ownerIsAlive(owner)) {
        // Keep a nonempty tombstone: a delayed second reclaimer cannot rename
        // a new owner's lock over it. Recursive deletion here could steal a new lock.
        const retired = join(state, `retired-${owner.pid}-${owner.token ?? 'legacy'}`);
        try { await rename(path, retired); }
        catch (error) {
          if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
        }
      } else if (!owner) {
        // Allow a creator to write its owner record before treating it as abandoned.
        const info = await stat(path).catch(error => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        if (info && Date.now() - info.mtimeMs > 30_000) throw new Error(`[mmp] 启动锁缺少进程记录，请确认没有构建进程后删除 ${path} 再重试。`);
      }
      if (!reported) { log('[mmp] 等待另一个启动命令完成共享构建……'); reported = true; }
      await delay(100, undefined, { signal });
      continue;
    }
    try { await publishOwner(join(path, 'owner.json'), { pid: process.pid, token }); }
    catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
    return {
      release: () => releaseOwner(path, token, true),
      track: child => publishOwner(join(path, 'owner.json'), {
        pid: process.pid, token, writerPid: child.pid, writerGroup: child.processGroup === true,
      }),
    };
  }
}

/** Fail before building if the requested Web listener is already occupied. */
export async function assertWebPortAvailable(port = 3080, host = '127.0.0.1') {
  await new Promise((resolvePort, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(new Error(`[mmp] 无法检查 ${host}:${port} 的占用情况`));
    });
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error(`[mmp] ${host}:${port} 已被其他服务占用。请先停止旧服务后重试；macOS 可用 lsof -nP -iTCP:${port} -sTCP:LISTEN 查找进程。`));
    });
    socket.once('error', error => {
      if (error.code === 'ECONNREFUSED') resolvePort();
      else reject(error);
    });
  });
}

/**
 * Serialize preparation and retain the watcher owner until its child has stopped.
 * A full preparation includes Desktop, so Desktop never builds beside the Web watchers.
 */
export async function startDevelopment({ root, mode, build, launch, preflight = async () => {}, log = console.log, signal }) {
  if (!['agent', 'desktop'].includes(mode)) throw new Error('Expected agent or desktop');
  const state = join(root, '.mmp-dev');
  const agentPath = join(state, 'agent.json');
  const startup = await acquireStartup(state, signal, log);
  const token = randomUUID();
  try {
    const owner = await readOwner(agentPath);
    const watching = owner !== undefined && ownerIsAlive(owner);
    if (watching && mode === 'agent') {
      log(`[mmp] 智能体开发服务已在运行（启动进程 ${owner.pid}）；复用现有服务，无需重复启动。`);
      return { exited: Promise.resolve(0) };
    }
    signal?.throwIfAborted();
    await preflight(mode);
    if (!watching) {
      log('[mmp] 正在准备网页与桌面共用的构建产物……');
      const preparation = await build();
      await startup.track(preparation);
      const code = await preparation.exited;
      if (code !== 0) throw new Error(`[mmp] 共享构建失败（退出码 ${code}）`);
    } else {
      log('[mmp] 复用智能体开发服务已准备的构建产物，启动桌面。');
    }
    signal?.throwIfAborted();
    const child = await launch(mode);
    if (mode === 'agent') {
      await publishOwner(agentPath, { pid: process.pid, token, writerPid: child.pid, writerGroup: child.processGroup === true });
      return { exited: child.exited.finally(() => releaseOwner(agentPath, token)) };
    }
    return child;
  } finally {
    await startup.release();
  }
}

/** Wait for a signalled launcher's remaining descendants before releasing ownership. */
async function drainProcessGroup(pid) {
  if (process.platform === 'win32') return;
  const deadline = Date.now() + 5000;
  for (;;) {
    try { process.kill(-pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return; throw error; }
    if (Date.now() >= deadline) {
      try { process.kill(-pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      return;
    }
    await delay(50);
  }
}

async function main() {
  const mode = process.argv[2];
  const args = process.argv.slice(3).filter(arg => arg !== '--');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const agentRoot = join(root, 'mammoth-agent');
  const controller = new AbortController();
  const children = new Set();
  let stopped;
  const signalChildren = signal => {
    for (const child of children) {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const shutdown = signal => {
    if (stopped) return;
    stopped = signal;
    controller.abort(new Error('Development startup interrupted'));
    signalChildren(signal);
  };
  const onInt = () => shutdown('SIGINT');
  const onTerm = () => shutdown('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  const launchCommand = async commandArgs => {
    controller.signal.throwIfAborted();
    const child = spawn(process.execPath, ['--import', 'tsx/esm', ...commandArgs], {
      cwd: agentRoot, stdio: 'inherit', detached: process.platform !== 'win32',
      // Always prepare both faces, even if the caller previously selected Web-only builds.
      env: { ...process.env, MMP_BUILD_TARGET: 'all' },
    });
    children.add(child);
    const exited = new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolveExit(code ?? (signal === 'SIGINT' ? 130 : 1)));
    }).then(async code => {
      if (stopped) await drainProcessGroup(child.pid);
      return code;
    }).finally(() => children.delete(child));
    // Observe early failures even if the caller is still recording ownership.
    void exited.catch(() => {});
    await new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); });
    return { exited, pid: child.pid, processGroup: process.platform !== 'win32' };
  };
  try {
    const running = await startDevelopment({
      root, mode, signal: controller.signal,
      preflight: async selected => {
        if (selected !== 'agent' || args.includes('--no-serve')) return;
        const value = name => {
          const inline = args.find(arg => arg.startsWith(`${name}=`));
          const index = args.indexOf(name);
          return inline ? inline.slice(name.length + 1) : index < 0 ? undefined : args[index + 1];
        };
        const port = Number(value('--port') ?? 3080);
        if (port > 0) await assertWebPortAvailable(port, value('--host') ?? '127.0.0.1');
      },
      build: () => launchCommand(['scripts/build.ts', '--scope', 'artifacts']),
      launch: selected => launchCommand(selected === 'agent'
        ? ['scripts/dev-web.ts', '--poll', '--skip-build', ...args]
        : ['apps/desktop/scripts/dev.ts', '--skip-build', ...args]),
    });
    process.exitCode = await running.exited;
  } catch (error) {
    if (!stopped) console.error(error.message);
    process.exitCode = stopped === 'SIGINT' ? 130 : stopped ? 143 : 1;
  } finally {
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
