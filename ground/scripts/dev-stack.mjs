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

/** Run a command to completion, resolving to { ok, output }. Never throws. */
function execCapture(command, args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, output: 'timeout' });
    }, timeoutMs);
    child.stdout.on('data', (c) => (output += c.toString()));
    child.stderr.on('data', (c) => (output += c.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, output: 'spawn failed' });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim() });
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

async function waitForPort(host, port, label, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(host, port)) {
      console.log(`[boot] ${label} ready (${host}:${port})`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
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


async function ensureDatabase() {
  const { host, port } = databaseEndpoint();
  if (await probe(host, port)) {
    console.log(`[boot] database ready (${host}:${port})`);
    return true;
  }

  console.log(`[boot] database not listening on ${host}:${port}`);
  const docker = await execCapture('docker', [
    'info',
    '--format',
    '{{.ServerVersion}}',
  ]);
  if (!docker.ok) {
    console.error(
      [
        '[boot] 数据库没起来，api 会直接崩（Prisma P1001: Can\'t reach database server）。',
        '[boot] Docker 也没在跑，先启动它：',
        '[boot]   colima start        # 或打开 Docker Desktop',
        '[boot]   pnpm db:up          # 起 mammoth-postgres (:5433)',
        '[boot] 然后重新 pnpm run dev。',
      ].join('\n'),
    );
    return false;
  }

  console.log('[boot] starting postgres (docker compose up -d)...');
  const up = await execCapture(
    'docker',
    ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d'],
    180_000,
  );
  if (!up.ok) {
    console.error(`[boot] docker compose up failed: ${up.output}`);
    console.error('[boot] 手动执行：pnpm db:up');
    return false;
  }
  if (await waitForPort(host, port, 'database', 90_000)) return true;
  console.error(`[boot] postgres 已启动但 ${host}:${port} 仍不可连，检查容器日志：`);
  console.error('[boot]   docker logs mammoth-postgres');
  return false;
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

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  console.log('[boot] 0/3 checking database...');
  if (!(await ensureDatabase())) {
    process.exit(1);
  }

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

main().catch((err) => {
  console.error('[boot]', err.message || err);
  shutdown();
  process.exit(1);
});
