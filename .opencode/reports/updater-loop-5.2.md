# 应用内更新闭环 · 5.2（feed / 签名判定 / 打包断言）

日期：2026-11-13（America/Los_Angeles）· 分支 `5.2` · HEAD `2d3ea0cc`（未提交）

结论：三块均已补齐。macOS 现在能发布 `latest-mac.yml`/`nightly-mac.yml` + zip + blockmap；mac 签名改为「打包记录 > 运维 `--signed` + zip」；signed 打包产物必须含 `app-update.yml`，package-target 与 Windows workflow Collect 步骤双重断言。证书相关路径仅单测/桩验证，见末节。

## 1 改动清单

| path:line | 内容 |
| --- | --- |
| `mammoth-agent/scripts/publish-desktop-downloads.ts:12` | 引入 `desktopUpdateMetadataFilename`（复用 electron-builder 通道命名，不新造规则） |
| `:24-40` | 平台表增加 `updaterExtension`（win=`exe`、mac=`zip`）与 `nodePlatform`；新增 `UpdateChannel` |
| `:56-120` | `PublishCliOptions` 增加 `signed`/`channel`；`PublishPlan` 增加 `channel`；`FeedPublication` 重构为 `ymlName/yml/publicUrl/version/channel/updaterName/updaterUrl/updaterSha512/updaterSize/uploads[]` |
| `:124-142` | `PublicText`；`PublishEnvironment.fetchText`（公网 feed 校验注入点） |
| `:236-282` | 新增 `acceptedUpdateFileNames`、`resolveFeedMetadataName`、`resolvePublishChannel`（latest+prerelease 直接报错） |
| `:543-570` | `readInstallerSignature` → `readInstallerJsonSignature`（无文件返回 `undefined`，不再默认 false） |
| `:572-600` | 新增 `resolveArtifactSigned`：有 `installer.json.signed` 用它；否则 mac 需 `--signed` 且存在 zip；win 传 `--signed` 报错；mac `--signed` 缺 zip 报错 |
| `:630-716` | `createFeedPublication` 支持 mac：yml 名按通道、zip 名必须在 `acceptedUpdateFileNames` 内、校验 `files[0].sha512/size`、blockmap 必填、`uploads` = zip(mac)+blockmap；win 的 `files[0].url` 仍指向 downloads 根版本化 exe |
| `:608-616` 与 `:718-737` | 新增 `findUpdateArchive`（`<base>.zip`/`<base>-unsigned.zip`）与 `verifyPublishedFeed`（公网 yml 的 version/url/sha512/size 逐项比对） |
| `:757-790` | 新增 `resolveRecordedChannel`：`<target>-release.json` 优先，`--channel` 冲突或版本不符直接失败，缺记录时按版本推断 |
| `:793-830` | `createPublishPlan` 串联 channel / 签名判定 / feed |
| `:905-916` | 日志新增 `CHANNEL`，`FEED` 列出全部 uploads |
| `:958-980` | 发布时先传 zip+blockmap（哈希一致则 `KEEP_FEED`，不一致 `REPLACE_FEED`），再原子写 yml |
| `:979-981` | 发布后 `verifyPublishedFeed`，日志 `FEED_VERIFIED` |
| `:1027-1085` | CLI 新增 `--signed`、`--channel nightly|latest`（非法值报错） |
| `:1176-1184` | 新增 `publicText` 与 `fetchText` 注入 |
| `mammoth-agent/apps/desktop/scripts/desktop-packaged-update-config.ts`（新增） | `packagedUpdateConfigPath`（mac `Contents/Resources/app-update.yml` / win `win-unpacked/resources/app-update.yml`）、`assertPackagedUpdateConfig`（缺文件/provider/url/channel 不符即失败，缺 channel 视为 `latest`）、CLI `--target/--artifacts` |
| `mammoth-agent/apps/desktop/scripts/package-target.ts:21,589-594` | signed 且非 `--dir`/`--prepare-only` 时，先断言打包产物内 feed 与 `resolveDesktopAutoUpdateConfig` 一致，再写 release record |
| `mammoth-agent/.github/workflows/windows-package.yml:189-196` | 新增 Collect 步骤「Assert signed package embeds its update feed」，`if: success() && inputs.signing == 'signed'`，unsigned 跳过；preset 决定 `MMP_DESKTOP_AUTO_UPDATE_ENV`，通道取 `MMP_DESKTOP_UPDATE_CHANNEL` |
| `mammoth-agent/scripts/publish-desktop-downloads.spec.ts` | +7 项（mac feed 命名/上传/公网校验/缺 zip/错通道、签名判定、channel 记录） |
| `mammoth-agent/apps/desktop/tests/desktop-packaged-update-config.spec.ts`（新增） | 4 项：路径、正例、缺省 channel、缺失/越权/错通道/provider/YAML |
| `mammoth-agent/apps/desktop/tests/package-target-stages.spec.ts:16` | mock 新断言模块（该套件不产真实包） |

未改：`electron-builder-config.mjs` 的 signed 分支（已 `target:['dmg','zip']` + generic publish + afterPack 写 mac `app-update.yml`）；unsigned 输出结构、依赖清单、锁文件均未动。

## 2 feed 目录与命名规则

| 目标 | 目录（远端 / 公网） | 稳定版 | 预发布/nightly | 文件 |
| --- | --- | --- | --- | --- |
| win-x64 | `/www/mmp-prod/downloads/mmp-desk/feeds/win-x64` · `https://www.mmai.vip/downloads/mmp-desk/feeds/win-x64/` | `latest.yml` | `nightly.yml` | yml + `<base>.exe.blockmap`（exe 留在 `downloads/` 根，yml `url` 指版本化 exe） |
| mac-arm64 | `.../feeds/mac-arm64/` | `latest-mac.yml` | `nightly-mac.yml` | yml + `<base>.zip` + `<base>.zip.blockmap`，yml `url` 指 `feeds/mac-arm64/<base>.zip` 绝对地址 |
| mac-x64 | `.../feeds/mac-x64/` | `latest-mac.yml` | `nightly-mac.yml` | 同上 |

通道解析顺序：`--channel`（与记录冲突即失败）→ `<target>-release.json.channel` → 版本推断（含 `-` 为 nightly，纯 x.y.z 为 latest；latest+预发布直接报错）。
`<base>` = `mammoth-ai-<version>-<os>-<arch>`（与 electron-builder `artifactName` 同一来源）。
`automatic_updates = signed && feed` 保持不变；dmg 的 manifest 条目仍是 `downloads/mammoth-agent-<target>-<version>-<sha8>.dmg`。

## 3 验证（实际命令 / 结果）

| 命令 | 结果 |
| --- | --- |
| `npx vitest run scripts/publish-desktop-downloads.spec.ts` | **23 passed / 0 failed**（原 16 + 7：稳定/nightly mac 命名、channel 推断与记录、签名判定矩阵、mac zip+blockmap 上传与公网 yml 校验、缺 zip 报错、通道不符报错、sha512/size 一致性） |
| `npx vitest run apps/desktop/tests/desktop-packaged-update-config.spec.ts apps/desktop/tests/package-target-stages.spec.ts` | **52 passed / 0 failed** |
| `npx vitest run scripts/windows-package-workflow.spec.ts scripts/desktop-package-forms.spec.ts` | **25 passed / 3 skipped**（workflow 结构、步骤顺序、artifact 数量均仍满足） |
| `pnpm run typecheck` | **5/5 gates passed**，无新增错误 |
| `pnpm run build --profile local` | **10 passed, 0 failed, 0 skipped**（28.74s） |
| `pnpm run verify-export-jsdoc` | 本次文件无告警；仓库既有失败项（`packages/preset/official-agent-gallery`、`session-persistence`、`workspace` 等）为存量，未触碰 |

真实 dry-run（无写入，只 HEAD 公网）：

```
# /tmp/win-out2（314,443,540 bytes，真实 GH Actions 产物）
$ npx tsx scripts/publish-desktop-downloads.ts --platform win-x64 --input /tmp/win-out2 --version 0.3.4 --dry-run
MODE dry-run（不写入远端；--yes 才发布）
TARGETFILE mammoth-agent-win-x64-0.3.4-e82fae59.exe
ALIAS mammoth-agent-win.exe
SHA256 e82fae5947aa7fca25846aec83886ea4cdad2ee545d8a25f483f86795a2000dc
BYTES 314443540
SIGNED false
CHANNEL latest
FEED none
AUTOMATIC_UPDATES false
WARN NSIS 安装器为 i386 stub：x64 架构取自 electron-builder 目标名 win-x64，安装器 PE 机器字段不代表应用架构
WARN SIGNED=false: automatic_updates 强制为 false；签名前不得开启自动更新
PUBLIC https://www.mmai.vip/downloads/mammoth-agent-win-x64-0.3.4-e82fae59.exe status=200 bytes=314443540
DRY_RUN complete: no remote writes
```

```
# 小尺寸 nightly fixture（$TMPDIR/opencode/win-nightly-fixture，验证通道命名与 feed 计划）
$ npx tsx scripts/publish-desktop-downloads.ts --platform win-x64 --input .../win-nightly-fixture --version 0.3.4-nightly.1 --feed --dry-run
CHANNEL nightly
FEED nightly.yml + mammoth-ai-0.3.4-nightly.1-win-x64-unsigned.exe.blockmap -> /www/mmp-prod/downloads/mmp-desk/feeds/win-x64
AUTOMATIC_UPDATES false
```

```
# mac fixture（arm64 Mach-O + zip/blockmap/nightly-mac.yml，验证 mac 命名、签名声明、zip 上传计划）
$ npx tsx scripts/publish-desktop-downloads.ts --platform mac-arm64 --input .../mac-nightly-fixture --version 0.3.4-nightly.1 --feed --signed --dry-run
SIGNED true
CHANNEL nightly
FEED nightly-mac.yml + mammoth-ai-0.3.4-nightly.1-mac-arm64.zip + mammoth-ai-0.3.4-nightly.1-mac-arm64.zip.blockmap -> /www/mmp-prod/downloads/mmp-desk/feeds/mac-arm64
AUTOMATIC_UPDATES true
```

```
# 缺 zip 时 --signed 必须失败
Error: desktop downloads: --signed requires the update zip beside the mac-arm64 artifacts
```

```
# 打包断言 CLI（本地用 presets/test.env + 假 app 包）
$ MMP_PACKAGING_CONFIG_DIR=... MMP_PACKAGING_PRESET=test MMP_DESKTOP_UPDATE_CHANNEL=nightly node --import tsx apps/desktop/scripts/desktop-packaged-update-config.ts --target mac-arm64 --artifacts ...
APP_UPDATE_CONFIG .../artifacts url=https://updates.example.com/mmp-desk/<id>/feeds/mac-arm64/ channel=nightly environment=test
# 缺失 → app-update.yml is missing; signed builds must embed the update feed ...
# 通道不一致 → channel is latest, expected nightly
# preset 与部署不一致 → preset deployment must match its name（loadDesktopPackageEnvironment:77）
```

## 4 需要证书/真机才能验证的项

- macOS 真实 signed 打包：`dmg`+`zip`+`nightly-mac.yml` 的实际产物名、`verifyMacOSAppUpdateConfig` 与新增断言在真包上的通过性（本地无 Developer ID / 公证凭据）。
- Windows 真实 signed 打包：`win-unpacked/resources/app-update.yml` 由 electron-builder 实际写出、NSIS 安装后 `resources/app-update.yml` 存在、`installer.json.signed=true`；本机无 Windows x64 主机与 EV 令牌。
- feed 写入后的公网可达性、EdgeOne/nginx 缓存传播、`REPLACE_FEED` 对已缓存 blockmap 的影响（本次全为 dry-run，未写 `/www/mmp-prod`）。
- electron-updater 端到端升级（装旧版 → 拉 `nightly-mac.yml` → 差分下载 zip → 重启生效）需要证书签名包，未执行。
- `windows-package.yml` 新增 Collect 步骤只在 runner `mmp-win-package-trial` 上真实生效，本地无法执行 pwsh/Windows 路径。

## 5 未验证与风险

- 未跑全量 `pnpm run test`（按仓库规则按面验证）；`apps/desktop/tests/desktop-package-selection.spec.ts:135` 在本分支 **既有失败**（`selectDesktopPackage` 路由授权用例，单跑亦失败），本次未改该文件与实现，非本改动引入。
- `resolveRecordedChannel` 在产物目录存在 `<target>-release.json` 且版本不符时直接失败：保留目录跨版本手工发布会被拦截，按设计选择「失败而非猜测」。
- mac feed 的 zip 以原始 `<base>.zip` 名进入 feeds 目录（与 COS 上传器把 zip 放 `bin/` 不同）；Baota 路径以 yml 绝对 URL 为准，客户端不受影响。
- 未更新 `.opencode/skills/baota-release/SKILL.md`（第 1044 行仍只描述 Windows `latest.yml`）：该路径编辑被工具策略拒绝（`Permission denied: edit`），需 DeepSeek 决定是否授权另行更新。

## 6 交接

- 秋池：按第 3 节命令复核；重点回归 `--feed` 的 win nightly / mac nightly dry-run 与「缺 zip」「--signed 缺 zip」负例。
- 浪哥：关注 `publish-desktop-downloads.ts` 的 feed 上传顺序（zip → blockmap → yml → 公网校验 → manifest）、`resolveRecordedChannel` 的失败策略、`package-target.ts:588` 新断言的位置（在 `writeReleaseRecord` 之前）。
- 甜甜：无 UI 变化。
- 需要 Windows runner 跑一次 `windows-package.yml`（signed, preset=production, channel=nightly）以实证第 4 节的 Windows 项。
