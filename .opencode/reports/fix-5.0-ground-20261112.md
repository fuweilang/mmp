# 5.0 Ground 侧缺陷修复报告

- 角色：李庚（架构 + 唯一开发）
- 时间：2026-11-12（America/Los_Angeles）
- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.0`，基线 `58ec00c2`（未 commit/stash/reset）
- 范围：仅 `ground/apps/backend`、`ground/apps/frontend`、`ground/infra`；未改 `mammoth-agent` 任何文件
- 结论：**10 条已修 / 1 条部分（CI 接线被权限拒绝）**；P0 已闭环（生产 fail-closed）。剩余未验项均需隔离库/真实通道/nginx 二进制。

---

## 1（P0）SMS 生产 fail-closed + mockCode 双门 + env 模板 + preflight

**改动**
- `apps/backend/src/auth/sms.ts:57-101`：`isProductionRuntime()`、`smsProvider()`（生产只接受 `tencent`，其余直接抛错）、`assertSmsConfig()`（生产必须 `SMS_PROVIDER=tencent` 且 SecretId/Key/SdkAppId/模板齐全）。
- `apps/backend/src/auth/sms.ts:78-80,194,228`：`mockCodeAllowed()` 双门（`provider==='mock' && NODE_ENV!=='production'`），发码响应与冷却响应都走同一门。
- `apps/backend/src/main.ts:59`：`assertSmsConfig()` 在 `NestFactory.create` 之前执行，失败即进程退出（fail-closed）。
- `infra/production/compose.yml:25`：api 服务显式 `NODE_ENV: production`。
- `infra/production/Dockerfile.api:27`：镜像内 `ENV NODE_ENV=production`（不依赖 compose 注入也不会退回 mock）。
- `infra/production/production.env.example:14-22`：补 `NODE_ENV`、`SMS_PROVIDER=tencent`、SecretId/Key/SdkAppId/SignName/TemplateId/Region（全部占位符，无真实密钥）。
- `infra/production/check-sms-env.mjs`（新增）：模板模式校验键齐全；运行时模式校验 `SMS_PROVIDER=tencent`、凭据非占位、模板覆盖 login/register。
- `infra/production/release.sh:255-262`（preflight：模板 + 发布目录已有 env）、`:469-471`（deploy 前强制运行时校验）。
- `infra/production/preflight-local.sh:16-21`：同一校验接入本地发布预检。

**验证**
- `NODE_ENV=production SMS_PROVIDER= node --import tsx -e "assertSmsConfig()"` → `fail-closed OK: 生产环境必须设置 SMS_PROVIDER=tencent…`
- `NODE_ENV=production SMS_PROVIDER=mock` → 同上抛错；`SMS_PROVIDER 空`（非生产）→ `provider= mock`
- `node check-sms-env.mjs production.env.example --template` → exit 0；`--runtime` 对模板 → exit 1（`缺少真实凭据 …`）；伪造值临时 env → exit 0；`SMS_PROVIDER=mock` → exit 1
- 单测 `fails closed in production …` 2 例通过

**未验 / 风险**
- 未做真实容器启动验证（需 DB 与凭据）；逻辑在 bootstrap 第一行，失败即 `bootstrap.failed` + exit 1。
- 现有生产 `production.env` 若没有短信键，下次发版会 preflight 失败、容器会 crash-loop —— 这是预期 fail-closed，需先补 env。
- `NODE_ENV=production` 同时关闭支付 mock（`pay.constants.ts:29`，模板本就 `PAY_PROVIDER=real`）。

## 2（P1）trust proxy + phone/IP 双维度限流

**改动**
- `apps/backend/src/main.ts:47-57,68`：`trustProxySetting()`（默认 1 跳，`TRUST_PROXY` 可覆盖 `false/true/数字/字符串`），`app.set('trust proxy', …)`。
- `apps/backend/src/auth/sms.ts:9-10,168-176`：IP 20 次/小时（真实 IP）+ 手机号 5 次/小时双维度；`auth.service.ts` store 增 `countPhoneSince`。
- 审计 `ip` 仍由 controller 传 `req.ip`，随 trust proxy 自动变正确（未改审计字段结构）。

**验证**
- Express 同版本探针：`trust proxy 1` + `x-forwarded-for: 6.6.6.6, 203.0.113.9` → `req.ip = 203.0.113.9`（左侧伪造值被忽略，取 nginx 追加的真实 IP；未设置时仍为 `127.0.0.1`）
- 单测 `counts the hourly limit per phone as well as per IP` 通过

**未验 / 风险**
- nginx 侧已用 `$proxy_add_x_forwarded_for`（`proxy-common.conf:4`），一跳假设成立；若前面再加 CDN/WAF 需把 `TRUST_PROXY` 调到对应跳数，否则取到的是 CDN 回源 IP。
- 手机号 5 次/小时是新增阈值，正常用户基本不会触发（60s 冷却已存在）。

## 4（P1）nginx `/api/pay/` 落到 Harness

**改动**
- `infra/production/nginx-mmai.conf:33-38`：新增 `location ^~ /api/pay/ { proxy_pass http://127.0.0.1:33100; include proxy-common.conf; }`；`^~` 优先于后面的正则 location，其余 location 未动。

**验证**
- 静态核对：`grep -n "api/pay" nginx-mmai.conf` → `:34 location ^~ /api/pay/`，位于正则 location（`:39`）之前；`proxy_pass` 指向 33100。

**未验 / 风险**
- 本机无 nginx 二进制，未跑 `nginx -t`；语法与既有 `^~` 块同构，`include` 路径与相邻 location 一致。

## 5（P2）核销原子化 + 先建号后核销

**改动**
- `apps/backend/src/auth/sms.ts:233-250`：拆 `verify()`（只校验、累计错误次数）与 `consume()`（条件核销）。
- `apps/backend/src/auth/sms.ts:29-31`：store `consume` 改返回 boolean；实现见 `auth.service.ts:241-247`（`updateMany where {id, consumedAt:null}` + `count===1`）。
- `apps/backend/src/auth/auth.service.ts:38-40`：注册改为 `verify()` → `createEnterpriseAccount(input, claim)`。
- `apps/backend/src/auth/auth.service.ts:157-165`：核销放进同一 `$transaction` 末尾，`count!==1` 抛错整体回滚（并发下一码只能出一个会话/账号）。
- `apps/backend/src/auth/auth.service.ts:264-270`：SMS 登录先查人再 `consume()`（并发第二次报「验证码已使用」）。

**验证**
- 单测 `consumes a code at most once under concurrency`（两并发 consume 只 1 成功）通过
- `tsc --noEmit` src 0 error

**未验 / 风险**
- 未在真实 PG 上做并发压测（无隔离库）；事务语义依据 Prisma 交互式事务“抛错回滚”。
- 建号事务时长因多两次 updateMany 略增（同库同事务，毫秒级）。

## 6（P2）发码接口手机号可枚举

**改动**
- `apps/backend/src/auth/sms.ts:178-184`：`scene` 与注册状态不匹配时**静默成功**（`ok:true, retryAfterSeconds:60`），不发码、不落库、不回 `mockCode`。
- `apps/backend/src/auth/auth.service.ts:268`：SMS 登录对不存在/停用账号统一「手机号或验证码错误」。

**验证**
- 单测 `does not leak registration state …`（login 未知号 / register 已知号）2 例通过（无行落库、无 mockCode）

**未验 / 风险**
- UX 变化：未注册用户点「获取验证码」会看到已发送但收不到短信；注册场景用已注册号也不再提示「已注册」，最终在提交时失败。

## 7（P2）索引 / 部分唯一约束 / 过期清理

**改动**
- `apps/backend/prisma/schema.prisma:1258`：`@@index([sendIp, createdAt])`；`:1259-1260` 注释说明部分唯一索引由迁移维护。
- 新迁移 `apps/backend/prisma/migrations/20261112190000_sms_code_hardening/migration.sql`：
  - `CREATE INDEX …("send_ip","created_at")`
  - 先把历史重复的未核销行标记为已核销（只保留最新一条，避免建唯一索引失败）
  - `CREATE UNIQUE INDEX …("phone","scene") WHERE "consumed_at" IS NULL`
- `apps/backend/src/auth/sms.ts:199,252-257`：发码前 `retireExpired()` 释放过期槽位；`purgeExpired()`（删除过期超 1 天）按进程内每小时节流惰性执行（不引入新 worker/定时器）。
- `apps/backend/src/auth/auth.service.ts:205-260`：对应 Prisma 实现（含并发唯一冲突 P2002 → 视为冷却，不重复下发）。

**验证**
- `npx prisma validate` → `The schema at prisma/schema.prisma is valid`
- `tsc --noEmit` src 0 error；单测覆盖 insert 冲突/过期释放路径

**未验 / 风险**
- **未 apply 迁移**（无隔离 `DATABASE_URL`，不碰生产 PG）：`UPDATE` 去重与部分唯一索引的实际执行未验证。
- Prisma schema 表达不了部分索引：`prisma migrate diff`/`migrate dev` 会认为该索引是多余对象，后续需要继续手工维护（已写注释）。

## 8（P2）短信单测接入脚本 / CI

**改动**
- `apps/backend/package.json:16`：新增 `"test:auth": "node --import tsx --test test/auth/sms.unit.test.ts"`。
- `apps/backend/test/auth/sms.unit.test.ts`：适配新 `SmsCodeStore`，从 3 例扩到 8 例（P0 fail-closed、枚举、并发核销、双维度限流）。

**验证**
- `pnpm --filter @mammoth/backend test:auth` → 8 pass / 0 fail

**未修（权限拒绝）**
- `ground/.github/workflows/ci.yml` 的 api job 加 `pnpm --filter @mammoth/backend test:auth` 被工具权限拒绝（`Permission denied: edit`），未绕过。
- 该 workflow 目前只在 `push: [1.0, main]` 与 `pull_request` 触发，5.0 分支需合并或由 owner 调整触发；本次未改发布工作流。

## 9（P2）bin 下载 Cache-Control `always`

**改动**
- `infra/production/nginx-mmai.conf:65`：`add_header Cache-Control "public, max-age=86400" always;`（与 feeds `:53` 对齐）。

**验证**
- 静态核对：`grep -n "max-age=86400" nginx-mmai.conf` → `:65 … always;`，仅 bin location 命中。

**未验 / 风险**
- 无 nginx 二进制，未实测 404 响应头。

## 12（P2）Login 提交 loading 守卫

**改动**
- `apps/frontend/src/views/Login.vue:257`：`onSubmit` 入口 `if (loading.value) return;`（表单 submit 与按钮 `native-type=submit` 同源，连点/回车都从这里进）。
- `apps/frontend/src/views/Login.vue:160`：`sendCode` 入口 `if (sendingSms.value) return;`。

**验证**
- `pnpm --filter @mammoth/frontend typecheck`（vue-tsc）exit 0

**未验 / 风险**
- 未做真实浏览器连点/回车手工验证（不启动用户服务）。

## 13（P2）`client-register` 旧客户端兼容

**改动**
- `apps/backend/src/auth/dto/login.dto.ts:43-49`：新增 `ClientRegisterDto`，`smsCode` 可选但仍 6 位数字校验；浏览器 `register` 继续用必填的 `PublicRegisterDto`。
- `apps/backend/src/auth/auth.controller.ts:51`：`client-register` 改用 `ClientRegisterDto`。
- `apps/backend/src/auth/auth.service.ts:50-63`：带 `smsCode` → `verify()` + 同事务核销（强校验）；不带 → 旧逻辑建号，审计记 `client_register_legacy`（区别于 `client_register`）。

**验证**
- `tsc --noEmit` src 0 error；DTO 行为由 `PublicRegisterDto` 既有校验覆盖，`forbidNonWhitelisted` 下旧 5 字段请求可通过。
- 未启动 HTTP 端到端（无隔离库）。

**未验 / 风险**
- legacy 路径仍是「不验手机号即可建号」，即本次改动前的既有行为；已加审计标记，但**没有服务端强制后续验证**（旧客户端无短信 UI，强制即锁死）。是否关闭 legacy 需产品决策。

## 14（P2）RoleTable super_admin 提示

**改动**
- `apps/frontend/src/components/admin/roles/RoleTable.vue:136`：恢复 `if (row.key === 'super_admin') return '超级管理员角色不可编辑';`，tooltip 与禁用态重新一致。

**验证**
- `vue-tsc --noEmit` exit 0；模板 `:disabled="!canEditRow(row)"` + `:content="editHint(row)"` 未改。

**未验 / 风险**
- 未做浏览器 hover 实测。

---

## 验证命令汇总

| 命令 | 结果 |
|---|---|
| `pnpm --filter @mammoth/backend test:auth` | 8 pass / 0 fail |
| `npx tsc --noEmit -p tsconfig.json`（backend） | `src/` 0 error（`test/knowledge-core/*` 等预存错误仍在，未触碰） |
| `pnpm --filter @mammoth/frontend typecheck` | exit 0 |
| `npx prisma validate` | valid |
| `node --import tsx -e` 生产 fail-closed 探针 | 缺 provider/mock 均抛错；非生产默认 mock |
| Express `trust proxy 1` 探针 | `req.ip = 203.0.113.9`（伪造左侧被忽略） |
| `node check-sms-env.mjs … --template/--runtime` | 模板 0；模板当运行时 1；伪造运行时值 0；mock 1 |
| `bash -n release.sh preflight-local.sh` | ok |
| `node --import tsx --test test/tenant/effective-permissions.unit.test.ts` | 4 pass（回归核对） |
| nginx 静态核对 | `^~ /api/pay/` 在正则前；bin `Cache-Control … always` |

## 未验 & 原因

1. **迁移 apply**：无隔离 `DATABASE_URL`，禁止碰生产 `mammoth_core`；仅 `prisma validate` + DDL 静态审查。
2. **HTTP 端到端**（发码→落库→sms-login→cookie→审计 ip）：同上，无隔离库；未起服务。
3. **真实腾讯短信**：无凭据/身份，仅静态 + 单测替身。
4. **容器 fail-closed 实际启动**：需 DB 与真实 env，未执行。
5. **nginx -t / 404 头实测**：本机无 nginx 二进制。
6. **GUI 连点/回车、tooltip**：未启动用户服务，未做真实点击。
7. **CI 接线**：`.github/workflows/ci.yml` 编辑被权限拒绝。

## 剩余风险

- 生产 `production.env` 未读、内容未知：若没补 `SMS_PROVIDER=tencent` 与凭据，下次发版 preflight 失败 / 容器 crash-loop（设计如此）。
- legacy `client-register` 仍可无短信建号（仅审计标记），是否强制升级需决策。
- 部分唯一索引脱离 Prisma schema 管理，后续 `migrate dev` 可能生成冲突迁移，需人工注释提醒。
- 枚举修复改变发码 UX（静默成功）。
- `TRUST_PROXY` 默认 1 跳，若新增 CDN 需调整。

## 交接

- DeepSeek：决定 legacy `client-register` 是否保留 / 是否强制升级；是否授权改 CI workflow。
- 秋池：需隔离库复测迁移 apply、并发一码多会话、发码→登录端到端、nginx 头。
- 甜甜：登录页「未注册也提示已发送」的新交互文案。
