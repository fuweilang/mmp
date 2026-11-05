/** Shared stdout + rotating file HTTP diagnostics for local DEV and Mammoth production. */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAX_BYTES = 5 * 1024 * 1024
const ENV_DISABLE = 'MMP_HTTP_LOG'

function enabled(): boolean {
  const raw = process.env[ENV_DISABLE]
  if (raw === '0' || raw === 'false') return false
  // Default on: terminal + file. Set MMP_HTTP_LOG=0 to silence.
  return true
}

function logDir(): string {
  const home = (process.env.MMP_HOME ?? '').trim() || join(homedir(), '.mmp')
  return join(home, 'logs')
}

function logPath(): string {
  return join(logDir(), 'http.log')
}

function rotateIfNeeded(path: string): void {
  try {
    if (statSync(path).size < MAX_BYTES) return
    renameSync(path, `${path}.1`)
  } catch {
    // Missing file or rename race — append will recreate.
  }
}

/**
 * Emit one HTTP diagnostic line to stdout and `$MMP_HOME/logs/http.log` (size-capped).
 * @param line - already-formatted message without trailing newline.
 */
export function httpLog(line: string): void {
  if (!enabled()) return
  const stamp = new Date().toISOString()
  const text = `[http] ${stamp} ${line}`
  console.error(text)
  try {
    const dir = logDir()
    mkdirSync(dir, { recursive: true })
    const path = logPath()
    rotateIfNeeded(path)
    appendFileSync(path, `${text}\n`, 'utf8')
  } catch (error) {
    console.error('[http] file log failed', error instanceof Error ? error.message : error)
  }
}

/** Absolute path of the durable HTTP log file (for operator docs). */
export function httpLogFilePath(): string {
  return logPath()
}

/**
 * fetch() wrapper that logs method, URL, status/error, and duration.
 * Does not log bodies or Authorization headers.
 */
export async function loggedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const url = String(input instanceof Request ? input.url : input)
  const started = Date.now()
  try {
    const response = await fetch(input, init)
    httpLog(`${method} ${url} -> ${String(response.status)} (${String(Date.now() - started)}ms)`)
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    httpLog(`${method} ${url} -> ERROR ${message} (${String(Date.now() - started)}ms)`)
    throw error
  }
}
