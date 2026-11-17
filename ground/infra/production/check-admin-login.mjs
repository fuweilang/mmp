#!/usr/bin/env node
/**
 * 发版门禁 33：用 release-private/admin-credentials.txt 里的超管凭据真实登录一次。
 *
 * 用法（仓库根或任意目录）：
 *   node ground/infra/production/check-admin-login.mjs
 *   node ground/infra/production/check-admin-login.mjs ./release-private/admin-credentials.txt https://www.mmai.vip
 *
 * 凭据文件支持中文行格式（超管账号 138… / 密码 xxx（2026-11-14 实测 200））：
 * 只取「密码」后的第一个非空白、非全角括号片段，避免把「（实测 200）」吃进密码。
 * 永不打印密码，只打印 pwlen 与 HTTP 结果。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const credentialsPath = path.resolve(process.argv[2] ?? path.join(repoRoot, 'release-private/admin-credentials.txt'));
const origin = (process.argv[3] ?? 'https://www.mmai.vip').replace(/\/$/, '');

if (!fs.existsSync(credentialsPath)) {
  console.error(`凭据文件不存在：${credentialsPath}`);
  process.exit(2);
}
const raw = fs.readFileSync(credentialsPath, 'utf8');
const phone = (raw.match(/超管账号\s*[:：]?\s*(\d+)/) ?? [])[1];
const password = (raw.match(/密码\s*[:：]?\s*([^\s（(]+)/) ?? [])[1];
if (!phone || !password) {
  console.error('凭据解析失败：需要「超管账号 138…」与「密码 xxx」两行');
  process.exit(2);
}
console.log(`credentials=${path.relative(repoRoot, credentialsPath)} phone_tail=${phone.slice(-4)} pwlen=${password.length}`);

const response = await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone, password }),
  signal: AbortSignal.timeout(20_000),
});
const text = await response.text();
let body = null;
try { body = JSON.parse(text); } catch { /* keep text */ }
console.log(`login_status=${response.status}`);

if (response.status !== 200 || !body) {
  console.error(`登录失败：${text.slice(0, 160).replace(/\s+/g, ' ')}`);
  console.error('凭据过期就直接更新 release-private/admin-credentials.txt（600），不要在发布窗口里反复试。');
  process.exit(1);
}
const permissions = Array.isArray(body.effectivePermissions) ? body.effectivePermissions.length : null;
console.log(`user_id=${body.user?.id ?? ''} permissions=${permissions ?? '-'} tenants=${Array.isArray(body.tenants) ? body.tenants.length : '-'}`);
console.log('admin login ok');
