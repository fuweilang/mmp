# Windows 发布能力建设 · 5.2

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`（HEAD `a01b1d59`），未 commit/push/部署
- 时间：2026-11-13 06:10 America/Los_Angeles
- 只读线上：`https://www.mmai.vip/downloads/mammoth-latest.json` 与 `HEAD` 同源文件；未读 `.env`/凭据，未上传任何文件

## 结论

| 任务 | 状态 | 说明 |
|---|---|---|
| 1 签名支持 | **阻塞（工具权限）** | `.github/workflows/windows-package.yml` 的 `write`/`edit` 均返回 `Permission denied: edit`（文件本身 `-rw-r--r--` 可写，属 opencode 权限策略）。未用 shell 绕过。完整补丁见下文，待授权后落盘 |
| 2 自动更新三件套 | 完成 | 新脚本 `publish-desktop-downloads.ts` + 16 项单测 |
| 3 接管手工流程 | 完成 | 真实 300MB 产物 dry-run，与线上 win 条目逐字段一致 |

## 改动清单

| 文件 | 行 | 内容 |
|---|---|---|
| `mammoth-agent/scripts/publish-desktop-downloads.ts` | 新增 1-971 | 下载页发布脚本：命名/PE/`lipo` 校验、sha256/bytes、版本化上传、固定别名、原子 manifest、可选 feed、公网 GET 校验、失败回滚 |
| 同上 | 15 | 远端根 `/www/mmp-prod/downloads`（线上 nginx 实际根目录，非 `/www/mammoth`） |
| 同上 | 188-265 | 复用 `desktop-artifact-name.mjs` 基名做入口校验；PE machine 判定 + NSIS 32 位 stub 例外 |
| 同上 | 303-346 | `automatic_updates = signed && feed`；unsigned 强制 false 并输出告警 |
| 同上 | 653-796 | 发布编排；manifest 最后写；任意失败从 `.prev-<UTC>` 回滚 manifest+alias |
| 同上 | 873-916 | SSH 传输（`BatchMode=yes`，上传走 `cat > tmp && mv`） |
| 同上 | 918-947 | 公网 `HEAD`/流式 `GET` sha256 校验 |
| `mammoth-agent/scripts/publish-desktop-downloads.spec.ts` | 新增 1-353 | 16 项单测 |
| `.github/workflows/windows-package.yml` | **未改** | 权限拒绝；补丁见文末 |

命名映射（与线上现状一致）：`desktop-artifact-name` 的 `mammoth-ai-0.3.3-win-x64-unsigned.exe` → 下载名 `mammoth-agent-win-x64-0.3.3-cb39f292.exe`，别名 `mammoth-agent-win.exe`；mac 同理 `mammoth-agent-mac-arm64-0.3.3-<sha8>.dmg`。

## 脚本用法

```sh
# 默认 dry-run（只读线上 manifest + HEAD，不写远端）
npx tsx scripts/publish-desktop-downloads.ts \
  --platform win-x64|mac-arm64|mac-x64 --input <dir> --version 0.3.3 \
  [--server root@124.223.179.250] [--feed]

# 真发布（本次未执行）
npx tsx scripts/publish-desktop-downloads.ts ... --yes
```

- `--input` 内需有 `mammoth-ai-<version>-<platform>[-unsigned].(exe|dmg)`；win 读 `installer.json.signed`（工作流产出），mac 无该文件即 signed=false。
- `--feed` 需 `latest.yml`（win）/`latest-mac.yml`（mac）+ `.blockmap`，脚本会校验 yml 的 version/url/sha512/size 与真实文件一致，并把 url 改写为最终公网地址后上传到 `downloads/mmp-desk/feeds/<platform>/`。
- 执行顺序：版本化文件（不可覆盖，字节不同即中止）→ 固定别名 → feed → 公网 GET sha256/size 校验 → 原子写 manifest；任何一步失败回滚 manifest+alias（保留 `.prev-YYYYMMDD-HHMMSS`）。已上传的版本化文件保留（不可变证据）。

## dry-run 输出摘要（真实产物）

```
MODE dry-run（不写入远端；--yes 才发布）
PLATFORM win-x64
SOURCE /tmp/win-out/mammoth-ai-0.3.3-win-x64-unsigned.exe
TARGETFILE mammoth-agent-win-x64-0.3.3-cb39f292.exe
ALIAS mammoth-agent-win.exe
SHA256 cb39f292186c46ea1f4d5498fb8a61e6406aec02762a731bbe46c86165cea02b
BYTES 314369394
SIGNED false
FEED none
AUTOMATIC_UPDATES false
WARN NSIS 安装器为 i386 stub：x64 架构取自 electron-builder 目标名 win-x64，安装器 PE 机器字段不代表应用架构
WARN SIGNED=false: automatic_updates 强制为 false；签名前不得开启自动更新
MANIFEST /www/mmp-prod/downloads/mammoth-latest.json (backup ...prev-20261113-061052)
DIFF platforms.windows-amd64 unchanged
PUBLIC https://www.mmai.vip/downloads/mammoth-agent-win-x64-0.3.3-cb39f292.exe status=200 bytes=314369394
DRY_RUN complete: no remote writes
```

一致性核对（线上 `windows-amd64`）：`file`、`sha256`、`bytes`、`signed`、`automatic_updates` 全部一致 → diff `unchanged`。
注意：真实 NSIS 安装器 PE machine = `0x14c`（32 位 stub，属 NSIS 正常行为），因此 x64 判定规则为：PE 为 `0x8664` 直接通过；`0x14c` 且含 `NullsoftInst` 签名则通过并告警（架构来自 electron-builder 的 `win-x64` 目标名）；其余拒绝。mac 用 `.app` 的 `lipo`，只有 dmg 时只读挂载后 `lipo`，finally 强制卸载并清理。

## 验证

| 命令（cwd=`mammoth-agent`） | 结果 |
|---|---|
| `npx vitest run scripts/publish-desktop-downloads.spec.ts` | **16 passed / 0 failed**（命名、PE、NSIS、manifest 合并、unsigned 禁止 true、feed 校验、发布成功、manifest 写失败回滚、上传失败不动 manifest、不可变冲突、dry-run 无写） |
| `npx vitest run scripts/baota-desktop-publication.spec.ts scripts/publish-desktop-downloads.spec.ts` | 2 files / **17 passed** |
| `npx tsx scripts/run-oxlint.ts <两个新文件>` | 0 error |
| `pnpm run typecheck` | 4 gates passed / 1 failed；仅既有 `scripts/ground-web-router.ts` 的 4 个错误（109/124/169/384，工作区他人 WIP，基线同文件已有 TS2412；**本改动 0 新增**） |
| `pnpm run build --profile local` | **9 passed / 1 failed**，失败仍为 host aggregate check 的同一 `ground-web-router.ts`；无新增失败 |
| 真实 dry-run（见上） | exit 0，`DIFF unchanged`，公网 HEAD 200 / 314369394 |
| `pnpm run verify-export-jsdoc` | 仓库既有失败（ui/official-agent-gallery 等）；`grep publish-desktop` 无本文件条目 |

## 签名待办（上线前用户提供）

1. Windows 代码签名证书 **PFX（含私钥）**，存入 GitHub Secrets `CSC_LINK`（base64 或 runner 可读路径）。
2. PFX 密码，存入 `CSC_KEY_PASSWORD`。
3. 两者同时存在 → 签名分支：electron-builder 默认签名器 + `CSC_IDENTITY_AUTO_DISCOVERY=true`；随后 `Get-AuthenticodeSignature` 必须为 `Valid`，否则 job 失败、不上传 artifact。
4. 缺任一 secret → unsigned 分支，显式输出 `SIGNED=false`，不生成 feed，manifest 侧 `automatic_updates` 必为 false。

**为什么签名后才允许 `automatic_updates=true`**：electron-updater 静默下载并安装，安装前校验发布者/签名；unsigned 二进制无法匹配 publisherName，SmartScreen 也会拦截，等于把未验证可执行文件静默推给用户。脚本因此把 `automatic_updates` 设为 `signed && feed`：未签名强制 false；签名但无 feed 也没有更新源，同样保持 false。

## 未能落盘的 workflow 补丁（权限拒绝，勿用 shell 绕过）

对 `.github/workflows/windows-package.yml` 应用以下 5 处修改：

```diff
-# 猛犸桌面客户端 · Windows x64 安装包（未签名）
+# 猛犸桌面客户端 · Windows x64 安装包（条件签名 · 宝塔下载页）
+# 未配置证书 → unsigned（仅手工下载）；配置 secrets.CSC_LINK + CSC_KEY_PASSWORD →
+# electron-builder PFX 签名，且 Get-AuthenticodeSignature 必须 Valid 才上传。
+# 上线前需提供：PFX（含私钥）+ 密码，分别存 CSC_LINK / CSC_KEY_PASSWORD。
-name: Package Desktop · Windows x64 (unsigned, Baota)
+name: Package Desktop · Windows x64 (conditional signing, Baota)
@@ steps
+      - name: Resolve signing mode
+        id: signing
+        env:
+          CSC_LINK_SECRET: ${{ secrets.CSC_LINK }}
+          CSC_KEY_PASSWORD_SECRET: ${{ secrets.CSC_KEY_PASSWORD }}
+        run: |
+          $signed = -not [string]::IsNullOrWhiteSpace($env:CSC_LINK_SECRET) -and -not [string]::IsNullOrWhiteSpace($env:CSC_KEY_PASSWORD_SECRET)
+          if ($signed) { 'signed=true' >> $env:GITHUB_OUTPUT; 'mode=signed' >> $env:GITHUB_OUTPUT }
+          else { 'signed=false' >> $env:GITHUB_OUTPUT; 'mode=unsigned' >> $env:GITHUB_OUTPUT; Write-Host 'SIGNED=false: unsigned build' }
@@
-      - name: Package Windows x64 (unsigned)
-        run: corepack pnpm --dir apps/desktop run package:win:x64:unsigned
+      - name: Package Windows x64
+        env:
+          CSC_LINK: ${{ secrets.CSC_LINK }}
+          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
+          CSC_IDENTITY_AUTO_DISCOVERY: ${{ steps.signing.outputs.signed == 'true' && 'true' || 'false' }}
+        run: corepack pnpm --dir apps/desktop run package:win:x64:unsigned
```

Collect 步骤替换为（保留原目录与环境不变）：

```powershell
$dir = 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'
$exe = Get-ChildItem -Path $dir -Filter '*-win-x64*.exe' -File -Recurse |
  Where-Object { $_.Name -notlike '*.blockmap' } | Select-Object -First 1
if (-not $exe) { throw "no win-x64 installer in $dir" }
$match = [regex]::Match($exe.BaseName, '^mammoth-ai-(.+)-win-x64(?:-unsigned)?$')
if (-not $match.Success) { throw "unexpected installer name $($exe.Name)" }
$version = $match.Groups[1].Value
$signed = '${{ steps.signing.outputs.signed }}' -eq 'true'
if ($signed) {
  $signature = Get-AuthenticodeSignature -LiteralPath $exe.FullName
  if ($signature.Status -ne 'Valid') { throw "Authenticode status $($signature.Status): $($signature.StatusMessage)" }
  Write-Host "AUTHENTICODE=Valid SUBJECT=$($signature.SignerCertificate.Subject)"
} else { Write-Host 'SIGNED=false (unsigned branch: Authenticode check skipped)' }
$hash = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash.ToLower()
$out = Join-Path $env:GITHUB_WORKSPACE 'windows-artifact'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $out $exe.Name)
if (Test-Path -LiteralPath "$($exe.FullName).blockmap") {
  Copy-Item -LiteralPath "$($exe.FullName).blockmap" -Destination (Join-Path $out "$($exe.Name).blockmap")
}
$feedYml = Join-Path $dir 'latest.yml'
if (Test-Path -LiteralPath $feedYml) { Copy-Item -LiteralPath $feedYml -Destination (Join-Path $out 'latest.yml'); $feed = $true }
elseif ($signed) {
  $sha512 = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA512).Hash))
  $yml = @(
    "version: $version"
    'files:'
    "  - url: $($exe.Name)"
    "    sha512: $sha512"
    "    size: $($exe.Length)"
    "path: $($exe.Name)"
    "sha512: $sha512"
    "releaseDate: '$((Get-Date).ToUniversalTime().ToString('o'))'"
  ) -join "`n"
  [System.IO.File]::WriteAllText((Join-Path $out 'latest.yml'), $yml + "`n", [System.Text.UTF8Encoding]::new($false))
  $feed = $true
} else { Write-Host 'FEED=absent (unsigned)'; $feed = $false }
$metadata = [ordered]@{ product='mammoth-agent'; platform='win-x64'; version=$version; file=$exe.Name
  sha256=$hash; bytes=$exe.Length; signed=$signed; feed=$feed }
[System.IO.File]::WriteAllText((Join-Path $out 'installer.json'), ($metadata | ConvertTo-Json -Depth 5) + "`n",
  [System.Text.UTF8Encoding]::new($false))
"SIGNED=$($signed.ToString().ToLower())"; "FEED=$($feed.ToString().ToLower())"
```

Upload 步骤 `name:` 改为：

```yaml
          name: mammoth-agent-win-x64-${{ steps.signing.outputs.mode }}
```

## 未验证 / 风险

| 项 | 原因/影响 |
|---|---|
| workflow 落盘 + Windows job 实跑 | 被 opencode 权限拒绝；补丁未应用。PFX 签名是否同时覆盖 `win-unpacked` 内 exe 与 NSIS 安装器、`Get-AuthenticodeSignature` 在托管 runner 的实际结果，均需一次真实 Actions 运行验证 |
| app-update.yml / 应用内自动更新 | 本工作流走 `MMP_DESKTOP_UNSIGNED=1` 管线，electron-builder 不写 `app-update.yml`；即使 feed 可上传，应用内 updater 仍需正式 EV 管线或后续代码支持。manifest 的 `automatic_updates` 现为 `signed && feed`，在签名管线验证前**不要**用 `--feed --yes` 发布 |
| `.blockmap` 落点 | 按任务要求上传到 `feeds/<platform>/`；electron-updater 差分包默认按 `<安装包URL>.blockmap` 取，若启用差分需把同名 blockmap 放到版本化安装包旁，当前不启用 |
| mac 路径 | `createPublishPlan` 已实现 `.app`/dmg 挂载 `lipo`，但本机无 mac 产物，未实跑；mac feed（`latest-mac.yml` + zip）未端到端验证 |
| `--yes` 真上传/回滚演练 | 按要求未真实上传；回滚仅由单测中的内存远端覆盖（manifest 写失败、上传失败、不可变冲突），未在宝塔实机演练 |
| 线上目录 | 实际根为 `/www/mmp-prod/downloads`（`https://www.mmai.vip/downloads`），脚本常量按此写死；若迁移需改常量 |

## 交接

- 待 DeepSeek/用户授权 `.github/workflows/windows-package.yml` 写权限后，按上文补丁落盘，并跑一次 `workflow_dispatch`（无 secret、有 secret 各一次）验证 `SIGNED=false/true` 与 `installer.json`。
- 秋池：可先验收脚本 dry-run 与单测；签名/真实上传链路需 Windows runner 与证书后才能验。
- 浪哥：重点复核 `applyPublishPlan` 的回滚边界（feed 已传不回滚、版本化文件保留）与 `automatic_updates = signed && feed` 的取舍。
