import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./dev-stack.mjs', import.meta.url));
const moduleUrl = new URL('./dev-stack.mjs', import.meta.url).href;
const root = path.dirname(path.dirname(script));

// Run the real boot code with only the external pnpm CLI replaced.
// Tests never install packages or stop the user's development services.
function fixture({ code = 0, missing = false, timeout = false, cli = false, prepareOnly = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmp-dev-deps-'));
  try {
    const state = path.join(dir, 'calls.json');
    fs.writeFileSync(state, '[]');
    if (!missing) fs.writeFileSync(path.join(dir, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs');
const file = process.env.DEV_DEPS_FIXTURE;
const calls = JSON.parse(fs.readFileSync(file, 'utf8'));
calls.push({ args: process.argv.slice(2), cwd: process.cwd() });
fs.writeFileSync(file, JSON.stringify(calls));
console.log(${JSON.stringify(code ? 'ERR_PNPM_OUTDATED_LOCKFILE: fixture manifest mismatch' : 'fixture install complete')});
${timeout ? 'setTimeout(() => {}, 10000);' : `process.exit(${code});`}
`, { mode: 0o700 });
    const source = `import { ensureDependencies } from ${JSON.stringify(moduleUrl)};
try { await ensureDependencies({ timeoutMs: ${timeout ? 200 : 8000} }); }
catch (error) { console.error(error.message); process.exit(error.exitCode ?? 1); }`;
    const result = spawnSync(process.execPath, cli ? [script, ...(prepareOnly ? ['--prepare-only'] : [])] : ['--input-type=module', '-e', source], {
      cwd: os.tmpdir(), encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: dir, DEV_DEPS_FIXTURE: state },
    });
    assert.ifError(result.error);
    return { code: result.status, output: result.stdout + result.stderr, calls: JSON.parse(fs.readFileSync(state, 'utf8')) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('startup synchronizes the workspace against its lockfile even when node_modules exists', () => {
  const result = fixture();
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(result.calls, [{ args: ['install', '--frozen-lockfile', '--prefer-offline'], cwd: root }]);
});

test('install failure preserves pnpm status and actionable diagnostics', () => {
  const result = fixture({ code: 23 });
  assert.equal(result.code, 23, result.output);
  assert.match(result.output, /依赖同步失败/);
  assert.match(result.output, /ERR_PNPM_OUTDATED_LOCKFILE/);
});

test('missing pnpm reports exit 127', () => {
  const result = fixture({ missing: true });
  assert.equal(result.code, 127, result.output);
  assert.match(result.output, /依赖同步失败/);
});

test('a stuck install is bounded and reports exit 124', () => {
  const result = fixture({ timeout: true });
  assert.equal(result.code, 124, result.output);
  assert.match(result.output, /依赖同步失败/);
  assert.match(result.output, /timeout/);
});

test('prepare-only stops on dependency failure before checking the database', () => {
  const result = fixture({ code: 23, cli: true });
  assert.equal(result.code, 23, result.output);
  assert.equal(result.calls.length, 1);
  assert.doesNotMatch(result.output, /checking database|starting api|reclaiming/);
});

test('normal startup stops on dependency failure before touching services', () => {
  const result = fixture({ code: 23, cli: true, prepareOnly: false });
  assert.equal(result.code, 23, result.output);
  assert.equal(result.calls.length, 1);
  assert.doesNotMatch(result.output, /checking database|starting api|reclaiming/);
});
