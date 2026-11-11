import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './dev-banner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
const exited = new Map();

function prefixPipe(name, stream, out) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const line of parts) out.write(`[${name}] ${line}\n`);
  });
  stream.on('end', () => {
    if (buf) out.write(`[${name}] ${buf}\n`);
  });
}

function run(name, command) {
  const child = spawn(command, {
    cwd: root,
    shell: true,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  exited.set(name, null);
  prefixPipe(name, child.stdout, process.stdout);
  prefixPipe(name, child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    exited.set(name, { code, signal });
    if (signal) console.error(`[${name}] killed by ${signal}`);
    else if (code && code !== 0) console.error(`[${name}] exited ${code}`);
  });
  return child;
}

function probe(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Run a command to completion, preserving { ok, code, output }; missing=127, timeout=124. */
export function execCapture(command, args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, code: 124, output: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on('data', (c) => (output += c.toString()));
    child.stderr.on('data', (c) => (output += c.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: error.code === 'ENOENT' ? 127 : 1, output: error.message });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? 1, output: output.trim() });
    });
  });
}

/** DATABASE_URL from the shell, else from apps/backend/.env (Prisma's source). */
function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = fs.readFileSync(path.join(root, 'apps/backend/.env'), 'utf8');
    const line = env
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('DATABASE_URL='));
    if (!line) return null;
    return line
      .slice('DATABASE_URL='.length)
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

function databaseEndpoint() {
  const url = readDatabaseUrl();
  const fallback = { host: '127.0.0.1', port: 5433 };
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || fallback.host,
      port: Number(parsed.port || 5432),
    };
  } catch {
    return fallback;
  }
}

async function waitForPort(host, port, label, timeoutMs, probePort = probe, pollMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probePort(host, port)) {
      console.log(`[boot] ${label} ready (${host}:${port})`);
      return true;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

/**
 * The api dies on boot with Prisma P1001 when Postgres is not listening, and
 * that crash is far less actionable than the two commands that fix it. Probe
 * the endpoint from DATABASE_URL first and start the compose service when
 * Docker is available.
 */

/** Ports owned exclusively by this ground stack. */
const DEV_PORTS = [
  { port: 3100, label: 'api' },
  { port: 5202, label: 'web' },
  { port: 5201, label: 'gateway' },
];

const NEVER_KILL_RE = /opencode|postgres(\.real)?|mammoth-pg|Docker|colima/i;
/** Leftover ground / mammoth console listeners are safe to reclaim. */
const DEV_STACK_RE =
  /dev-stack|dev-gateway|@mammoth\/(frontend|backend)|vite|mammoth-console|dist\/main|pnpm run dev|start:dev|scripts\/dev-/;

function pidsListeningOn(port) {
  try {
    const out = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8' },
    );
    return [...new Set(out.trim().split(/\s+/).filter(Boolean))];
  } catch {
    return [];
  }
}

function processCommand(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function killPid(pid, signal = 'SIGTERM') {
  try {
    process.kill(Number(pid), signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reclaim 3100/5202/5201 from a previous half-dead `pnpm run dev`.
 * Without this, waitPort() connects to the *old* listener, prints "ready",
 * then the new child crashes with EADDRINUSE.
 */
async function ensureDevPortsFree() {
  const victims = [];
  for (const { port, label } of DEV_PORTS) {
    for (const pid of pidsListeningOn(port)) {
      if (String(pid) === String(process.pid)) continue;
      const cmd = processCommand(pid);
      if (!cmd) continue;
      if (NEVER_KILL_RE.test(cmd)) {
        console.error(
          `[boot] :${port} (${label}) 被保护进程占用，无法自动清理：pid=${pid} ${cmd.slice(0, 120)}`,
        );
        process.exit(1);
      }
      // Prefer known ground leftovers; still reclaim plain node listeners on
      // these dedicated ports — they are almost always stale stack pieces.
      if (!DEV_STACK_RE.test(cmd) && !cmd.includes('mmPlatform/ground')) {
        console.log(
          `[boot] :${port} (${label}) 被占用，尝试清理：pid=${pid} ${cmd.slice(0, 100)}`,
        );
      } else {
        console.log(
          `[boot] 清理残留 ${label} :${port} pid=${pid}`,
        );
      }
      victims.push({ pid, port, label, cmd });
      killPid(pid, 'SIGTERM');
    }
  }
  if (!victims.length) return;

  await new Promise((r) => setTimeout(r, 800));
  for (const { pid, port, label } of victims) {
    if (pidsListeningOn(port).includes(String(pid)) || pidsListeningOn(port).includes(pid)) {
      console.log(`[boot] 强制结束残留 ${label} :${port} pid=${pid}`);
      killPid(pid, 'SIGKILL');
    }
  }
  await new Promise((r) => setTimeout(r, 400));

  for (const { port, label } of DEV_PORTS) {
    const left = pidsListeningOn(port);
    if (left.length) {
      const detail = left
        .map((pid) => `${pid} ${processCommand(pid).slice(0, 80)}`)
        .join('; ');
      console.error(`[boot] :${port} (${label}) 仍被占用，无法启动：${detail}`);
      process.exit(1);
    }
  }
  console.log('[boot] 已释放 3100 / 5202 / 5201，继续启动');
}


/** Preserve the failed CLI's exit status rather than reporting a successful boot. */
function bootFailure(message, code = 1) {
  const error = new Error(message);
  error.exitCode = Number.isInteger(code) && code > 0 && code < 256 ? code : 1;
  return error;
}

/** Start only the runtime selected by the existing context; never install or switch contexts. */
async function ensureDocker({ runCommand, dockerTimeoutMs, pollMs, platform, desktopInstalled, env }) {
  const infoArgs = ['info', '--format', '{{.ServerVersion}}'];
  const info = await runCommand('docker', infoArgs, 5_000);
  if (info.ok) return;
  if (info.code === 127) throw bootFailure('未找到 Docker CLI；请先安装 Docker/Colima，本脚本不会自动安装。', 127);
  if (env.DOCKER_HOST) throw bootFailure('DOCKER_HOST 指定的 Docker 不可用；请启动对应服务或修正配置，不会另启本地 runtime。', info.code);
  const context = await runCommand('docker', ['context', 'show'], 5_000);
  if (!context.ok) throw bootFailure(`无法读取 Docker context：${context.output}`, context.code);
  const name = context.output.trim();
  let command, args;
  if (name === 'colima' || name.startsWith('colima-') || name === 'default') {
    const installed = await runCommand('colima', ['version'], 5_000);
    if (installed.ok) {
      command = 'colima';
      args = name.startsWith('colima-') ? ['start', '--profile', name.slice(7)] : ['start'];
    } else if (name !== 'default') {
      throw bootFailure('当前 Docker context 使用 Colima，但 Colima 不可用；请先安装/修正，不会改用另一 runtime。', installed.code);
    }
  }
  if (!command && (name === 'desktop-linux' || name === 'default') && platform === 'darwin' && desktopInstalled) {
    command = 'open'; args = ['-a', 'Docker'];
  }
  if (!command) throw bootFailure(`Docker 未就绪，当前 context「${name}」无可自动启动的已安装本机 runtime；请手动启动对应 Docker。`);
  console.log(`[boot] Docker 未运行，正在启动 ${command === 'colima' ? 'Colima' : 'Docker Desktop'}...`);
  const deadline = Date.now() + dockerTimeoutMs;
  const started = await runCommand(command, args, dockerTimeoutMs);
  if (!started.ok) throw bootFailure(`Docker runtime 启动失败：${started.output}`, started.code);
  while (Date.now() < deadline) {
    const ready = await runCommand('docker', infoArgs, Math.min(5_000, Math.max(1, deadline - Date.now())));
    if (ready.ok) { console.log('[boot] Docker ready'); return; }
    await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  }
  throw bootFailure(`等待 Docker 就绪超时（${dockerTimeoutMs}ms）；保留已有 runtime/数据，请检查后重试。`, 124);
}

/** Optional dependencies are solely a narrow test seam; CLI defaults use real checks and commands. */
export async function ensureDatabase({
  endpoint = databaseEndpoint(), probePort = probe, runCommand = execCapture,
  dockerTimeoutMs = 120_000, databaseTimeoutMs = 90_000, pollMs = 500,
  platform = process.platform, desktopInstalled = fs.existsSync('/Applications/Docker.app'), env = process.env,
} = {}) {
  const { host, port } = endpoint;
  if (await probePort(host, port)) {
    console.log(`[boot] database ready (${host}:${port})`);
    return true; // An already-ready DB needs neither Docker nor a second runtime.
  }
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) || port !== 5433) {
    throw bootFailure(`配置的数据库 ${host}:${port} 不可连接。开发库走 SSH 隧道：ssh -N -L 5434:127.0.0.1:5432 root@124.223.179.250。本机 compose 只提供 :5433，不会拿它代替这条隧道。`);
  }
  await ensureDocker({ runCommand, dockerTimeoutMs, pollMs, platform, desktopInstalled, env });
  console.log('[boot] starting postgres (existing compose service, no recreate)...');
  const up = await runCommand('docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d', '--no-recreate', '--wait', '--wait-timeout', '90', 'postgres'], 180_000);
  if (!up.ok) throw bootFailure(`数据库启动失败：${up.output}；可用 pnpm db:up 检查。`, up.code);
  if (await waitForPort(host, port, 'database', databaseTimeoutMs, probePort, pollMs)) return true;
  throw bootFailure(`Postgres 已请求启动，但 ${host}:${port} 等待超时；请检查 docker logs mammoth-postgres。`, 124);
}

function waitPort(port, label, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const state = exited.get(label);
      if (state) {
        const why = state.signal ? `signal ${state.signal}` : `exit ${state.code}`;
        reject(new Error(`${label} died before opening :${port} (${why})`));
        return;
      }
      const socket = net.connect({ port, host: '127.0.0.1' }, () => {
        socket.end();
        console.log(`[boot] ${label} ready (:${port})`);
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`timeout waiting for ${label} :${port}`));
          return;
        }
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(0), 300).unref();
}


async function main(args = process.argv.slice(2)) {
  console.log('[boot] 0/3 checking database...');
  if (!(await ensureDatabase())) {
    process.exit(1);
  }

  if (args.includes('--prepare-only')) { console.log('[boot] Docker/数据库准备完成；未启动开发服务。'); return; }

  console.log('[boot] reclaiming api/web/gateway ports if stale...');
  await ensureDevPortsFree();

  console.log('[boot] 1/3 starting api...');
  run('api', 'pnpm run dev:api');
  await waitPort(3100, 'api');

  console.log('[boot] 2/3 starting web...');
  run('web', 'pnpm run dev:web');
  await waitPort(5202, 'web');

  console.log('[boot] 3/3 starting gateway...');
  run('gw', 'pnpm run dev:gateway');
  await waitPort(5201, 'gateway');

  console.log('[boot] stack up. Ctrl-C to stop all.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  main().catch((err) => {
    console.error('[boot]', err.message || err);
    shutdown();
    process.exit(err.exitCode ?? 1);
  });
}
