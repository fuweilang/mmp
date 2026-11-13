/** Launch the local multi-browser Web router; every identity Host still starts through the supported mmp profile. */
import { spawn } from 'node:child_process'
import { mkdir, chown } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { groundWebPartition, startGroundWebRouter, type IdentityWebWorker, type GroundWebIdentity } from './ground-web-router.ts'

const ROOT = resolve(import.meta.dirname, '..')

function positiveEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error(`${name} must be a positive integer`)
  return value
}

async function startIdentityHost(identity: GroundWebIdentity, publicOrigin: string, signal: AbortSignal, options: {
  groundOrigin: string; home: string; workerArgs: readonly string[]; startupTimeoutMs: number
}): Promise<IdentityWebWorker> {
  const home = join(options.home, 'web-identities', groundWebPartition(options.groundOrigin, identity))
  signal.throwIfAborted()
  await mkdir(home, { recursive: true })
  signal.throwIfAborted()
  const docker = process.env.MMP_WEB_WORKER_MODE === 'docker'
  const partition = groundWebPartition(options.groundOrigin, identity)
  const container = `mmp-user-${process.pid}-${partition.slice(0, 24)}`
  const built = process.env.MMP_WEB_BUILT_RUNTIME === '1'
  const cli = built ? [join(ROOT, 'apps/cli/lib/bin.js')] : ['--import', import.meta.resolve('tsx/esm'), join(ROOT, 'apps/cli/src/bin.ts')]
  const webArgs = ['web', ...options.workerArgs, '--host', '127.0.0.1', '--port', '0', '--no-open',
    '--public-url', publicOrigin, '--trusted-host', new URL(publicOrigin).host]
  let command = process.execPath, args = [...cli, ...webArgs]
  if (docker) {
    if (options.workerArgs.length) throw new Error('Production workers use the image profile; arbitrary CLI overrides are not allowed')
    const image = process.env.MMP_WEB_WORKER_IMAGE
    const hostRoot = process.env.MMP_WEB_HOST_DATA_ROOT
    if (!image || !hostRoot || !hostRoot.startsWith('/') || hostRoot.includes(',')) throw new Error('Set MMP_WEB_WORKER_IMAGE and an absolute MMP_WEB_HOST_DATA_ROOT')
    await chown(home, 10001, 10001)
    command = 'docker'
    args = ['run', '--rm', '--init', '--name', container, '--network', 'host', '--read-only',
      '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--pids-limit', String(positiveEnvironment('MMP_WEB_WORKER_PIDS', 256)),
      '--memory', `${positiveEnvironment('MMP_WEB_WORKER_MEMORY_MB', 1024)}m`,
      '--cpus', String(positiveEnvironment('MMP_WEB_WORKER_CPUS', 1)),
      '--tmpfs', '/tmp:rw,nosuid,nodev,exec,size=256m',
      '--mount', `type=bind,source=${join(hostRoot, 'web-identities', partition)},target=/home/mmp`,
      '--workdir', '/home/mmp', '-e', 'HOME=/home/mmp', '-e', 'MMP_HOME=/home/mmp', '-e', 'MMP_WEB_SSO=1',
      '-e', 'MMP_WEB_READY_STDOUT=1', '-e', `MMP_WEB_SESSION_ORIGIN=${publicOrigin}`,
      '-e', `GROUND_PUBLIC_ORIGIN=${options.groundOrigin}`, image, 'node', '/app/apps/cli/lib/bin.js', ...webArgs]
  }
  const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, MMP_HOME: home,
    MMP_WEB_SSO: '1', MMP_WEB_SESSION_ORIGIN: publicOrigin, GROUND_PUBLIC_ORIGIN: options.groundOrigin },
    stdio: docker ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'ipc'] })
  const exited = new Promise<void>(resolveExit => { child.once('exit', () => resolveExit()); child.once('error', () => resolveExit()) })
  let stopping: Promise<void> | undefined
  const close = (): Promise<void> => stopping ??= (async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    if (docker) {
      const stop = spawn('docker', ['stop', '--time', '5', container], { stdio: 'ignore' })
      await new Promise<void>(done => { stop.once('exit', () => done()); stop.once('error', () => done()) })
    }
    child.kill('SIGTERM')
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([exited, new Promise<void>(done => { timer = setTimeout(done, 3000) })])
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited }
  })()
  const abort = (): void => { void close() }
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  void exited.then(() => { signal.removeEventListener('abort', abort) })
  const output = createInterface({ input: child.stdout! })
  const errors = createInterface({ input: child.stderr! })
  let stderrTail = ''
  errors.on('line', line => { stderrTail = `${stderrTail}\n${line}`.slice(-4000); console.error(line) })
  try {
    return await new Promise<IdentityWebWorker>((ready, fail) => {
      const timer = setTimeout(() => fail(new Error('Web identity Host startup timed out')), options.startupTimeoutMs)
      const finish = (error?: Error): void => { clearTimeout(timer); if (error) fail(error) }
      child.once('error', error => finish(error))
      void exited.then(() => finish(new Error(`Web identity Host exited before readiness: ${stderrTail}`)))
      const onReady = (message: unknown): void => {
        if (typeof message !== 'object' || message === null || !('type' in message)
          || message.type !== 'mmp-web-ready' || !('origin' in message) || typeof message.origin !== 'string') return
        try {
          const privateUrl = new URL(message.origin)
          if (privateUrl.protocol !== 'http:' || privateUrl.hostname !== '127.0.0.1' || !privateUrl.port
            || privateUrl.username || privateUrl.password || privateUrl.pathname !== '/' || privateUrl.search || privateUrl.hash) {
            throw new Error('Invalid Web identity Host listener')
          }
          clearTimeout(timer)
          ready({ origin: privateUrl.origin, exited, close })
        } catch { finish(new Error('Invalid Web identity Host readiness message')) }
      }
      child.on('message', onReady)
      output.on('line', line => {
        if (line.startsWith('mmp-worker-ready: ')) {
          try { onReady(JSON.parse(line.slice('mmp-worker-ready: '.length))) }
          catch { finish(new Error('Invalid worker readiness output')) }
        } else if (!line.startsWith('mmp web: ')) console.log(line)
      })
    })
  } catch (error) { await close(); throw error }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2), workerArgs: string[] = []
  if (process.env.MMP_WEB_SSO === '0'
    || args.includes('--help') || args.includes('-h') || args.includes('--version')) {
    const profile = spawn(process.execPath, ['--import', import.meta.resolve('tsx/esm'), join(ROOT, 'apps/cli/src/bin.ts'), 'web', ...args],
      { cwd: ROOT, env: process.env, stdio: 'inherit' })
    const forward = (signal: NodeJS.Signals): void => { profile.kill(signal) }
    process.on('SIGTERM', forward)
    process.on('SIGINT', forward)
    try {
      process.exitCode = await new Promise<number>((done, fail) => { profile.once('error', fail); profile.once('exit', code => done(code ?? 1)) })
    } finally { process.removeListener('SIGTERM', forward); process.removeListener('SIGINT', forward) }
    return
  }
  let host = '127.0.0.1', port = 3080
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '--host') host = args[++index] ?? ''
    else if (arg === '--port') port = Number(args[++index])
    else if (arg.startsWith('--port=')) port = Number(arg.slice(7))
    else if (arg.startsWith('--host=')) host = arg.slice(7)
    else if (arg === '--no-open') { /* Router always leaves opening the local entry to the user. */ }
    else if (arg === '--public-url' || arg.startsWith('--public-url=')) throw new Error('Local Web SSO uses the loopback listener URL; public deployment needs a separate gateway.')
    else workerArgs.push(arg)
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be between 0 and 65535')
  const groundOrigin = new URL(process.env.GROUND_PUBLIC_ORIGIN || process.env.MMP_PLATFORM_ORIGIN || 'http://127.0.0.1:5201').origin
  const publicOrigin = process.env.MMP_WEB_PUBLIC_ORIGIN
  if (publicOrigin && process.env.MMP_WEB_WORKER_MODE !== 'docker') throw new Error('Production Web requires isolated Docker workers')
  const router = await startGroundWebRouter({ host, port, groundOrigin,
    ...(publicOrigin ? { publicOrigin } : {}),
    cookieName: process.env.MMP_GROUND_COOKIE_NAME || 'mammothai_access_token',
    maxWorkers: positiveEnvironment('MMP_WEB_MAX_IDENTITIES', publicOrigin ? 12 : 8),
    idleMs: positiveEnvironment('MMP_WEB_IDENTITY_IDLE_MS', 600_000),
    handoffMs: positiveEnvironment('MMP_WEB_HANDOFF_MS', 15_000),
    queueTimeoutMs: positiveEnvironment('MMP_WEB_QUEUE_TIMEOUT_MS', 120_000),
    requestTimeoutMs: positiveEnvironment('MMP_WEB_AUTH_TIMEOUT_MS', 30000),
    startWorker: (identity, origin, signal) => startIdentityHost(identity, origin, signal, {
      groundOrigin, home: resolve(process.env.MMP_HOME || join(homedir(), '.mmp')), workerArgs,
      startupTimeoutMs: positiveEnvironment('MMP_WEB_HOST_STARTUP_TIMEOUT_MS', 60000),
    }),
  })
  const done = Promise.withResolvers<void>()
  const stop = (): void => { void router.close().then(() => done.resolve(), error => { console.error(error); process.exitCode = 1; done.resolve() }) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  console.log(`mmp web: ${router.origin}/`)
  console.log('Web SSO：各浏览器使用自己的 Ground 登录；用户和企业分别隔离。')
  await done.promise
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
