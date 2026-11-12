# 5.0 桌面修复第二轮（李庚）— 2026-11-12

- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.0`，HEAD `58ec00c2`。
- 范围：仅 `mammoth-agent/**`；未改 `ground/**`、`.github/workflows/ci.yml`、Grok 的 4 个文件。
- 未 commit/push/stash/reset/clean/切分支；未打包、未真实上传/COS/发布、未发短信、未读凭据、未起停服务/桌面。
- 时间：America/Los_Angeles 2026-11-12。

## 结论

| 编号 | 状态 | 一句话 |
|---|---|---|
| P2-11 残留中文 | 完成 | 桌面只按 `code` 映射本地文案，服务端 `message` 从共享结果类型中移除；未知/缺失 code 走通用本地化兜底 |
| 旧客户端注册提示 | 完成 | `CLIENT_TOO_OLD` 8 语言映射「当前版本过旧，请更新到最新版本」，无自动重试/重复提交 |
| 新增红 main-startup | 完成 | mock coordinator `check` 写回 `updateState`，退避断言恢复 2000ms；该 spec 由 19 fail 降为 18 fail |
| preflight fixture 旧名 | 完成 | fixture 改用 `desktopArtifactBaseForTarget`，两个快照同步新基名，2 个用例由失败转通过 |
| P3 上传日志 | 完成 | 409 命中同字节打印 `skipped(exists)`，不再误报 `uploaded` |
| 补测试 | 完成 | 新增平台侧 5 码映射 + 未知码/非 JSON 兜底；渲染端限流码、旧客户端注册码；上传 skip 日志；preflight 新名 |

## 改动清单

| 文件:line | 改动 |
|---|---|
| `packages/credentials/deepseek-account/src/types.ts:52-71` | 新增 `AccountFailureCode`（5 码）；`SmsSendResult`/`PasswordSignInResult` 失败分支改携带 `code?`，删除 `message?` |
| `packages/credentials/deepseek-account/src/index.ts:4` | 导出 `AccountFailureCode` |
| `packages/credentials/deepseek-account-platform/src/index.ts:31-49` | `readErrorMessage` → `readFailureCode`：只接受已知码，未知/非 JSON 返回 `undefined` |
| 同上 `:696-698` | `sendSmsCode`：码映射 reason，携带 code，不再透传中文 message |
| 同上 `:785,799-804,810,824,831,849` | `client-sms-login` / `client-register` / `client-login` 返回码，内部签名由 `message?` 改 `code?` |
| `apps/desktop/src/account-backend.ts:5,115-142,152-159` | 跨 IPC 校验只保留已知 code；密码/SMS 结果不再有 message |
| `apps/desktop/src/client/WelcomePage.tsx:155-161,192,207-214,225-231` | 渲染端按 code 取 8 语言文案；`CLIENT_TOO_OLD` 统一提示；未知码/无码通用兜底 |
| `apps/desktop/src/locale.ts:111-112,328-329,543-544,758-759,973-974,1188-1189,1403-1404,1618-1619` | 8 语言新增 `welcomeSmsRateLimited`、`welcomeClientTooOld`（插入位置一致） |
| `apps/desktop/tests/main-startup.spec.ts:381-390` | mock coordinator `check` 用 await 结果写回 `harness.updateState`，`lastCheckFailed` 反映真实状态 |
| `apps/desktop/tests/desktop-publication-preflight.spec.ts:3-9,27` | 基名改走 `desktopArtifactBaseForTarget('1.0.0', target)` |
| `apps/desktop/tests/expected/publication-mac-arm64.md` / `-win-x64.md` | 快照更新为 `mammoth-ai-1.0.0-*` 及新 YAML 字节（-u 生成） |
| `apps/desktop/scripts/desktop-upload-run.ts:163,182-188` | 每 artifact 记 `skipped`；日志 `uploaded` / `skipped(exists)` |
| `apps/desktop/tests/desktop-upload-run.spec.ts:5,212-222` | 捕获 stdout，断言 skip 与正常上传的不同文案 |
| `apps/desktop/tests/welcome-renderer.client.spec.tsx:211-247` | 限流码/无码兜底/无效码断言；新增旧客户端注册码用例（仅 1 次调用） |
| `apps/desktop/tests/account-backend.spec.ts:47-70` | 由 IPC 结果剥离 message、未知码丢弃的断言 |
| `packages/credentials/deepseek-account-platform/tests/sms-failure-code.spec.ts`（新） | 5 码映射、未知码、非 JSON、注册 `CLIENT_TOO_OLD` 单次请求、SMS 登录码 |

## 验证命令与结果

| 命令（workdir `mammoth-agent`） | 结果 |
|---|---|
| `vitest run welcome-renderer.client account-backend desktop-upload-run desktop-publication-preflight sms-failure-code locale.spec` | 5 files pass / 1 pre-existing fail；71 pass（最终 6 files → 79 pass，见下） |
| `vitest run sms-failure-code desktop-publication-preflight welcome-renderer.client account-backend desktop-upload-run desktop-upload-plan` | **6 files / 79 passed** |
| `vitest run apps/desktop/tests/main-startup.spec.ts` | **18 failed / 135 passed**（基线 19/134；目标用例通过，其余为既有红） |
| `vitest run packages/credentials/deepseek-account-platform/tests` | **40 failed / 283 passed**（基线 40/280，+3 新用例） |
| `vitest run packages/client/ui-settings-account/tests` | **9 failed / 406 passed**（= 基线） |
| `vitest run packages/client/ui-settings-general/tests` | **9 files / 100 passed**（= 基线） |
| `vitest run locale.spec.ts` | **1 failed**（既有 zh 键顺序 `welcomeNamePlaceholder`/`welcomeEnterprise`，未增加） |
| `vitest run desktop-artifact-name desktop-upload-plan update-coordinator update-schedule` | **4 files / 78 passed** |
| `tsc --noEmit -p`：deepseek-account / deepseek-account-platform / desktop host leaf / desktop client leaf | **0 error** |
| `tsc -b` 重建上述项目依赖声明后：`NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit -p tsconfig.client.json` | **0 error** |
| 同法 `tsconfig.host.json` | **0 error** |
| `oxlint` 目标文件 | 新增/修改行 0 错；平台 index `:280,656,1128-1147` 与 account-backend `:123,159`、main-startup `:396` 为既有告警 |

## 未验与原因

- **真实 Ground 端到端**：Ground 改动为并行未提交树，未运行其测试、未起服务；桌面侧仅用 loopback HTTP fixture 验证 JSON `{code,message}`。
- **真实短信/限流/真机 GUI**：禁止发送短信、无合法 GUI 自动化；仅 jsdom + 8 语言字典断言。
- **真实 COS 上传、electron-builder、公证、CI retain**：按约束未执行。
- **全仓 `pnpm run build:check` / `pnpm run lint` 门禁**：未跑（需全量构建产物）；已用两个 tsc 聚合 + 定向 oxlint 替代，属部分验证。

## 剩余风险

1. 发布顺序：Ground 必须先于/同批上线错误码；若旧 Ground 只回中文 message，桌面会显示通用本地化文案（不再中文，但信息更泛）。
2. `SmsSendResult`/`PasswordSignInResult` 移除 `message` 是 pre-stable 破坏性变更，仓内消费方已全部更新；仓外使用方会编译失败（建议 upgrade guide 记录）。
3. `CLIENT_TOO_OLD` 仅在注册/短信登录/密码登录路径映射；若 Ground 未来在 `sms/send` 返回该码，会落到「发送失败」通用文案。
4. 既有 `locale.spec.ts` 1 红（zh 键顺序）未修，按基线保留。

## 交接

- 秋池：复跑上表命令；重点看 `main-startup` 18 fail 是否与基线名单一致、`publication-*.md` 快照新名。
- 浪哥：复审共享结果类型删除 `message` 的兼容面、`readFailureCode` 对非 JSON/body-lock 的处理。
- DeepSeek：确认发布顺序与是否补 upgrade guide；确认是否顺手修 locale zh 键顺序（会把基线 1 红清零）。
