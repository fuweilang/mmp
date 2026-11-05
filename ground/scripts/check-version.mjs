#!/usr/bin/env node
/**
 * 版本一致性检查：任何一处和 config/version.json 不一致就失败。
 *
 * 检查范围（存在才检查）：
 *   ground/config/version.json         ← 唯一来源
 *   ground/packages/shared/src/version.ts
 *   ground/packages/shared/dist/version.js  ← 运行时角标
 *   Octop/pyproject.toml               ← 桌面端与 GitHub Actions 取这里
 *   Octop/src/octop/__init__.py
 *
 * 用法：
 *   node scripts/check-version.mjs      # 发版 / CI 用
 *   pnpm version:check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const octopRoot = path.resolve(root, '../Octop');

const source = JSON.parse(fs.readFileSync(path.join(root, 'config', 'version.json'), 'utf8'));
const expected = String(source.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(expected)) {
  console.error(`[version] config/version.json 不是合法的 x.y.z：${expected || '(空)'}`);
  process.exit(1);
}

const checks = [
  {
    label: 'packages/shared/src/version.ts',
    file: path.join(root, 'packages/shared/src/version.ts'),
    pattern: /APP_VERSION\s*=\s*'([^']+)'/,
  },
  {
    label: 'packages/shared/dist/version.js',
    file: path.join(root, 'packages/shared/dist/version.js'),
    pattern: /APP_VERSION\s*=\s*'([^']+)'/,
  },
  {
    label: 'Octop/pyproject.toml',
    file: path.join(octopRoot, 'pyproject.toml'),
    pattern: /^version\s*=\s*"([^"]+)"/m,
  },
  {
    label: 'Octop/src/octop/__init__.py',
    file: path.join(octopRoot, 'src/octop/__init__.py'),
    pattern: /__version__\s*=\s*"([^"]+)"/,
  },
];

const rows = [['config/version.json', expected, 'source']];
let failed = false;

for (const check of checks) {
  if (!fs.existsSync(check.file)) {
    rows.push([check.label, '(缺失，跳过)', 'skip']);
    continue;
  }
  const match = check.pattern.exec(fs.readFileSync(check.file, 'utf8'));
  const actual = match?.[1] ?? '(未找到)';
  const ok = actual === expected;
  if (!ok) failed = true;
  rows.push([check.label, actual, ok ? 'ok' : 'MISMATCH']);
}

// .env 里的版本变量曾是线上角标显示 1.1.0 的根因，仓库里出现就直接拦下。
for (const envName of ['.env', '.env.local', '../.env']) {
  const envPath = path.resolve(root, envName);
  if (!fs.existsSync(envPath)) continue;
  if (/^\s*MAMMOTH_APP_VERSION\s*=/m.test(fs.readFileSync(envPath, 'utf8'))) {
    failed = true;
    rows.push([envName, 'MAMMOTH_APP_VERSION', 'MISMATCH']);
  }
}

const width = Math.max(...rows.map(([label]) => label.length));
for (const [label, actual, state] of rows) {
  console.log(`${state === 'ok' || state === 'source' ? '✓' : '✗'} ${label.padEnd(width)}  ${actual}`);
}

if (failed) {
  console.error('\n[version] 版本号不一致，先执行：pnpm version:bump patch（或 version:bump --set x.y.z）');
  process.exit(1);
}

console.log(`\n[version] ${expected} 全部一致`);