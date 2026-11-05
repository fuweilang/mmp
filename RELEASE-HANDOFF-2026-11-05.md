# 猛犸发布任务（宝塔生产 + 客户端安装包）

## 0. 背景

仓库根：`/Users/fuweilang/Documents/code/mmp`（一个 git 仓库，当前分支 `1.0`，含 `ground/` 中台和 `mammoth-agent/` 智能体两个子项目）。
2026-11-05 本地完成了一批改动，**全部未发布、未提交**。任务：先提交，再按既定流程发布到宝塔生产（www.mmai.vip），并重新打包三个客户端安装包。

发版前先读并遵守 `.opencode/skills/baota-release/SKILL.md`（唯一发版入口），不要凭记忆发版。

## 1. 待发布的改动清单（全部已在本地验证）

### mammoth-agent（智能体 Harness）

1. **新会话死按钮修复**：`packages/client/ui-workspace/src/client/navigation.ts` —— 无工作区时点新会话不再静默无反应，改为弹出目录选择，选定后自动建工作区开会话。测试已更新（513 条全绿）。
2. **首次引导页恢复**：`packages/client/ui-settings-account/src/client/index.ts` —— 重新注册 `desktop-onboarding` 到 `shell.overlay`（welcome→领额度→用途→流程四步），登录后且未完成时显示，Web 和桌面端都生效。
3. **默认浅色主题**：`packages/client/ui-theme/src/theme-settings.ts` —— `DEFAULT_PREFERENCE` 由 `system` 改为 `light`，首屏 CSS/启动脚本/运行时/schema 默认值一并生效；用户手动选过的偏好不受影响。相关 6 条测试断言已更新。
4. **客户端 flock 原生模块缺失修复（重要，线上正在炸）**：已打包客户端第一轮会话必报 `Cannot find module '@mammoth-ai/node-addon-system-darwin-arm64'`。根因是 `apps/desktop/scripts/package-target.ts` 只打了入口包没打平台包，且 `prepare-package-set.ts` 对缺失的可选平台包静默放行。已修：
   - 打包时补打目标平台原生包（本机同架构本地编译 pack；跨架构用 `apps/desktop/scripts/pack-registry-package.mjs` 从 npm registry 拉同版本 tarball，走 `resolveNpmRegistry`）；
   - 闭包选择加守卫：目标平台缺 flock 原生包直接报错；
   - 测试已补（84 条相关全绿，全量对比零新增失败）。
5. **Web 端下载客户端按钮**：新包 `packages/client/ui-client-download`，已注册进 web 壳（`tsconfig.client.json` references、`packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/package.json`）。下载源是同源 `/downloads/mammoth-agent-mac-arm64.dmg`、`mammoth-agent-mac-x64.dmg`、`mammoth-agent-win.exe` 和 `/downloads/mammoth-latest.json`。桌面客户端内不显示（`'mmpDesktop' in globalThis` 判定）。
6. **品牌词**：界面公司名 DeepSeek→猛犸AI/Mammoth AI（8 语言）；「深度求索」→「深度思考」类措辞；日语 DSH→MMP。
7. **圆角 logo + 桌面图标**：`apps/desktop/resources/` 的 icon.png / icon-macos.png / icon-windows.png / icon.icns / tray-windows.ico 全部重生成（圆角半径 12.5%）；`apps/desktop/src/main.ts` 加了 `applicationIconPath()`、dev 模式 macOS Dock 图标、win32 窗口图标。logo 源文件和生成脚本在 `/Users/fuweilang/Documents/code/mmp/logo-assets/`。
8. **账户面板手机号不再打星**：`AccountMenu.tsx` 全量显示手机号。

### ground（中台）

9. **登录/注册后双开**：`apps/frontend/src/views/Login.vue` —— 从客户端唤起的登录/注册成功后，当前标签页跳回客户端（localhost 回调）的同时，`window.open` 新开 Web 智能体首页；被浏览器拦截也不影响客户端回调。
10. **本地 dev 网关**：`scripts/dev-gateway.mjs` 的 `/agent*` 代理到本地 mmp web（3080），仅开发用，不影响生产。
11. 另有一批发布 tooling 改动（`docs/release/`、`infra/production/release.sh` 等）和 AI 币计费任务五~七（冻结/多退少补、企业额度、联调），提交时注意保留。

### 已知存量问题（不属于本次发布阻塞项）

- `mammoth-agent` 分支上有约 27~30 条测试失败是 1.0 分支存量（locale、CSS lint 等），改动前后数量只减不增，不要顺手修。
- `packages/client/ui-settings-account/tests/apply.client.spec.ts` 有部分 locale 相关存量失败。

## 2. 执行步骤

### 2.1 提交代码

```bash
cd /Users/fuweilang/Documents/code/mmp
git add -A
git commit -m "feat: 新会话修复/引导页恢复/浅色默认/flock打包修复/下载按钮/品牌词/图标/双开跳转"
```

（是否 push 到远端问用户；本地目前没有配置 GitHub 远端就先本地提交。）

### 2.2 发布中台 + Web 智能体到宝塔

严格按 `.opencode/skills/baota-release/SKILL.md`：

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh
./ground/infra/production/release.sh --dry-run   # 先看计划
./ground/infra/production/release.sh --yes
./ground/infra/production/smoke.sh https://www.mmai.vip
```

中断续跑：`release.sh --release-id <ID> --from web --yes`；回滚：`rollback.sh --release-id <ID> --yes`。
注意：只动 `www.mmai.vip` 和 `/www/mmp-prod`；web 镜像必须在服务器原生 amd64 构建；发版前确认 `/www/mmp-prod/.release.lock` 无锁。

### 2.3 重新打包客户端（含 flock 修复和新图标）

在**本机（macOS arm64）**执行：

```bash
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
pnpm install --frozen-lockfile
# macOS Apple 芯片（本机编译原生模块）
pnpm --dir apps/desktop run package:mac:arm64:unsigned
# macOS Intel（跨架构，脚本会自动从 npm 拉 darwin-x64 原生包，需 npm 可用、能访问 registry）
pnpm --dir apps/desktop run package:mac:x64:unsigned
# Windows
pnpm --dir apps/desktop run package:win:x64:unsigned
```

打出来的包按 SKILL.md 的 downloads 约定上传到服务器 `/www/mmp-prod/downloads/`：
- `mammoth-agent-mac-arm64.dmg`、`mammoth-agent-mac-x64.dmg`、`mammoth-agent-win.exe`
- 并更新 `mammoth-latest.json`（版本号、sha256、size），先传产物再传 latest.json，上传前备份旧 latest.json。

打包验证要点（新守卫）：如果平台原生包缺失，`prepare:packages` 会直接报错，不会再静默出坏包。

### 2.4 验收清单（全部通过才算完成）

1. `curl -s https://www.mmai.vip/console/api/version` 返回目标版本。
2. 浏览器无痕窗口打开 `https://www.mmai.vip/` → 未登录 303 到登录页。
3. 注册新账号 → toast 注册成功 → **立即跳回 Web 智能体首页** → 出现四步引导页（**浅色**主题）→ 完成后能直接点新会话（不再卡"请选择工作区"）。
4. Web 页面有「下载客户端」按钮，弹窗三个包（win / mac-arm64 / mac-x64），链接可下载。
5. 客户端点登录 → 浏览器登录成功后：当前页回客户端 + 新开 Web 首页 tab。
6. 新装的客户端（mac arm64）登录后发起会话，**不再出现** `Cannot find module '@mammoth-ai/node-addon-system-darwin-arm64'`。
7. 客户端和 Web 界面公司名为「猛犸AI」，对话中为「深度思考中」，无「深度求索」字样。
8. 账户面板手机号全量显示（无 ****）。
9. 客户端安装后图标是猛犸 logo（不是 Electron 默认图标）。
10. 引导页只出现一次：完成或跳过后重启不再出现。

## 3. 红线

- 不部署 Octop（已作废）；`/agent` 的 410 是历史配置，web 智能体现在由 `/` 承载，不要恢复旧路由。
- 不 `docker system prune -a`；不打印明文密码；不动 `/www/mammoth` 旧栈。
- 发版失败优先 `rollback.sh`，不要边查边试改服务器。

## 4. 后续待办（不在本次范围）

- 客户端/Web 全链路 HTTP 请求埋点与日志上报（落到 Ground 存储，dev/生产同构），用于线上问题快速定位。方案待出。
