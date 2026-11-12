# 5.0 桌面侧缺陷修复（李庚）— 2026-11-12

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.0`，HEAD `58ec00c2`（未提交工作树）。
- 范围：仅 `mammoth-agent/`；未改 `ground/`；未触碰 `SettingsRoot.tsx` / `AccountMenu.tsx` / `AccountMenu.module.css` / `settings-root.client.spec.tsx`。
- 未 commit / stash / reset / 切分支；未跑 electron-builder 打包；未真实上传；未读 `.env`/凭据；未重启用户服务或桌面窗口。
- 时间：America/Los_Angeles 2026-11-12。

## 结论

| 编号 | 状态 | 摘要 |
|---|---|---|
| P1-3 产物改名链路 | 已修 | 5 处硬编码收敛到 `desktop-artifact-name.mjs`；fixture 同步；新增联动断言；顺带修复 5 个因半改名而红的既有用例 |
| P2-10 更新协调器静默 | 已修 | 后台轮询不再发 `checking`、不再常驻 `error`；检查失败清空 `candidate/releaseNotes`；退避保留 |
| P2-11 错误文案本地化 | 已修 | 主进程/服务层只回 reason code；渲染端 8 语言字典取文案 |
| P2-15 上传 409 幂等 | 已修（单测/loopback） | 409 后 HEAD 比对 md5+size：一致则跳过，不一致报 `ObjectConflict`；未真实上传 |
| P2-16 locale 补全 | 已修 | `desktop.update.*` 15 键 × 6 语言，账号 3 键 × 6 语言；键集由 `satisfies` 编译期约束 |
| P2-13 注册带 smsCode | 部分 | 桌面新流程已验证（表单/IPC/服务端请求均带 6 位码）；旧客户端只能靠强制更新策略，已在 README 登记 |

## P1-3 产物改名只改一半

改动：

| 文件:line | 改动 |
|---|---|
| `apps/desktop/scripts/desktop-artifact-name.mjs:2,11,19` | 新增 `DESKTOP_ARTIFACT_STEM='mammoth-ai'` 与 `desktopArtifactBaseForTarget(version, target)`；`desktopArtifactBase` 由其派生 |
| `apps/desktop/scripts/desktop-artifact-name.d.mts:2-6` | 声明同步 |
| `apps/desktop/scripts/package-macos.ts:7,114` | 公证后 DMG/ZIP/blockmap 基名走 `desktopArtifactBase` |
| `apps/desktop/scripts/retain-desktop-ci.ts:4,63` | CI 保留清单走 `desktopArtifactBaseForTarget` |
| `apps/desktop/scripts/desktop-build-version-discovery.ts:22,36-39,113` | 产物正则用共享 stem，并显式兼容 `deepseek-harness-*`；COS 列目录改为目录前缀（一次覆盖新旧名），避免复用已发布 index |
| `apps/desktop/scripts/installed-update-distribution.ts:7,56` | installed-update feed 文件名走共享基名 |
| `apps/desktop/tests/{package-macos,retain-desktop-ci,desktop-build-version-discovery,installed-update-*,fixtures/installed-update-packaging}` | fixture/断言同步新名；新增“旧名仍参与编号”用例 |
| `apps/desktop/tests/{installer-packaging,macos-signature,windows-update-publisher}.spec.ts` | 原断言旧名（工作树中已红），改由共享基名推导 |
| `apps/desktop/tests/desktop-artifact-name.spec.ts`（新增） | 联动断言：builder `artifactName` 渲染名 == 目标基名（win-x64/mac-arm64/mac-x64）；`retain-desktop-ci.ts`/`package-macos.ts`/`installed-update-distribution.ts` 源码不得出现 `deepseek-harness`；`desktop-build-version-discovery.ts`/`desktop-upload-plan.ts` 必须引用共享来源 |

验证：

```
pnpm exec vitest run <10 个改名相关 spec>        → 10 files / 130 passed
（修复前同一组：3 files failed / 5 tests failed，均为旧名断言；现 0 fail）
```

风险/未验：未运行 electron-builder，未做真实公证打包与 CI retain 步骤；版本发现的新 COS 列目录前缀（`<prefix>/` 而非 `<prefix>/mammoth-ai-`）只经单测与代码路径核对，未连真实 bucket 验证分页/数量。

## P2-10 更新协调器静默与失败清理

改动：

| 文件:line | 改动 |
|---|---|
| `apps/desktop/src/update-coordinator.ts:100` | 新增只读 `lastCheckFailed`（静默失败仍驱动退避） |
| `:112-120` | `manual` 加入 in-flight 检查时提升可见性（手动调用者失败仍可见） |
| `:209-242` | `doCheck`：仅可见检查发布 `checking`；自动成功仅在“新增可用/离开 idle”时发布；失败统一清空 `candidate`+`releaseNotes`；自动失败只撤回陈旧 `available`→`idle`，不发布 `error` |
| `apps/desktop/src/update-schedule.ts:45,71` | 退避判定改用 `lastCheckFailed`，不依赖已发布状态 |
| `apps/desktop/tests/update-coordinator.spec.ts:171-192,296-310` | 新增“自动失败静默 + 手动可见”“静默失败撤回陈旧 offer”用例；失败后 `info.releaseNotes` 为空、`state` 不带 `version` |
| `apps/desktop/tests/update-schedule.spec.ts:48,105,155` | 断言改为静默预期 |
| `apps/desktop/tests/main-startup.spec.ts:382` | 该 spec 的假 coordinator 补 `lastCheckFailed`（保持旧语义） |

验证：

```
pnpm exec vitest run update-coordinator/update-schedule/update-presentation → 3 files / 53 passed
pnpm exec vitest run update-attention/update-dialog/update-error-renderer/update-journal/mandatory-* → 6 files / 87 passed
```

未验：真实 10 分钟轮询的 GUI 侧栏观感（无自动化浏览器/GUI），仅单测覆盖状态发布；`DesktopUpdateIndicator` 未改代码（静默后不再出现 `checking`/自动 `error`，手动检查仍按原逻辑显示）。

## P2-11 错误文案硬编码

改动：

| 文件:line | 改动 |
|---|---|
| `packages/credentials/deepseek-account/src/types.ts:52-57` | `SmsFailureReason = 'invalid' \| 'unavailable' \| 'rejected'`；失败态改为 `{ok:false, reason, message?}`（message 仅服务端细节） |
| `packages/credentials/deepseek-account/src/index.ts:4` | 导出 `SmsFailureReason` |
| `packages/credentials/deepseek-account-platform/src/index.ts:675-700` | 删除 4 处中文；服务不可达/非 OIDC → `unavailable`，HTTP 拒绝 → `rejected` + 服务端原文 |
| `apps/desktop/src/account-backend.ts:138-155` | IPC 边界校验 reason 枚举；默认中文文案删除 |
| `apps/desktop/src/main.ts:1267-1269` | welcome backend 缺失 → `{ok:false, reason:'unavailable'}` |
| `apps/desktop/src/welcome-window.ts:126,133` | 手机号/场景非法 → `reason:'invalid'`；短信登录码非法 → `reason:'credentials'`（不再带中文 message） |
| `apps/desktop/src/client/WelcomePage.tsx:155-159` | 渲染端映射：invalid→`welcomePhoneInvalid`，unavailable→`welcomeSmsUnavailable`，rejected→服务端 message ?? `welcomeSmsFailed` |
| `apps/desktop/src/locale.ts:110,325,538,751,964,1177,1390,1603` | 新增 `welcomeSmsUnavailable` 8 语言（en/zh/ja/es/fr/de/ru/pt） |
| `apps/desktop/tests/welcome-renderer.client.spec.tsx:211-228` | 新增四类失败文案断言（en） |
| `apps/desktop/tests/welcome-window.spec.ts:149-172` | 新增 IPC reason 断言 + 注册必须 6 位码 |

验证：

```
pnpm exec vitest run welcome-window/welcome-renderer.client → 2 files / 45 passed（含新增用例）
grep 中文常量：apps/desktop/src + packages/credentials → 仅 locale.ts 字典命中
```

未验：Ground 返回的中文业务文本仍会原样透传到非中文界面（`rejected` 分支），因为文案归属后端；这属于另一路（ground）范围。

## P2-15 上传 409 幂等

改动：

| 文件:line | 改动 |
|---|---|
| `apps/desktop/scripts/desktop-upload-run.ts:12-19` | `ObjectConflict` 加入可分类失败码 |
| `:65-101` | `md5Hex`/`alreadyExists`/`missingObject`/`storedObjectMatches`（HEAD 的 `ETag` 与 `headers['content-length']` 都读取，因 SDK 在 HEAD 上把长度放在 headers） |
| `:170-186` | PUT 409/FileAlreadyExists → `stage='verify-existing'`；md5+size 一致则记 `put-skipped`（不计 confirmedPuts、继续后续对象），不一致抛 `ObjectConflict`；其余错误原样抛出 |
| `apps/desktop/tests/desktop-upload-run.spec.ts:185-240` | loopback 用例：409→HEAD 相同→成功（1 PUT 跳过 + feed PUT）；409→HEAD 不同→`stopped at verify-existing`、`failure.errorCode=ObjectConflict`、不再 PUT |

验证：

```
pnpm exec vitest run desktop-upload-run.spec.ts → 12 passed
pnpm exec vitest run desktop-upload-run/desktop-upload-plan/upload-target → 全部通过（含原 2 PUT 审计序列不变）
```

未验：真实 COS（未上传、未读凭据）；分片/大对象 ETag 非单段 md5 时会被判 `ObjectConflict`（当前发布产物均为单段流式 PUT，符合前提）。

## P2-16 locale 补全

| 文件 | 改动 |
|---|---|
| `packages/client/ui-settings-general/src/client/update-locales.ts:36-137` | 新增 `updateJa/Es/Fr/De/Ru/Pt`，各 15 键（nav/current/target/unknown/notChecked/latest/unsupported/check/download/notes/noNotes/later/safety/actionFailed/quiet） |
| `packages/client/ui-settings-general/src/client/locales.ts:1,103,150,197,244,291,338` | 6 语言改用各自字典，不再 `...updateEn` |
| `packages/client/ui-settings-account/src/client/locales.ts:134,204,249,294,339,384` | `versionUpdate/updateTarget/installedVersion` 6 语言真实翻译 |

验证：

```
pnpm exec tsc --noEmit -p packages/client/ui-settings-general/tsconfig.client.json → 0 error
pnpm exec tsc --noEmit -p packages/client/ui-settings-account/tsconfig.json          → 0 error
pnpm exec vitest run packages/client/ui-settings-general/tests → 9 files / 100 passed
pnpm exec vitest run packages/client/ui-settings-account/tests → 9 failed / 406 passed（与基线 9 fail 相同，非本 diff）
```

键集一致性由 `satisfies Record<keyof typeof en, string>` 编译期保证；无缺键。

## P2-13 注册带 smsCode（桌面侧）

- 现状核对（已带）：`WelcomePage.tsx` 注册表单校验 `^\d{6}$` 并提交 `smsCode`；`preload-welcome`/`welcome-api`/`welcome-window:139-151` 要求 6 位码后才转发；`deepseek-account-platform` 的 `requestClientRegister` 直接把含 `smsCode` 的输入 POST 到 `/api/auth/client-register`。
- 新增证据：`welcome-window.spec.ts:148-172` 断言缺码/5 位码返回 `{ok:false,reason:'credentials'}` 且不调用服务；合法输入按原样转发；渲染端既有用例断言提交体含 `smsCode:'123456'`。
- 旧客户端策略（桌面侧可做的部分）：服务端新增必填后，旧包无法被本次代码修复；唯一能触达已安装包的机制是强制更新策略（`/api/v0/check_client_update` 返回 blocking）。已在 `apps/desktop/README.md:317` 登记：对“低于首个发送 smsCode 的版本”发布 mandatory block。
- 未做（需 DeepSeek 决定）：后端是否给旧客户端单独的错误码（如 `CLIENT_TOO_OLD`）以便桌面旧包显示“请更新”而不是通用 400 文案；该项属 ground 侧。

## 基线与回归对比

| 套件 | 基线（QA/实测） | 本次后 | 结论 |
|---|---|---|---|
| 改名相关 10 spec | 3 files / 5 tests fail（旧名断言，工作树已红） | 10 files / 130 pass | 改善 |
| `apps/desktop/tests` 全量 | 未给全量基线；本次实测 11 files / 32 fail | 同左（改动后再测） | 无新增；失败见下 |
| ├ `main-startup.spec.ts` | 工作树已删普通更新对话框实现（`main.ts` diff -106 行，`updateCheckTitle/updateCurrent` 已无调用点） | 18–19 fail（用旧退避判定复测也是 18 fail） | 预存在，非本 diff |
| ├ `desktop-publication-preflight.spec.ts` | 2 sha 快照 fail（QA 已列） | 2 fail | 预存在 |
| ├ `desktop-bundle-imports/windows-sign/windows-package-preset/packaged-runtime-verification/pack-local-packages/installed-update-bootstrap/desktop-package-selection/desktop-package-environment` | 预存在（平台/构建产物/旧名） | 同 | 预存在 |
| ├ `locale.spec.ts` | 1 fail（zh 字典 `welcomeEnterprise*` 与 `welcomeNamePlaceholder` 顺序在 HEAD 已不一致） | 1 fail | 预存在（HEAD 已验证） |
| `ui-settings-account` tests | 9 fail | 9 fail | 相同 |
| `deepseek-account-platform` tests | 40 fail（`account: network`） | 40 fail | 相同 |
| `ui-settings-general` tests | 100 pass | 100 pass | 相同/改善 |
| `verify-client-ui-i18n` | 红（`RechargeDialog.tsx`/`ground-billing.ts` 硬编码中文） | 红，输出无本 diff 文件 | 预存在 |

类型检查：

```
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.host.json   → 0 error
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.client.json → 0 error
```

（默认 4GB 堆下仓库级 `tsc -p tsconfig.host.json` 会 OOM，属环境限制；另需 `tsc -b apps/desktop/tsconfig.host.json` 刷新被 gitignore 的 `lib/types`，否则聚合检查读到旧声明。）

## 未验与风险

1. 真实 macOS 公证打包、CI retain、真实 COS 列目录/上传：全部未执行（禁止 electron-builder/真实上传）。
2. GUI 观感（侧栏角标、设置页更新区、欢迎页文案）未做真机/浏览器自动化；只有组件级 jsdom 断言。
3. 旧客户端注册兼容：桌面侧不可修，依赖服务端 mandatory block 或版本化端点（ground 另一路）。
4. `storedObjectMatches` 依赖单段 PUT 的 ETag=md5；若将来改分片上传需重新定义幂等判据。
5. `apps/desktop/tests` 仍有预存在红（main-startup 等），未经 owner 修复前不能作为整体回归证据。
