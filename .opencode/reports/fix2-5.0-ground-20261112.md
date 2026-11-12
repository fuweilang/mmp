# 5.0 Ground 侧修复（F1 / legacy 绕过 / 稳定错误码 / 测试）

- 角色：李庚（架构 + 唯一开发）｜2026-11-12 America/Los_Angeles
- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.0`，基线 HEAD `58ec00c2`（未 commit/push/切分支；未改 CI，未碰 `mammoth-agent/**` 与 Grok 的 4 个文件）
- 范围：`ground/apps/backend/src/auth/**`、`src/main.ts`、新增 `src/startup-check.ts`、`test/auth/**`、`package.json`；`ground/infra/production/proxy-common.conf` 仅核对未改
- 未读 `.env`/凭据；未真发短信；未启动/重启任何用户服务；未连生产库

## 结论

F1 枚举、legacy 绕过、稳定错误码、启动级断言、测试覆盖 5 项已落地并通过自测；`proxy-common.conf` 的 buffering off/3600s 判定为本次 SSE 必需，保留并在此说明。CI 接入未授权，未动。

## 变更清单

| # | 状态 | 文件:line | 改法 |
|---|---|---|---|
| 1 F1 | 完成 | `src/auth/auth.service.ts:267-281` | `openSmsSession` 把「用户不存在/停用」「无活码/过期」「错码/锁定/已用」全部折叠为同一 `SMS_INVALID` +「手机号或验证码错误」；仅吞 `BadRequestException`，其它异常原样上抛 |
| 2 legacy | 完成 | `src/auth/auth.service.ts:57-62`；`src/auth/dto/login.dto.ts:40-49`；`src/auth/auth.controller.ts:49-53`（签名不变） | `client-register` 缺/空白 `smsCode` → `CLIENT_TOO_OLD`（message 提示升级），在访问 DB 前抛出；有码强制 `verify(...,'register')`；删除 legacy 分支与 `client_register_legacy` 审计；DTO 改 `@IsOptional @IsString`（格式校验放服务层，缺失码才能返回稳定码而非通用 400） |
| 3 错误码 | 完成 | `src/auth/sms.ts:6-19`（类型+`smsError`）、`:85,141,153,170,191,194,241,255-268` | 统一 `SMS_RATE_LIMITED` / `SMS_INVALID` / `SMS_CODE_EXPIRED` / `SMS_UNAVAILABLE` / `CLIENT_TOO_OLD`；`message` 全部保留中文；`ApplicationExceptionFilter` 原样展开 `{code,message}`（新增用例断言 400 响应体） |
| 4 测试 | 完成 | `test/auth/sms.unit.test.ts`、`test/auth/sms-auth.spec.ts`、`test/auth/startup.spec.ts`、`test/auth/fake-sms-store.ts`；`package.json:16` | 覆盖见下表 |
| 5 proxy | 保留并说明 | `infra/production/proxy-common.conf:7-11` | Ground 自身提供 OpenAI 兼容流式网关（`src/llm/llm-chat.controller.ts:19` `@Controller('v1')`；`llm-chat.gateway.service.ts:544-567` 逐块 `res.write`），nginx `nginx-mmai.conf:39-42` 将 `^/api/(…|v1|…)` 反代到 Ground 并 include 本文件。故 `proxy_buffering off` + 3600s 是流式必需，非误改；`proxy-common-long.conf` 未动 |
| 6 启动断言 | 完成 | `src/startup-check.ts:8-10`；`src/main.ts:11,59` | 抽出 `runStartupChecks()`，`main.ts` 在 `NestFactory.create` 之前调用；测试含真实子进程启动（生产缺 provider 时 exit 1 且不出现 `Local: http://localhost`）+ 源码顺序守卫 |

## 测试覆盖（`test/auth/`）

| 需求 | 用例 |
|---|---|
| dev mock 固定码 123456 | `sms.unit`「fills the local mock code…」 |
| prod 缺 `SMS_PROVIDER` / `=mock` 拒绝启动 | `sms.unit`「fails closed…」×2、`startup.spec`「assertSmsConfig still rejects mock」 |
| prod 真实验证码校验（桩，不真发） | `SmsCodes` 新增可注入 `deliver`（`sms.ts:174-181`），`sms.unit`「sends a random code through the injected channel…」断言 `mockCode===undefined`、随机 6 位、hash 一致、可核销 |
| 过期码 / 复用码 / 错码 / 缺失码 | `sms.unit`「rejects expired, reused, wrong and missing codes with stable codes」 |
| 5 次锁定 | 「locks the code after five wrong attempts」→ `SMS_RATE_LIMITED` |
| 60s 冷却（换 IP 仍冷却） | 「enforces the 60s cooldown per phone even from another IP」 |
| IP+手机号双维度限流 | 「enforces the IP limit across different phones and the phone limit across different IPs」 |
| client-register 缺码被拒且不建号 | `sms-auth.spec` 3 条：缺码/空白码（prisma 完全未被访问）、畸形码、6 位无对应码 → `user.create`/审计 0 次 |
| F1 三态一致 | `sms-auth.spec`：未注册 / 无活码 / 错码 / 停用账号 四种响应 `deepEqual` = `{code:'SMS_INVALID',message:'手机号或验证码错误'}` |
| 环境隔离（同代码 dev/prod 相反） | `sms.unit`「behaves oppositely in dev and production for the same input」；启动断言在 dev 为 no-op、prod 抛错 |
| 启动断言回归 | `startup.spec` 4 条；已人工注释 `main.ts:59` 后复跑：子进程用例 `✖`（24 pass / 1 fail），恢复后全绿 |

## 验证命令与结果

| 命令（cwd） | 结果 |
|---|---|
| `pnpm --filter @mammoth/backend test:auth`（`ground/`） | **26 pass / 0 fail**，duration ≈0.8s |
| 同命令，临时注释 `runStartupChecks()`（`main.ts:59`） | **24 pass / 1 fail**（真实入口子进程用例），恢复后 26 pass —— 证明用例能抓该回归 |
| `pnpm verify:api`（`ground/`，即 `nest build`） | 通过（仅 prisma 旧配置弃用 warning） |
| `git status --short -- .github` | 无改动（CI 未授权，保持待决） |

未起 Nest 服务、未跑真实 HTTP：避免加载用户 `.env` 与服务端口。错误码已通过 `ApplicationExceptionFilter` 单测证明进入响应体。

## 未验与原因

1. **真实 HTTP 端到端**（cookie/`req.ip`/审计）：未启动后端实例（不重启用户服务、不读 `.env`）。
2. **真实腾讯短信通道**：无凭据，不真发；生产分支仅用注入桩验证随机码与核销逻辑。
3. **真实生产容器启动**：需真实 `production.env`+DB；仅子进程级 fail-closed 证据。
4. **nginx `-t` 本轮未复跑**：`proxy-common.conf` 本轮零改动，qa2 已对同内容做过真实 `nginx -t`。
5. **PeecAI 参考目录**：`/Users/fuweilang/Documents/code/PeecAI` 读取被沙箱拒绝（external_directory），未读；现有实现已满足任务书所述策略：`mock|tencent`、默认 `123456`、TTL 300s、冷却 60s、5 次、IP 20/h、签名 `猛犸世纪`、未引入 aliyun。

## 剩余风险

- **F1 残余侧信道（F1b）**：登录路径 DB 查询次数/耗时仍可能区分号码状态；文案与码已完全一致，未做等时化（本轮未授权范围）。
- **限流粒度**：手机号 5 次/小时在 60s 冷却下突发不可达（qa2 F6），行为未变。
- **CLIENT_TOO_OLD 依赖桌面端展示**：后端已给稳定码与中文 message；桌面端（另一路）需按码提示升级，本轮不改 `mammoth-agent/**`。
- **长超时副作用**：所有 Ground API 连接可挂 1h；用于 SSE 必需，若后续拆分可只给 `^/api/v1` 单独长超时。
- `smsCode` 缺失不再被 ValidationPipe 拦，改由服务层判定；非字符串（数字/对象）仍走通用 400，无稳定码（旧客户端只发 5 字段，不受影响）。

## 交接

- **秋池**：复验 `pnpm --filter @mammoth/backend test:auth`（cwd=`ground`）；关注 F1 四态一致与缺码不建号。
- **浪哥**：复审 `openSmsSession` 折叠范围（是否应保留「尝试次数过多」提示）与 `CLIENT_TOO_OLD` 最小边界。
- **DeepSeek**：F1b 是否做等时化；`proxy-common.conf` 是否长期作用于全部 Ground API。

## 仍需用户决定（未做）

1. **CI 接入**：`ground/.github/workflows/ci.yml` 未授权，未改；是否把 `test:auth` 加进 api job 并纳入 `5.0` 触发分支。
2. **旧桌面客户端升级策略**：当前仅「拒绝 + 提示升级」，无宽限期/降权；如需过渡期体验需产品给完整策略。
3. **F1b 等时化**与**手机号维度限额口径**（5/h vs 冷却）是否本轮处理。
