# 版本号单一真相源（AI 默认不问）

> 目标：角标、mammoth-latest.json、GitHub Actions 产物名、中台/客户端展示版本、发版脚本 `--version` / `--expect-version` **只跟一处走**；分支可以叫 `2.0` / `3.0` / `3.14.1` / `1.1.x`，**分支名 ≠ 版本号**。任何 AI（Deepseek / Kimi / Grok / OpenCode）发版时 **默认不问「发哪个版本」**。

相关：[`versioning.md`](./versioning.md)（latest 字段语义）· baota-release Skill · `ground/scripts/{bump,sync,check}-version*.mjs`

---

## 1. 单一真相源（SSOT）

| 项 | 约定 |
|----|------|
| **唯一源文件** | `ground/config/version.json` → `{ "version": "x.y.z" }` |
| **改版本入口** | 在 `ground/` 执行 `pnpm version:bump patch\|minor\|major` 或 `pnpm version:bump --set x.y.z` |
| **同步** | bump 会调 `version:sync`，写入：`packages/shared/src/version.ts`、`Octop/pyproject.toml`、`Octop/src/octop/__init__.py` |
| **校验** | `pnpm version:check`（任一副本不一致即失败） |
| **禁止** | 在服务器 `.env` / Dockerfile / 前端里硬编码 `MAMMOTH_APP_VERSION`；禁止只改包名不改 SSOT |

**取舍说明（为何不是 tag / 分支名 / package.json）**

| 候选 | 结论 |
|------|------|
| Git tag `v*` | 适合对外冻结标记，但日常快发常无 tag；tag 滞后会导致 AI 猜错。作**可选校验**，不作日常 SSOT。 |
| 分支名 `3.0` | **刻意不等于**版本号（可在 `3.0` 分支继续发 `2.0.0`）。分支只表示开发线。 |
| 各仓 package.json | 前端多为占位；Actions 已读 `Octop/pyproject.toml`（由 sync 从 SSOT 写入）。 |
| **`version.json`** | 已有 bump/sync/check；中台 `GET /api/version`、本地 `MAMMOTH_APP_VERSION`、角标均已对齐此源。**保持并强化。** |

---

## 2. 各产物如何读这个源

```
ground/config/version.json
        │
        ├─ pnpm version:sync
        │     → shared APP_VERSION（中台前端角标）
        │     → Octop pyproject / __init__.__version__（agent /api/version、Actions 包版本）
        │
        ├─ 本地 dev：ground package.json scripts 导出 MAMMOTH_APP_VERSION
        │
        ├─ 中台快发：release-baota-mid / smoke 默认 --expect-version = SSOT
        │     → 校验 console+agent /api/version
        │
        ├─ Actions（octop-desktop / desktop-hotfix）：
        │     Read package version ← pyproject.toml（须已 sync）
        │     → artifact 名 …-x.y.z.zip/dmg/exe
        │
        └─ T1 publish-desktop-baota.sh：默认 --version = SSOT
              → mammoth-latest.json 的 shell/portable（及可选 dashboard/code）
```

**角标**：Web/客户端展示读运行时 API / 构建时打进的 `APP_VERSION` / `__version__`，均源自 SSOT，不读分支名。

**mammoth-latest.json**：由 `publish-desktop-baota.sh` + `mammoth-latest.py` 写入；版本参数默认 SSOT。分层热更（只升 dashboard/code）仍遵守 `versioning.md` 字段语义。

**GitHub Actions**：不另开「版本 input」；checkout 发版分支后读已 sync 的 `pyproject.toml`。发版前确认该分支上 `version.json` 与 pyproject 一致（`pnpm version:check`）。

---

## 3. 分支不固定时怎么只改一处

1. 选定**发版锁定分支**（如 `3.0-release-20261102` 或 `2.0`）——只决定「用哪份代码」。
2. 在该分支的 `ground/config/version.json` 写成目标版本（本次要继续 **2.0.0** 就保持 `"version": "2.0.0"`，**不要**为了分支名叫 3.0 去改成 3.0.0）。
3. `pnpm version:sync && pnpm version:check` → commit → 再跑 baota-release。
4. AI / 脚本 **只读 SSOT**，不问用户；分支仅作 git `--ref`。

回退发 `1.1.x`：在对应锁定分支把 SSOT 设为 `1.1.x` 并 sync，同样不问「分支叫什么」。

---

## 4. 与 baota-release Skill 的集成点

| 步骤 | 行为 |
|------|------|
| 发版前 | 读 `ground/config/version.json`（发版 worktree 内）；打印 `MAMMOTH_VERSION=…` |
| preflight / mid | `release-baota-mid`：未传 `--expect-version` 时自动用 SSOT |
| Actions | `--ref <锁定分支>`；平台按 Skill 指定；版本来自该 ref 上的 pyproject |
| T1 | `publish-desktop-baota.sh`：未传 `--version` 时自动用 SSOT；先 dry-run 再 `--apply` |
| AI 纪律 | **默认不问版本**；仅 SSOT 缺失/非法，或与用户书面指定的 tag/版本**明显冲突**时问一句 |

脚本钩子（已落地）：`publish-desktop-baota.sh`、`release-baota-mid.sh` 自动解析 SSOT。

---

## 5. 开发 vs 发版节奏

- **本地 3.0（或任意开发分支）上的代码版本 = 当前 SSOT**，AI 不问、脚本默认读文件。
- **一次发版窗口内不要 bump**；中台 smoke +（若有）客户端 publish 成功后再 `pnpm version:bump` 开下一版。
- `version:sync` 必须更新 `packages/shared` 的 **src 与 dist**（运行时角标读 dist）。

## 6. 本次发版约定（2026-11-02）

- **继续产品版本 2.0.0**（角标、`/api/version`、Actions 包名、mammoth-latest 的 shell/portable 均 **2.0.0**）。
- 即使 git 分支是 `3.0` / `3.0-release-20261102`，**也不改成 3.0.0**，避免重编重传。
- Deepseek：`--version` / `--expect-version` 可省略；若手写必须写 `2.0.0`。

---

## 7. 待落地 / 可选增强

- [x] Skill 写明「默认不问 + 读 SSOT」
- [x] publish / mid / smoke / resolve-mammoth-version.sh 默认读 `version.json`
- [x] Actions：`octop-desktop.yml` 打印/注明包版本来自已 sync 的 pyproject（Octop-only；勿用分支名当版本）
- [x] `fast-release.sh` dry-run 页眉打印 SSOT 版本
- [x] 方案文入库：`ground/docs/release/VERSION-SINGLE-SOURCE.md`（工作区根 `docs/release/` 保持镜像）
