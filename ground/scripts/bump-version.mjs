#!/usr/bin/env node
/**
 * 版本号唯一入口：ground/config/version.json
 *
 * 用法（在 ground 目录执行，或 pnpm version:bump <action>）：
 *   node scripts/bump-version.mjs patch        # 1.1.2 -> 1.1.3（发版默认）
 *   node scripts/bump-version.mjs minor        # 1.1.2 -> 1.2.0
 *   node scripts/bump-version.mjs major        # 1.1.2 -> 2.0.0
 *   node scripts/bump-version.mjs --set 1.2.3  # 指定版本
 *
 * 改完 version.json 后立即调用 sync-mammoth-version.mjs，把版本同步到
 * packages/shared、Octop pyproject / __init__。桌面端与 GitHub Actions
 * 都从 pyproject 取版本，因此不需要额外文件。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = path.join(root, 'config', 'version.json');

function fail(message) {
  console.error(`[version] ${message}`);
  process.exit(1);
}

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!match) fail(`不是合法的 x.y.z 版本号：${version}`);
  return match.slice(1).map(Number);
}

const [, , action = 'patch', ...rest] = process.argv;
const raw = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const current = String(raw.version || '');
const [major, minor, patch] = parse(current);

let next;
if (action === '--set' || action === 'set') {
  next = String(rest[0] || '').replace(/^v/, '');
} else if (action === 'major') {
  next = `${major + 1}.0.0`;
} else if (action === 'minor') {
  next = `${major}.${minor + 1}.0`;
} else if (action === 'patch') {
  next = `${major}.${minor}.${patch + 1}`;
} else {
  fail(`未知参数 ${action}；用法：bump-version.mjs [patch|minor|major|--set x.y.z]`);
}

parse(next);
if (next === current) fail('版本号没有变化');

fs.writeFileSync(versionPath, `${JSON.stringify({ ...raw, version: next }, null, 2)}\n`);
console.log(`[version] ${current} → ${next}`);

execFileSync(process.execPath, [path.join(root, 'scripts', 'sync-mammoth-version.mjs')], {
  stdio: 'inherit',
});