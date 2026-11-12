# 5.0 QA 待修清单（等 Grok Build 收工后再交李庚）

状态：**冻结**。Grok Build 正在直接改 5.0 的发版 bug，李庚本轮不写任何业务源码，秋池不再跑测试。
恢复条件：用户确认 Grok 已写完。

QA 报告：`.opencode/reports/qa-5.0-backend-20261112.md`、`.opencode/reports/qa-5.0-desktop-20261112.md`

## P0（1 条，两报告重复命中）
1. `ground/apps/backend/src/auth/sms.ts:42-52,131-156` — 生产未设 `SMS_PROVIDER` 默认 mock，未鉴权 `/api/auth/sms/send` 回显 `mockCode=123456` → 任意已注册手机号可登录（含超管）。修法：启动时生产强制真实通道 + fail-closed；`mockCode` 双门 `NODE_ENV!=='production'`；`production.env.example` 与 release preflight 补短信配置。

## P1
2. 无限流真实 IP：`src/main.ts` 无 `trust proxy` → 20 次/小时变全站共享，可被人 20 请求打停全站发码。修法：`app.set('trust proxy', 1|'loopback')`，限流叠加 phone+IP。
3. 产物改名不全链路：`electron-builder-config.mjs:122` 改 `mammoth-ai-*`，但 `package-macos.ts:113`、`retain-desktop-ci.ts:62`、`desktop-build-version-discovery.ts:34,110`、`installed-update-distribution.ts:55` 仍用旧名 → 公证打包/CI/版本发现/更新 feed 失效；相关 fixture 仍旧名所以单测假绿。
4. `/api/pay/notify` 未进 nginx 正则（`infra/production/nginx-mmai.conf:33`），支付回调落到 Harness 端口。

## P2（李庚侧）
5. 短信码核销非原子（`sms.ts:158-169`、`auth.service.ts:211`）→ 并发一码多会话；先消费后建号（`:38,53`）失败也烧码。
6. 未鉴权接口区分手机号已注册/未注册 → 可枚举。
7. `sms_verification_code` 无过期清理、无 `(sendIp,createdAt)` 索引、无 phone+scene 部分唯一约束。
8. `test/auth/sms.unit.test.ts` 未接入任何 script/CI。
9. `nginx-mmai.conf:57-62` bin 下载 `Cache-Control` 缺 `always`。
10. 更新协调器：自动轮询发 `checking`/`error`（`update-coordinator.ts:206-221`、`update-schedule.ts:20`）与"后台安静检查"文案矛盾；检查失败不清 `candidate/releaseNotes`（`:199-221`）。
11. 欢迎页/账号错误文案硬编码中文（`welcome-window.ts:126,133`、`account-backend.ts:148`、`main.ts:1268`、`deepseek-account-platform:676-699`）→ en/ja 界面显示中文。
12. `Login.vue:254` 无 loading 守卫，连点/回车重复提交，第二次提示"验证码已过期"。
13. `client-register` 新增必填 smsCode → 旧桌面客户端 400，需版本化或强制更新门禁。
14. `RoleTable.vue:129-137` super_admin 禁用编辑但删了提示。
15. `desktop-upload-run.ts:58-64` 加 `x-cos-forbid-overwrite` 后重试 409 不幂等。
16. 8 locale 中 ja/es/fr/de/ru/pt 新 key 回退英文。

## 基线红（非本次 diff，需 owner 先修）
- `ui-settings-account` 9 fail（`browser-login.client.spec.ts:84`、en/zh 断言，`DEFAULT_LOCALE='zh'`）
- account-platform 40 fail（`account: network`）
- publication-preflight 2 个 sha 快照

## 通过项
短信 10 例（冷却/过期/锁定/重放/scene/未注册/20 上限/DTO）、权限矩阵 4 例（超管 14 键、平台管理员 6、企业管理员 8、成员空、跨企业隔离、catalog 无孤儿）、`prisma validate` 与迁移 DDL 一致、tsc/vue-tsc 0 error、nginx SSE 关缓冲 3600s、桌面更新状态机与欢迎页中英快照、发布脚本 dry-run、IPC 注册注销成对。

## 阻塞（需用户提供）
隔离 `DATABASE_URL`、真实腾讯短信凭据、nginx 二进制、GUI/桌面实机与真实上传发布。
