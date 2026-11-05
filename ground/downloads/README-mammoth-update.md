# 猛犸桌面端热更新（Phase 1）上传说明

Phase 1 只热更新 **绿色 portable 运行环境**（`~/.octop/portable`），Wails 桌面壳保持运行。
壳本身若有新版本，客户端只会提示去官网重新下载安装包（Phase 2 再做壳内静默替换）。

## 需要上传到宝塔的文件

目录：`/www/mammoth/downloads/`（与现有 dmg/exe 同一目录）

| 文件 | 作用 |
|------|------|
| `mammoth-latest.json` | 各平台最新 portable / shell 元数据（见下方字段） |
| `mammoth-portable-<plat>-<version>.zip` | 绿包 zip（与桌面打包产物同结构，zip 根目录为 `Octop-<plat>/`） |
| 现有 `mammoth-agent-*.dmg` / `mammoth-agent-win.exe` | 壳安装包（Phase 1 仅作 shell.url 提示） |

`<plat>` 必须与桌面 Go 的 `greenPlat()` 一致：`darwin-arm64`、`darwin-amd64`、`windows-amd64`、`linux-amd64`、`linux-arm64`。

公开 URL 示例：

- `https://www.mmai.vip/downloads/mammoth-latest.json`
- `https://www.mmai.vip/downloads/mammoth-portable-darwin-arm64-1.2.3.zip`

## `mammoth-latest.json` 字段

参考同目录 `mammoth-latest.example.json`。

- `schema_version`：目前为 `1`
- `platforms.<plat>.portable.version`：PEP 440 版本；必须 **高于** 用户本机 `~/.octop/portable` 当前版本才会下载
- `platforms.<plat>.portable.url`：zip 的 https 地址
- `platforms.<plat>.portable.sha256`：zip 全文件 sha256（小写 hex），校验失败则中止
- `platforms.<plat>.shell`（可选）：Phase 1 仅用于提示「请重新下载安装包」

## 上传步骤（简版）

1. 本地打出绿包 zip（沿用 `Octop/desktop/portable` 打包流程），文件名可改成 `mammoth-portable-<plat>-<version>.zip`，**zip 内部目录名仍须是 `Octop-<plat>/`**。
2. 计算校验：`shasum -a 256 mammoth-portable-….zip`（macOS）或 `sha256sum …`（Linux）。
3. 复制 `mammoth-latest.example.json` → `mammoth-latest.json`，填入真实 `version` / `url` / `sha256`。
4. 用宝塔文件管理或 scp 把 `mammoth-latest.json` 与 zip 放到 `/www/mammoth/downloads/`。
5. 确认 nginx 已加载 `nginx-mammoth.conf` 中的 `/downloads/mammoth-latest.json` 与 `/downloads/mammoth-`（改完后重载 nginx）。
6. 浏览器访问 `https://www.mmai.vip/downloads/mammoth-latest.json` 应返回 JSON；再在桌面端头像菜单点「版本更新」验证。

## 客户端行为摘要

头像菜单「版本更新」（仅 Wails 桌面壳内显示）→ 拉 `mammoth-latest.json` → 若 portable 更新 → 下载并校验 → 替换 `~/.octop/portable` → `stopListeningOctop` → 热重启 Octop，壳不退出。

环境变量（可选，本地调试）：`OCTOP_MAMMOTH_LATEST_URL` 覆盖 latest.json 地址。
