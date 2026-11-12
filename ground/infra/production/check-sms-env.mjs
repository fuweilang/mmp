#!/usr/bin/env node
// Fail-closed SMS channel check for production env files.
//
// usage:
//   node check-sms-env.mjs <env-file> --template   # 模板必须声明全部短信键（值可为占位符）
//   node check-sms-env.mjs <env-file> --runtime    # 实际部署值必须是真实腾讯/阿里云通道，且无占位符
//
// Exit 1 with a human-readable reason; never prints secret values (key names only).
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

/** 每种通道的必填键；模板前缀用于「共用 ID 或 _LOGIN/_REGISTER 分开配」两种写法。 */
const PROVIDERS = {
  tencent: {
    credentials: ['TENCENT_SMS_SECRET_ID', 'TENCENT_SMS_SECRET_KEY', 'TENCENT_SMS_SDK_APP_ID'],
    templatePrefix: 'TENCENT_SMS_TEMPLATE_ID',
  },
  aliyun: {
    credentials: ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET'],
    templatePrefix: 'ALIYUN_SMS_TEMPLATE_ID',
  },
};
const REAL_PROVIDERS = Object.keys(PROVIDERS);

const DECLARED = [
  'SMS_PROVIDER',
  ...PROVIDERS.tencent.credentials,
  ...PROVIDERS.aliyun.credentials,
];
const PLACEHOLDER = /REPLACE_WITH|CHANGEME|TODO|^\s*$/i;

function fail(reason) {
  console.error(`SMS 配置检查失败：${reason}`);
  process.exit(1);
}

function provider() {
  return String(env.SMS_PROVIDER || '').trim().toLowerCase();
}

/** 模板 ID 可以共用一个，也可以按 login/register 分开配。 */
function hasTemplates(prefix) {
  const shared = String(env[prefix] || '').trim();
  const login = String(env[`${prefix}_LOGIN`] || shared).trim();
  const register = String(env[`${prefix}_REGISTER`] || shared).trim();
  return !PLACEHOLDER.test(login) && !PLACEHOLDER.test(register);
}

function templatesDeclared(prefix) {
  return prefix in env || (`${prefix}_LOGIN` in env && `${prefix}_REGISTER` in env);
}

if (mode === 'template') {
  const missing = DECLARED.filter((key) => env[key] === undefined);
  if (missing.length > 0) fail(`模板缺少键 ${missing.join(', ')}（${file}）`);
  const current = provider();
  if (!REAL_PROVIDERS.includes(current)) {
    fail(`模板 SMS_PROVIDER 必须是 ${REAL_PROVIDERS.join(' 或 ')}（当前 ${env.SMS_PROVIDER || '空'}）`);
  }
  const { templatePrefix } = PROVIDERS[current];
  if (!templatesDeclared(templatePrefix)) {
    fail(`模板缺少 ${current} 短信模板键（${templatePrefix} 或 ${templatePrefix}_LOGIN/${templatePrefix}_REGISTER 两个）`);
  }
  console.log(`SMS env template ok: ${file}`);
} else {
  if (env.NODE_ENV !== undefined && env.NODE_ENV !== 'production') {
    fail(`生产 env 的 NODE_ENV 必须是 production（当前 ${env.NODE_ENV}）`);
  }
  const current = provider();
  if (!REAL_PROVIDERS.includes(current)) {
    fail(`SMS_PROVIDER 必须是 ${REAL_PROVIDERS.join(' 或 ')}，生产禁止 mock 短信通道`);
  }
  const { credentials, templatePrefix } = PROVIDERS[current];
  const missing = credentials.filter((key) => PLACEHOLDER.test(String(env[key] || '')));
  if (missing.length > 0) fail(`缺少真实凭据 ${missing.join(', ')}`);
  if (!hasTemplates(templatePrefix)) {
    fail(`缺少短信模板 ID（${templatePrefix}，或按场景的 _LOGIN/_REGISTER）`);
  }
  console.log(`SMS env runtime ok: ${file}`);
}
