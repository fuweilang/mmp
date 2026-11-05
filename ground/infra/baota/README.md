> **Octop 已废弃**（2026-11）：不再构建/发布 `mammoth-octop`、桌面 `publish-desktop`。本目录以中台 `api` + `web` + `pg` 为准。终端见 sibling DeepSeek Harness。

# 猛犸宝塔 infra（ground/infra/baota）

生产部署模板与**中台快发**脚本。发版前给人/AI 粘贴 [`docs/release/HANDOFF-ANY-AI.md`](../../../docs/release/HANDOFF-ANY-AI.md)（换模型时本地文件不会自动加载）。规程全文见仓库技能：

- [`.opencode/skills/baota-release/SKILL.md`](../../../.opencode/skills/baota-release/SKILL.md)
- 复盘报告：[`docs/reports/2026-11-02-release-retrospective.md`](../../../docs/reports/2026-11-02-release-retrospective.md)
- 发版索引：[`docs/release/README.md`](../../../docs/release/README.md)

## 密保（强制）

| 禁止 | 正确做法 |
|------|----------|
| rsync ground/Octop **源码**到 `/www/mammoth/src`、`/www/mammoth/Octop` | 本地 `docker build --platform linux/amd64` → `docker save` → scp → 宝塔 `docker load` |
| 在宝塔上 `docker compose build` | compose **image-only**（无 `build:`）；`up -d` 只用已 load 的 tag |
| 宝塔盘长期留明文源码树 | `cleanup-baota-source-trees.sh --apply`（先 bak） |

允许同步：`web/`（frontend **dist**）、`downloads/`（客户端安装包）、`docker-compose.yml`、`.env`、`secrets/`、`data/`。

镜像一句话：`本地 build(linux/amd64) → save\|gzip → scp → 宝塔 load → compose up -d（无 --build）`。

## 并行快发

墙上时钟走 **中台 || 客户端**，约 max(两者)，禁止串行等完再 `platforms=all`。
**拆单**：`fast-release` **默认只要中台**；`--dispatch` 才开客户端（热修 `desktop-hotfix.yml`）。

| 资源 | 说明 |
|------|------|
| `fast-release.sh` | 编排（**默认 dry-run + no-client**；`--dispatch` 触发 hotfix） |
| `publish-desktop-baota.sh` | T1：Actions→宝塔（默认 dry-run；覆盖前 bak） |
| Skill SSOT | [`.opencode/skills/baota-release/SKILL.md`](../../../.opencode/skills/baota-release/SKILL.md) |
| 半页说明 | [`docs/release/fast-parallel.md`](../../../docs/release/fast-parallel.md) |

```bash
./fast-release.sh --mid octop                         # 默认只要中台提示
./fast-release.sh --mid octop --dispatch              # 开客户端 + desktop-hotfix
./publish-desktop-baota.sh --run-id <id> --version <ver>          # T1 dry-run
./publish-desktop-baota.sh --run-id <id> --version <ver> --apply  # 真传
```

**分层优先**（能 zip 就别打 220MB）：`Octop/scripts/mammoth-dashboard-release.sh`、`mammoth-release.sh --dashboard|--code`。

`--ref` 默认：**Octop 当前分支**，否则 **3.0**。规程适用 2.0/3.0。

## 脚本（目标：中台 ≤20 分钟）

| 脚本 | 作用 |
|------|------|
| `fast-release.sh` | **并行快发编排**（默认 dry-run + no-client；可选 `--dispatch`） |
| `preflight-baota.sh` | 发版前检查（本地 Dockerfile + 远程 image-only compose/secrets；**禁明文源码树**） |
| `release-baota-mid.sh` | 中台快发：preflight → **本地 build+save/load** → web dist → up → **smoke 必跑** |
| `cleanup-baota-source-trees.sh` | 可选/建议：bak 后移走盘上 `src/`、`Octop/` 明文树 |
| `smoke-baota.sh` | 生产 API 冒烟 + 调 `assert-latest-json.sh` |
| `publish-desktop-baota.sh` | T1 Actions 产物直传 + latest；覆盖前 `*.bak-<ts>` |
| `assert-latest-json.sh` | mammoth-latest shell/portable 分裂警告 |
| `resolve-mammoth-version.sh` | 打印 `ground/config/version.json`（SSOT） |

```bash
cd ~/Documents/code/mmPlatform/ground/infra/baota
./cleanup-baota-source-trees.sh --apply   # 仅当盘上仍有明文树
./preflight-baota.sh --track fast
./release-baota-mid.sh --all              # 或 --api / --octop / --web
./smoke-baota.sh --expect-version 2.0.0
```

默认 `--track fast`：从本机 `mmPlatform/{ground,Octop}` **build 镜像**（不 rsync 源码）。  
冻结轨：`--track freeze`（`~/Documents/code/mm-release-1.0`，分支必须 `1.0` 且干净）。

## 模板文件

- `docker-compose.yml` — **image-only**；含 `OCTOP_HOME`、`./data/octop`、`./secrets:/app/secrets:ro`（无 `build:`）
- `Dockerfile.api` / `Dockerfile.octop` — **仅本地/CI 构建用**；octop 必须含 `frontend-builder`
- `nginx-mammoth.conf` / `init-db.sh`

**不要**把真实 PEM / 支付密钥提交进本目录。
