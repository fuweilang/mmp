# 5.0 桌面 / 前端验收（秋池）— 2026-11-12

- 仓库：/Users/fuweilang/Documents/code/mmp，分支 `5.0`，HEAD `58ec00c2`，未提交 84 项（未改动、未 commit/stash）。
- 角色边界：只做指定范围；未读 .env/凭据；未执行真实上传、发布、electron-builder 打包；未连真实库；未起/停用户服务（5201 为既有 dev server，仅只读访问）。
- 时间：America/Los_Angeles 2026-11-12。

## 命令与结果

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run apps/desktop/tests/update-coordinator.spec.ts update-schedule.spec.ts update-presentation.spec.ts` | 3 files / 52 pass |
| `pnpm exec vitest run apps/desktop/tests/welcome-window.spec.ts welcome-renderer.client.spec.tsx desktop-upload-plan.spec.ts desktop-build-commit.spec.ts` | 4 files / 77 pass |
| `pnpm exec vitest run apps/desktop/tests/desktop-upload-plan.spec.ts desktop-build-commit.spec.ts scripts/baota-desktop-publication.spec.ts` | 3 files / 36 pass |
| `pnpm exec vitest run packages/client/ui-settings-general/tests/desktop-update-section.client.spec.tsx shell.client.spec.ts settings-root.client.spec.tsx desktop-update.client.spec.tsx` | 4 files / 65 pass |
| `pnpm exec vitest run packages/client/ui-settings-general/tests packages/client/ui-settings-account/tests` | 39 files / 9 fail（基线红，见 P2-8） |
| `pnpm exec vitest run packages/credentials/deepseek-account-platform/tests` | 18 files / 40 fail（基线红，`account: network`，见 P2-8） |
| `pnpm exec vitest run apps/desktop/tests/desktop-publication-preflight.spec.ts ...` | 2 snapshot fail（基线红，见 P2-8） |
| `pnpm exec tsx --test test/auth/sms.unit.test.ts`（ground/apps/backend） | 3 pass（mock 码、冷却、未知手机号） |
| `curl http://127.0.0.1:5201/src/views/Login.vue` | 200，48KB，含 sms；证明当前工作树 SFC 在既有 dev server 可编译 |
| 真实 GUI / 真实上传 / 真实签名公证 / 真实短信 | **未执行（阻塞）** |

## 缺陷清单

### P0-1 生产短信默认 mock，可用固定 123456 登录任意已注册手机号

- path:line
  - `ground/apps/backend/src/auth/sms.ts:42-47`（未设置 `SMS_PROVIDER` 即 `mock`，无 NODE_ENV 保护）
  - `ground/apps/backend/src/auth/sms.ts:49-52,135`（mock 码固定 `123456`）
  - `ground/apps/backend/src/auth/sms.ts:152-156`（HTTP 响应直接回传 `mockCode`）
  - `ground/apps/backend/src/auth/auth.service.ts:223-228`（`openSmsSession` 只校验短信码即建会话）
  - `ground/infra/production/production.env.example`（未列 `SMS_PROVIDER` / 腾讯云短信密钥）
- 实际：按 `infra/production` 部署且不额外注入环境变量时，`/api/auth/sms/send` 发码返回 `mockCode=123456`，`/api/auth/sms-login`、`/api/auth/client-sms-login` 接受 123456，可登录任意 active 手机号；注册同样可绕过真实短信。
- 预期：生产环境缺短信供应商时 fail-closed（拒绝启动/拒绝发码），或启动时拒绝 `mock`。
- 复现：ground/apps/backend 下 `SMS_PROVIDER` 不设置 → 观察 `smsProvider()` 返回 `mock`；单测 `sms.unit.test.ts` 首例已证明发送结果含 123456。未做真实登录。
- 建议：`smsProvider()` 在 `NODE_ENV==='production'` 时禁止 `mock`；`production.env.example` 增补短信配置并在发布 preflight 校验。

### P1-1 反向代理下 `req.ip` 恒为 127.0.0.1，短信 20 次/小时配额变成全站共享（可被一键 DoS）

- path:line
  - `ground/apps/backend/src/auth/sms.ts:9,119-121`（`IP_HOURLY_LIMIT = 20`，按 `sendIp` 计数）
  - `ground/apps/backend/src/auth/auth.controller.ts:63-64`（`sendSms(..., req.ip)`）
  - `ground/apps/backend/src/main.ts`（无 `app.set('trust proxy', ...)`，全仓 grep 无配置）
  - `ground/infra/production/compose.yml:27`（api 仅 `127.0.0.1:33100`）
  - `ground/infra/production/nginx-mmai.conf:21`（nginx 反代到本机）
- 实际：所有请求 `req.ip` 都是回环地址，任意人发 20 条验证码即耗尽全站一小时配额，之后所有用户"验证码发送过于频繁"；审计日志中的 ip 也全部错误。
- 预期：按真实客户端 IP 限流；代理链路显式 `trust proxy`（如 `loopback`）并确认 nginx 覆盖 `X-Forwarded-For`。
- 复现：nginx→api 拓扑下抓 `req.ip`；单测用固定 `sendIp` 无法覆盖。未执行网络请求。
- 建议：`app.set('trust proxy','loopback')`；限流同时按 phone + ip；补充超限 E2E。

### P1-2 产物改名 `mammoth-ai-*` 未同步到发布/保留/版本发现/公证链路，下一次打包 CI 会失败

- 改名来源：`mammoth-agent/apps/desktop/scripts/electron-builder-config.mjs:122`、`desktop-artifact-name.mjs:9`
- 未同步（仍硬编码 `deepseek-harness-`）：
  - `apps/desktop/scripts/package-macos.ts:113`：公证后从临时目录 `stat` 旧名 `.dmg/.zip/.blockmap` → 文件不存在，签名/公证 mac 打包直接失败
  - `apps/desktop/scripts/retain-desktop-ci.ts:62`：CI 保留清单用旧名 → `desktop-release-store.ts:46-49` lstat ENOENT，`.github/workflows/{macos-package,macos-intel-package,windows-package}.yml` 的 retain 步骤失败
  - `apps/desktop/scripts/desktop-build-version-discovery.ts:34,110`：正则与 COS Prefix 仍是旧名 → 本地/远端都看不到新版本，`--build-version auto` 永远建议同一 index，重复版本号（随后被 COS 覆盖保护拒绝或覆盖旧产物）
  - `apps/desktop/scripts/installed-update-distribution.ts:55`：安装更新分发只认旧名 → installed-update 资质/发布拒绝新 feed
- 实际：单测全绿是因为 fixture 仍用旧名（`package-macos.spec.ts:39`、`retain-desktop-ci.spec.ts:25-28`、`desktop-build-version-discovery.spec.ts:39+`、`tests/expected/*`），只有 upload-plan 新增用例覆盖新名（`desktop-upload-plan.spec.ts:349`）。
- 预期：所有读取/重命名/保留/发现都走 `desktopArtifactBase`；fixture 同步新名并保留 legacy 兼容用例。
- 复现：静态路径核对 + `package-macos` 单测 fixture 与 builder 实际命名对照；未运行 electron-builder。
- 建议：李庚统一改 `package-macos / retain-desktop-ci / version-discovery / installed-update-distribution`，并补一条"builder 输出名 == 保留名"的联动测试。

### P2-1 后台自动检查不再静默，与"安静检查"文案矛盾，离线下常驻错误角标

- path:line：`apps/desktop/src/update-coordinator.ts:206-207`（每次 `doCheck` 都 `setState({phase:'checking'})`）、`:221`（自动失败也发布 error）；`apps/desktop/src/update-schedule.ts:20`（默认 10 分钟一次，退避上限 1 小时）；`packages/client/ui-settings-general/src/client/update-locales.ts:17`（"Background checks are quiet…"）；`DesktopUpdateIndicator.tsx:68-75`（非 idle 即显示角标）
- 实际：每 10 分钟侧栏闪一次"检查更新"；某次自动检查失败后，角标显示错误/重试并可能持续到下一次成功（最长 1 小时）。
- 预期：自动检查静默（或改文案/仅在有更新时显示）；手动检查才展示进度与失败。
- 证据：`tests/update-schedule.spec.ts` 本次把断言改成包含 `checking/error`，即行为变化已被测试固化。
- 建议：自动轮询传入 quiet 标记，仅发布 available/ready；或明确产品决定后修改文案与角标策略。

### P2-2 检查失败后仍保留旧 candidate 与 releaseNotes，错误页展示过期目标版本

- path:line：`update-coordinator.ts:214-218`（成功才写 `candidate/releaseNotes`）、`:220-221`（失败不清空）、`:199-201`（`target()` 返回旧 candidate）
- 实际：先检测到 X 可用，再手动检查断网 → 状态 `error/check` 仍带 `version: X` 和旧发行说明，设置页显示"目标版本 X"与旧 notes，但下载按钮不可用。
- 预期：检查失败清空目标/说明，或明确标注"上次已知"。
- 建议：catch 中 `candidate = undefined; releaseNotes = undefined`（或记录 lastKnown 字段）。
- 证据：现有单测只断言 `checked=false`，未覆该显示；可按上述 fixture 复现。

### P2-3 新增桌面/账号错误文案硬编码中文，非中文界面显示中文

- path:line：`welcome-window.ts:126,133`、`account-backend.ts:148`、`main.ts:1268`、`deepseek-account-platform/src/index.ts:676,685,689,699`；渲染端直接展示 `WelcomePage.tsx:158-159`
- 实际：en/ja/es 等界面在短信发送失败/服务不可用时显示"短信服务暂不可用""验证码发送失败"等中文。
- 预期：main/host 返回 reason 码，渲染端用 locale 字典取文案（或按 locale 传 messages）。
- 建议：主进程只回 `reason`，文案留在 `locale.ts`；Welcome 页对 `message` 做字典映射。

### P2-4 Login.vue 提交中可再次提交（回车/连点）导致重复注册与误导性错误

- path:line：`ground/apps/frontend/src/views/Login.vue:254`（`onSubmit` 无 `loading` 早退）、`:287-299`（注册提交）、模板 `:button :loading`（仅按钮态）
- 实际：首次提交后 `loading=true`，但回车仍可再次触发表单 submit；第二次注册时短信码已被消费 → 注册成功后又弹"验证码不存在或已过期"，并可能重复发请求。
- 预期：提交中忽略新提交（`if (loading.value) return`）或禁用表单。
- 复现：既有 dev server 已编译该 SFC；无浏览器自动化工具，未做真机点击，按代码路径判定。
- 建议：`onSubmit` 首行加 loading 守卫；`sendCode` 再补 `sendingSms` 守卫（已有 disabled）。

### P2-5 `/api/auth/client-register` 变为短信码必填，已安装旧桌面客户端注册失败

- path:line：`ground/apps/backend/src/auth/dto/login.dto.ts:35-39`（`PublicRegisterDto extends RegisterDto`，`smsCode` 必填）、`auth.controller.ts:49-52`（client-register 使用该 DTO）、`auth.service.ts:50-56`
- 实际：旧桌面版本（本次改动前的 `requestClientRegister` 只发 name/phone/password/enterpriseName/slug）升级服务端后注册返回 400。
- 预期：版本化端点/兼容缺省码，或强制更新后再启用。
- 建议：为旧客户端保留无 smsCode 的旧端点并在过渡期限流，或发布前置检查最低客户端版本。

### P2-6 RoleTable 对 super_admin 仅灰掉编辑按钮，移除原因提示

- path:line：`ground/apps/frontend/src/components/admin/roles/RoleTable.vue:129-137`（`canEditRow` 仍拒绝 super_admin，`editHint` 删掉"超级管理员角色不可编辑"）、模板 `:55-57`（tooltip 在 hint 为空时禁用）
- 实际：super_admin 行编辑按钮禁用且无任何说明；其余角色提示保留。
- 预期：保留提示，或本次确实要放开 super_admin 编辑（则需同步 `canEditRow` 与 `AdminRoles.vue:344`）。
- 建议：恢复 hint 一行，或在同一改动里放开编辑并说明。

### P2-7 上传开启 `x-cos-forbid-overwrite` 后，同版本重试会被判 FileAlreadyExists

- path:line：`apps/desktop/scripts/desktop-upload-run.ts:58-64`（版本化对象加 `x-cos-forbid-overwrite: true`）、`:12-13`（FileAlreadyExists 归类）、`:114-117`（PUT）
- 实际：PUT 已落盘但响应丢失/进程中断后重跑，同一 key 现存 → COS 409 FileAlreadyExists，上传记录失败，需要人工删对象；"内容一致可重试"的前提未实现（未先比对 ETag/哈希）。
- 预期：同内容重试幂等（HEAD 比对后跳过），或明确记录为"待人工处理"。
- 证据：仅静态；未执行真实上传。单测只断言 header 值（`desktop-upload-plan.spec.ts` 新增用例）。
- 建议：PUT 前 HEAD + 比对 sha512/md5，或捕获 FileAlreadyExists 后 HEAD 比较。

### P2-8 分支测试基线红（非本 diff 引入，但不能作为本 diff 的回归证据）

- `packages/client/ui-settings-account`：9 fail。`browser-login.client.spec.ts:84`（与 locale 无关）；其余 8 处是 spec 断言英文、产品默认 locale 为 `zh`（`packages/client/locale/src/client/index.ts:102-109` `DEFAULT_LOCALE='zh'`），涉及 `quota-notice-hold.client.spec.tsx:202/354`、`onboarding.client.spec.tsx:45` 等。本 diff 只把 `quota-notice-hold.client.spec.tsx:260` 的 en 改成 zh，未修其余。
- `packages/credentials/deepseek-account-platform`：40 fail，`account: network`（`src/index.ts:440`），相关 spec 未修改。
- `apps/desktop/tests/desktop-publication-preflight.spec.ts`：2 个 snapshot 的 feed sha256 不匹配但字节数相同（276），spec 与 expected 均未修改，且本 diff 的 `mmpRelease` 仅在 build record 含 branch+builtAt 时写入（fixture 无）。
- 结论：以上是 5.0 工作树既有红，不能计为通过，也不是本次改动引入；但会让"额度提示持久/登出清理"无法用测试验证。
- 建议：由各自 owner 先修基线（locale 用 zh 断言或显式设置 preference；刷新 publication snapshot），再跑本 PR 回归。

### P2-9 新增更新/账号文案只提供中英，其余 6 个 locale 直接回退英文

- path:line：`packages/client/ui-settings-general/src/client/update-locales.ts:1-18`（ja/es/fr/de/ru/pt 全部 `...updateEn`）、`packages/client/ui-settings-general/src/client/locales.ts:101-340`；`packages/client/ui-settings-account/src/client/locales.ts:133-390`（`versionUpdate/updateTarget/installedVersion` 在 6 个 locale 为英文字符串）
- 实际：非中英界面出现英文设置区块/菜单项；key 无缺失（脚本校验 en/zh/ja/es/fr/de/ru/pt 键集一致）。
- 预期：与既有 `desktop.update.*` 一致提供本语言文案，或明确登记为英语回退。
- 建议：补 6 语言文案或按仓库既有 language-pack 流程降级（需产品确认）。

### P3（记录不单列缺陷）SMS 表无清理与 sendIp 索引

- `ground/apps/backend/prisma/schema.prisma:1244-1261`：只有 `(phone,scene,createdAt)` 与 `expiresAt` 索引，`countSince` 按 `sendIp` 查询（`auth.service.ts:203-205`）无可用索引；过期行无清理任务，表长期增长。建议加 `(sendIp, createdAt)` 索引 + 定期清理。

## 通过项（一句带过）

- 更新状态机：检查→下载→安装分离，`runDesktopUpdateCommand` 只接受白名单动作，版本由主进程绑定；`install` 必须 ready+已下载且版本一致；`supportsDesktopUpdates` 只放行 darwin x64/arm64 与 win32 x64；重复点击由 store/coordinator 双重门禁合并（单测 52 项通过）。
- 欢迎页：中英 expected 与实际渲染一致，8 个 locale 的 8 个新 key 全覆盖；注册必须 6 位码、IPC 通道关闭时成对移除；可见文案未进 HTML（单测通过）。
- 发布计划（仅 dry-run/单测）：新品牌产物命名、legacy 旧包仍可发布、metadata 最后上传、`Cache-Control`/覆盖保护、branch/builtAt/commit 进计划与 feed 均通过；Baota 原子写/不可变拷贝单测通过。
- 设置页：版本信息从 General 迁到独立 section，旧宿主回退到旧版本行；账号菜单版本项与目标版本展示、无 rail 冗余（65 项通过）。
- 未做真实上传、真实签名/公证、真实短信、真实 GUI 点击。

## 未验与阻塞

- **GUI 视觉（Login 窄屏/倒计时、Settings 更新页、账户菜单）**：本机无 Playwright/Puppeteer 等合法浏览器自动化依赖，未用 mock 冒充；仅验证 5201 dev server 能以 200 返回并编译当前 `Login.vue`。阻塞。
- **真实桌面更新全链路（下载/安装/重启）**：需要已打包且带合法 `app-update.yml` 的安装包与更新源，未执行；拒绝 electron-builder。阻塞。
- **真实短信（腾讯云）与生产限流**：不可发送真实短信；未读生产环境变量。阻塞。
- **账号额度提示持久/登出清理**：相关 spec 基线红（P2-8），本次未获得新证据。
- **上传/发布**：仅 dry-run 单测，未触网。

## 交接

- 李庚：P0-1、P1-1（Ground 短信/trust proxy/env preflight）、P2-5、P2-6、P3。
- 王总：P1-2（产物改名链路）、P2-1/P2-2（updater 行为与文案）、P2-7。
- 甜甜：P2-3（错误文案本地化）、P2-4（登录页重复提交）、更新设置页视觉。
- 浪哥：对 P1-2 与 P0-1 做复审；基线红（P2-8）需 owner 各自修复后再验收。
