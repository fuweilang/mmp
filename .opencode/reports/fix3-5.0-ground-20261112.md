# 第四轮修复（Ground 侧 3 项）

- 角色：李庚（架构 + 唯一开发）｜2026-11-12 07:01 America/Los_Angeles
- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.0`，HEAD `58ec00c2`（未 commit/push/stash/reset/clean）
- 依据：`.opencode/reports/qa3-5.0-backend-20261112.md`
- 范围：仅 Ground（`ground/apps/backend/src/auth/sms.ts`、`test/auth/*`、`ground/infra/production/{proxy-common,nginx-mmai}.conf`）；未改 `.github/workflows`、`mammoth-agent/**`、Grok 4 文件；未读 `.env`/凭据、未真发短信、未重启服务

## 结论

| # | 状态 | 文件:line | 验证 | 风险 |
|---|---|---|---|---|
| 1 发码接口可枚举（F1c） | 已修 | `src/auth/sms.ts:205-210`（冷却分支固定 60、无 mockCode）；对照静默 `:198-202`；mockCode 仅成功分支 `:239-246` | `test:auth` 33/33；真实 HTTP 探针：静默 == 冷却 == 预置 35s 冷却，响应逐字节相同 `{"ok":true,"retryAfterSeconds":60}` | 低：前端仅用于倒计时（`Login.vue:169`），回 60 更保守 |
| 2 proxy-common 超时过宽 | 已修 | `infra/production/proxy-common.conf:1-10`（只收紧 connect=10s，读/写回落 nginx 默认 60s，移除 buffering off/3600s）；`nginx-mmai.conf:33-44` 新增 `location ~ ^/api/v1/` 独占 buffering off + 3600s，并置于通用 Ground 正则之前 | `nginx -t` successful（docker nginx:alpine）；`nginx -T` 合并配置核对：仅 `^/api/v1/` 有 `proxy_buffering off`+3600s，其余 Ground location 无覆盖 → 默认 60s | 中低：`/console/api/v1/*`（当前仅 models 列表）走 60s；若未来 Web 端改走 console 前缀做 SSE 需再加 location |
| 3 测试空洞 | 已补 | `test/auth/sms.unit.test.ts:40,81,97,162,247`；`test/auth/sms-auth.spec.ts:160,325`；`test/auth/fake-sms-store.ts:2,95` | `test:auth` 26 → **33 pass / 0 fail**；4 类空洞各有对应用例 | 低 |

## 详细证据

### 1. `sms/send` 静默/冷却响应等价

改动（`src/auth/sms.ts`）：

- 静默分支 `:198-202`：`{ ok: true, retryAfterSeconds: COOLDOWN_SECONDS }`（不变）
- 冷却分支 `:205-210`：不再计算真实剩余秒数、不再带 `mockCode`，同样返回 `{ ok: true, retryAfterSeconds: COOLDOWN_SECONDS }`
- 成功发码分支 `:239-246`：`mockCode` 只在 `provider==='mock' && !production` 时出现（不变）
- 并发唯一索引兜底 `:226` 也是固定 60、无 mockCode

HTTP 探针：用 **dist 产物 + 真实 Nest**（AuthController + AuthService + 真实 ValidationPipe + ApplicationExceptionFilter + 全局前缀 `api`）起 127.0.0.1 随机端口，Prisma 用内存桩（不连库、不读 `.env`），`SMS_PROVIDER=mock`、`NODE_ENV=development`。`POST /api/auth/sms/send`：

| 场景 | 状态 | body |
|---|---|---|
| 未注册 + login（静默） | 200 | `{"ok":true,"retryAfterSeconds":60}` |
| 已注册 + login 首次（确实发码） | 200 | `{"ok":true,"retryAfterSeconds":60,"mockCode":"123456"}` |
| 已注册 + login 立即重发（冷却） | 200 | `{"ok":true,"retryAfterSeconds":60}` |
| 已注册 + 预置 35s 前活码（冷却） | 200 | `{"ok":true,"retryAfterSeconds":60}` |
| 未注册 + register（确实发码） | 200 | `{"ok":true,"retryAfterSeconds":60,"mockCode":"123456"}` |

`SILENT_EQ_COOLDOWN=true`、`SILENT_EQ_SEEDED=true`（逐字节相等，字段顺序 `ok,retryAfterSeconds` 一致）；`COOLDOWN_HAS_MOCK=false`、`FRESH_HAS_MOCK=true`。

### 2. nginx 作用域

- `proxy-common.conf` 现只剩公共 header + `proxy_connect_timeout 10s`；**明确注释**不能在此写 read/send，否则与 SSE location 叠加成 `directive is duplicate`（首版即因此 `nginx -t` 报错，已改）。
- `nginx-mmai.conf:33-44` 新增窄 location：

```
location ~ ^/api/v1/ {
    proxy_pass http://127.0.0.1:33100;
    include /www/mmp-prod/proxy-common.conf;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

- 位置在 `location ~ ^/api/(auth|billing|v1|...)` 之前（regex location 按出现顺序匹配），`nginx -T` 展开顺序已核对。
- 长连接来源：`src/llm/llm-chat.controller.ts:19` `@Controller('v1')` + `llm-chat.gateway.service.ts` 逐块 `res.write`。

验证：

```
$ docker run --rm -v <infra/production>:/www/mmp-prod:ro -v <wrapper>:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

`nginx -T` 关键行：`:164 location ~ ^/api/v1/` → `:167 proxy_buffering off`、`:169 proxy_read_timeout 3600s`、`:170 proxy_send_timeout 3600s`；`:173` 通用 Ground 正则仅 `include proxy-common.conf`（无 3600/无 buffering off）。`/console/api/`、`/admin/api/`、`/api/pay/`、`/api/health`、`/api/version` 均已回落默认 60s。

> wrapper 与仓库内文件均放临时路径，验证后已删除；仓库仅 2 个 conf 被修改。

### 3. 测试补齐（`pnpm --filter @mammoth/backend test:auth`）

新增 7 例（26 → 33）：

| 空洞 | 用例 | 断言要点 |
|---|---|---|
| ① TTL | `sms.unit.test.ts:40` | `SMS_CODE_TTL_SECONDS === 300` 且真实落库 `expiresAt-createdAt === 300_000`（改常量必红）；`fake-sms-store.ts:95` 的 seed 默认值改用同一常量，避免测试自证 |
| ① 附带 | `sms.unit.test.ts:81` | 静默分支与冷却分支 `deepEqual`，键顺序仅 `['ok','retryAfterSeconds']` |
| ② `SMS_UNAVAILABLE` 真实路径 | `sms.unit.test.ts:97`（未知 provider，dev，未触库）<br>`sms.unit.test.ts:247`（tencent 通道抛错 → 丢弃未核销行）<br>`sms-auth.spec.ts:160`（真实 `SmsCodes.send` 抛错 → 真实 `ApplicationExceptionFilter` → 400 body `SMS_UNAVAILABLE` + 中文 message + `statusCode/requestId`） | 覆盖配置错误与发送失败两条真实路径，不再只靠人工构造 exception |
| ③ 只缺模板 ID | `sms.unit.test.ts:162` | 三把密钥齐、三处模板全空 → message 同时含 `TENCENT_SMS_TEMPLATE_ID_LOGIN/REGISTER`，且不含 `SECRET_ID/SECRET_KEY/SDK_APP_ID` |
| ④ client-register 成功路径 | `sms-auth.spec.ts:325` | 正确码建号：`user.create`/`tenant.create` 各 1；码核销 `updateMany({id:'code-1',consumedAt:null})` 且 `data.consumedAt` 为 Date；audit 1 条 `client_register`（userId/tenantId/ip）；返回 `token='signed-token'` + 会话 |

结果：`tests 33 / pass 33 / fail 0 / duration_ms 1793`。
`tsc --noEmit -p tsconfig.json` 仍为仓库既有 `test/official-skill/*` 错误，过滤 `test/auth|src/auth/sms` **0 条**；`nest build`（`pnpm --filter @mammoth/backend build`）通过。

## 未验与原因

1. **生产 nginx reload / 1h 长连接实测**：未在服务器执行（不部署、不重启），仅 `nginx -t` + `nginx -T` 静态/合并配置证据。
2. **真实腾讯短信**：无凭据、禁止真发；仅注入桩。
3. **完整 AppModule / 浏览器 GUI**：探针只挂 AuthController+AuthService+真实 pipe/filter，不加载 `.env`、GlobalConfig、健康检查。
4. **变异实验**：未通过改源码跑“改坏看红”（禁止用 shell 改源码）；TTL/冷却/配置模板用例均以字面量或字段集合钉死，静态可判定会变红。
5. **`/console/api/v1/` 流式**：当前 Web 端无 `chat/completions` 调用（仅 models 列表），保持 60s；若后续 Web 端流式化需补 location。

## 剩余风险

- `proxy-common.conf` 不再显式写 read/send 60s，依赖 nginx 默认值（官方默认即 60s）。若未来全局 `nginx.conf` 改默认值，普通 API 预算会随之变化；已在文件内注释约束。
- agent `/` 仍走 `proxy-common-long.conf`（3600s），属 mammoth-agent 侧，本轮未动。
- `sms/send` 静默分支仍返回 `ok:true` 且前端提示“验证码已发送”（既有行为，非本轮引入）。

## 交接

- **秋池**：复验 F1c 真实 HTTP 两分支逐字节一致；确认 `nginx -T` 作用域。
- **浪哥**：复审 `sms.ts:198-210` 等价性与 `nginx-mmai.conf:33-44` location 顺序/默认超时依赖。
- **DeepSeek**：F1b（sms-login 耗时）、F1d（bcrypt 时间差）、F2'（OIDC 重定向）仍待裁决，本轮未动。
