# 任务

听用户指令再做下一项。不要并行开 2。

## 1. 规格

- [x] 写本目录。不另写产品文档。不叫林杰。
- [x] 按当天决策更新：客户端在本机可登录也可注册，账号只在中台；两端用户管理都能看到。规格不再写「客户端只有登录」。

## 2. 官网包

- [x] 核对官网安装包是否含 `60859f3`、`499b428`。Mac arm64 已含：壳里有 `.bundle-sha256` 和 `OCTOP_MAMMOTH_OIDC_ISSUER`，运行时里有 `/mammoth/console-link`。包时间 2026-10-25 21:09，晚于两笔提交。不重打，不换宝塔。
- [x] 不含则重打。本次跳过。
- [x] 浪哥不审。没有新 diff。

## 3. 本机登录与注册

- [x] 客户端薄表单，停在本机，两个页签：密码登录 / 注册，选中蓝底 `#2563eb`，对齐中台 `/login`。本机 Octop 代调中台，再在服务端走完现有 OIDC。未改 Nest。
- [x] 登录代调 `POST /console/api/auth/login`；注册代调现有 `POST /console/api/auth/register`，字段 `name` / `phone` / `password` / `enterpriseName`。未新增接口或字段。
- [x] 禁止 WebView 跳到官网 `/login` 或 OIDC 授权页。AuthGuard 首屏在本机时进 `/login`，不进 `/setup`，也不跳授权页。
- [x] 现有接口可以换成 Octop 会话，没有停手。
- [x] 注册后中台和 Octop 两侧用户管理都能看到；密码只在中台，Octop `users` 只是影子用户。

## 4. 企业控制台

- [x] 不新做。登录成功仍写入 `console_handoff` token，沿用一次性票。单测覆盖了写入。没有在 Chrome 里实点。

## 5. 旧运行时

- [x] 现官网 Mac 包已有 `.bundle-sha256`。本次没有新打包，没有改 `~/.octop` 目录名。新登录代码还不在官网包里。

## 6. 验收

- [x] 秋池这次不叫。没有新官网包，也没有客户那台干净电脑。
- [x] 本地已跑：`test_sso_service` 两条桌面登录、`test_exempt_paths`、`mammothSso.test.ts`、dashboard `tsc -b`。
- [ ] 注册链路补专测：`desktop-register` 目前只有 exempt-path 断言和前端 `mammothSso.test.ts`，后端 `register_with_platform` 没有专属单测。

## 7. 发包前

- [x] 浪哥审过。P0 已补：AuthGuard 不再把干净客户端送进本地向导。公网经 nginx 调 desktop-login 会 403。没有再审第二轮。不换宝塔包。

## 8. 旧版本 App 清理（与 1.1.1 同批）

只动 `desktop/`，不碰 dashboard RBAC 与 ground。

- [x] 启动检测：同 bundle id 或旧「猛犸AI」App 仍在 `/Applications`、`~/Applications` 时识别出来（复用 `dual_install_darwin.go`，并排除当前运行的 .app，避免删到自己）。见 `legacy_app.go`。
- [x] 提示界面：走 shell 自带 `assets/{index.html,index.js,index.css}`，文案进 `desktop/src/assets/copy.json`，中英 66 key 对齐。设置页单行两态：命中时「移到废纸篓 / 稍后再处理」，未命中时「检查旧版」。
- [x] 「移到废纸篓」：`osascript` 让 Finder 删除（进废纸篓可还原），全程无 `rm -rf`；失败自动打开所在文件夹并提示手动删除。
- [x] 「稍后再处理」：写 `~/.octop/config.json` 的 `desktop_legacy_app_dismissed`（保留其它 key），设置页「检查旧版」可再次触发。
- [x] 不静默删除、不阻塞启动：检测放 goroutine 并有 5s 超时，命中才弹设置窗口；旧版自启清理也挪到后台。
- [x] 日志：命中、延后、移除成功/失败、超时全部 `log.Printf`。
- [x] 非 darwin/windows 平台 no-op（Windows 按你最新要求走注册表 `UninstallString` 静默卸载，找不到只提示去「设置-应用」卸载，不手删目录）。
- [x] 版本号 bump 至 1.1.2，`CHANGELOG.md` 的 `[Unreleased]` 已记。
- [x] **验收要点**：`go test ./...` 覆盖废纸篓拒绝删当前 App、`config.json` 保留其它 key；新旧并存时的 GUI 弹窗未在本机实跑（本机没有第二个同 bundle id 的 App）。

## 9. 客户端调中台控制台接口 401（跨站 cookie 丢失）

线上证据：罗总 2026-10-28 15:07–15:28，`/console/api/auth/me`、`/console/api/usage/quota`、`/console/api/kb/search`、`/console/api/usage/events` 连续 401。

- [x] 根因记录：客户端页面在 `http://127.0.0.1:8088`，调 `https://www.mmai.vip/console/api/*` 只用 `credentials: "include"`（`dashboard/src/api/modules/mammothConsole.ts` 的 `consoleJson`）；ground 侧 cookie 是 `sameSite: 'lax'`（`ground/apps/backend/src/auth/auth.service.ts:161,221`），跨站请求不带 cookie → 一律 401。
- [x] 采用 Bearer 方案，ground 的 cookie 与 CORS 一行未动。
- [x] Octop 侧：新增 `GET /api/auth/mammoth/console-token`（`api/routers/auth_oauth.py` → `SsoService.console_bearer_token`），取 `mammoth.console_handoff.{user_id}`，登录态校验，缺失/过期返 401（`ErrorCode.TOKEN_EXPIRED`）；日志只记原因，不记 token。
- [x] dashboard 侧：`consoleJson` 带 `Authorization: Bearer`；遇 401 重取一次凭证并重试，仍 401 抛 `ConsoleAuthError`，不再静默 `return null`。
- [x] 静默失败改掉：无凭证/过期/网络三种情况分别抛明确错误，调用方能区分「没登录」与「真没数据」。
- [x] **验收要点**：单测覆盖 token 正常 / 缺失 / 过期（`tests/unit/api/test_console_token.py`、`tests/unit/auth/test_sso_service.py`）；真实 `www.mmai.vip` 与罗总那台机器未复测。

## 10. 客户端启动报错回传服务端

原则：**本地先写入文件，上传是尽力而为**。客户端自己都打不开时，不能指望它当场把错误发出去；也不能因为发不出去就丢掉。

- [x] 客户端本地**先写入文件**：shell 启动阶段写 `~/.octop/logs/client-boot.jsonl`（`desktop/src/boot_log.go`），dashboard probes 由 `bootDiagnostics.ts` 走本地 `POST /api/client-log` 落到同一文件；1MB 滚动，只保留两份。
- [x] 上传是**尽力而为 + 重试队列**：健康检查通过后 shell 把 `uploaded:false` 的行逐条 POST 到 `POST /api/client-log`，首批最多 40 条，失败即停、下次启动补传；不阻塞启动、无无限重试。
- [x] Octop 服务端新增 `POST /api/client-log`（`api/routers/client_log.py`）：收 `{shell_version, runtime_version, platform, phase, last_error, probes, ts}`；access log 中间件照常记真实 IP + 用户，另起一条 `client-boot` 摘要日志（版本 + phase + 截断错误 + probe 状态码）；probe 只留状态码不留 body。
- [x] 兜底导出：诊断面板保留「复制诊断」，新增「导出日志文件」（`GET /api/client-log/export`，两份滚动文件一起下载）。
- [x] 限流：同一 IP 每分钟 12 条，超出 429。
- [x] 敏感内容：token / cookie / password / `Bearer xxx` 在三处（Go 落盘、Python 落盘、日志）统一正则脱敏，body 不入库。
- [x] **验收要点**：`tests/unit/api/test_client_log.py` 覆盖落盘、脱敏、限流、导出；`boot_log_test.go` 覆盖滚动与补传标记。真机断网恢复未跑。

## 明确不做

- [ ] 分仓
- [ ] 拆 Octop 大文件
- [ ] 藏 Octop 用户页、模型配置归中台
- [ ] `pnpm dev` 收成两条
- [ ] PeecAI 接入
- [ ] 改产品数据目录
