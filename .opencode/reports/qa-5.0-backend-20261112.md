# QA 5.0 后端验收 — 短信登录/权限目录/迁移/nginx

- 角色：秋池（测试）
- 时间：2026-11-12 05:15 America/Los_Angeles
- 仓库：/Users/fuweilang/Documents/code/mmp，分支 `5.0`，HEAD `58ec00c2`，未提交改动 84 个
- 约束：未改源码、未 commit/stash/reset/clean、未读 .env（`prisma` CLI 自身会加载 .env，未输出其内容）、未碰真实库

## 结论

**不可直接上线。** 有 1 个 P0（生产默认 mock 短信 + 响应回显验证码 → 任意已注册手机号可被接管），2 个 P1（IP 限流退化为全站 20 次/小时；预存 nginx `/api/pay` 漏配）。权限目录精简与迁移静态一致，通过。

## 一、改动确认（`git diff -- <path>`，逐项核对）

| 范围 | 结论 |
|---|---|
| `src/auth/sms.ts`（新增）| 逻辑正确，但 provider 默认 mock、mockCode 无环境门 |
| `auth.controller.ts` / `auth.service.ts` / `dto/login.dto.ts` | 契约一致；register 增加 smsCode；新增 3 个路由 |
| `prisma/schema.prisma` + `migrations/20261112180000_sms_verification_code/` | 与 Prisma 生成 DDL 逐字一致，无破坏性语句 |
| `prisma/seed.ts` | 新增 orgPreset override 残留清理，与 catalog 一致 |
| `permissions/catalog.ts`（-163） | 8 个旧键全部下线；全仓 0 处残留引用；picker 无孤儿 |
| `frontend/src/api/auth.ts` / `stores/auth.ts` | 与后端 `{phone, smsCode}`、`SessionMe` 一致；`vue-tsc` 0 error |
| `infra/*` 三份 nginx | SSE 缓冲已关、超时 3600s；无 nginx 二进制，只做人工核对 |

## 二、缺陷清单

### P0-1 SMS_PROVIDER 缺省为 mock，生产未配置 → 验证码明文回显 + 固定 123456（账号接管）

- 位置：`ground/apps/backend/src/auth/sms.ts:43`（`(process.env.SMS_PROVIDER || 'mock')`）、`:50`（默认 `123456`）、`:131`、`:155`（响应带 `mockCode`）
- 生产侧：`ground/infra/production/production.env.example` 无任何 SMS 变量（`grep -in sms` 无输出）；`compose.yml:24` 用 `env_file: production.env`；`compose.yml`/`release.sh` 无 `NODE_ENV`、无启动校验
- 实际：`SMS_PROVIDER` 未设置时 `smsProvider()` 返回 `mock`，`POST /api/auth/sms/send`（无鉴权）直接把 `mockCode:"123456"` 写进响应体；`Login.vue` 还会自动回填
- 预期：生产环境必须使用真实通道；mock 只在非生产且显式开启时可用，生产缺配置应在启动时失败
- 复现：① 不设 `SMS_PROVIDER` ② `POST /api/auth/sms/send {"phone":"<已注册手机号>","scene":"login"}` ③ 响应含 `mockCode:"123456"` ④ `POST /api/auth/sms-login {"phone":<同一手机号>,"smsCode":"123456"}` 直接拿到会话（含 `isPlatformAdmin` 账号）
- 证据：临时探针 `qa-sms-probe.test.ts` 用例 `LEAK: no SMS_PROVIDER in production returns mockCode` 通过（`NODE_ENV=production` 仍返回 `123456` 并可 `consume` 成功）
- 建议：`smsProvider()` 在 `NODE_ENV==='production'` 且未显式 `SMS_PROVIDER=tencent` 时抛错；`mockCode` 仅在 `NODE_ENV!=='production'` 且 `SMS_PROVIDER==='mock'` 时返回；`compose.yml` 显式 `NODE_ENV=production` 并对 `SMS_PROVIDER` 做启动校验

### P1-1 未启用 trust proxy → `req.ip` 恒为 127.0.0.1，20 次/小时变成全站配额

- 位置：`ground/apps/backend/src/main.ts:44-72`（无 `app.set('trust proxy', …)`）；消费点 `src/auth/sms.ts:119`（`countSince(sendIp)`）
- 实际：`compose.yml:27` 后端只监听 `127.0.0.1:33100`，nginx 反代；Express 未开 trust proxy 时 `req.ip` = 回环地址，`X-Real-IP/X-Forwarded-For` 被忽略
- 预期：按真实客户端 IP 计 20 次/小时
- 复现：Express 探针（同版本 express 4.22.1）请求带 `x-forwarded-for: 203.0.113.9` → `{"ip":"127.0.0.1"}`；设 `trust proxy 1` 后 → `{"ip":"203.0.113.9"}`
- 影响：全站第 21 次发码（所有用户合计）即返回「验证码发送过于频繁」；审计日志 `ip` 字段同样全是 127.0.0.1（既有问题，本次被放大）
- 证据：`qa-trustproxy.mjs` 输出 `no trust proxy -> {"ip":"127.0.0.1"}` / `trust proxy 1 -> {"ip":"203.0.113.9"}`
- 建议：`app.set('trust proxy', 1)`（或 nginx 出口 IP 列表）；同时确认 nginx 用 `$proxy_add_x_forwarded_for` 追加（已是）

### P1-2（非本次 diff，预存）生产 nginx 正则 location 不含 `pay`，支付回调落到 agent:33080

- 位置：`ground/infra/production/nginx-mmai.conf:33`（`^/api/(auth|billing|v1|session-history|oidc|library|official-…)`）；后端 `src/pay/pay-notify.controller.ts:7`（`@Controller('pay')`）
- 实际：`/api/pay/...` 不匹配该正则 → 命中 `location /` → `127.0.0.1:33080`（Harness），Ground 收不到回调
- 预期：`/api/pay/` 反代到 33100
- 说明：该行本次未改（仅新增 downloads location），列此仅供 DeepSeek 决定是否并入本轮
- 建议：正则加 `pay`，或用 `location ^~ /api/pay/` 显式反代

### P2-1 验证码核销非原子，并发可重放

- 位置：`src/auth/sms.ts:158-169`（先 `findLatest` 再 `consume`）；`src/auth/auth.service.ts:211`（`update where id` 无 `consumedAt: null` 条件）
- 实际：两个并发请求可同时读到未消费行并都通过校验（登录场景一码出两会话；注册场景靠 `User.phone @unique` 兜底失败回滚）
- 预期：核销为条件更新（`updateMany where { id, consumedAt: null }` 并校验 count=1）或事务内 `SELECT … FOR UPDATE`
- 复现：同一码并行发起两次 `sms-login`

### P2-2 注册先把码烧掉再建账号

- 位置：`src/auth/auth.service.ts:38`、`:53`（`consume` 在 `createEnterpriseAccount` 之前）
- 实际：手机号已注册 / 品牌被占用 → 400，但验证码已 consumed；用户需重新发码（冷却行已消费可立即重发，影响有限）
- 预期：账号创建成功后再核销，或同事务内核销

### P2-3 手机号注册状态可枚举

- 位置：`src/auth/sms.ts:114-115`（`该手机号已注册` / `该手机号尚未注册`）；`auth.service.ts` `openSmsSession` 先查用户再核销
- 实际：未鉴权接口按文案区分返回，可批量探测号码是否注册
- 预期：统一文案 + 仅对注册场景静默忽略

### P2-4 验证码表无清理任务

- 位置：`prisma/schema.prisma` `SmsVerificationCode`（有 `expiresAt` 索引但无 purge）；`grep smsVerificationCode` 仅 auth.service 使用
- 实际：每次发码 +1 行，永久累积
- 建议：定时删除 `expiresAt < now-1d`（或复用现有 worker 模式）

### P2-5 同 phone+scene 无唯一约束，并发发码产生两行

- 位置：`schema.prisma` 末尾模型（仅 pkey）；`sms.ts:126-152`
- 实际：冷却窗口内两次并发请求都能 insert，用户可能收到旧码后用不上（`findLatest` 只取最新）
- 建议：以 (phone, scene, consumed_at is null) 部分唯一索引 / 应用层串行

### P2-6 新增单测未接入任何脚本或 CI

- 位置：`ground/apps/backend/test/auth/sms.unit.test.ts`；`ground/apps/backend/package.json` scripts 无 `test:auth`；`.github/workflows` 仅 `windows-package.yml`
- 实际：只能手动 `node --import tsx --test` 运行，回归不设防
- 建议：加 `test:auth` 并在 preflight/CI 调用

### P2-7 `bin/` 下载 404 未 `always`，可被启发式缓存

- 位置：`ground/infra/production/nginx-mmai.conf:57-62`（feed location 用了 `always`，bin 的 `Cache-Control "public, max-age=86400"` 没有）
- 实际：文件未上传时 404 无缓存头，浏览器/中间层可能缓存 404
- 建议：`add_header Cache-Control "public, max-age=86400" always;` 或对 404 显式 `no-store`

### P2-8 super_admin 不可编辑提示被删，与后端硬锁不一致

- 位置：`ground/apps/frontend/src/components/admin/roles/RoleTable.vue:135`（删掉 `超级管理员角色不可编辑`）；`src/permissions/catalog.ts:158-160`（`isRoleMutationAllowed` 仍锁 `super_admin`）
- 实际：UI 不再告知原因，点了才失败
- 建议：保留提示（甜甜/李庚）

## 三、通过项（本次实测）

| 项 | 证据 |
|---|---|
| 仓内单测 | `node --import tsx --test test/auth/sms.unit.test.ts` 3 pass；`test/tenant/effective-permissions.unit.test.ts` 4 pass |
| 短信行为 10 例 | 临时探针 `qa-sms-probe.test.ts` 10 pass：5 次错误后锁定（第 6 次提示次数过多）、过期码不可用、register 码不能用于 login、已用码不可重放且不阻塞重发、60s 冷却仅限同号、20 次 IP 上限、DTO 6 位校验、sendIp 截断、HMAC 绑定 phone+scene |
| DTO 契约 | `qa-dto-probe.ts` OK：缺 `smsCode`/5 位/非数字/非法 scene 全部报错，合法请求通过（`PublicRegisterDto` 继承生效） |
| 权限矩阵 | `qa-perm-matrix.test.ts` 4 pass：super_admin=14 键、platform_admin=6 admin 键、org_admin=8 console 键、org_member=[]；A 企业自定义角色在 B 企业不可见；org_admin 预设不发给普通成员；库内残留 `skills/terminal` 被过滤不外泄 |
| 目录 & 引用 | `qa-catalog-probe.ts` OK：picker 覆盖全部 14 键、无重复/孤儿；`ASSIGNABLE=TENANT` 仅 console 8 键；全仓 grep `token_usage|agent_plugins|subagents|terminal|browser|skills` 作为权限键 0 处引用（mammoth-agent 命中均为 Cordis inject 名/UI 卡片名） |
| 迁移/seed 静态 | `npx prisma validate` valid；`prisma migrate diff --from-empty --to-schema-datamodel` 生成 DDL 与迁移 SQL 逐字一致（表/两索引/默认值）；迁移仅 `CREATE TABLE/INDEX`，无破坏性语句；seed 清理 `RolePermission` 与 `OrgPresetOverridePermission` 残留与 catalog 一致 |
| 类型 | 后端 `npx tsc --noEmit -p tsconfig.json`：`src/` 0 error（仅 `test/library/*`、`test/official-skill/*` 预存错误，未改动文件）；前端 `npx vue-tsc --noEmit` exit 0 |
| nginx（人工核对） | `infra/baota/nginx-mammoth.conf:66,85,106,126` 与 `production/proxy-common.conf:8-11` 均 `proxy_buffering off` + `proxy_cache off` + 3600s；SSE 端点 `/api/v1/chat/completions`（`llm-chat.controller.ts:35`）在 prod 命中正则 location（include proxy-common），在 baota 命中 `^~ /api/`；`/console/api/`、`/admin/api/` 同样已改；`/downloads/mmp-desk/{feeds,bin}` 为更长前缀 `^~`，可覆盖父级 `^~ /downloads/`，`alias` 尾部斜杠一致 |

## 四、未验 & 原因（阻塞）

1. **迁移 apply**：无隔离 `DATABASE_URL`（`RAG_TEST_DATABASE_URL` / `LIBRARY_TEST_DATABASE_URL` 均未设置），本机无 psql；唯一本地 PG 是生产 compose 的 `mammoth_core`（禁止使用）。仅完成 `prisma migrate diff` 等价校验。可执行：`DATABASE_URL=<空库> pnpm -C ground/apps/backend exec prisma migrate deploy` + `prisma migrate status`
2. **HTTP 端到端**（发码→落库→sms-login→cookie→审计）：无隔离库，未起服务；未做真实会话验证
3. **真实短信通道**：无腾讯云凭据/身份，`tencent` 分支只做静态审查（含 `SendStatusSet[0].Code` 判断、异常转 400）
4. **`nginx -t`**：本机无 nginx 二进制（`which nginx` 无、brew 无、本地 docker 无 nginx 镜像），仅人工逐行核对；`gzip` 是否含 `text/event-stream` 需在服务器 `nginx.conf` 核对
5. **GUI**：未启动 Web/desktop，登录页验证码交互、RoleTable 提示按代码审阅，未做真实点击

## 五、剩余风险

- 生产 `production.env` 实际内容未知（不读）；若已配 `SMS_PROVIDER=tencent`，P0-1 降为 P2（mockCode 仍可能在误配时回显）
- 数据面：老库 `RolePermission`/override 里的旧键需跑一次 `pnpm prisma:seed` 才清理；不跑则只在读出时被过滤（行为正确、数据脏）
- 权限精简后 org_member 有效权限为空：若有企业依赖旧 `skills/terminal` 键做前端门禁，将全部失效（全仓未发现此类引用，第三方/外部客户端无法排查）
- 老版本桌面客户端注册不带 `smsCode` → 400（`client-register` 契约已破），需与客户端发版对齐

## 六、交接

- 李庚（后端）：P0-1、P1-1、P2-1/2/4/5、P2-6
- 王总（Agent/桌面）：老客户端 `client-register`/`client-sms-login` 兼容与发版顺序
- 甜甜：P2-8 + 登录页 mockCode 自动回填在生产的行为
- DeepSeek：P1-2 是否并入本轮；生产 env 是否已配 `SMS_PROVIDER`
- 建议补测（需隔离库）：迁移 apply、短信落库→登录端到端、并发重放用例
