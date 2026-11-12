#!/usr/bin/env node
// Fail-closed SMS channel check for production env files.
//
// usage:
//   node check-sms-env.mjs <env-file> --template   # 模板必须声明全部短信键（值可为占位符）
//   node check-sms-env.mjs <env-file> --runtime    # 实际部署值必须是真实腾讯通道，且无占位符
//
// Exit 1 with a human-readable reason; never prints secret values.
import fs from 'node:fs';

const [, , file, modeArg] = process.argv;
const mode = modeArg === '--template' ? 'template' : 'runtime';
if (!file) {
  console.error('usage: check-sms-env.mjs <env-file> [--template|--runtime]');
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (error) {
  console.error(`无法读取 env 文件：${file}（${error.code || error.message}）`);
  process.exit(1);
}

const env = {};
for (const line of raw.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

const DECLARED = [
  'SMS_PROVIDER',
  'TENCENT_SMS_SECRET_ID',
  'TENCENT_SMS_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
];
const RUNTIME_REQUIRED = [
  'TENCENT_SMS_SECRET_ID',
  'TENCENT_SMS_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
];
const PLACEHOLDER = /REPLACE_WITH|CHANGEME|TODO|^\s*$/i;

function fail(reason) {
  console.error(`SMS 配置检查失败：${reason}`);
  process.exit(1);
}

/** 模板 ID 可以共用一个，也可以按 login/register 分开配。 */
function hasTemplates() {
  const shared = String(env.TENCENT_SMS_TEMPLATE_ID || '').trim();
  const login = String(env.TENCENT_SMS_TEMPLATE_ID_LOGIN || shared).trim();
  const register = String(env.TENCENT_SMS_TEMPLATE_ID_REGISTER || shared).trim();
  return !PLACEHOLDER.test(login) && !PLACEHOLDER.test(register);
}

if (mode === 'template') {
  const missing = DECLARED.filter((key) => env[key] === undefined);
  if (missing.length > 0) fail(`模板缺少键 ${missing.join(', ')}（${file}）`);
  if (String(env.SMS_PROVIDER).trim().toLowerCase() !== 'tencent') {
    fail(`模板 SMS_PROVIDER 必须是 tencent（当前 ${env.SMS_PROVIDER || '空'}）`);
  }
  if (!('TENCENT_SMS_TEMPLATE_ID' in env)
    && !('TENCENT_SMS_TEMPLATE_ID_LOGIN' in env && 'TENCENT_SMS_TEMPLATE_ID_REGISTER' in env)) {
    fail('模板缺少短信模板键（TENCENT_SMS_TEMPLATE_ID 或 _LOGIN/_REGISTER 两个）');
  }
  console.log(`SMS env template ok: ${file}`);
} else {
  if (env.NODE_ENV !== undefined && env.NODE_ENV !== 'production') {
    fail(`生产 env 的 NODE_ENV 必须是 production（当前 ${env.NODE_ENV}）`);
  }
  if (String(env.SMS_PROVIDER || '').trim().toLowerCase() !== 'tencent') {
    fail('SMS_PROVIDER 必须是 tencent，生产禁止 mock 短信通道');
  }
  const missing = RUNTIME_REQUIRED.filter((key) => PLACEHOLDER.test(String(env[key] || '')));
  if (missing.length > 0) fail(`缺少真实凭据 ${missing.join(', ')}`);
  if (!hasTemplates()) {
    fail('缺少短信模板 ID（TENCENT_SMS_TEMPLATE_ID，或按场景的 _LOGIN/_REGISTER）');
  }
  console.log(`SMS env runtime ok: ${file}`);
}
